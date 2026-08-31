import { useMemo, useState } from 'react';
import { Icon, categoryIcon } from '../components/Icon.jsx';
import { Check, Empty, ConfirmButton, useCopy, toast } from '../components/ui.jsx';
import { CATEGORIES, UNITS, SCALE_MODES, SCALE_LABELS, SCALE_HINTS } from '../data/constants.js';
import { dayList, shoppingList, groupByCategory, shoppingTotals, formatQty } from '../lib/calc.js';
import { touch } from '../state/useKitchen.js';
import { now } from '../state/schema.js';

export function Shopping({ state, update }) {
  const copy = useCopy();
  const days = useMemo(
    () => dayList(state.settings.startDate, state.settings.days),
    [state.settings.startDate, state.settings.days],
  );
  const rows = useMemo(() => shoppingList(state, days), [state, days]);
  const groups = useMemo(() => groupByCategory(rows, CATEGORIES), [rows]);
  const totals = useMemo(
    () => shoppingTotals(rows, state.shopping, state.settings.people),
    [rows, state.shopping, state.settings.people],
  );

  const budget = Number(state.settings.budget) || 0;
  const overBudget = budget > 0 && totals.total > budget;

  /** Each item carries its own timestamp, so a teammate ticking a different
   *  item at the same time merges instead of overwriting the whole list. */
  const patchItem = (key, patch) =>
    update((s) => ({
      ...s,
      shopping: touch({
        ...s.shopping,
        items: {
          ...s.shopping.items,
          [key]: { ...(s.shopping.items?.[key] || {}), ...patch, _ts: now() },
        },
      }),
    }));

  const setBought = (key, value) => patchItem(key, { bought: value });

  const setPrice = (key, value) =>
    patchItem(key, { price: value === null || value === '' ? undefined : value });

  /** Clearing has to stamp each item, not drop the map — an unstamped removal
   *  would be silently undone by the next merge from another device. */
  const clearBought = () =>
    update((s) => {
      const ts = now();
      const items = Object.fromEntries(
        Object.entries(s.shopping.items || {}).map(([k, v]) => [k, { ...v, bought: false, _ts: ts }]),
      );
      return { ...s, shopping: touch({ ...s.shopping, items }) };
    });

  const toWhatsApp = () => {
    const lines = [`*רשימת קניות — קאמפ פרדייז*`, `${state.settings.people} סועדים · ${days.length} ימים`, ''];
    for (const g of groups) {
      lines.push(`*${g.category}*`);
      for (const r of g.items) {
        const done = state.shopping.items?.[r.key]?.bought ? '✓ ' : '';
        lines.push(`${done}${r.n} — ${formatQty(r.q, r.u)}`);
      }
      lines.push('');
    }
    if (totals.total > 0) {
      lines.push(`סה"כ משוער: ${Math.round(totals.total)} ₪ (${totals.perPerson.toFixed(1)} ₪ לאדם)`);
    }
    copy(lines.join('\n'), 'הרשימה הועתקה — הדבק בוואטסאפ');
  };

  if (!rows.length) {
    return (
      <div className="stack">
        <AddExtra state={state} update={update} />
        <Empty icon="shopping" title="אין מה לקנות עדיין"
               hint="שבץ ארוחות בלשונית השבוע, או הוסף פריט ידנית למעלה." />
      </div>
    );
  }

  return (
    <div className="stack">
      <AddExtra state={state} update={update} />
      <div className="card stack-2">
        <div className="spread">
          <h2>רשימת קניות</h2>
          <span className="tag num">{totals.bought}/{totals.count}</span>
        </div>
        <div className="progress"><i style={{ width: `${totals.progress * 100}%` }} /></div>

        <div className="grid-2" style={{ marginTop: '0.5rem' }}>
          <div className="card-inset">
            <div className="eyebrow">עלות משוערת</div>
            <div className="num" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              {Math.round(totals.total)} ₪
            </div>
            <div className="tiny dim">
              {totals.priced} מתוך {totals.count} פריטים מתומחרים
            </div>
          </div>
          <div className="card-inset">
            <div className="eyebrow">לאדם</div>
            <div className="num" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              {totals.perPerson.toFixed(1)} ₪
            </div>
            {budget > 0 && (
              <div className={`tiny ${overBudget ? '' : 'dim'}`}
                   style={overBudget ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                {overBudget
                  ? `חריגה של ${Math.round(totals.total - budget)} ₪ מהתקציב`
                  : `נותרו ${Math.round(budget - totals.total)} ₪ מהתקציב`}
              </div>
            )}
          </div>
        </div>

        <div className="row wrap" style={{ marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-primary" onClick={toWhatsApp}>
            <Icon name="copy" />העתק לוואטסאפ
          </button>
          <button type="button" className="btn btn-quiet" onClick={clearBought}>
            <Icon name="reset" />אפס סימונים
          </button>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.category} className="card">
          <div className="section-title">
            <Icon name={categoryIcon(g.category)} strokeWidth={1.9} />
            <h3 className="grow">{g.category}</h3>
            <span className="tiny dim num">{g.items.length}</span>
          </div>
          <div className="stack-2">
            {g.items.map((r) => {
              const bought = !!state.shopping.items?.[r.key]?.bought;
              return (
                <div key={r.key} className="row" style={{ gap: '0.5rem' }}>
                  <Check
                    checked={bought}
                    onChange={(v) => setBought(r.key, v)}
                    className="grow"
                    label={
                      <span className="row" style={{ gap: '0.4rem' }}>
                        <span className="grow">{r.n}</span>
                        <span className="num small" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {formatQty(r.q, r.u)}
                        </span>
                      </span>
                    }
                  />
                  <input
                    className="input input-sm num"
                    style={{ width: '4.5rem' }}
                    type="number"
                    min="0"
                    step="0.5"
                    inputMode="decimal"
                    placeholder="₪"
                    aria-label={`מחיר עבור ${r.n}`}
                    value={state.shopping.items?.[r.key]?.price ?? ''}
                    onChange={(e) => setPrice(r.key, e.target.value === '' ? null : Number(e.target.value))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Free-form shopping items.
 *
 * Everything else in the list is derived from a recipe and scaled by head
 * count. This is the escape hatch for what the kitchen also needs but nobody
 * eats — foil, bin bags, a gas canister — where a flat quantity is the point.
 */
function AddExtra({ state, update }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blankExtra);
  const items = state.extras?.items || [];

  const add = () => {
    const n = draft.n.trim();
    if (!n) { toast('צריך שם לפריט', 'danger'); return; }
    if (!(Number(draft.q) > 0)) { toast('צריך כמות גדולה מאפס', 'danger'); return; }
    update((s) => ({
      ...s,
      extras: touch({
        ...s.extras,
        items: [...(s.extras?.items || []), { ...draft, n, id: `x${now().toString(36)}` }],
      }),
    }));
    setDraft(blankExtra());
    toast('הפריט נוסף לרשימה');
  };

  const remove = (id) =>
    update((s) => ({
      ...s,
      extras: touch({ ...s.extras, items: s.extras.items.filter((x) => x.id !== id) }),
    }));

  return (
    <div className="card stack-2">
      <div className="spread">
        <button
          type="button"
          className="btn btn-quiet grow"
          style={{ justifyContent: 'flex-start', padding: '0.2rem 0' }}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <Icon name="add" />
          <h3 className="grow" style={{ textAlign: 'start' }}>פריטים שהוספת</h3>
          {items.length > 0 && <span className="tag num">{items.length}</span>}
          <span style={{
            display: 'inline-flex',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 260ms cubic-bezier(0.22,0.61,0.36,1)',
          }}>
            <Icon name="expand" />
          </span>
        </button>
      </div>

      {items.length > 0 && (
        <div className="row wrap" style={{ gap: '0.35rem' }}>
          {items.map((x) => (
            <span key={x.id} className="chip chip-static">
              {x.n} · {x.q} {x.u}
              {x.scale !== 'fixed' && (
                <span className="tiny dim">({SCALE_LABELS[x.scale]})</span>
              )}
              <button
                type="button"
                className="btn btn-quiet"
                style={{ padding: 0, background: 'none', marginInlineStart: '0.15rem' }}
                aria-label={`הסר את ${x.n}`}
                onClick={() => remove(x.id)}
              >
                <Icon name="close" size="0.9em" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="stack-2" style={{ marginTop: '0.25rem' }}>
          <div className="row wrap" style={{ gap: '0.35rem' }}>
            <input
              className="input input-sm grow"
              style={{ minWidth: '9rem' }}
              placeholder="שם הפריט"
              aria-label="שם הפריט"
              value={draft.n}
              onChange={(e) => setDraft({ ...draft, n: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            />
            <input
              className="input input-sm num"
              style={{ width: '4.5rem' }}
              type="number"
              min="0"
              step="0.5"
              aria-label="כמות"
              value={draft.q}
              onChange={(e) => setDraft({ ...draft, q: Number(e.target.value) })}
            />
            <select
              className="select input-sm"
              style={{ width: '5.2rem' }}
              aria-label="יחידה"
              value={draft.u}
              onChange={(e) => setDraft({ ...draft, u: e.target.value })}
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select
              className="select input-sm"
              style={{ width: '8.5rem' }}
              aria-label="קטגוריה"
              value={draft.c}
              onChange={(e) => setDraft({ ...draft, c: e.target.value })}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="field">
            <label>איך לחשב את הכמות</label>
            <div className="row wrap" style={{ gap: '0.35rem' }}>
              {SCALE_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  aria-pressed={draft.scale === m}
                  onClick={() => setDraft({ ...draft, scale: m })}
                >
                  {SCALE_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="tiny dim">{SCALE_HINTS[draft.scale]}</div>
          </div>

          <button type="button" className="btn btn-primary btn-sm"
                  style={{ alignSelf: 'flex-start' }} onClick={add}>
            <Icon name="add" />הוסף לרשימה
          </button>
        </div>
      )}
    </div>
  );
}

const blankExtra = () => ({ n: '', q: 1, u: UNITS[2], c: 'אחר', scale: 'fixed' });

export default Shopping;
