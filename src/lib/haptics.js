/**
 * A short buzz at the moment something is committed.
 *
 * In a kitchen your eyes are on the pot and your hand is on the phone. A tick
 * you can feel means you do not have to look back at the screen to know it
 * registered.
 *
 * ⚠️ `navigator.vibrate` is Android and desktop Chrome only. **Safari on
 * iPhone does not support it**, and there is no substitute a web page can
 * reach — the Taptic Engine is not exposed to the web. Anyone on the crew
 * using an iPhone will feel nothing at all. This is a bonus for some of the
 * team, never a channel anything depends on: every one of these moments also
 * has a visual result, and always must.
 *
 * Kept to commit moments only. Feedback on everything trains people to stop
 * noticing it.
 */

/** Two short pulses are a notification; one brief tick is a confirmation. */
const TICK = 12;

export function haptic(pattern = TICK) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // A blocked or absent Vibration API is not an error worth surfacing.
  }
}
