import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { DayStrip } from '../components/DayStrip.jsx';
import { IngredientTable } from '../components/IngredientTable.jsx';
import { RecipeMark, Empty } from '../components/ui.jsx';
import { MEAL_KEYS, MEAL_LABELS } from '../data/constants.js';
import { dayList, todayIndex, mealId, mealIngredients, mealPeople } from '../lib/calc.js';

/** The opening screen: one day at a time, everything the shift needs. */
export function Today({ state, onGoToWeek }) {
  const days = useMemo(
    () => dayList(state.settings.startDate, state.settings.days),
    [state.settings.startDate, state.settings.days],
  );
  const todayIdx = useMemo(() => todayIndex(days), [days]);
  const [selected, setSelected] = useState(() => todayIdx ?? 0);

  // If the real date falls inside the festival, open on it.
  useEffect(() => {
    if (todayIdx !== null) setSelected(todayIdx);
  }, [todayIdx]);

  const day = days[selected] || days[0];
  if (!day) return <Empty icon="warn" title="לא הוגדרו ימים" hint="קבע תאריך התחלה ומספר ימים בהגדרות." />;

  const planned = MEAL_KEYS
    .map((mk) => ({ mk, meal: state.meals[mealId(day.key, mk)] }))
    .filter(({ meal }) => meal?.recipeId && state.recipes[meal.recipeId] && !state.recipes[meal.recipeId]._deleted);

  return (
    <div className="stack">
      <DayStrip days={days} selected={selected} onSelect={setSelected} todayIdx={todayIdx} />

      <div className="spread">
        <div>
          <h2>{day.weekday}</h2>
          <div className="small muted num">{day.label}</div>
        </div>
        {selected === todayIdx && <span className="tag tag-fire"><Icon name="flame" size="0.9em" />היום</span>}
      </div>

      {planned.length === 0 ? (
        <Empty
          icon="week"
          title="לא שובצו ארוחות ליום הזה"
          hint="אפשר לבחור מתכונים בלשונית השבוע."
          action={<button type="button" className="btn btn-primary" onClick={onGoToWeek}>
            <Icon name="week" />פתח את לוח השבוע
          </button>}
        />
      ) : (
        planned.map(({ mk, meal }) => (
          <MealCard key={mk} state={state} meal={meal} mealKey={mk} />
        ))
      )}
    </div>
  );
}

function MealCard({ state, meal, mealKey }) {
  const recipe = state.recipes[meal.recipeId];
  const diners = mealPeople(meal, state.settings);
  const rows = useMemo(() => mealIngredients(meal, state), [meal, state]);
  const sides = (meal.sides || []).map((id) => state.sides[id]).filter((s) => s && !s._deleted);

  return (
    <div className="card stack">
      <div className="row" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
        <RecipeMark item={recipe} large />
        <div className="grow">
          <span className="tag tag-plum">
            <Icon name={mealKey} size="0.9em" />{MEAL_LABELS[mealKey]}
          </span>
          <h3 style={{ marginTop: '0.35rem' }}>{recipe.name}</h3>
          <div className="small muted">{diners} סועדים</div>
        </div>
      </div>

      {meal.tornim && (
        <div className="row wrap" style={{ gap: '0.35rem' }}>
          <span className="tiny dim" style={{ marginInlineEnd: '0.2rem' }}>
            <Icon name="users" size="0.95em" /> תורנים:
          </span>
          {meal.tornim.split(',').map((n) => n.trim()).filter(Boolean).map((n) => (
            <span key={n} className="chip chip-static">{n}</span>
          ))}
        </div>
      )}

      {sides.length > 0 && (
        <div className="row wrap" style={{ gap: '0.35rem' }}>
          <span className="tiny dim" style={{ marginInlineEnd: '0.2rem' }}>תוספות:</span>
          {sides.map((s) => (
            <span key={s.id} className="chip chip-static">
              <Icon name={s.iconKey} size="0.95em" />{s.name}
            </span>
          ))}
        </div>
      )}

      {recipe.steps && (
        <div className="card-inset">
          <h4 style={{ marginBottom: '0.4rem' }}>הוראות הכנה</h4>
          <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: 'var(--ink-2)' }}>
            {recipe.steps}
          </div>
        </div>
      )}

      {sides.filter((s) => s.steps).map((s) => (
        <div key={s.id} className="card-inset">
          <h4 style={{ marginBottom: '0.4rem' }}>{s.name}</h4>
          <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: 'var(--ink-2)' }}>
            {s.steps}
          </div>
        </div>
      ))}

      <div>
        <h4 style={{ marginBottom: '0.5rem' }}>מצרכים ל-{diners} סועדים</h4>
        <IngredientTable rows={rows} />
      </div>
    </div>
  );
}

export default Today;
