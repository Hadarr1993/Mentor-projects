import { useCallback, useEffect, useRef, useState } from 'react';
import { Reveal } from './motion.jsx';
import { Icon } from './Icon.jsx';

/* ── Toast ──────────────────────────────────────────────────────────── */

let pushToast = () => {};
export const toast = (message, tone = 'ok') => pushToast(message, tone);

export function ToastHost() {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);
  const timers = useRef(new Set());

  useEffect(() => {
    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms);
      timers.current.add(t);
    };

    pushToast = (message, tone) => {
      const id = ++idRef.current;
      // Mounted in its "entering" position, then released on the next frame
      // so the browser has a start value to transition away from. A single
      // rAF is not always enough — the first one can land in the same frame
      // as the paint that mounted the element.
      setItems((xs) => [...xs, { id, message, tone, state: 'entering' }]);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, state: 'in' } : x)));
      }));

      later(() => {
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, state: 'leaving' } : x)));
        later(() => setItems((xs) => xs.filter((x) => x.id !== id)), 180);
      }, 2600);
    };

    const pending = timers.current;
    return () => {
      pushToast = () => {};
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.tone === 'danger' ? 'toast-danger' : ''}`}
          data-state={t.state}
        >
          <Icon name={t.tone === 'danger' ? 'error' : 'done'} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Confirm-by-second-press ────────────────────────────────────────────
   A destructive action asks once, inline, and forgets after a few seconds.
   No modal — a dialog for every delete trains people to dismiss dialogs. */

export function ConfirmButton({ onConfirm, children = 'מחק', className = 'btn btn-sm btn-danger', icon = 'trash', title }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const click = () => {
    if (armed) {
      clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 3500);
    }
  };

  return (
    <button type="button" className={className} onClick={click} title={title}
            aria-label={armed ? 'לאשר מחיקה' : title || 'מחק'}>
      <Icon name={armed ? 'warn' : icon} />
      {armed ? 'בטוח?' : children}
    </button>
  );
}

/* ── Recipe mark ────────────────────────────────────────────────────── */

export function RecipeMark({ item, large = false }) {
  if (!item) return null;
  return (
    <div className={`mark ${large ? 'mark-lg' : ''}`}>
      {item.img
        ? <img src={item.img} alt="" loading="lazy" />
        : <Icon name={item.iconKey || 'other'} size={large ? '1.8rem' : '1.3rem'} strokeWidth={1.9} />}
    </div>
  );
}

/* ── Checkbox ───────────────────────────────────────────────────────── */

export function Check({ checked, onChange, label, className = '' }) {
  return (
    <label className={`check ${checked ? 'done' : ''} ${className}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="box"><Icon name="check" size="0.9rem" strokeWidth={3} /></span>
      {label != null && <span className="label grow">{label}</span>}
    </label>
  );
}

/* ── Chip picker ────────────────────────────────────────────────────── */

export function ChipPicker({ options, selected, onToggle, empty = 'אין פריטים' }) {
  if (!options.length) return <div className="tiny dim">{empty}</div>;
  return (
    <div className="row wrap" style={{ gap: '0.4rem' }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="chip"
          aria-pressed={selected.includes(o.id)}
          onClick={() => onToggle(o.id)}
        >
          {o.iconKey && <Icon name={o.iconKey} size="0.95em" strokeWidth={2} />}
          {o.name}
        </button>
      ))}
    </div>
  );
}

/* ── Error box (never an alert) ─────────────────────────────────────── */

export function ErrorBox({ error, onRetry, onDismiss }) {
  if (!error) return null;
  return (
    <div className="errorbox">
      <div className="row" style={{ alignItems: 'flex-start', gap: '0.5rem' }}>
        <Icon name="error" />
        <div className="grow">{error}</div>
      </div>
      {(onRetry || onDismiss) && (
        <div className="row" style={{ marginTop: '0.6rem', gap: '0.4rem' }}>
          {onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}><Icon name="refresh" />נסה שוב</button>}
          {onDismiss && <button type="button" className="btn btn-sm btn-quiet" onClick={onDismiss}>סגור</button>}
        </div>
      )}
    </div>
  );
}

/* ── Number stepper ─────────────────────────────────────────────────── */

export function NumberField({ value, onChange, min = 0, max = 9999, step = 1, suffix, placeholder, ariaLabel }) {
  return (
    <div className="row" style={{ gap: '0.3rem' }}>
      <input
        type="number"
        className="input input-sm num"
        style={{ width: '5rem' }}
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : Math.max(min, Math.min(max, Number(v))));
        }}
      />
      {suffix && <span className="tiny dim">{suffix}</span>}
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────────── */

export function Empty({ icon = 'info', title, hint, action }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
      <div style={{ color: 'var(--ink-3)', marginBottom: '0.6rem' }}>
        <Icon name={icon} size="2rem" strokeWidth={1.6} />
      </div>
      <h3 style={{ marginBottom: '0.3rem' }}>{title}</h3>
      {hint && <div className="small muted" style={{ marginBottom: action ? '1rem' : 0 }}>{hint}</div>}
      {action}
    </div>
  );
}

/* ── Collapsible ────────────────────────────────────────────────────── */

export function Collapsible({ title, icon, defaultOpen = false, right, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <div className="spread">
        <button
          type="button"
          className="btn btn-quiet grow"
          style={{ justifyContent: 'flex-start', padding: '0.2rem 0' }}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {icon && <Icon name={icon} />}
          <h3 className="grow" style={{ textAlign: 'start' }}>{title}</h3>
          <span style={{
            display: 'inline-flex',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 260ms cubic-bezier(0.22,0.61,0.36,1)',
          }}>
            <Icon name="expand" />
          </span>
        </button>
        {right}
      </div>
      <Reveal open={open}>
        <div style={{ marginTop: 'var(--s3)' }}>{children}</div>
      </Reveal>
    </div>
  );
}

/* ── Copy to clipboard ──────────────────────────────────────────────── */

export function useCopy() {
  return useCallback(async (text, okMessage = 'הועתק') => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast(okMessage);
      return true;
    } catch (err) {
      toast(`ההעתקה נכשלה: ${err.message}`, 'danger');
      return false;
    }
  }, []);
}
