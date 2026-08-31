import { useCallback, useEffect, useState } from 'react';
import { storage } from './storage.js';
import { DEVICE_KEY } from './schema.js';

/**
 * Who is holding this device.
 *
 * Stored under its own key and never synced. It cannot live in `settings`,
 * which merges as a single object with last-writer-wins — a name there would
 * be overwritten across devices, and every phone would end up thinking it
 * belonged to whoever saved most recently.
 *
 * An empty name is a normal state, not an error: a task closed from a device
 * that never picked a name is recorded as done, simply without a name
 * attached. Nothing is invented.
 */
export function useDevice() {
  const [me, setMe] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await storage.get(DEVICE_KEY, false);
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!cancelled && parsed?.me) setMe(String(parsed.me));
      } catch {
        // A missing or unreadable device record is not worth surfacing —
        // the app works fine without a name.
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const chooseMe = useCallback(async (name) => {
    const value = String(name || '').trim();
    setMe(value);
    try {
      await storage.set(DEVICE_KEY, JSON.stringify({ me: value }), false);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { me, chooseMe, ready };
}
