import { formatQty } from '../lib/calc.js';
import { Icon, categoryIcon } from './Icon.jsx';

/** Computed ingredient list for one meal, at that meal's head count. */
export function IngredientTable({ rows, showSource = true, emptyText = 'אין מצרכים' }) {
  if (!rows?.length) return <div className="tiny dim">{emptyText}</div>;
  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>מצרך</th>
            {showSource && <th>מתוך</th>}
            <th style={{ textAlign: 'end' }}>כמות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key || `${r.n}|${r.u}`}>
              <td>
                <span className="row" style={{ gap: '0.4rem' }}>
                  <span className="dim" style={{ display: 'inline-flex' }}>
                    <Icon name={categoryIcon(r.c)} size="0.95em" strokeWidth={1.9} />
                  </span>
                  {r.n}
                </span>
              </td>
              {showSource && (
                <td className="tiny dim">
                  {Array.isArray(r.from) ? r.from.join(' · ') : r.from || ''}
                </td>
              )}
              <td className="qty">{formatQty(r.q, r.u)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Editable per-person ingredient rows, used by the recipe editor. */
export function IngredientEditor({ ings, onChange, units, categories }) {
  const update = (i, patch) => onChange(ings.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const remove = (i) => onChange(ings.filter((_, j) => j !== i));
  const add = () => onChange([...ings, { n: '', q: 0, u: units[0], c: categories[0] }]);

  return (
    <div className="stack-2">
      <div className="tiny dim">כמויות לאדם אחד. האפליקציה מכפילה במספר הסועדים ומוסיפה רזרבה.</div>
      {ings.map((ing, i) => (
        <div key={i} className="row" style={{ gap: '0.35rem', alignItems: 'center' }}>
          <input
            className="input input-sm grow"
            placeholder="שם המצרך"
            value={ing.n}
            aria-label={`שם מצרך ${i + 1}`}
            onChange={(e) => update(i, { n: e.target.value })}
          />
          <input
            className="input input-sm num"
            style={{ width: '4.5rem' }}
            type="number"
            step="0.1"
            min="0"
            value={ing.q}
            aria-label={`כמות לאדם ${i + 1}`}
            onChange={(e) => update(i, { q: Number(e.target.value) })}
          />
          <select
            className="select input-sm"
            style={{ width: '5.2rem' }}
            value={ing.u}
            aria-label={`יחידה ${i + 1}`}
            onChange={(e) => update(i, { u: e.target.value })}
          >
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select
            className="select input-sm"
            style={{ width: '8.5rem' }}
            value={ing.c}
            aria-label={`קטגוריה ${i + 1}`}
            onChange={(e) => update(i, { c: e.target.value })}
          >
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-quiet btn-icon"
                  onClick={() => remove(i)} aria-label="הסר מצרך">
            <Icon name="close" />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={add} style={{ alignSelf: 'flex-start' }}>
        <Icon name="add" />הוסף מצרך
      </button>
    </div>
  );
}
