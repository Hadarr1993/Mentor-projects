import { useMemo } from 'react';
import { Icon, categoryIcon } from '../components/Icon.jsx';
import { Check, Empty, useCopy, toast } from '../components/ui.jsx';
import { CATEGORIES } from '../data/constants.js';
import { dayList, shoppingList, groupByCategory, shoppingTotals, formatQty } from '../lib/calc.js';
import { touch } from '../state/useKitchen.js';

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

  const setBought = (key, value) =>
    update((s) => ({
      ...s,
      shopping: touch({ ...s.shopping, bought: { ...s.shopping.bought, [key]: value } }),
    }));

  const setPrice = (key, value) =>
    update((s) => {
      const prices = { ...s.shopping.prices };
      if (value === null || value === '') delete prices[key];
      else prices[key] = value;
      return { ...s, shopping: touch({ ...s.shopping, prices }) };
    });

  const clearBought = () =>
    update((s) => ({ ...s, shopping: touch({ ...s.shopping, bought: {} }) }));

  const toWhatsApp = () => {
    const lines = [`*רשימת קניות — קאמפ פרדייז*`, `${state.settings.people} סועדים · ${days.length} ימים`, ''];
    for (const g of groups) {
      lines.push(`*${g.category}*`);
      for (const r of g.items) {
        const done = state.shopping.bought?.[r.key] ? '✓ ' : '';
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
    return <Empty icon="shopping" title="אין מה לקנות עדיין"
                  hint="שבץ ארוחות בלשונית השבוע והרשימה תיבנה מעצמה." />;
  }

  return (
    <div className="stack">
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
              const bought = !!state.shopping.bought?.[r.key];
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
                    value={state.shopping.prices?.[r.key] ?? ''}
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

export default Shopping;
