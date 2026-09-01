import { now } from './schema.js';

/**
 * Cloud sync, with the server as the single source of truth.
 *
 * The device holds a cache of the last document the server gave us, plus a
 * queue of edits it has not acknowledged yet. What the app renders is the
 * cache with the queue applied on top, so an edit appears instantly and the
 * screen keeps working with no reception.
 *
 * The device is deliberately NOT a second copy of the document. An earlier
 * design made every phone an equal peer with its own authoritative document,
 * which forced a merge whenever two of them met — and a freshly created set
 * of defaults would win against real work simply because its timestamps were
 * newer. Joining a camp is now a read, not a negotiation.
 *
 * The only genuine conflict left is two people editing while both are offline.
 * That is resolved by rebasing the queue onto whatever the server has, which
 * is correct without comparing timestamps between documents: a queued edit is
 * by definition newer than the document it was made against.
 */

const API = '/api/state';

const MIN_POLL = 5000;
const MAX_POLL = 60000;

/**
 * Only an explicit `false` means offline.
 *
 * Some runtimes expose a `navigator` without `onLine` at all — Node does, and
 * so do a few embedded webviews. Treating a missing value as offline would
 * make those environments silently never sync, which is a far worse failure
 * than optimistically attempting a request that fails.
 */
const isOnline = () => globalThis.navigator?.onLine !== false;

let campCode = null;
let cache = { rev: 0, data: null };
let queue = [];            // [{ id, apply }] — apply(doc) -> doc
let inFlight = false;
let lastError = null;
let pollTimer = null;
let pollDelay = MIN_POLL;

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => { const s = status(); listeners.forEach((fn) => fn(s)); };

export function status() {
  return {
    campCode,
    rev: cache.rev,
    error: lastError,
    pending: queue.length,
    syncing: inFlight,
    online: isOnline(),
    connected: campCode !== null && cache.rev > 0,
  };
}

export function setCampCode(code) {
  if (code === campCode) return;
  campCode = code || null;
  cache = { rev: 0, data: null };
  queue = [];
  lastError = null;
  emit();
}

/* ------------------------------------------------------------ documents */

const BAGS = ['recipes', 'sides', 'meals', 'tasks'];

/**
 * There is deliberately no document merge here.
 *
 * Every queued edit is written as a pure transform of the document it is
 * handed — `(doc) => ({ ...doc, recipes: { ...doc.recipes, [id]: mine } })`.
 * Replaying that against a teammate's newer document keeps everything they
 * changed and applies only what this device changed, which is exactly the
 * right outcome and needs no timestamp comparison.
 *
 * An earlier version merged two whole documents entity by entity. That is
 * what let a freshly created set of defaults overwrite real work: its
 * timestamps were simply newer. Reintroducing such a merge would bring the
 * bug back with it.
 */

const TOMBSTONE_TTL = 1000 * 60 * 60 * 24 * 60;
export function pruneTombstones(state) {
  const cutoff = now() - TOMBSTONE_TTL;
  for (const key of BAGS) {
    const bag = state?.[key];
    if (!bag) continue;
    for (const [id, item] of Object.entries(bag)) {
      if (item?._deleted && (Number(item._ts) || 0) < cutoff) delete bag[id];
    }
  }
  return state;
}

/* -------------------------------------------------------------- fetch */

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {
    throw Object.assign(new Error(`תשובה לא תקינה מהשרת (${res.status})`), { status: res.status });
  }
  if (!res.ok) {
    throw Object.assign(
      new Error(json?.error?.message || `שגיאת שרת ${res.status}`),
      { status: res.status, payload: json },
    );
  }
  return json;
}

const url = (extra = '') => `${API}?code=${encodeURIComponent(campCode)}${extra}`;

/* --------------------------------------------------------------- read */

/**
 * Fetch the camp document. Returns null when the camp is empty, and the
 * unchanged cache when the server reports our revision is current.
 */
export async function fetchDoc() {
  if (!campCode) return null;
  const json = await request('GET', url(cache.rev ? `&since=${cache.rev}` : ''));
  lastError = null;

  if (json?.unchanged) { emit(); return cache.data; }
  cache = { rev: json?.rev || 0, data: json?.data || null };
  emit();
  return cache.data;
}

/** What the app should render: the server's document with our queue on top. */
export function view() {
  let doc = cache.data;
  for (const item of queue) doc = item.apply(doc);
  return doc;
}

/* -------------------------------------------------------------- write */

/**
 * Queue an edit. `apply` must be a pure function of the document so it can be
 * replayed against a newer server document after a conflict.
 */
export function enqueue(apply) {
  queue.push({ id: `${now()}-${queue.length}`, apply });
  emit();
  return flush();
}

/**
 * Send the queue. On a revision conflict the server hands back its newer
 * document; we replay the queue onto that and try once more. The queue is
 * only cleared once the server has accepted the result.
 */
export async function flush() {
  if (!campCode || inFlight || queue.length === 0) return;
  if (!isOnline()) return;

  inFlight = true;
  emit();

  const sending = queue.slice();
  const applyAll = (doc) => {
    let out = doc;
    for (const item of sending) out = item.apply(out);
    return out;
  };

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const payload = pruneTombstones(applyAll(cache.data));
      try {
        const json = await request('PUT', url(), { rev: cache.rev, data: payload });
        cache = { rev: json.rev, data: payload };
        // Drop exactly what we sent; anything queued meanwhile stays.
        const sentIds = new Set(sending.map((s) => s.id));
        queue = queue.filter((q) => !sentIds.has(q.id));
        lastError = null;
        return;
      } catch (err) {
        const conflict = err.status === 409;
        if (!conflict || attempt === 1) throw err;
        // Adopt the server's document and replay our edits on top of it.
        cache = { rev: err.payload?.rev || 0, data: err.payload?.data || cache.data };
      }
    }
  } catch (err) {
    lastError = err.message;
  } finally {
    inFlight = false;
    emit();
  }
}

/* ------------------------------------------------------------ polling */

/**
 * Adaptive polling: brisk right after something happens, slowing to a crawl
 * when the screen is idle. A fixed fast interval across a whole crew would
 * exhaust the Upstash command budget for no benefit.
 */
export function startPolling(onDoc) {
  stopPolling();

  const tick = async () => {
    pollTimer = null;
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    const online = isOnline();

    if (campCode && visible && online) {
      const before = cache.rev;
      try {
        await fetchDoc();
        await flush();
        // Something moved — go brisk again. Otherwise back off.
        pollDelay = cache.rev !== before ? MIN_POLL : Math.min(pollDelay * 1.6, MAX_POLL);
        if (cache.rev !== before && cache.data) onDoc?.(cache.data);
      } catch {
        pollDelay = Math.min(pollDelay * 2, MAX_POLL);
      }
    }
    pollTimer = setTimeout(tick, pollDelay);
  };

  pollTimer = setTimeout(tick, MIN_POLL);

  const wake = () => { pollDelay = MIN_POLL; if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; tick(); } };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake();
    });
  }
  return stopPolling;
}

export function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  pollDelay = MIN_POLL;
}

/** Test seam: inspect and set the cache without going through the network. */
export const __cache = {
  get: () => ({ ...cache }),
  set: (next) => { cache = { ...next }; },
  queueLength: () => queue.length,
  reset: () => { cache = { rev: 0, data: null }; queue = []; lastError = null; },
};
