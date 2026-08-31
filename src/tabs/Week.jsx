import { useMemo } from 'react';
import { Icon } from '../components/Icon.jsx';
import { IngredientTable } from '../components/IngredientTable.jsx';
import { ChipPicker, RecipeMark, toast } from '../components/ui.jsx';
import { MEAL_KEYS, MEAL_LABELS } from '../data/constants.js';
import { dayList, mealId, mealIngredients, mealPeople, assignTornim } from '../lib/calc.js';
import { buildSingleMealPage, printDocument } from '../lib/exportHtml.js';
import { touch } from '../state/useKitchen.js';

export function Week({ state, update }) {
  const days = useMemo(
    () => dayList(state.settings.startDate, state.settings.days),
    [state.settings.startDate, state.settings.days],
  );
  const recipes = useMemo(() => live(state.recipes), [state.recipes]);
  const sides = useMemo(() => live(state.sides), [state.sides]);

  const autoAssign = () => {
    const assigned = assignTornim(state, days);
    const count = Object.keys(assigned).length;
    if (!count) {
      toast('צריך חברי מחנה בהגדרות וארוחות משובצות', 'danger');
      return;
    }
    update((s) => {
      const meals = { ...s.meals };
      for (const [id, names] of Object.entries(assigned)) {
        meals[id] = touch({ ...meals[id], tornim: names });
      }
      return { ...s, meals };
    });
    toast(`שובצו תורנים ל-${count} ארוחות`);
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="spread">
          <div>
            <h2>לוח השבוע</h2>
            <div className="small muted">
              {days.length} ימים · ברירת מחדל {state.settings.people} סועדים
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={autoAssign}>
            <Icon name="shuffle" />שבץ תורנים אוטומטית
          </button>
        </div>
      </div>

      {days.map((day) => (
        <div key={day.key} className="card">
          <div className="section-title">
            <h3 className="grow">{day.weekday}</h3>
            <span className="tag num">{day.label}</span>
          </div>
          <div className="stack">
            {MEAL_KEYS.map((mk) => (
              <MealEditor
                key={mk}
                state={state}
                update={update}
                day={day}
                mealKey={mk}
                recipes={recipes}
                sides={sides}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MealEditor({ state, update, day, mealKey, recipes, sides }) {
  const id = mealId(day.key, mealKey);
  const meal = state.meals[id] || { recipeId: '', people: null, tornim: '', sides: [] };
  const recipe = state.recipes[meal.recipeId];
  const diners = mealPeople(meal, state.settings);
  const rows = useMemo(
    () => (recipe && !recipe._deleted ? mealIngredients(meal, state) : []),
    [meal, state],
  );

  const patch = (changes) =>
    update((s) => ({ ...s, meals: { ...s.meals, [id]: touch({ ...meal, ...changes }) } }));

  const members = (state.settings.members || []).filter((m) => m.name?.trim());
  const chosen = (meal.tornim || '').split(',').map((s) => s.trim()).filter(Boolean);

  const toggleMember = (name) => {
    const next = chosen.includes(name)
      ? chosen.filter((n) => n !== name)
      : [...chosen, name];
    patch({ tornim: next.join(', ') });
  };

  const printMeal = () => {
    const html = buildSingleMealPage(state, day.key, mealKey);
    if (!html) { toast('אין מה להדפיס — לא נבחר מתכון', 'danger'); return; }
    if (!printDocument(html)) toast('הדפדפן חסם את חלון ההדפסה', 'danger');
  };

  return (
    <div className="card-inset stack-2">
      <div className="spread">
        <span className="tag tag-plum">
          <Icon name={mealKey} size="0.95em" />{MEAL_LABELS[mealKey]}
        </span>
        {recipe && !recipe._deleted && (
          <button type="button" className="btn btn-sm btn-quiet" onClick={printMeal}>
            <Icon name="print" />PDF
          </button>
        )}
      </div>

      <div className="row" style={{ gap: '0.5rem' }}>
        {recipe && !recipe._deleted && <RecipeMark item={recipe} />}
        <select
          className="select grow"
          value={meal.recipeId || ''}
          aria-label={`מתכון ל${day.weekday} ${MEAL_LABELS[mealKey]}`}
          onChange={(e) => patch({ recipeId: e.target.value })}
        >
          <option value="">— בחר מתכון —</option>
          {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {meal.recipeId && (
        <>
          <div className="row wrap" style={{ gap: '0.5rem' }}>
            <div className="field">
              <label htmlFor={`${id}-people`}>סועדים</label>
              <input
                id={`${id}-people`}
                type="number"
                className="input input-sm num"
                style={{ width: '5.5rem' }}
                min="1"
                placeholder={String(state.settings.people)}
                value={meal.people ?? ''}
                onChange={(e) => patch({ people: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div className="field grow">
              <label htmlFor={`${id}-tornim`}>תורנים</label>
              <input
                id={`${id}-tornim`}
                className="input input-sm"
                placeholder="שמות, מופרדים בפסיק"
                value={meal.tornim || ''}
                onChange={(e) => patch({ tornim: e.target.value })}
              />
            </div>
          </div>

          {members.length > 0 && (
            <div className="row wrap" style={{ gap: '0.35rem' }}>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  aria-pressed={chosen.includes(m.name.trim())}
                  onClick={() => toggleMember(m.name.trim())}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}

          <div className="field">
            <label>תוספות</label>
            <ChipPicker
              options={sides}
              selected={meal.sides || []}
              onToggle={(sideId) => {
                const cur = meal.sides || [];
                patch({ sides: cur.includes(sideId) ? cur.filter((x) => x !== sideId) : [...cur, sideId] });
              }}
              empty="אין תוספות במאגר"
            />
          </div>

          <details>
            <summary className="small muted" style={{ cursor: 'pointer' }}>
              מצרכים ל-{diners} סועדים ({rows.length} פריטים)
            </summary>
            <div style={{ marginTop: '0.5rem' }}>
              <IngredientTable rows={rows} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

const live = (bag) =>
  Object.values(bag || {})
    .filter((x) => x && !x._deleted)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

export default Week;
