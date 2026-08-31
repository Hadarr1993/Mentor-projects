import { useEffect, useRef } from 'react';
import { useDragScroll } from '../lib/spring.js';

/**
 * Horizontal day picker.
 *
 * Dragged 1:1 with the pointer, with momentum on release and progressive
 * resistance at the ends instead of a hard stop. A drag that moved swallows
 * the click that would otherwise land on a day chip.
 */
export function DayStrip({ days, selected, onSelect, todayIdx }) {
  const ref = useRef(null);
  const didDrag = useDragScroll(ref);
  const chipRefs = useRef([]);

  // Keep the selected day in view when it changes from elsewhere
  // (the Today tab auto-selecting the real date, for instance).
  useEffect(() => {
    const el = chipRefs.current[selected];
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selected]);

  return (
    <div className="daystrip" ref={ref} role="tablist" aria-label="בחירת יום">
      {days.map((d, i) => (
        <button
          key={d.key}
          ref={(el) => { chipRefs.current[i] = el; }}
          type="button"
          role="tab"
          className={`daychip ${i === todayIdx ? 'daychip-today' : ''}`}
          aria-pressed={i === selected}
          aria-selected={i === selected}
          onClick={() => { if (!didDrag()) onSelect(i); }}
        >
          <b>{d.weekday}</b>
          <span className="num">{d.short}</span>
        </button>
      ))}
    </div>
  );
}

export default DayStrip;
