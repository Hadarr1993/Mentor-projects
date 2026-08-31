/**
 * One storage surface, three drivers.
 *
 * The signature is deliberately the one from the original artifact spec —
 * get/set/delete with a boolean `shared` — so the app code stays portable
 * between a claude.ai artifact and this deployment. What changes underneath
 * is only which driver answers.
 *
 *   window.storage present  -> use it (artifact runtime)
 *   shared === true         -> the cloud driver (sync.js)
 *   otherwise               -> IndexedDB
 *   IndexedDB unavailable   -> in-memory, and the app says so loudly
 */

const DB_NAME = 'camp-paradise-kitchen';
const STORE = 'kv';

let memoryFallbackReason = null;
const memory = new Map();

export const getFallbackReason = () => memoryFallbackReason;

/* ------------------------------------------------------------ IndexedDB */

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB אינו זמין בדפדפן הזה'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('פתיחת מסד הנתונים נכשלה'));
    req.onblocked = () => reject(new Error('מסד הנתונים חסום על ידי לשונית אחרת'));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function idbRequest(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error || new Error('פעולת אחסון נכשלה'));
        tx.onabort = () => reject(tx.error || new Error('פעולת האחסון בוטלה'));
      }),
  );
}

const idb = {
  get: (k) => idbRequest('readonly', (s) => s.get(k)),
  set: (k, v) => idbRequest('readwrite', (s) => s.put(v, k)),
  delete: (k) => idbRequest('readwrite', (s) => s.delete(k)),
};

/* --------------------------------------------------------------- memory */

const mem = {
  get: async (k) => memory.get(k),
  set: async (k, v) => void memory.set(k, v),
  delete: async (k) => void memory.delete(k),
};

/* -------------------------------------------------------- local driver */

/** IndexedDB, degrading to memory once — and only once — if it is blocked. */
async function local(op, key, value) {
  if (memoryFallbackReason) return mem[op](key, value);
  try {
    return await idb[op](key, value);
  } catch (err) {
    memoryFallbackReason = err?.message || String(err);
    return mem[op](key, value);
  }
}

/* -------------------------------------------------------- artifact host */

const hostStorage = () =>
  (typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function')
    ? window.storage
    : null;

/* ----------------------------------------------------------------- API */

let cloud = null;
/** sync.js registers itself here to avoid an import cycle. */
export function registerCloudDriver(driver) {
  cloud = driver;
}

export async function get(key, shared = false) {
  const host = hostStorage();
  if (host) return host.get(key, shared);
  if (shared && cloud) return cloud.get(key);
  return local('get', key);
}

export async function set(key, value, shared = false) {
  const host = hostStorage();
  if (host) return host.set(key, value, shared);
  // A shared document is always written locally too, so the app keeps
  // working offline and nothing is lost if the push fails.
  await local('set', key, value);
  if (shared && cloud) return cloud.set(key, value);
  return undefined;
}

export async function del(key, shared = false) {
  const host = hostStorage();
  if (host) return host.delete(key, shared);
  await local('delete', key);
  if (shared && cloud) return cloud.delete(key);
  return undefined;
}

export const storage = { get, set, delete: del };
