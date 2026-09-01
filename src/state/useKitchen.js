import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storage, getFallbackReason } from './storage.js';
import * as sync from './sync.js';
import {
  STORAGE_KEY,
  CORRUPT_KEY,
  REPUBLISH_KEY,
  makeDefaults,
  hydrate,
  now,
} from './schema.js';

const DEBOUNCE_MS = 600;

/**
 * The single owner of application state.
 *
 * Saving rules, in priority order:
 *  1. A local write always happens and never depends on the network.
 *  2. Edits are debounced ~600ms; saveNow() bypasses that and resolves
 *     only once the write is confirmed.
 *  3. A failed save surfaces its real reason and stays retryable — it is
 *     never swallowed and never silently discards the edit.
 */
export function useKitchen() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState(null);
  const [corrupt, setCorrupt] = useState(null);
  const [syncStatus, setSyncStatus] = useState(sync.status());

  const timer = useRef(null);
  const latest = useRef(null);
  const savedTimer = useRef(null);
  latest.current = state;

  /* ------------------------------------------------------------- load */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let raw;
      try {
        raw = await storage.get(STORAGE_KEY, false);
      } catch (err) {
        raw = undefined;
        if (!cancelled) setSaveError(describe(err));
      }

      let next;
      let upgradedFrom = null;
      if (raw === undefined || raw === null) {
        next = makeDefaults();
      } else {
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const storedVersion = Number(parsed?.schemaVersion) || 0;
          next = hydrate(parsed);
          if (storedVersion !== next.schemaVersion) upgradedFrom = storedVersion;
        } catch (err) {
          // Never reset on a bad document. Park it and carry on.
          try {
            await storage.set(CORRUPT_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw), false);
          } catch { /* the banner still tells the user */ }
          if (!cancelled) setCorrupt(describe(err));
          next = makeDefaults();
        }
      }

      sync.setCampCode(next.campCode);

      // The camp document is authoritative. If the server has one, adopt it
      // outright — joining is a read, never a negotiation between two copies.
      // What this device holds locally is a cache of that same document.
      try {
        const theirs = await sync.fetchDoc();
        if (theirs) {
          // Recipes and sides saved before saveNow pushed anything live only
          // on this device. Publish that backlog once, on the way in, or it
          // stays invisible to the crew until each item is edited again.
          //
          // Strictly once per device: see REPUBLISH_KEY. The flag is only set
          // after the push is confirmed, so a launch with no reception tries
          // again next time instead of losing the work.
          const done = await storage.get(REPUBLISH_KEY, false).catch(() => null);
          const stranded = done ? null : unpublished(next, theirs);
          next = hydrate(theirs);
          if (stranded) {
            await sync.enqueue(stranded);
            const after = sync.status();
            if (!after.error && after.pending === 0) {
              next = hydrate(sync.view() || stranded(next));
              await storage.set(REPUBLISH_KEY, '1', false).catch(() => {});
            }
          } else if (!done) {
            // Nothing owed. Record that, so this never runs again.
            await storage.set(REPUBLISH_KEY, '1', false).catch(() => {});
          }
        } else if (next) {
          // Nobody has published this camp yet, so this device seeds it.
          sync.enqueue((doc) => doc || next);
        }
      } catch (err) {
        // No reception, or no backend configured. The cache carries the app.
        if (!cancelled) setSyncStatus({ ...sync.status(), error: describe(err) });
      }

      if (cancelled) return;
      latest.current = next;
      setState(next);
      setLoading(false);

      // Persist a schema upgrade once, rather than re-running the migration
      // on every open and leaving two shapes alive in storage indefinitely.
      // Only when the version actually moved — never a write just for opening.
      if (upgradedFrom !== null) {
        write(next);
      }
    })();
    return () => { cancelled = true; };
    // `write` is stable (useCallback with no deps) and defined before this
    // effect ever runs, so it does not need to be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sync.subscribe(setSyncStatus), []);

  /**
   * Live updates. The poll adopts anything a teammate pushed; local edits
   * still in the queue are layered on top by sync.view(), so a change arriving
   * mid-edit never discards what is being typed.
   */
  useEffect(() => sync.startPolling(() => {
    const fresh = sync.view();
    if (!fresh) return;
    const hydrated = hydrate(fresh);
    latest.current = hydrated;
    setState(hydrated);
    storage.set(STORAGE_KEY, JSON.stringify(hydrated), false).catch(() => {});
  }), []);

  /* ------------------------------------------------------------- save */

  const write = useCallback(async (value) => {
    setSaveState('saving');
    try {
      // The local record is the offline cache and is always written. Pushing
      // to the camp is queued separately by `update`, so a network problem is
      // a sync warning and never a lost edit.
      await storage.set(STORAGE_KEY, JSON.stringify(value), false);
      setSaveError(null);
      setSaveState('saved');
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1800);
      return true;
    } catch (err) {
      setSaveError(describe(err));
      setSaveState('error');
      return false;
    }
  }, []);

  const schedule = useCallback((value) => {
    clearTimeout(timer.current);
    setSaveState('saving');
    timer.current = setTimeout(() => write(value), DEBOUNCE_MS);
  }, [write]);

  /**
   * Apply a change.
   *
   * `fn` must be a pure transform of the document it is given — it is shown
   * immediately, cached locally, and also queued for the camp, where it may be
   * replayed against a newer document a teammate pushed in the meantime.
   * Closing over a captured snapshot instead of using the passed value would
   * make that replay overwrite their work.
   */
  const update = useCallback((fn) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (!next || next === prev) return prev;
      latest.current = next;
      schedule(next);
      return next;
    });
    sync.enqueue(fn);
  }, [schedule]);

  /**
   * An edit that cannot wait for the debounce — saving a recipe, where the
   * editor stays open until the write is confirmed.
   *
   * This is `update` without the 600ms wait, and like `update` it queues the
   * change for the camp. It did not, once, and that was the whole bug: every
   * recipe and every side dish was written to this device and never pushed,
   * so a teammate who joined got a real camp with none of the cooking in it.
   *
   * `fn` must be a pure transform of the document it is handed, for the same
   * reason as in `update` — it may be replayed against a newer document.
   *
   * The returned boolean means "safely stored on this device", not "reached
   * the camp". A recipe written in a field with no signal is saved, and the
   * queue delivers it later; the cloud's state is reported by the sync badge,
   * not by conflating it with data loss.
   */
  const saveNow = useCallback(async (fn) => {
    clearTimeout(timer.current);
    let value = latest.current;
    if (fn) {
      value = fn(latest.current);
      latest.current = value;
      setState(value);
      sync.enqueue(fn);
    }
    return write(value);
  }, [write]);

  /**
   * Take on a document that came from the server — joining a camp.
   *
   * Local only, deliberately. Pushing it back would be a whole-document
   * write of something the server already has, which is the shape of edit
   * that used to let one device flatten another's work.
   */
  const adoptRemote = useCallback(async (doc) => {
    latest.current = doc;
    setState(doc);
    return write(doc);
  }, [write]);

  /**
   * Replace the camp document outright — a reset, or a restore from a backup
   * file. Unlike an edit, this does not merge with anything: it declares what
   * the camp now is, for everyone holding the code.
   *
   * The callers say so plainly before they get here. It is the one operation
   * in the app that can discard a teammate's work, so it exists as its own
   * named function rather than hiding inside a save.
   */
  const replaceCamp = useCallback(async (doc) => {
    latest.current = doc;
    setState(doc);
    sync.enqueue(() => doc);
    return write(doc);
  }, [write]);

  const retrySave = useCallback(() => write(latest.current), [write]);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** Flush a pending debounce if the tab is closing mid-edit. */
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        write(latest.current);
      }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => window.removeEventListener('pagehide', flush);
  }, [write]);

  const memoryOnly = useMemo(() => getFallbackReason(), [saveState]);

  return {
    state,
    loading,
    update,
    saveNow,
    adoptRemote,
    replaceCamp,
    setState,
    saveState,
    saveError,
    retrySave,
    corrupt,
    dismissCorrupt: () => setCorrupt(null),
    memoryOnly,
    syncStatus,
    /**
     * Pull the camp, then push whatever this device still owes it.
     *
     * Reports what actually happened. It used to say "refreshed" whenever the
     * server returned any document at all, even when the push that followed
     * failed and this device's work never left the phone — which is how a
     * camp code got shared with a crew that could not see the recipes.
     */
    refreshFromCloud: async () => {
      const theirs = await sync.fetchDoc();
      await sync.flush();

      const after = sync.status();
      if (after.error) throw new Error(after.error);
      if (after.pending > 0) {
        throw new Error(`${after.pending} שינויים עדיין לא נשלחו למחנה`);
      }

      if (!theirs) return false;
      const fresh = hydrate(sync.view() || theirs);
      latest.current = fresh;
      setState(fresh);
      await write(fresh);
      return true;
    },
  };
}

/**
 * Entities this device holds that the camp has never seen.
 *
 * For a while `saveNow` wrote recipes and sides to local storage and never
 * queued them, so a device can be carrying work the server has no idea about.
 * Fixing the save path does not retrieve any of it: the queue only ever holds
 * new edits. This publishes the backlog, once, when the app opens.
 *
 * It is add-only on purpose, and is not a document merge coming back:
 *
 *  - An id the server already has is left completely alone, whatever this
 *    device thinks it should contain. The server is still the truth.
 *  - An id the server has tombstoned is skipped, or a device that never saw
 *    the deletion would resurrect a recipe someone deliberately removed.
 *
 * Returns a pure transform to enqueue, or null when there is nothing to send.
 */
const PUBLISHABLE = ['recipes', 'sides'];

export function unpublished(mine, theirs) {
  const missing = {};
  let found = 0;

  for (const bag of PUBLISHABLE) {
    for (const [id, item] of Object.entries(mine?.[bag] || {})) {
      if (!item || item._deleted) continue;
      const remote = theirs?.[bag]?.[id];
      if (remote) continue;              // theirs wins, including tombstones
      (missing[bag] ||= {})[id] = item;
      found++;
    }
  }

  if (!found) return null;
  return (doc) => {
    const out = { ...doc };
    for (const [bag, items] of Object.entries(missing)) {
      // Anything that arrived since still wins — this only fills the gaps.
      out[bag] = { ...items, ...(doc?.[bag] || {}) };
    }
    return out;
  };
}

function describe(err) {
  if (!err) return 'שגיאה לא ידועה';
  const name = err.name || '';
  const msg = err.message || String(err);
  if (name === 'QuotaExceededError' || /quota/i.test(msg)) {
    return 'נגמר מקום האחסון בדפדפן. מחק תמונות מתכונים או ייצא גיבוי ואפס.';
  }
  return msg;
}

/** Stamp an entity as changed. Every mutation goes through this so the
 *  merge in sync.js has something to compare. */
export const touch = (obj) => ({ ...obj, _ts: now() });
