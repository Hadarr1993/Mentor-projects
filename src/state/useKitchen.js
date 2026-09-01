import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storage, getFallbackReason } from './storage.js';
import * as sync from './sync.js';
import {
  STORAGE_KEY,
  CORRUPT_KEY,
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
          next = hydrate(theirs);
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

  /** Commit immediately and report whether the write actually landed. */
  const saveNow = useCallback(async (fn) => {
    clearTimeout(timer.current);
    let value = latest.current;
    if (fn) {
      value = fn(latest.current);
      latest.current = value;
      setState(value);
    }
    return write(value);
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
    setState,
    saveState,
    saveError,
    retrySave,
    corrupt,
    dismissCorrupt: () => setCorrupt(null),
    memoryOnly,
    syncStatus,
    refreshFromCloud: async () => {
      const theirs = await sync.fetchDoc();
      await sync.flush();
      if (!theirs) return false;
      const fresh = hydrate(sync.view() || theirs);
      latest.current = fresh;
      setState(fresh);
      await write(fresh);
      return true;
    },
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
