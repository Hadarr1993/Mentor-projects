import {
  DEFAULT_PANTRY,
  DEFAULT_BREAKFAST,
  EMOJI_TO_ICON_KEY,
  ICON_KEYS,
  UNITS,
  CATEGORIES,
  SCALE_MODES,
} from '../data/constants.js';
import { DEFAULT_RECIPES } from '../data/recipes.js';
import { DEFAULT_SIDES } from '../data/sides.js';

/** NEVER change this key. It is the address of every user's data. */
export const STORAGE_KEY = 'midburn-kitchen';
export const CORRUPT_KEY = 'midburn-kitchen__corrupt';

/** Bump when the shape changes, and add a matching entry to MIGRATIONS. */
export const SCHEMA_VERSION = 2;

export const now = () => Date.now();

export function newCampCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = new Uint8Array(10);
  (globalThis.crypto || {}).getRandomValues?.(bytes);
  for (let i = 0; i < 10; i++) {
    s += alphabet[(bytes[i] || Math.floor(Math.random() * 256)) % alphabet.length];
  }
  return `PRDS-${s}`;
}

export function makeDefaults() {
  const ts = now();
  const stamp = (obj) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, { ...v, _ts: ts }]),
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    campCode: newCampCode(),
    settings: {
      people: 50,
      reservePct: 12,
      budget: 0,
      startDate: '2026-11-02',
      days: 6,
      tornimPerMeal: 2,
      members: [],
      shared: false,
      _ts: ts,
    },
    recipes: stamp(DEFAULT_RECIPES),
    sides: stamp(DEFAULT_SIDES),
    meals: {},
    breakfast: { ings: DEFAULT_BREAKFAST.map((i) => ({ ...i })), _ts: ts },
    pantry: { ings: DEFAULT_PANTRY.map((i) => ({ ...i })), _ts: ts },
    // Per-item, each with its own timestamp, so two people ticking things off
    // in the same shop merge instead of overwriting each other.
    shopping: { items: {}, _ts: ts },
    // Added after the first release. No migration and no SCHEMA_VERSION bump:
    // deepMergeDefaults fills a missing key from defaults, which is exactly
    // what that mechanism exists for.
    extras: { items: [], _ts: ts },
  };
}

/**
 * Migrations run in order from the stored version up to SCHEMA_VERSION.
 * Each one takes the previous shape and returns the next. Adding a key here
 * is how the schema evolves without ever discarding user data.
 */
export const MIGRATIONS = {
  // 0 -> 1: the initial shape. Anything without a version is treated as a
  // pre-release document; normalise it rather than dropping it.
  1: (data) => ({ ...data, schemaVersion: 1 }),

  // 1 -> 2: shopping held two flat maps under one timestamp, so a sync merge
  // took one device's entire tick list and discarded the other's. Reshape to
  // one stamped record per item so they merge individually.
  2: (data) => {
    const ts = Number(data.shopping?._ts) || now();
    const items = { ...(data.shopping?.items || {}) };
    const put = (key, patch) => {
      items[key] = { ...(items[key] || { _ts: ts }), ...patch };
    };
    for (const [key, price] of Object.entries(data.shopping?.prices || {})) {
      if (Number.isFinite(Number(price))) put(key, { price: Number(price) });
    }
    for (const [key, bought] of Object.entries(data.shopping?.bought || {})) {
      if (bought) put(key, { bought: true });
    }
    return { ...data, schemaVersion: 2, shopping: { items, _ts: ts } };
  },
};

/**
 * Deep-merge defaults under the stored data. New fields introduced by a
 * future version appear with their default; nothing that exists is replaced.
 * This is the guarantee that shipping a feature never resets anyone.
 */
export function deepMergeDefaults(defaults, stored) {
  if (stored === undefined || stored === null) return clone(defaults);
  if (Array.isArray(defaults) || Array.isArray(stored)) return clone(stored);
  if (!isPlain(defaults) || !isPlain(stored)) return clone(stored);

  const out = {};
  for (const k of new Set([...Object.keys(defaults), ...Object.keys(stored)])) {
    if (!(k in stored)) out[k] = clone(defaults[k]);
    else if (!(k in defaults)) out[k] = clone(stored[k]);
    else out[k] = deepMergeDefaults(defaults[k], stored[k]);
  }
  return out;
}

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Bring any stored document up to the current version and shape. */
export function hydrate(raw) {
  const defaults = makeDefaults();
  if (!raw || typeof raw !== 'object') return defaults;

  let data = raw;
  const from = Number(data.schemaVersion) || 0;
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    if (MIGRATIONS[v]) data = MIGRATIONS[v](data);
  }

  const merged = deepMergeDefaults(defaults, data);
  merged.schemaVersion = SCHEMA_VERSION;
  if (!merged.campCode) merged.campCode = newCampCode();

  // A restored document may predate iconKey, or carry values we no longer allow.
  for (const bag of ['recipes', 'sides']) {
    for (const item of Object.values(merged[bag] || {})) {
      normaliseItem(item);
    }
  }
  merged.extras.items = (merged.extras.items || []).filter(validExtra);

  // The pre-v2 maps are carried through the merge by deepMergeDefaults; drop
  // them now that MIGRATIONS[2] has folded their contents into `items`.
  delete merged.shopping.prices;
  delete merged.shopping.bought;
  for (const [key, item] of Object.entries(merged.shopping.items || {})) {
    if (!item || typeof item !== 'object') { delete merged.shopping.items[key]; continue; }
    if (typeof item._ts !== 'number') item._ts = now();
  }
  merged.breakfast.ings = (merged.breakfast.ings || []).filter(validIng);
  merged.pantry.ings = (merged.pantry.ings || []).filter(validIng);

  return merged;
}

function normaliseItem(item) {
  if (!item || typeof item !== 'object') return;
  if (!item.iconKey) {
    item.iconKey = EMOJI_TO_ICON_KEY[item.icon] || 'other';
  }
  if (!ICON_KEYS.includes(item.iconKey)) item.iconKey = 'other';
  delete item.icon;
  item.ings = (item.ings || []).filter(validIng);
  if (typeof item.steps !== 'string') item.steps = '';
  if (typeof item._ts !== 'number') item._ts = now();
}

function validExtra(i) {
  return validIng(i) && SCALE_MODES.includes(i.scale ?? 'fixed');
}

function validIng(i) {
  return (
    i && typeof i === 'object' && String(i.n || '').trim() &&
    UNITS.includes(i.u) && CATEGORIES.includes(i.c) && Number.isFinite(Number(i.q))
  );
}
