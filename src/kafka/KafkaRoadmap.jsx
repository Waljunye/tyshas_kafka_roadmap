import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  C, MONO, DISP, SLABEL, ORDER, TRACKS, PRIO_LABEL, META, EDGES,
  PRESET_STATUS, DEFAULT_SELECTED,
} from './data';
import { buildGrid, buildSpine, buildRadial } from './layout';

// Design "props" (editor knobs in the original .dc component) — fixed to their defaults.
const SHOW_NODE_COORDS = true;
const SHOW_BLUEPRINT_GRID = true;
const EDGE_STYLE = 'ortho';

const STORAGE_KEY = 'kafka-roadmap-status-v1';
const PANEL_W_KEY = 'kafka-roadmap-panel-w-v1';

// Each layout's native stage is scaled to fit the (measured) graph viewport so the
// blueprint / spine / radial boards all share one container without scrolling.
// These are only fallbacks until the container is measured.
const GRAPH_VW = 940;
const GRAPH_VH = 660;

// Detail panel: default width + drag bounds (graph keeps at least MIN_GRAPH px).
const PANEL_W = 380;
const PANEL_MIN = 300;
const PANEL_MAX = 760;
const MIN_GRAPH = 380;

// Zoom bounds (multiplier on top of the auto-fit scale).
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 5;

function clampPanelW(w) {
  const hardMax = Math.min(PANEL_MAX, (typeof window !== 'undefined' ? window.innerWidth : 1440) - MIN_GRAPH);
  return Math.max(PANEL_MIN, Math.min(hardMax, w));
}

function loadPanelW() {
  try {
    const raw = window.localStorage.getItem(PANEL_W_KEY);
    if (raw) return clampPanelW(parseFloat(raw));
  } catch (e) {
    /* ignore */
  }
  return PANEL_W;
}

const BOARD_BG = 'linear-gradient(158deg, rgba(22,22,28,0.62), rgba(10,10,14,0.48))';
const STAGE_BG =
  'radial-gradient(640px 440px at 18% 12%, rgba(92,124,138,0.13), transparent 60%), ' +
  'radial-gradient(540px 540px at 86% 84%, rgba(92,124,138,0.09), transparent 55%), ' +
  'radial-gradient(460px 360px at 56% 46%, rgba(236,233,226,0.05), transparent 62%), #08080B';

const VIEWS = [
  { key: 'blueprint', label: 'БЛЮПРИНТ', kicker: '01 — БЛЮПРИНТ · ИНЖЕНЕРНАЯ СХЕМА' },
  { key: 'spine', label: 'ОСЬ', kicker: '02 — ОСЬ · ПОЗВОНОЧНИК' },
  { key: 'radial', label: 'РАДИАЛ', kicker: '03 — РАДИАЛ · СОЗВЕЗДИЕ' },
];

function loadStatus() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* ignore corrupt/unavailable storage */
  }
  return { ...PRESET_STATUS };
}

export default function KafkaRoadmap() {
  const [status, setStatus] = useState(loadStatus);
  const [selected, setSelected] = useState(DEFAULT_SELECTED);
  const [igniteId, setIgniteId] = useState(null);
  const [igniteN, setIgniteN] = useState(0);
  const [view, setView] = useState('blueprint');

  // Resizable detail panel — drag the divider left/right to grow or shrink it.
  const [panelW, setPanelW] = useState(loadPanelW);
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_W_KEY, String(Math.round(panelW)));
    } catch (e) {
      /* ignore */
    }
  }, [panelW]);

  const startResize = (e) => {
    e.preventDefault();
    setResizing(true);
    const onMove = (ev) => setPanelW(clampPanelW(window.innerWidth - ev.clientX));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      setResizing(false);
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Keep the panel within bounds when the window is resized.
  useEffect(() => {
    const onResize = () => setPanelW((w) => clampPanelW(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Measure the graph column so the stage scales to fill whatever space it gets.
  const graphRef = useRef(null);
  const [graphSize, setGraphSize] = useState({ w: GRAPH_VW, h: GRAPH_VH });
  useLayoutEffect(() => {
    const el = graphRef.current;
    if (!el) return undefined;
    const update = () => setGraphSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- zoom & pan over the roadmap canvas ---
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef(pan);
  const viewRef = useRef({ fitScale: 1 }); // latest fit scale, read by wheel handler
  zoomRef.current = zoom;
  panRef.current = pan;

  // Re-fit (reset zoom/pan) when the layout changes.
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [view]);

  // Scale `factor` around a screen point (sx, sy) given relative to the graph centre,
  // keeping whatever is under that point fixed.
  const zoomAround = (factor, sx, sy) => {
    const fitScale = viewRef.current.fitScale;
    const z0 = zoomRef.current;
    const z1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z0 * factor));
    if (z1 === z0) return;
    const ratio = (fitScale * z1) / (fitScale * z0);
    const p = panRef.current;
    setPan({ x: sx - ratio * (sx - p.x), y: sy - ratio * (sy - p.y) });
    setZoom(z1);
  };
  const zoomBy = (factor) => zoomAround(factor, 0, 0); // around centre (for buttons)
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Wheel-to-zoom toward the cursor (non-passive so we can preventDefault the page scroll).
  useEffect(() => {
    const el = graphRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - (rect.left + rect.width / 2);
      const sy = e.clientY - (rect.top + rect.height / 2);
      zoomAround(e.deltaY < 0 ? 1.12 : 1 / 1.12, sx, sy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag the empty canvas to pan (ignore drags that start on a node or the zoom UI).
  const startPan = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-node="1"]') || e.target.closest('[data-zoom-ui="1"]')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const start = panRef.current;
    const onMove = (ev) => setPan({ x: start.x + (ev.clientX - sx), y: start.y + (ev.clientY - sy) });
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'grabbing';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
    } catch (e) {
      /* ignore */
    }
  }, [status]);

  const statusOf = (id) => status[id] || 'todo';

  // --- interactions (ported from tapNode / setStatus) ---
  const tapNode = (id) => {
    setIgniteId(id);
    setIgniteN((n) => n + 1);
    if (selected !== id) {
      setSelected(id);
      return;
    }
    const order = ['todo', 'doing', 'done', 'skip'];
    setStatus((s) => {
      const cur = s[id] || 'todo';
      const next = order[(order.indexOf(cur) + 1) % 4];
      return { ...s, [id]: next };
    });
  };

  const applyStatus = (id, k) => {
    setStatus((s) => ({ ...s, [id]: k }));
    setSelected(id);
    setIgniteId(id);
    setIgniteN((n) => n + 1);
  };

  // --- styling helpers (ported from nodeStyle / labelStyle / edgeStyle) ---
  const nodeStyle = (id, cx, cy, w, compact) => {
    const s = statusOf(id);
    const isSel = selected === id;
    const st = {
      position: 'absolute', left: cx + 'px', top: cy + 'px', transform: 'translate(-50%,-50%)',
      width: w + 'px', boxSizing: 'border-box', padding: compact ? '7px 10px' : '9px 12px',
      cursor: 'pointer', fontFamily: MONO, borderRadius: '13px',
      backdropFilter: 'blur(13px) saturate(1.6)', WebkitBackdropFilter: 'blur(13px) saturate(1.6)',
      transition: 'transform 620ms cubic-bezier(.2,0,0,1), filter 900ms cubic-bezier(.2,0,0,1), background 320ms ease, border-color 360ms ease, box-shadow 360ms ease',
      filter: 'none', zIndex: isSel ? 6 : 3,
    };
    if (s === 'todo') {
      st.background = 'linear-gradient(157deg, rgba(50,50,60,0.80), rgba(20,20,26,0.72))';
      st.border = '1px solid rgba(255,255,255,0.11)';
      st.boxShadow = '0 6px 22px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.12)';
      st.color = C.ink;
    } else if (s === 'doing') {
      st.background = 'linear-gradient(157deg, rgba(96,130,146,0.52), rgba(46,66,76,0.46))';
      st.border = '1px solid rgba(147,180,194,0.5)';
      st.boxShadow = '0 6px 26px rgba(92,124,138,0.30), 0 0 20px rgba(92,124,138,0.22), inset 0 1px 0 rgba(255,255,255,0.20)';
      st.color = '#EAF3F6';
    } else if (s === 'done') {
      st.background = 'linear-gradient(157deg, rgba(246,244,239,0.93), rgba(212,208,199,0.80))';
      st.border = '1px solid rgba(255,255,255,0.66)';
      st.boxShadow = '0 8px 28px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.72)';
      st.color = C.void;
    } else {
      st.background = 'linear-gradient(157deg, rgba(28,28,36,0.62), rgba(14,14,18,0.52))';
      st.border = '1px dashed rgba(255,255,255,0.13)';
      st.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05)';
      st.color = C.faint;
    }
    if (isSel) {
      st.borderColor = 'rgba(147,180,194,0.88)';
      st.boxShadow = '0 0 0 1px rgba(147,180,194,0.5), 0 10px 30px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.22)';
      st.filter = 'drop-shadow(0 0 17px rgba(92,124,138,0.6))';
    }
    if (igniteId === id) {
      st.animation = 'kIgnite' + (igniteN % 2 ? 'A' : 'B') + ' 900ms cubic-bezier(.2,0,0,1)';
    }
    return st;
  };

  const labelStyle = (id, compact) => {
    const s = statusOf(id);
    return {
      fontFamily: DISP, fontWeight: 600, fontSize: (compact ? 12 : 13.5) + 'px', lineHeight: 1.04,
      letterSpacing: '.04em', textTransform: 'uppercase', marginTop: compact ? '3px' : '4px',
      color: 'inherit', textDecoration: s === 'skip' ? 'line-through' : 'none',
    };
  };

  const edgeStyle = (a, b, type) => {
    const touches = a === selected || b === selected;
    const st = {
      stroke: touches ? '#88AEBD' : 'rgba(236,233,226,0.15)',
      strokeWidth: touches ? 1.7 : 1,
      fill: 'none',
      transition: 'stroke 160ms',
      filter: touches ? 'drop-shadow(0 0 4px rgba(92,124,138,0.55))' : 'none',
    };
    if (type === 'opt') st.strokeDasharray = '2 6';
    return st;
  };

  const decorate = (base) => {
    const m = META[base.id];
    return {
      id: base.id, n: m.n, label: m.label, est: m.est, compact: base.compact, priority: m.priority,
      diffStr: '●'.repeat(m.diff) + '○'.repeat(3 - m.diff),
      ref: SHOW_NODE_COORDS ? base.ref : '',
      style: nodeStyle(base.id, base.cx, base.cy, base.w, base.compact),
      labelStyle: labelStyle(base.id, base.compact),
      onClick: () => tapNode(base.id),
    };
  };

  // --- active layout ---
  const layout = useMemo(() => {
    if (view === 'spine') return buildSpine();
    if (view === 'radial') return buildRadial();
    return buildGrid({ showBlueprintGrid: SHOW_BLUEPRINT_GRID, edgeStyle: EDGE_STYLE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const fitScale = Math.min(graphSize.w / layout.width, graphSize.h / layout.height);
  viewRef.current.fitScale = fitScale;
  const scale = fitScale * zoom;
  const nodes = layout.nodes.map(decorate);

  // --- progress ---
  const total = ORDER.length;
  let done = 0, doing = 0;
  ORDER.forEach((id) => {
    const s = statusOf(id);
    if (s === 'done') done++;
    else if (s === 'doing') doing++;
  });
  const pct = Math.round((done / total) * 100);
  const progress = {
    done, doing, total, pctStr: pct + '%',
    doingPct: Math.round(((done + doing) / total) * 100),
    donePct: pct,
  };

  // --- selected / detail panel (ported from buildSelected) ---
  const sel = buildSelected(selected, statusOf, applyStatus);

  return (
    <div style={{
      height: '100vh', width: '100vw', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      background: BOARD_BG, backdropFilter: 'blur(34px) saturate(1.4)', WebkitBackdropFilter: 'blur(34px) saturate(1.4)',
    }}>
          {/* header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '18px 28px', borderBottom: '1px solid rgba(255,255,255,0.09)', flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.26em', color: C.mut, textTransform: 'uppercase', marginBottom: 9 }}>
                {VIEWS.find((v) => v.key === view).kicker}
              </div>
              <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 30, letterSpacing: '.06em', color: C.ink, lineHeight: 1, textTransform: 'uppercase' }}>
                APACHE KAFKA
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.24em', color: C.mut, textTransform: 'uppercase', marginTop: 8 }}>
                ROADMAP · {ORDER.length} НОД · GO-BACKEND · SENIOR
              </div>
            </div>
            <div style={{ width: 360 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: MONO, marginBottom: 8 }}>
                <span style={{ fontSize: 10, letterSpacing: '.22em', color: C.mut, textTransform: 'uppercase' }}>ПРОГРЕСС</span>
                <span style={{ fontSize: 10, letterSpacing: '.14em', color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                  ИЗУЧЕНО {progress.done} / {progress.total}
                </span>
              </div>
              <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: progress.doingPct + '%', background: 'linear-gradient(90deg, rgba(92,124,138,0.5), rgba(108,146,162,0.28))', boxShadow: '0 0 12px rgba(92,124,138,0.45)', transition: 'width 200ms cubic-bezier(.2,0,0,1)' }} />
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: progress.donePct + '%', background: 'linear-gradient(90deg, rgba(246,244,239,0.96), rgba(214,210,201,0.86))', boxShadow: '0 0 14px rgba(236,233,226,0.32)', transition: 'width 200ms cubic-bezier(.2,0,0,1)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', color: C.faint, textTransform: 'uppercase' }}>
                <span>В ПРОЦЕССЕ {progress.doing}</span><span style={{ color: C.mut }}>{progress.pctStr}</span>
              </div>
            </div>
          </div>

          {/* view switcher */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 28px', borderBottom: '1px solid rgba(255,255,255,0.09)', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: C.faint, textTransform: 'uppercase', marginRight: 6 }}>ВИД</span>
            {VIEWS.map((v) => {
              const active = view === v.key;
              return (
                <div
                  key={v.key}
                  onClick={() => setView(v.key)}
                  style={{
                    fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase',
                    padding: '7px 16px', borderRadius: 9, cursor: 'pointer', transition: 'all 160ms',
                    border: active ? '1px solid rgba(147,180,194,0.6)' : '1px solid rgba(255,255,255,0.10)',
                    color: active ? '#EAF3F6' : C.mut,
                    background: active ? 'rgba(92,124,138,0.22)' : 'rgba(255,255,255,0.03)',
                    boxShadow: active ? '0 0 18px rgba(92,124,138,0.30)' : 'none',
                  }}
                >
                  {v.label}
                </div>
              );
            })}
          </div>

          {/* body: graph + panel */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <div
              ref={graphRef}
              onPointerDown={startPan}
              style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%', background: STAGE_BG, borderRight: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', cursor: 'grab', touchAction: 'none' }}
            >
              {/* pan layer (screen px), centred on the graph */}
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(${pan.x}px, ${pan.y}px)` }}>
              <div style={{ width: layout.width, height: layout.height, transform: `translate(-50%,-50%) scale(${scale})`, transformOrigin: 'center center' }}>
                <svg viewBox={layout.viewBox} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                  {/* layout-specific guides */}
                  {view === 'blueprint' && layout.gridLines.map((ln, i) => (
                    <path key={'g' + i} d={ln.d} style={{ stroke: 'rgba(255,255,255,0.055)', strokeWidth: 1, fill: 'none' }} />
                  ))}
                  {view === 'spine' && (
                    <line x1={layout.axisX} y1={layout.axisY1} x2={layout.axisX} y2={layout.axisY2} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                  )}
                  {view === 'radial' && layout.rings.map((r, i) => (
                    <circle key={'r' + i} cx={layout.cx} cy={layout.cy} r={r.r} style={{ stroke: 'rgba(255,255,255,0.055)', strokeWidth: 1, fill: 'none' }} />
                  ))}
                  {/* edges */}
                  {layout.edges.map((e, i) => (
                    <path key={'e' + i} d={e.d} style={edgeStyle(e.a, e.b, e.type)} />
                  ))}
                  {/* blueprint axis ticks */}
                  {view === 'blueprint' && layout.ticks.map((t, i) => (
                    <text key={'t' + i} x={t.x} y={t.y} style={t.style}>{t.label}</text>
                  ))}
                </svg>

                {nodes.map((nd) => (
                  <div key={nd.id} data-node="1" style={nd.style} onClick={nd.onClick}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, letterSpacing: '.1em', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ opacity: 0.55 }}>{nd.n}</span>
                      <span style={{ color: nd.priority > 0 ? C.gold : 'inherit', opacity: nd.priority > 0 ? 0.95 : 0.55, letterSpacing: nd.priority > 0 ? '.04em' : '.1em' }}>{nd.ref}</span>
                    </div>
                    <div style={nd.labelStyle}>{nd.label}</div>
                    {!nd.compact && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 8.5, letterSpacing: '.08em', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ letterSpacing: '.18em' }}>{nd.diffStr}</span><span>{nd.est}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              </div>

              {/* zoom controls */}
              <ZoomControls
                zoom={zoom}
                onIn={() => zoomBy(1.2)}
                onOut={() => zoomBy(1 / 1.2)}
                onReset={resetView}
              />
            </div>

            {/* drag handle — resize the detail panel */}
            <div
              onPointerDown={startResize}
              title="Потяни, чтобы изменить ширину панели"
              style={{
                position: 'relative', width: 8, flexShrink: 0, height: '100%', cursor: 'col-resize',
                background: resizing ? 'rgba(147,180,194,0.22)' : 'transparent',
                borderLeft: '1px solid rgba(255,255,255,0.08)', transition: 'background 140ms',
                touchAction: 'none',
              }}
            >
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                width: 2, height: 34, borderRadius: 2,
                background: resizing ? '#88AEBD' : 'rgba(255,255,255,0.22)', transition: 'background 140ms',
              }} />
            </div>

            {/* detail panel */}
            <div style={{ width: panelW, flexShrink: 0, height: '100%', overflowY: 'auto', background: 'rgba(255,255,255,0.022)' }}>
              {sel ? (
                <DetailPanel sel={sel} igniteN={igniteN} />
              ) : (
                <EmptyPanel />
              )}
            </div>
          </div>

          {/* legend footer */}
          <div style={{ flexShrink: 0 }}>
            <Legend />
          </div>
    </div>
  );
}

function ZoomControls({ zoom, onIn, onOut, onReset }) {
  const btn = {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: MONO, fontSize: 16, lineHeight: 1, color: C.ink, cursor: 'pointer', userSelect: 'none',
    background: 'rgba(20,20,26,0.72)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9,
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', transition: 'all 140ms',
  };
  return (
    <div
      data-zoom-ui="1"
      style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 10 }}
    >
      <div style={btn} title="Приблизить" onClick={onIn}>＋</div>
      <div style={{ ...btn, fontSize: 9, letterSpacing: '.04em', color: C.mut, cursor: 'default', height: 22, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(zoom * 100)}%
      </div>
      <div style={btn} title="Отдалить" onClick={onOut}>−</div>
      <div style={{ ...btn, fontSize: 13 }} title="Сбросить вид" onClick={onReset}>⟳</div>
    </div>
  );
}

// --- selected-node data assembly (ported from buildSelected) ---
function buildSelected(selected, statusOf, applyStatus) {
  if (!selected) return null;
  const m = META[selected];
  const s = statusOf(selected);
  const deps = EDGES.filter((e) => e[1] === selected).map((e) => ({ n: META[e[0]].n, label: META[e[0]].label }));
  const pad2 = (n) => String(n).padStart(2, '0');

  const btnBase = {
    padding: '11px 8px', textAlign: 'center', fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
    textTransform: 'uppercase', cursor: 'pointer', borderRadius: 10, border: '1px solid rgba(255,255,255,0.11)',
    color: C.mut, background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    transition: 'all 150ms',
  };
  const statusBtns = ['todo', 'doing', 'done', 'skip'].map((k) => {
    const st = { ...btnBase };
    if (k === s) {
      if (k === 'todo') { st.borderColor = 'rgba(255,255,255,0.32)'; st.color = C.ink; st.background = 'rgba(255,255,255,0.07)'; }
      else if (k === 'doing') { st.borderColor = 'rgba(147,180,194,0.6)'; st.color = '#EAF3F6'; st.background = 'rgba(92,124,138,0.22)'; st.boxShadow = '0 0 18px rgba(92,124,138,0.32)'; }
      else if (k === 'done') { st.background = 'linear-gradient(157deg, rgba(246,244,239,0.93), rgba(212,208,199,0.82))'; st.color = C.void; st.borderColor = 'rgba(255,255,255,0.6)'; }
      else { st.borderStyle = 'dashed'; st.borderColor = 'rgba(255,255,255,0.26)'; st.color = C.faint; st.textDecoration = 'line-through'; }
    }
    return { key: k, label: SLABEL[k], style: st, onClick: () => applyStatus(selected, k) };
  });

  return {
    n: m.n, label: m.label, desc: m.desc, est: m.est,
    diffStr: '●'.repeat(m.diff) + '○'.repeat(3 - m.diff),
    group: TRACKS[m.track], statusLabel: SLABEL[s],
    priority: m.priority,
    prioStr: m.priority > 0 ? '★'.repeat(m.priority) : '—',
    prioLine: m.priority > 0 ? '★'.repeat(m.priority) + ' · ' + PRIO_LABEL[m.priority] : PRIO_LABEL[0],
    deps, depCount: pad2(deps.length), hasDeps: deps.length > 0,
    questions: m.questions || [],
    ready: m.ready || '',
    statusBtns,
  };
}

function DetailPanel({ sel, igniteN }) {
  const panelStyle = { padding: '22px 22px 26px', fontFamily: MONO, animation: 'kPanel' + (igniteN % 2 ? 'A' : 'B') + ' 360ms cubic-bezier(.2,0,0,1)' };
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 48, fontWeight: 500, color: C.ink, lineHeight: 0.86, letterSpacing: '.01em' }}>{sel.n}</div>
        <div style={{ textAlign: 'right', fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', lineHeight: 1.7 }}>
          <div style={{ color: C.steel }}>{sel.group}</div>
          <div style={{ color: C.mut }}>{sel.statusLabel}</div>
        </div>
      </div>
      <div style={{ fontSize: 9.5, letterSpacing: '.16em', marginTop: 12, textTransform: 'uppercase', color: sel.priority > 0 ? C.gold : C.faint }}>{sel.prioLine}</div>
      <div style={{ height: 1, background: C.hair, margin: '18px 0' }} />
      <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 22, letterSpacing: '.04em', color: C.ink, textTransform: 'uppercase', lineHeight: 1.04 }}>{sel.label}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: C.mut, marginTop: 13, letterSpacing: '.005em' }}>{sel.desc}</div>

      <div style={{ display: 'flex', gap: 26, marginTop: 22, flexWrap: 'wrap' }}>
        <Stat title="СЛОЖНОСТЬ" value={sel.diffStr} valueStyle={{ letterSpacing: '.18em' }} />
        <Stat title="ОЦЕНКА" value={sel.est} valueStyle={{ letterSpacing: '.1em' }} />
        <Stat title="ПРИОРИТЕТ" value={sel.prioStr} valueStyle={{ letterSpacing: '.1em', color: sel.priority > 0 ? C.gold : C.ink }} />
        <Stat title="ПРЕДПОСЫЛКИ" value={sel.depCount} valueStyle={{ letterSpacing: '.1em', fontVariantNumeric: 'tabular-nums' }} />
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 9, letterSpacing: '.2em', color: C.faint, textTransform: 'uppercase', marginBottom: 10 }}>ЗАВИСИТ ОТ</div>
        {sel.hasDeps ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {sel.deps.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 10.5, letterSpacing: '.05em', color: C.mut }}>
                <span style={{ color: C.steel, fontVariantNumeric: 'tabular-nums' }}>{d.n}</span><span>{d.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: C.faint, letterSpacing: '.14em', textTransform: 'uppercase' }}>— корневая нода —</div>
        )}
      </div>

      {sel.questions.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 9, letterSpacing: '.2em', color: C.faint, textTransform: 'uppercase', marginBottom: 11 }}>КОНТРОЛЬНЫЕ ВОПРОСЫ</div>
          <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sel.questions.map((q, i) => (
              <li key={i} style={{ fontSize: 11.5, lineHeight: 1.5, color: C.ink, letterSpacing: '.005em' }}>{q}</li>
            ))}
          </ol>
          {sel.ready && (
            <div style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 8,
              border: '1px solid rgba(217,178,95,0.32)', background: 'rgba(217,178,95,0.06)',
            }}>
              <div style={{ fontSize: 9, letterSpacing: '.2em', color: C.gold, textTransform: 'uppercase', marginBottom: 6 }}>✅ ГОТОВО, ЕСЛИ</div>
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.ink, letterSpacing: '.005em' }}>{sel.ready}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 26 }}>
        <div style={{ fontSize: 9, letterSpacing: '.2em', color: C.faint, textTransform: 'uppercase', marginBottom: 11 }}>СТАТУС · КЛИК ЧТОБЫ ОТМЕТИТЬ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {sel.statusBtns.map((b) => (
            <div key={b.key} style={b.style} onClick={b.onClick}>{b.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ title, value, valueStyle }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: '.2em', color: C.faint, textTransform: 'uppercase' }}>{title}</div>
      <div style={{ fontSize: 14, color: C.ink, marginTop: 7, ...valueStyle }}>{value}</div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: MONO }}>
      <svg width="64" height="64" viewBox="0 0 64 64" style={{ margin: '0 auto 22px', display: 'block' }}>
        <path d="M32 6 L32 58 M32 20 L18 12 M32 20 L46 12 M32 38 L16 34 M32 38 L48 34 M32 50 L22 56 M32 50 L42 56" stroke="#26262C" strokeWidth="1.2" fill="none" />
        <circle cx="32" cy="32" r="3" stroke="#5C7C8A" strokeWidth="1.2" fill="none" />
      </svg>
      <div style={{ fontSize: 11, letterSpacing: '.24em', color: C.faint, textTransform: 'uppercase' }}>выбери ноду</div>
      <div style={{ fontSize: 10, letterSpacing: '.1em', color: '#34343B', marginTop: 10, lineHeight: 1.6 }}>
        клик по узлу — детали и координаты<br />повторный клик — сменить статус
      </div>
    </div>
  );
}

function Legend() {
  const item = (swatch, label) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{swatch}{label}</span>
  );
  const sw = (style) => <span style={{ width: 14, height: 14, borderRadius: 4, display: 'inline-block', ...style }} />;
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '13px 24px', borderTop: '1px solid rgba(255,255,255,0.09)', fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: C.mut, textTransform: 'uppercase', flexWrap: 'wrap' }}>
      {item(sw({ border: '1px solid rgba(255,255,255,0.12)', background: 'linear-gradient(157deg, rgba(48,48,58,0.55), rgba(18,18,24,0.4))' }), 'ПУСТО')}
      {item(sw({ border: '1px solid rgba(147,180,194,0.46)', background: 'linear-gradient(157deg, rgba(108,146,162,0.34), rgba(56,80,91,0.14))', boxShadow: '0 0 10px rgba(92,124,138,0.3)' }), 'В ПРОЦЕССЕ')}
      {item(sw({ background: 'linear-gradient(157deg, rgba(246,244,239,0.93), rgba(212,208,199,0.8))' }), 'ИЗУЧЕНО')}
      {item(sw({ border: '1px dashed rgba(255,255,255,0.2)', background: 'linear-gradient(157deg, rgba(28,28,36,0.4), rgba(12,12,16,0.26))' }), 'ПРОПУЩЕНО')}
      <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)' }} />
      {item(<svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#7D7A72" strokeWidth="1" /></svg>, 'СВЯЗЬ В ТРЕКЕ')}
      {item(<svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#7D7A72" strokeWidth="1" strokeDasharray="2 4" /></svg>, 'МЕЖ-ТРЕК')}
      <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)' }} />
      {item(<span style={{ color: C.gold }}>★</span>, 'ВЫСОКИЙ')}
      {item(<span style={{ color: C.gold }}>★★</span>, 'ТОП ДЛЯ РОЛИ')}
    </div>
  );
}
