import { registerCloudDriver } from './storage.js';
import { now } from './schema.js';

/**
 * Cloud sync for the camp.
 *
 * The hard rule: a push never replaces the server document wholesale.
 * Recipes, sides and meals each carry their own `_ts` and are merged
 * entity by entity, so "last write wins" applies to the thing that was
 * edited — not to everything a teammate did while you were offline.
 *
 * Deletes leave a tombstone. Without one, a device that has been off for a
 * day pushes its stale copy back and resurrects a deleted recipe.
 */

const API = '/api/state';

let campCode = null;
let baseRev = 0;
let lastError = null;
let pending = null;
let inFlight = false;
const listeners = new Set();

export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(status()));

export function status() {
  return {
    campCode,
    rev: baseRev,
    error: lastError,
    pending: pending !== null,
    syncing: inFlight,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
  };
}

export function setCampCode(code) {
  campCode = code || null;
  baseRev = 0;
}

/* ----------------------------------------------------------- merging */

const isBag = (k) => k === 'recipes' || k === 'sides' || k === 'meals';

/** Newest `_ts` wins, per entity. Missing timestamps lose to present ones. */
function mergeBag(mine = {}, theirs = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const a = mine[key];
    const b = theirs[key];
    if (!a) out[key] = b;
    else if (!b) out[key] = a;
    else out[key] = (Number(a._ts) || 0) >= (Number(b._ts) || 0) ? a : b;
  }
  return out;
}

/** Merge a local document over a server document. */
export function mergeState(mine, theirs) {
  if (!theirs) return mine;
  if (!mine) return theirs;

  const out = { ...theirs, ...mine };
  for (const key of ['recipes', 'sides', 'meals', 'tasks']) {
    out[key] = mergeBag(mine[key], theirs[key]);
  }
  for (const key of ['settings', 'breakfast', 'pantry', 'extras']) {
    const a = mine[key];
    const b = theirs[key];
    out[key] = (Number(a?._ts) || 0) >= (Number(b?._ts) || 0) ? a : b;
  }

  // Shopping is the one place two people genuinely work at the same time —
  // both ticking items off in the same shop. Merging it wholesale would let
  // whoever saved last erase the other's ticks, so merge item by item.
  out.shopping = {
    ...(mine.shopping || {}),
    items: mergeBag(mine.shopping?.items, theirs.shopping?.items),
    _ts: Math.max(Number(mine.shopping?._ts) || 0, Number(theirs.shopping?._ts) || 0),
  };

  return out;
}

/** Drop tombstones that everyone has surely seen, so the doc stays small. */
const TOMBSTONE_TTL = 1000 * 60 * 60 * 24 * 60; // 60 days
export function pruneTombstones(state) {
  const cutoff = now() - TOMBSTONE_TTL;
  for (const key of ['recipes', 'sides', 'meals', 'tasks']) {
    const bag = state[key];
    if (!bag) continue;
    for (const [id, item] of Object.entries(bag)) {
      if (item?._deleted && (Number(item._ts) || 0) < cutoff) delete bag[id];
    }
  }
  return state;
}

/* -------------------------------------------------------------- fetch */

async function request(method, body) {
  const res = await fetch(`${API}?code=${encodeURIComponent(campCode)}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`תשובה לא תקינה מהשרת (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(json?.error?.message || `שגיאת שרת ${res.status}`);
  }
  return json;
}

/** Pull the camp document. Returns null when there is nothing stored yet. */
export async function pull() {
  if (!campCode) return null;
  const json = await request('GET');
  if (!json || !json.data) {
    baseRev = json?.rev || 0;
    return null;
  }
  baseRev = json.rev || 0;
  lastError = null;
  emit();
  return json.data;
}

/**
 * Push local state. On a rev conflict the server hands back the newer
 * document; we merge and push again, once. If that still conflicts, the
 * next debounced save will pick it up rather than looping here.
 */
export async function push(state) {
  if (!campCode) return state;
  let payload = state;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = await request('PUT', { rev: baseRev, data: payload });
      baseRev = json.rev;
      lastError = null;
      emit();
      return payload;
    } catch (err) {
      if (/conflict/i.test(err.message) && attempt === 0) {
        const theirs = await pull();
        payload = pruneTombstones(mergeState(payload, theirs));
        continue;
      }
      lastError = err.message;
      emit();
      throw err;
    }
  }
  return payload;
}

/* ------------------------------------------------------ queued driver */

/**
 * Writes are coalesced: only the newest state matters, so a backlog of
 * edits collapses into one push when the network returns.
 */
async function drain() {
  if (inFlight || pending === null || !campCode) return;
  inFlight = true;
  emit();
  const value = pending;
  pending = null;
  try {
    await push(value);
  } catch {
    // Keep the newest write queued unless a fresher one already replaced it.
    if (pending === null) pending = value;
  } finally {
    inFlight = false;
    emit();
    if (pending !== null && (typeof navigator === 'undefined' || navigator.onLine)) {
      setTimeout(drain, 2000);
    }
  }
}

registerCloudDriver({
  get: () => pull(),
  set: (_key, value) => {
    pending = value;
    return drain();
  },
  delete: () => Promise.resolve(),
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    emit();
    drain();
  });
  window.addEventListener('offline', emit);
}
