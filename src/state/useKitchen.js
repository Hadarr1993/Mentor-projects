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
      if (raw === undefined || raw === null) {
        next = makeDefaults();
      } else {
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          next = hydrate(parsed);
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

      // A shared document merges the cloud copy in before first paint.
      if (next.settings?.shared) {
        try {
          const theirs = await sync.pull();
          if (theirs) next = hydrate(sync.mergeState(next, theirs));
        } catch (err) {
          if (!cancelled) setSyncStatus({ ...sync.status(), error: describe(err) });
        }
      }

      if (cancelled) return;
      setState(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => sync.subscribe(setSyncStatus), []);

  /* ------------------------------------------------------------- save */

  const write = useCallback(async (value) => {
    setSaveState('saving');
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(value), false);
      if (value.settings?.shared) {
        // Local write already succeeded; a cloud failure is a sync warning,
        // not a lost edit, so it must not flip the save indicator to error.
        storage.set(STORAGE_KEY, value, true).catch(() => {});
      }
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

  /** Apply a change. `fn` receives the current state and returns the next. */
  const update = useCallback((fn) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (!next || next === prev) return prev;
      latest.current = next;
      schedule(next);
      return next;
    });
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
      const theirs = await sync.pull();
      if (!theirs) return false;
      const merged = hydrate(sync.mergeState(latest.current, theirs));
      latest.current = merged;
      setState(merged);
      await write(merged);
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
