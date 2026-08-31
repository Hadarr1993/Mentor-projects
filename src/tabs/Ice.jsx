import { useMemo } from 'react';
import { Icon } from '../components/Icon.jsx';
import { IngredientTable } from '../components/IngredientTable.jsx';
import { Empty } from '../components/ui.jsx';
import { MEAL_LABELS } from '../data/constants.js';
import { dayList, icePlan, formatQty, ICE_BAG_COVERS_GRAMS } from '../lib/calc.js';

/**
 * Cold chain planning. Chilled ingredients are the thing that actually
 * goes wrong at a desert festival, so this screen is about risk, not just
 * quantities.
 */
export function Ice({ state }) {
  const days = useMemo(
    () => dayList(state.settings.startDate, state.settings.days),
    [state.settings.startDate, state.settings.days],
  );
  const plan = useMemo(() => icePlan(state, days), [state, days]);

  const totalBags = plan.reduce((s, d) => s + d.bags, 0);
  const anyChilled = plan.some((d) => d.chilledGrams > 0);
  // Anything chilled from the third day on is where things spoil.
  const lateRisk = plan.filter((d) => d.chilledGrams > 0 && d.day.index >= 2);

  if (!anyChilled) {
    return <Empty icon="ice" title="אין מנות שדורשות קירור"
                  hint="ברגע שתשבץ מנה עם מצרכים בקטגוריית קירור, התכנון יופיע כאן." />;
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="spread">
          <div>
            <h2>תכנון קרח</h2>
            <div className="small muted">
              הערכה: שק קרח אחד לכל {ICE_BAG_COVERS_GRAMS / 1000} ק"ג מצרכי קירור ליום
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="num" style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
              {totalBags}
            </div>
            <div className="eyebrow">שקי קרח</div>
          </div>
        </div>
      </div>

      {lateRisk.length > 0 && (
        <div className="banner banner-warn">
          <Icon name="warn" size="1.2em" />
          <div className="grow small">
            <b>מנות עם ביצים, גבינות או בשר עדיף לתכנן לימים הראשונים.</b>
            <div style={{ marginTop: '0.3rem' }}>
              כרגע יש מצרכי קירור ב{lateRisk.map((d) => d.day.weekday).join(', ')} —
              שקול להזיז אותן קדימה, לפני שהקרח נגמר.
            </div>
          </div>
        </div>
      )}

      {plan.map((d) => (
        <div key={d.day.key} className="card">
          <div className="section-title">
            <h3 className="grow">{d.day.weekday}</h3>
            <span className="tiny dim num">{d.day.short}</span>
            {d.bags > 0 && (
              <span className={`tag ${d.day.index >= 2 ? 'tag-warn' : 'tag-plum'}`}>
                <Icon name="ice" size="0.9em" />{d.bags} שקים
              </span>
            )}
          </div>

          {d.chilledGrams === 0 ? (
            <div className="tiny dim">אין מצרכי קירור ביום הזה.</div>
          ) : (
            <div className="stack-2">
              <div className="tiny dim">
                סה"כ קירור: <b className="num">{formatQty(d.chilledGrams, 'גרם')}</b>
              </div>
              {d.meals.map((m) => (
                <div key={m.mealKey} className="card-inset">
                  <div className="spread" style={{ marginBottom: '0.4rem' }}>
                    <span className="row" style={{ gap: '0.35rem' }}>
                      <Icon name={m.mealKey} size="0.95em" />
                      <b className="small">{m.name}</b>
                    </span>
                    <span className="tiny dim">{MEAL_LABELS[m.mealKey]}</span>
                  </div>
                  <IngredientTable rows={m.rows} showSource={false} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default Ice;
