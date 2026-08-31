import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Springs, hand-rolled on requestAnimationFrame.
 *
 * A spring is used instead of a CSS transition wherever a gesture can
 * interrupt the motion: it always integrates from the value currently on
 * screen, so grabbing a moving element mid-flight and reversing it is free.
 * A CSS transition would have to restart from its declared target and jump.
 *
 * Parameters follow Apple's designer-facing pair rather than the physics
 * triplet:
 *   damping  1.0 = critically damped, no overshoot (the default for UI)
 *            0.8 = a little bounce, earned only after real momentum
 *   response      seconds to reach the target; not a duration — a spring
 *                 has none, its settle time emerges from the parameters
 */

export const SPRING = {
  default: { damping: 1.0, response: 0.35 },
  move:    { damping: 1.0, response: 0.4 },
  momentum:{ damping: 0.8, response: 0.4 },
  sheet:   { damping: 0.8, response: 0.3 },
};

const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * An imperative spring. Read `.current` every frame; call `.set()` to
 * re-target without losing the current position or velocity.
 */
export function createSpring(initial, config = SPRING.default, onFrame) {
  let value = initial;
  let velocity = 0;
  let target = initial;
  let raf = null;
  let last = 0;
  let { damping, response } = config;

  const tick = (t) => {
    const dt = Math.min((t - last) / 1000, 1 / 30); // clamp after a tab stall
    last = t;

    const omega = (2 * Math.PI) / response;
    const zeta = damping;

    // Semi-implicit Euler, substepped so a long frame stays stable.
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const accel = -2 * zeta * omega * velocity - omega * omega * (value - target);
      velocity += accel * h;
      value += velocity * h;
    }

    const settled = Math.abs(value - target) < 0.01 && Math.abs(velocity) < 0.05;
    if (settled) {
      value = target;
      velocity = 0;
      raf = null;
      onFrame?.(value, true);
      return;
    }
    onFrame?.(value, false);
    raf = requestAnimationFrame(tick);
  };

  const start = () => {
    if (raf !== null) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  return {
    get current() { return value; },
    get velocity() { return velocity; },
    get target() { return target; },
    /** Re-target. Position and velocity carry over, so a reversal blends
     *  instead of hitting a brick wall. */
    set(next, opts = {}) {
      target = next;
      if (opts.velocity !== undefined) velocity = opts.velocity;
      if (opts.config) ({ damping, response } = opts.config);
      if (prefersReducedMotion() && !opts.force) {
        value = next; velocity = 0;
        onFrame?.(value, true);
        return;
      }
      start();
    },
    /** Hard set — used while a finger is down and tracking is 1:1. */
    jump(next, vel = 0) {
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      value = next; target = next; velocity = vel;
      onFrame?.(value, true);
    },
    setVelocity(v) { velocity = v; },
    stop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } },
  };
}

/** React binding: returns [value, setTarget]. */
export function useSpring(initial, config = SPRING.default) {
  const [value, setValue] = useState(initial);
  const ref = useRef(null);
  if (ref.current === null) {
    ref.current = createSpring(initial, config, (v) => setValue(v));
  }
  useEffect(() => () => ref.current?.stop(), []);
  const set = useCallback((t, opts) => ref.current.set(t, opts), []);
  return [value, set, ref.current];
}

/**
 * Where a flick would come to rest, using the exponential-decay model that
 * matches native scroll deceleration. The textbook v²/2a form is not what
 * this should be — it decelerates too abruptly to feel like a throw.
 */
export function project(velocity, decelerationRate = 0.998) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

/**
 * Progressive resistance past a boundary. A hard stop reads as frozen;
 * resistance reads as responsive with nothing further to reach.
 */
export function rubberband(overshoot, dimension, constant = 0.55) {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * 1:1 horizontal drag with momentum, for the day strip.
 *
 * Tracks a short velocity history rather than a single delta, keeps
 * pointer capture so a finger leaving the element keeps working, and hands
 * the release velocity to the deceleration so there is no seam between
 * dragging and coasting.
 */
export function useDragScroll(ref) {
  const state = useRef({ dragging: false, moved: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const s = state.current;
    let history = [];
    let raf = null;

    const stopGlide = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } };

    const maxScroll = () => Math.max(0, el.scrollWidth - el.clientWidth);

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stopGlide();
      s.dragging = true;
      s.moved = false;
      s.startX = e.clientX;
      // Respect where the strip was grabbed, not where its centre is.
      s.startScroll = el.scrollLeft;
      history = [{ x: e.clientX, t: performance.now() }];
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('dragging');
    };

    const onMove = (e) => {
      if (!s.dragging) return;
      const dx = e.clientX - s.startX;
      if (!s.moved && Math.abs(dx) < 8) return; // hysteresis before committing
      s.moved = true;

      // RTL scrollLeft runs negative in this direction; clamp against the
      // real range and rubber-band beyond it rather than stopping dead.
      let next = s.startScroll + dx;
      const min = -maxScroll();
      const max = 0;
      if (next > max) next = max + rubberband(next - max, el.clientWidth);
      else if (next < min) next = min - rubberband(min - next, el.clientWidth);
      el.scrollLeft = next;

      history.push({ x: e.clientX, t: performance.now() });
      if (history.length > 6) history.shift();
      e.preventDefault();
    };

    const onUp = (e) => {
      if (!s.dragging) return;
      s.dragging = false;
      el.classList.remove('dragging');
      el.releasePointerCapture?.(e.pointerId);
      if (!s.moved) return;

      // Velocity from the recent history, not the last event alone.
      const nowT = performance.now();
      const recent = history.filter((h) => nowT - h.t < 120);
      let velocity = 0;
      if (recent.length >= 2) {
        const a = recent[0];
        const b = recent[recent.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0) velocity = (b.x - a.x) / dt;
      }

      const min = -maxScroll();
      const start = el.scrollLeft;
      const clampedStart = Math.min(0, Math.max(min, start));

      // Out of bounds: spring straight back, ignoring the flick.
      if (start !== clampedStart) {
        glideTo(clampedStart, 0);
        return;
      }
      if (Math.abs(velocity) < 60) return;
      glideTo(Math.min(0, Math.max(min, start + project(velocity))), velocity);
    };

    function glideTo(target, velocity) {
      const spring = createSpring(el.scrollLeft, SPRING.momentum, (v, done) => {
        el.scrollLeft = v;
        if (done) raf = null;
      });
      spring.setVelocity(velocity);
      spring.set(target);
      raf = 1; // marker so a new gesture can cancel
      const cancel = () => spring.stop();
      el.addEventListener('pointerdown', cancel, { once: true });
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      stopGlide();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [ref]);

  /** True when the pointer moved enough to be a drag — used to swallow the
   *  click that would otherwise fire at the end of a swipe. */
  return () => state.current.moved;
}

/**
 * FLIP reordering for a list.
 *
 * When a row changes position — a task ticked off dropping to the bottom —
 * the browser repaints it in its new slot instantly. That reads as a glitch:
 * the row you were looking at is suddenly somewhere else. FLIP measures where
 * each row was, lets the DOM settle, then springs the difference away, so the
 * eye can follow the row to its new home.
 *
 * Rows opt in with `data-flip-key`. Positions are measured with `offsetTop`
 * rather than getBoundingClientRect, so a page scroll between renders cannot
 * be mistaken for movement.
 */
export function useFlipList(ref, deps) {
  const previous = useRef(new Map());

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;

    const nodes = [...container.querySelectorAll('[data-flip-key]')];
    const next = new Map();
    const springs = [];

    for (const node of nodes) {
      const key = node.dataset.flipKey;
      const top = node.offsetTop;
      next.set(key, top);

      const before = previous.current.get(key);
      // A row that was not on screen last time has nowhere to travel from.
      if (before === undefined) continue;

      const delta = before - top;
      if (Math.abs(delta) < 1) continue;

      node.style.willChange = 'transform';
      const spring = createSpring(delta, SPRING.move, (v, settled) => {
        node.style.transform = settled ? '' : `translate3d(0, ${v}px, 0)`;
        if (settled) node.style.willChange = '';
      });
      spring.set(0);
      springs.push(spring);
    }

    previous.current = next;
    // Abandoning mid-flight leaves a stray transform; clear it on teardown.
    return () => {
      for (const s of springs) s.stop();
      for (const node of nodes) {
        node.style.transform = '';
        node.style.willChange = '';
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
