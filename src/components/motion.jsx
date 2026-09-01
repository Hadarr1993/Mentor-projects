import { useLayoutEffect, useRef, useState } from 'react';
import { createSpring, SPRING } from '../lib/spring.js';

/**
 * The three places this app changes screens.
 *
 * All of them used to be hard cuts. A cut is not neutral — it costs the eye a
 * moment to work out that the thing in front of it is a different screen and
 * not the same one redrawn wrong. A short, directional move answers that
 * question before it is asked.
 *
 * Everything here runs on the springs in lib/spring.js, which collapse to an
 * instant jump under `prefers-reduced-motion`. Nothing below needs to check
 * that flag itself.
 */

/* ── Tabs ─────────────────────────────────────────────────────────────── */

/** How far a panel travels on the way in. Enough to read as a direction, not
 *  far enough to be a slide the user has to wait out. */
const TAB_OFFSET = 22;

/**
 * A tab panel arrives from the side it lives on.
 *
 * Transforms are physical, not logical: positive X is to the right on screen
 * whatever the writing direction. The layout is RTL, so a higher tab index
 * sits further left — App works out the sign and hands it over.
 *
 * Only the incoming panel moves. Keeping the outgoing one mounted for a true
 * two-layer cross-fade would mean two copies of a tab alive at once, and the
 * exiting copy would remount and re-run its effects for the sake of 300ms of
 * fade. The direction is what carries the meaning; the second layer does not.
 */
export function TabPanel({ tabKey, direction, children }) {
  const ref = useRef(null);
  const springRef = useRef(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    // The first paint is an arrival at the app, not a move between tabs.
    if (first.current) { first.current = false; return; }

    const el = ref.current;
    if (!el) return;

    const apply = (p, settled) => {
      const node = ref.current;
      if (!node) return;
      if (settled) {
        node.style.transform = '';
        node.style.opacity = '';
        node.style.willChange = '';
        return;
      }
      node.style.transform = `translate3d(${(1 - p) * TAB_OFFSET * direction}px, 0, 0)`;
      node.style.opacity = String(Math.min(1, 0.4 + p * 0.6));
    };

    // Set the starting frame before the browser paints, or the panel appears
    // in place for one frame and then jumps aside.
    el.style.willChange = 'transform, opacity';
    apply(0, false);

    springRef.current?.stop();
    springRef.current = createSpring(0, SPRING.default, apply);
    springRef.current.set(1);

    return () => springRef.current?.stop();
    // `direction` is read at the moment the tab changes; it is not its own trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  return <div ref={ref}>{children}</div>;
}

/* ── Sheets ───────────────────────────────────────────────────────────── */

/**
 * A panel that takes over the screen — the recipe editor — entering and
 * leaving along the same path.
 *
 * `originRef` may hold a client-coordinate point captured when the control
 * that opened it was pressed. The sheet then scales out of that point and
 * collapses back into it, which is what makes the button and the screen it
 * opened feel like one object rather than two.
 *
 * Children are held on screen while the sheet leaves; `open` going false is
 * the start of the exit, not the end of it.
 */
export function Sheet({ open, originRef, onExited, children }) {
  const held = useRef(null);
  // Read through a ref for the same reason Reveal does: the spring callback
  // outlives the render that created it.
  const exitedRef = useRef(onExited);
  exitedRef.current = onExited;
  if (open) held.current = children;

  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  const ref = useRef(null);
  const springRef = useRef(null);

  useLayoutEffect(() => {
    if (!present) return;
    const el = ref.current;
    if (!el) return;

    if (open) {
      const point = originRef?.current;
      if (point) {
        const box = el.getBoundingClientRect();
        el.style.transformOrigin = `${point.x - box.left}px ${point.y - box.top}px`;
      } else {
        el.style.transformOrigin = '50% 0';
      }
    }

    const apply = (p, settled) => {
      const node = ref.current;
      if (!node) return;
      if (settled && p >= 1) {
        node.style.transform = '';
        node.style.opacity = '';
        node.style.willChange = '';
        node.style.transformOrigin = '';
        return;
      }
      node.style.transform = `translate3d(0, ${(1 - p) * 24}px, 0) scale(${0.965 + p * 0.035})`;
      node.style.opacity = String(Math.max(0, Math.min(1, p)));
      if (settled && p <= 0) { setPresent(false); exitedRef.current?.(); }
    };

    el.style.willChange = 'transform, opacity';

    if (!springRef.current) {
      apply(0, false);
      springRef.current = createSpring(0, SPRING.sheet, apply);
    }
    springRef.current.set(open ? 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, present, originRef]);

  useLayoutEffect(() => () => springRef.current?.stop(), []);

  if (!present) return null;
  return <div ref={ref}>{held.current}</div>;
}

/* ── Collapsible content ──────────────────────────────────────────────── */

/**
 * Content that grows and shrinks instead of appearing and vanishing.
 *
 * Height is not a compositor-friendly property, and normally that rules it
 * out. Here it is the honest one: the card below has to move, and faking that
 * with a transform would leave a hole in the layout. These are short panels
 * in a settings screen, opened one at a time.
 *
 * Children unmount once the panel has finished closing, so a collapsed panel
 * never leaves focusable controls behind for a keyboard or a screen reader
 * to find.
 */
export function Reveal({ open, children }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const springRef = useRef(null);
  const first = useRef(true);

  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  /**
   * The spring's callback outlives the render that made it, so everything it
   * reads has to come from a ref. Capturing `open` instead left the panel
   * still believing it was opening all the way back down: it faded out but
   * held its full height, leaving a blank gap where the content had been.
   */
  const openRef = useRef(open);
  openRef.current = open;
  const fullRef = useRef(0);

  useLayoutEffect(() => {
    const box = outer.current;
    if (!box) return;

    // The first paint is a starting state, not a change to animate.
    if (first.current) {
      first.current = false;
      box.style.height = open ? 'auto' : '0px';
      box.style.opacity = open ? '1' : '0';
      if (!open) setPresent(false);
      return;
    }
    if (!present) return;

    fullRef.current = inner.current?.offsetHeight || 0;

    if (!springRef.current) {
      springRef.current = createSpring(0, SPRING.default, (v, settled) => {
        const node = outer.current;
        if (!node) return;
        const isOpen = openRef.current;
        const full = fullRef.current;
        const h = Math.max(0, v);
        node.style.height = settled && isOpen ? 'auto' : `${h}px`;
        node.style.opacity = String(full ? Math.max(0, Math.min(1, h / full)) : 1);
        // Only a real arrival at zero unmounts the children — `jump` below
        // also reports itself settled, and that one is a seed, not an end.
        if (settled && !isOpen && h === 0) setPresent(false);
      });
      box.style.height = '0px';
      box.style.opacity = '0';
    } else if (!open) {
      // While open the height was left on `auto`, so the spring's own value
      // is stale. Start the close from what is actually on screen.
      springRef.current.jump(box.offsetHeight);
    }
    springRef.current.set(open ? fullRef.current : 0);
  }, [open, present]);

  useLayoutEffect(() => () => springRef.current?.stop(), []);

  return (
    <div ref={outer} style={{ overflow: 'hidden' }}>
      <div ref={inner}>{present ? children : null}</div>
    </div>
  );
}
