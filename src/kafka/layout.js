// Geometry generators. Positions are computed from `track` + `deps` (not stored),
// so the three boards stay correct as nodes are added/removed.
// Each builder returns { nodes:[{id,cx,cy,w,ref,compact}], edges:[{d,a,b,type}], ... }.
// Edges are returned with { d, a, b, type } so the component can colour them by selection.

import { EDGES, byTrack, TRACK_ORDER, META } from './data';

const ref = (id) => {
  const m = META[id];
  return m.priority > 0 ? '★'.repeat(m.priority) : 'Т' + m.track;
};

function edgesFrom(pos) {
  return EDGES.filter(([a, b]) => pos[a] && pos[b]).map(([a, b, t]) => {
    const A = pos[a], B = pos[b];
    return { d: `M ${A.cx.toFixed(1)} ${A.cy.toFixed(1)} L ${B.cx.toFixed(1)} ${B.cy.toFixed(1)}`, a, b, type: t };
  });
}

// L1 — "Треки": one column per track, nodes stacked by study order within the track.
export function buildGrid() {
  const COLW = 168, RH = 100, LX = 110, TY = 92, NW = 146;
  const cols = TRACK_ORDER.length;
  const maxRows = Math.max(...TRACK_ORDER.map((t) => (byTrack[t] || []).length));
  const W = LX + (cols - 1) * COLW + 80;
  const H = TY + maxRows * RH + 30;

  const pos = {};
  const nodes = [];
  const gridLines = [];
  const ticks = [];

  TRACK_ORDER.forEach((t, ci) => {
    const x = LX + ci * COLW;
    gridLines.push({ d: `M ${x} ${TY - 34} L ${x} ${H - 24}` });
    ticks.push({ x, y: TY - 44, label: 'Т' + t, style: { fill: '#54545c', fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', letterSpacing: '.1em', textAnchor: 'middle', fontWeight: 600 } });
    (byTrack[t] || []).forEach((id, ri) => {
      const cx = x, cy = TY + ri * RH;
      pos[id] = { cx, cy };
      nodes.push({ id, cx, cy, w: NW, ref: ref(id), compact: false });
    });
  });

  // Orthogonal routing between columns reads cleaner than diagonal in a grid.
  const edges = EDGES.filter(([a, b]) => pos[a] && pos[b]).map(([a, b, t]) => {
    const A = pos[a], B = pos[b];
    let d;
    if (A.cx === B.cx) d = `M ${A.cx} ${A.cy} L ${B.cx} ${B.cy}`;
    else {
      const mx = Math.round((A.cx + B.cx) / 2);
      d = `M ${A.cx} ${A.cy} L ${mx} ${A.cy} L ${mx} ${B.cy} L ${B.cx} ${B.cy}`;
    }
    return { d, a, b, type: t };
  });

  return { nodes, edges, gridLines, ticks, viewBox: `0 0 ${W} ${H}`, width: W, height: H };
}

// L2 — "Ось": vertical backbone, tracks stacked top→down, members zig-zag around the axis.
export function buildSpine() {
  const CX = 300, TOP = 70, ROWH = 70, GAP = 30, BR = 150, NW = 138;
  const pos = {};
  const nodes = [];
  let y = TOP;

  TRACK_ORDER.forEach((t) => {
    const members = byTrack[t] || [];
    members.forEach((id, i) => {
      const cx = i === 0 ? CX : CX + (i % 2 ? BR : -BR);
      const cy = y + i * ROWH;
      pos[id] = { cx, cy };
      nodes.push({ id, cx, cy, w: NW, ref: ref(id), compact: true });
    });
    y += members.length * ROWH + GAP;
  });

  const H = y + 30;
  const W = CX + BR + NW;
  return { nodes, edges: edgesFrom(pos), axisX: CX, axisY1: TOP - 30, axisY2: H - 20, viewBox: `0 0 ${W} ${H}`, width: W, height: H };
}

// L3 — "Радиал": one concentric ring per track, members spread around the ring.
export function buildRadial() {
  const R0 = 150, RSTEP = 82, NW = 124;
  const rings = TRACK_ORDER.map((t, i) => ({ r: R0 + i * RSTEP }));
  const maxR = R0 + (TRACK_ORDER.length - 1) * RSTEP;
  const CX = maxR + 90, CY = maxR + 90;
  const pos = {};
  const nodes = [];

  TRACK_ORDER.forEach((t, ti) => {
    const members = byTrack[t] || [];
    const r = R0 + ti * RSTEP;
    const rot = -Math.PI / 2 + (ti % 2 ? Math.PI / members.length : 0);
    members.forEach((id, i) => {
      const a = rot + i * ((2 * Math.PI) / members.length);
      const cx = CX + r * Math.cos(a), cy = CY + r * Math.sin(a);
      pos[id] = { cx, cy };
      nodes.push({ id, cx, cy, w: NW, ref: ref(id), compact: true });
    });
  });

  const size = (maxR + 90) * 2;
  return { nodes, edges: edgesFrom(pos), rings, cx: CX, cy: CY, viewBox: `0 0 ${size} ${size}`, width: size, height: size };
}
