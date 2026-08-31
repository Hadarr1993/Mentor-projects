import { useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { IngredientEditor } from '../components/IngredientTable.jsx';
import { Collapsible, ConfirmButton, ErrorBox, useCopy, toast } from '../components/ui.jsx';
import { UNITS, CATEGORIES, ICON_KEYS } from '../data/constants.js';
import { makeDefaults, newCampCode, now } from '../state/schema.js';
import { touch } from '../state/useKitchen.js';
import * as sync from '../state/sync.js';

export function Settings({ state, update, saveNow, setState, syncStatus, onRefreshCloud }) {
  const copy = useCopy();
  const [error, setError] = useState(null);

  const patchSettings = (changes) =>
    update((s) => ({ ...s, settings: touch({ ...s.settings, ...changes }) }));

  /* Switching scope copies the current data into the new one, so nothing
     is stranded behind a toggle. */
  const toggleShared = async (shared) => {
    setError(null);
    try {
      if (shared) {
        sync.setCampCode(state.campCode);
        const theirs = await sync.pull();
        const merged = theirs ? sync.mergeState(state, theirs) : state;
        const next = { ...merged, settings: touch({ ...merged.settings, shared: true }) };
        setState(next);
        await saveNow(() => next);
        await sync.push(next);
        toast('עברת למצב משותף — הנתונים הועלו לענן');
      } else {
        patchSettings({ shared: false });
        toast('עברת למצב אישי — הנתונים נשארים במכשיר');
      }
    } catch (err) {
      setError(`המעבר נכשל: ${err.message}`);
      patchSettings({ shared: false });
    }
  };

  const regenerateCode = () => {
    const code = newCampCode();
    update((s) => ({ ...s, campCode: code }));
    sync.setCampCode(code);
    toast('נוצר קוד מחנה חדש');
  };

  const resetAll = async () => {
    const fresh = makeDefaults();
    setState(fresh);
    await saveNow(() => fresh);
    toast('הכל אופס לברירות המחדל');
  };

  return (
    <div className="stack">
      <ErrorBox error={error} onDismiss={() => setError(null)} />

      {/* ── Basics ─────────────────────────────────────────────── */}
      <div className="card stack-2">
        <h2>בסיס</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="s-people">מספר אנשים</label>
            <input id="s-people" type="number" min="1" className="input num"
                   value={state.settings.people}
                   onChange={(e) => patchSettings({ people: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
          <div className="field">
            <label htmlFor="s-reserve">אחוז רזרבה</label>
            <input id="s-reserve" type="number" min="0" max="100" className="input num"
                   value={state.settings.reservePct}
                   onChange={(e) => patchSettings({ reservePct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
          </div>
          <div className="field">
            <label htmlFor="s-budget">תקציב יעד (₪)</label>
            <input id="s-budget" type="number" min="0" className="input num"
                   value={state.settings.budget || ''}
                   placeholder="ללא"
                   onChange={(e) => patchSettings({ budget: Number(e.target.value) || 0 })} />
          </div>
          <div className="field">
            <label htmlFor="s-tornim">תורנים לארוחה</label>
            <input id="s-tornim" type="number" min="1" max="10" className="input num"
                   value={state.settings.tornimPerMeal}
                   onChange={(e) => patchSettings({ tornimPerMeal: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
          <div className="field">
            <label htmlFor="s-start">תאריך התחלה</label>
            <input id="s-start" type="date" className="input"
                   value={state.settings.startDate}
                   onChange={(e) => patchSettings({ startDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s-days">מספר ימים</label>
            <input id="s-days" type="number" min="1" max="30" className="input num"
                   value={state.settings.days}
                   onChange={(e) => patchSettings({ days: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} />
          </div>
        </div>
      </div>

      {/* ── Crew ───────────────────────────────────────────────── */}
      <MembersCard state={state} update={update} />

      {/* ── Sharing ────────────────────────────────────────────── */}
      <div className="card stack-2">
        <div className="section-title">
          <Icon name={state.settings.shared ? 'users' : 'lock'} strokeWidth={1.9} />
          <h2 className="grow">שיתוף עם המחנה</h2>
        </div>

        <div className="row wrap" style={{ gap: '0.4rem' }}>
          <button type="button" className="chip" aria-pressed={!state.settings.shared}
                  onClick={() => toggleShared(false)}>
            <Icon name="lock" size="0.95em" />אישי
          </button>
          <button type="button" className="chip" aria-pressed={state.settings.shared}
                  onClick={() => toggleShared(true)}>
            <Icon name="users" size="0.95em" />משותף
          </button>
        </div>

        <p className="small muted">
          {state.settings.shared
            ? 'הנתונים מסונכרנים בין כל מי שמזין את קוד המחנה. השינוי האחרון על כל פריט גובר, ולכן עדיף לא לערוך את אותו מתכון בו-זמנית.'
            : 'הנתונים נשמרים רק במכשיר הזה. אפשר בכל רגע לעבור למצב משותף — הנתונים הנוכחיים יועתקו לענן.'}
        </p>

        <div className="field">
          <label htmlFor="s-code">קוד מחנה</label>
          <div className="row">
            <input id="s-code" className="input grow num" readOnly value={state.campCode} />
            <button type="button" className="btn btn-sm" onClick={() => copy(state.campCode, 'הקוד הועתק')}>
              <Icon name="copy" />העתק
            </button>
          </div>
          <div className="tiny dim">
            כל מי שמחזיק בקוד יכול לקרוא ולערוך את הנתונים. שתף אותו רק עם הצוות.
          </div>
        </div>

        <div className="row wrap">
          <input
            className="input grow"
            placeholder="הצטרף לקוד מחנה קיים"
            aria-label="הצטרף לקוד מחנה קיים"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const code = e.target.value.trim().toUpperCase();
              if (!/^PRDS-[A-Z0-9]{6,32}$/.test(code)) {
                setError('קוד מחנה לא תקין. הפורמט הוא PRDS- ואחריו אותיות וספרות.');
                return;
              }
              update((s) => ({ ...s, campCode: code }));
              sync.setCampCode(code);
              e.target.value = '';
              toast('הקוד עודכן — הפעל מצב משותף כדי למשוך נתונים');
            }}
          />
          <button type="button" className="btn btn-quiet btn-sm" onClick={regenerateCode}>
            <Icon name="refresh" />קוד חדש
          </button>
        </div>

        {state.settings.shared && (
          <div className="row wrap">
            <button type="button" className="btn" onClick={onRefreshCloud}>
              <Icon name="refresh" />רענן מהענן
            </button>
            {syncStatus?.error && <span className="tiny" style={{ color: 'var(--danger)' }}>{syncStatus.error}</span>}
          </div>
        )}
      </div>

      {/* ── Breakfast ──────────────────────────────────────────── */}
      <Collapsible title="ארוחת בוקר" icon="egg">
        <div className="stack-2">
          <div className="tiny dim">
            כמויות לאדם ליום. נכנס לרשימת הקניות מוכפל במספר האנשים ובמספר הימים.
          </div>
          <IngredientEditor
            ings={state.breakfast.ings}
            onChange={(ings) => update((s) => ({ ...s, breakfast: touch({ ...s.breakfast, ings }) }))}
            units={UNITS}
            categories={CATEGORIES}
          />
        </div>
      </Collapsible>

      {/* ── Pantry ─────────────────────────────────────────────── */}
      <Collapsible title="מזווה קבוע" icon="water">
        <div className="stack-2">
          <div className="tiny dim">
            כמויות לאדם ליום. מים הם החשוב ביותר כאן — ברירת המחדל היא 4 ליטר לאדם ליום.
          </div>
          <IngredientEditor
            ings={state.pantry.ings}
            onChange={(ings) => update((s) => ({ ...s, pantry: touch({ ...s.pantry, ings }) }))}
            units={UNITS}
            categories={CATEGORIES}
          />
        </div>
      </Collapsible>

      {/* ── Sides ──────────────────────────────────────────────── */}
      <SidesCard state={state} update={update} saveNow={saveNow} />

      {/* ── Reset ──────────────────────────────────────────────── */}
      <div className="card stack-2">
        <h2>איפוס</h2>
        <p className="small muted">
          מוחק את כל המתכונים, השיבוצים והקניות ומחזיר לברירות המחדל.
          כדאי להוריד גיבוי מלשונית הייצוא לפני.
        </p>
        <ConfirmButton onConfirm={resetAll} className="btn btn-danger"
                       icon="reset">אפס הכל</ConfirmButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- members */

function MembersCard({ state, update }) {
  const [name, setName] = useState('');
  const members = state.settings.members || [];

  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (members.some((m) => m.name === n)) { toast('השם כבר קיים', 'danger'); return; }
    update((s) => ({
      ...s,
      settings: touch({
        ...s.settings,
        members: [...(s.settings.members || []), { id: `m${now().toString(36)}`, name: n }],
      }),
    }));
    setName('');
  };

  return (
    <div className="card stack-2">
      <div className="section-title">
        <Icon name="users" strokeWidth={1.9} />
        <h2 className="grow">חברי המחנה</h2>
        <span className="tiny dim num">{members.length}</span>
      </div>

      <div className="row">
        <input
          className="input grow"
          placeholder="שם"
          value={name}
          aria-label="שם חבר מחנה"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={add}>
          <Icon name="add" />הוסף
        </button>
      </div>

      {members.length === 0 ? (
        <div className="tiny dim">הוסף שמות כדי לאפשר שיבוץ תורנים אוטומטי.</div>
      ) : (
        <div className="row wrap" style={{ gap: '0.35rem' }}>
          {members.map((m) => (
            <span key={m.id} className="chip chip-static">
              {m.name}
              <button
                type="button"
                className="btn btn-quiet"
                style={{ padding: 0, background: 'none', marginInlineStart: '0.15rem' }}
                aria-label={`הסר את ${m.name}`}
                onClick={() => update((s) => ({
                  ...s,
                  settings: touch({ ...s.settings, members: s.settings.members.filter((x) => x.id !== m.id) }),
                }))}
              >
                <Icon name="close" size="0.9em" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- sides */

function SidesCard({ state, update, saveNow }) {
  const [editing, setEditing] = useState(null);
  const sides = Object.values(state.sides || {})
    .filter((s) => s && !s._deleted)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const save = async (side) => {
    const id = side.id || `s${now().toString(36)}`;
    const clean = {
      ...side,
      id,
      name: side.name.trim(),
      ings: side.ings.filter((i) => i.n.trim() && Number(i.q) > 0),
    };
    if (!clean.name) { toast('לתוספת חייב להיות שם', 'danger'); return; }
    const ok = await saveNow((s) => ({ ...s, sides: { ...s.sides, [id]: touch(clean) } }));
    if (ok) { toast('התוספת נשמרה'); setEditing(null); }
    else toast('השמירה נכשלה', 'danger');
  };

  const remove = (id) =>
    update((s) => ({ ...s, sides: { ...s.sides, [id]: { id, _deleted: true, _ts: now() } } }));

  return (
    <Collapsible title="מאגר תוספות" icon="salad" right={
      <span className="tiny dim num" style={{ marginInlineStart: '0.5rem' }}>{sides.length}</span>
    }>
      {editing ? (
        <div className="stack-2">
          <div className="field">
            <label htmlFor="side-name">שם התוספת</label>
            <input id="side-name" className="input" value={editing.name}
                   onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="field">
            <label>סימון</label>
            <div className="row wrap" style={{ gap: '0.35rem' }}>
              {ICON_KEYS.map((k) => (
                <button key={k} type="button" className="chip" aria-label={k}
                        aria-pressed={editing.iconKey === k}
                        onClick={() => setEditing({ ...editing, iconKey: k })}>
                  <Icon name={k} size="1.05em" />
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="side-steps">הוראות הכנה</label>
            <textarea id="side-steps" className="textarea" rows={4} value={editing.steps || ''}
                      onChange={(e) => setEditing({ ...editing, steps: e.target.value })} />
          </div>
          <div className="field">
            <label>מצרכים</label>
            <IngredientEditor ings={editing.ings} units={UNITS} categories={CATEGORIES}
                              onChange={(ings) => setEditing({ ...editing, ings })} />
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => save(editing)}>
              <Icon name="save" />שמור
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(null)}>ביטול</button>
          </div>
        </div>
      ) : (
        <div className="stack-2">
          <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}
                  onClick={() => setEditing({ id: '', name: '', iconKey: 'salad', steps: '',
                                              ings: [{ n: '', q: 0, u: UNITS[0], c: CATEGORIES[0] }] })}>
            <Icon name="add" />תוספת חדשה
          </button>
          {sides.map((s) => (
            <div key={s.id} className="row card-inset" style={{ gap: '0.5rem' }}>
              <Icon name={s.iconKey} strokeWidth={1.9} />
              <span className="grow small"><b>{s.name}</b>
                <span className="tiny dim"> · {s.ings.length} מצרכים</span>
              </span>
              <button type="button" className="btn btn-sm btn-quiet btn-icon"
                      onClick={() => setEditing(s)} aria-label={`ערוך ${s.name}`}>
                <Icon name="edit" />
              </button>
              <ConfirmButton onConfirm={() => remove(s.id)} className="btn btn-sm btn-quiet btn-danger"
                             title={`מחק ${s.name}`}>{''}</ConfirmButton>
            </div>
          ))}
        </div>
      )}
    </Collapsible>
  );
}

export default Settings;
