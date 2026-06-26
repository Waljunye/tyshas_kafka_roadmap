// Kafka roadmap data — revised for a Go-backend / senior-interview focus.
// 35 nodes across 9 tracks. Two axes: `difficulty` (1-3, how hard to learn) and
// `priority` (0-2 ★, interview yield for the role). Positions are NOT stored here —
// layouts are generated from `track` + `deps` in layout.js.

// Palette
export const C = {
  void: '#0A0A0B',
  bg: '#0D0D10',
  panel: '#141417',
  panel2: '#18181C',
  hair: '#26262C',
  hair2: '#34343B',
  ink: '#ECE9E2',
  mut: '#7D7A72',
  faint: '#4A4843',
  steel: '#5C7C8A',
  steelDim: '#38505B',
  steelInk: '#93B4C2',
  gold: '#D9B25F',
};

export const MONO = "'IBM Plex Mono',ui-monospace,Menlo,monospace";
export const DISP = "'Oswald','Arial Narrow',sans-serif";

// Status labels (RU)
export const SLABEL = { todo: 'ПУСТО', doing: 'В ПРОЦЕССЕ', done: 'ИЗУЧЕНО', skip: 'ПРОПУЩЕНО' };

// Track names (the "group" axis)
export const TRACKS = {
  1: 'ОСНОВЫ',
  2: 'БРОКЕР · НАДЁЖНОСТЬ',
  3: 'PRODUCER · ПОРЯДОК',
  4: 'CONSUMER',
  5: 'GO-ИНЖЕНЕРИЯ',
  6: 'ГАРАНТИИ',
  7: 'ЭКОСИСТЕМА',
  8: 'ЭКСПЛУАТАЦИЯ',
  9: 'ДИЗАЙН · СИНТЕЗ',
};
export const TRACK_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Priority (★) labels
export const PRIO_LABEL = { 0: 'ОБЫЧНЫЙ', 1: 'ВЫСОКИЙ ПРИОРИТЕТ', 2: 'ТОП ДЛЯ РОЛИ' };
export const prioStars = (p) => '★'.repeat(p);

// --- the roadmap, in logical study order ---
// code, title, track, difficulty, hours, priority, deps (by code), status, desc
const NODES_RAW = [
  ['K-01', 'ЧТО ТАКОЕ KAFKA', 1, 1, 1, 0, [], 'unchanged',
    'Распределённый отказоустойчивый лог событий. Брокеры хранят поток, продюсеры пишут, консьюмеры читают независимо и в своём темпе.'],
  ['K-02', 'ЛОГ КОММИТОВ', 1, 1, 1, 0, ['K-01'], 'unchanged',
    'Append-only лог — сердце Kafka. Записи неизменяемы и упорядочены, чтение идёт по позиции (оффсету), а не по извлечению из очереди.'],
  ['K-03', 'PUB/SUB vs ОЧЕРЕДЬ', 1, 1, 1, 0, ['K-01'], 'unchanged',
    'В отличие от очереди сообщение не исчезает при чтении. Несколько групп потребителей читают один топик параллельно и независимо.'],
  ['K-04', 'ТОПИКИ', 1, 1, 1, 0, ['K-02'], 'unchanged',
    'Именованный поток записей. Делится на партиции, настраивается фактор репликации, политика retention и сжатие.'],
  ['K-05', 'ПАРТИЦИИ', 1, 2, 2, 1, ['K-04'], 'unchanged',
    'Единица параллелизма и порядка. Порядок гарантируется только внутри партиции; ключ записи определяет её партицию.'],
  ['K-06', 'ОФФСЕТЫ', 1, 2, 1, 1, ['K-05'], 'changed',
    'Монотонный номер записи внутри партиции. Здесь живёт коммит-семантика: момент коммита оффсета определяет at-least / at-most-once и порождает дубли или потери.'],

  ['K-07', 'БРОКЕР', 2, 1, 1, 0, ['K-04'], 'unchanged',
    'Узел-сервер Kafka. Хранит партиции на диске, обслуживает запись и чтение, входит в кластер под управлением контроллера.'],
  ['K-08', 'КЛАСТЕР', 2, 2, 2, 0, ['K-07'], 'unchanged',
    'Набор брокеров с общим контроллером. Балансировка партиций, обнаружение отказов, хранение метаданных.'],
  ['K-09', 'РЕПЛИКАЦИЯ', 2, 2, 2, 0, ['K-08'], 'unchanged',
    'Копии партиции на разных брокерах. Лидер обслуживает весь I/O, фолловеры асинхронно дотягивают лог до конца.'],
  ['K-10', 'ISR / ЛИДЕР', 2, 3, 2, 1, ['K-09'], 'unchanged',
    'In-Sync Replicas — реплики, успевающие за лидером. min.insync.replicas задаёт порог надёжности подтверждённой записи.'],
  ['K-11', 'RETENTION', 2, 2, 1, 0, ['K-05'], 'unchanged',
    'Срок и объём хранения. Лог режется на сегменты и удаляется по времени или размеру независимо от факта прочтения.'],
  ['K-12', 'COMPACTION', 2, 3, 2, 0, ['K-11', 'K-06'], 'unchanged',
    'Log compaction хранит только последнее значение по ключу. Основа для changelog-топиков и восстановления состояния.'],

  ['K-13', 'ПРОДЮСЕР', 3, 1, 1, 0, ['K-05'], 'unchanged',
    'Клиент записи. Батчит, сжимает, выбирает партицию и ждёт подтверждения согласно политике acks.'],
  ['K-14', 'ACKS', 3, 2, 1, 1, ['K-13', 'K-10'], 'unchanged',
    '0 / 1 / all — компромисс надёжность ↔ латентность. acks=all вместе с ISR даёт запись без потерь.'],
  ['K-15', 'ИДЕМПОТЕНТНОСТЬ', 3, 3, 2, 1, ['K-14'], 'unchanged',
    'enable.idempotence убирает дубликаты при ретраях через PID и порядковые номера записей внутри сессии.'],
  ['K-16', 'КЛЮЧИ · ПАРТИЦИОНЕР', 3, 2, 1, 0, ['K-13'], 'unchanged',
    'Ключ → хеш → партиция. Гарантирует порядок по ключу и равномерность распределения нагрузки.'],
  ['K-29', 'ГАРАНТИИ ПОРЯДКА', 3, 3, 2, 1, ['K-16', 'K-15'], 'new',
    'Порядок гарантируется только внутри партиции, между партициями — нет. Без идемпотентности max.in.flight>1 + ретраи дают реордеринг. Тредофф параллелизм против порядка: шардирование по ключу + коммит только непрерывного префикса оффсетов.'],

  ['K-17', 'КОНСЬЮМЕР', 4, 2, 1, 1, ['K-06'], 'changed',
    'Клиент чтения через poll-цикл. Для senior — это poll loop, max.poll.records, fetch-тюнинг и backpressure, а не просто «читает из топика».'],
  ['K-18', 'ГРУППЫ', 4, 2, 2, 0, ['K-17'], 'unchanged',
    'Consumer group делит партиции между участниками. Координатор группы назначает владение и следит за живостью.'],
  ['K-19', 'РЕБАЛАНС', 4, 3, 2, 1, ['K-18'], 'unchanged',
    'Перераспределение партиций при входе/выходе участника. Cooperative-sticky минимизирует stop-the-world простой.'],
  ['K-20', 'LAG', 4, 2, 1, 0, ['K-18'], 'unchanged',
    'Отставание = конец лога − закоммиченный оффсет. Ключевая метрика здоровья потребления.'],
  ['K-30', 'ОШИБКИ · РЕТРАИ · DLQ', 4, 2, 2, 1, ['K-17'], 'new',
    'Poison pill блокирует партицию при наивном ретрае. Ограниченные ретраи → DLQ-топик; retry-топики с растущей задержкой (non-blocking). Blocking vs non-blocking — тредофф. DLQ обязательно мониторить. Связка с идемпотентностью обработки.'],

  ['K-31', 'GO-КЛИЕНТЫ', 5, 2, 1, 1, ['K-13', 'K-17'], 'new',
    'sarama (чистый Go, зрелый, низкоуровневый), franz-go (современный, полный EOS/транзакции, cooperative), confluent-kafka-go (cgo/librdkafka, фичастый, боль со статической сборкой), segmentio/kafka-go (чистое API для простого). Тредофф cgo vs чистый Go и паритет фич — выбор по задаче.'],
  ['K-32', 'НАДЁЖНЫЙ КОНСЬЮМЕР (GO)', 5, 3, 3, 2, ['K-31', 'K-19', 'K-30', 'K-29'], 'new',
    'Consume в loop (возвращается при ребалансе), MarkMessage + ручной коммит после обработки, graceful shutdown по SIGTERM с докоммитом. Параллелизм с сохранением порядка: воркер-пул, шардированный по ключу, коммит непрерывного префикса. Backpressure через ограниченные буферы. Тесты: моки / testcontainers.'],

  ['K-33', 'СЕМАНТИКА ДОСТАВКИ', 6, 2, 1, 1, ['K-14', 'K-06'], 'new',
    'Три семантики доставки и как достигается каждая. На практике в 95% случаев — at-least-once + дедуп по бизнес-ключу (upsert), а не транзакции Kafka. Фундамент под exactly-once.'],
  ['K-21', 'EXACTLY-ONCE', 6, 3, 3, 1, ['K-33', 'K-15'], 'unchanged',
    'EOS: идемпотентный продюсер + транзакции + read_committed. Ровно один наблюдаемый эффект на запись.'],
  ['K-22', 'ТРАНЗАКЦИИ', 6, 3, 2, 1, ['K-21'], 'unchanged',
    'Атомарная запись в несколько партиций и топиков. Основа паттерна consume-transform-produce.'],
  ['K-34', 'OUTBOX · CDC', 6, 3, 2, 2, ['K-33', 'K-24'], 'new',
    'Проблема dual-write: запись в БД и публикация в Kafka неатомарны. Outbox: бизнес-строка + строка outbox в одной транзакции БД; публикатор или Debezium (CDC из WAL) шлёт в Kafka. At-least-once публикация + дедуп на потребителе = эффективный exactly-once между системами.'],

  ['K-23', 'SCHEMA REGISTRY', 7, 2, 2, 0, ['K-13'], 'unchanged',
    'Реестр схем Avro/Protobuf/JSON. Контроль совместимости и эволюции контракта данных между сервисами.'],
  ['K-24', 'KAFKA CONNECT', 7, 2, 2, 0, ['K-07'], 'unchanged',
    'Декларативная интеграция источник ↔ приёмник без кода. Коннекторы, SMT-трансформации, конвертеры. Debezium работает поверх Connect.'],
  ['K-25', 'KAFKA STREAMS', 7, 1, 1, 0, ['K-18', 'K-12'], 'changed',
    'Только концепты: stream/table duality, окна и джойны, когда Streams, а когда Flink. JVM-мир — на Go не пишешь, нужны идеи, не API.'],

  ['K-26', 'KRAFT vs ZK', 8, 1, 1, 0, ['K-08'], 'changed',
    'KRaft убирает ZooKeeper: метаданные живут во внутреннем raft-логе. Концептуально просто, глубоко не копают.'],
  ['K-27', 'БЕЗОПАСНОСТЬ', 8, 2, 2, 0, ['K-08'], 'unchanged',
    'TLS-шифрование канала, SASL-аутентификация клиентов, ACL-авторизация по топикам и группам.'],
  ['K-28', 'МОНИТОРИНГ', 8, 2, 1, 0, ['K-20', 'K-10'], 'unchanged',
    'JMX-метрики, consumer lag, under-replicated партиции, throughput и латентность по перцентилям.'],

  ['K-35', 'ДИЗАЙН НА KAFKA · SIZING', 9, 3, 2, 2, ['K-32', 'K-34', 'K-05'], 'new',
    'Kafka vs RabbitMQ/SQS — когда что. Стратегия партиционирования под нагрузку (throughput, порядок, кардинальность ключа). Capacity planning: число партиций, RF, retention, прикидка throughput. End-to-end проектирование пайплайна и backpressure между стадиями.'],
];

const idOf = (code) => code.toLowerCase().replace('-', ''); // 'K-29' -> 'k29'

// META keyed by id
export const META = {};
// byTrack: track number -> ordered list of ids
export const byTrack = {};
// canonical iteration order (study order above)
export const ORDER = [];

NODES_RAW.forEach(([code, title, track, difficulty, hours, priority, deps, status, desc]) => {
  const id = idOf(code);
  META[id] = {
    id, code, n: code, label: title, track, g: track,
    diff: difficulty, est: hours + ' Ч', hours, priority, status, desc,
    deps: deps.map(idOf),
  };
  ORDER.push(id);
  (byTrack[track] = byTrack[track] || []).push(id);
});

// Dependency edges [from, to, type]; type 'core' = within a track (solid),
// 'opt' = cross-track link (dashed).
export const EDGES = [];
ORDER.forEach((id) => {
  META[id].deps.forEach((dep) => {
    const type = META[dep] && META[dep].track === META[id].track ? 'core' : 'opt';
    EDGES.push([dep, id, type]);
  });
});

// Empty preset = everything starts "todo"; default selection.
export const PRESET_STATUS = {};
export const DEFAULT_SELECTED = 'k01';
