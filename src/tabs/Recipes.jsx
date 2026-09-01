import { useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { IngredientEditor } from '../components/IngredientTable.jsx';
import { ImageDrop } from '../components/ImageDrop.jsx';
import { Sheet } from '../components/motion.jsx';
import { ConfirmButton, RecipeMark, Empty, ErrorBox, toast } from '../components/ui.jsx';
import { UNITS, CATEGORIES, ICON_KEYS } from '../data/constants.js';
import { identifyFromImage, recipeFromText, stepsForIngredients, guessIconKey } from '../lib/ai.js';
import { toImageBlock } from '../lib/image.js';
import { touch } from '../state/useKitchen.js';
import { now } from '../state/schema.js';

const blank = () => ({
  id: '',
  name: '',
  iconKey: 'other',
  steps: '',
  img: null,
  ings: [{ n: '', q: 0, u: UNITS[0], c: CATEGORIES[0] }],
});

export function Recipes({ state, update, saveNow }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(null); // 'manual' | 'text' | 'image'
  const [query, setQuery] = useState('');
  // True from the moment the editor starts closing until it has left, so the
  // list does not reappear underneath a sheet that is still on screen.
  const [closing, setClosing] = useState(false);

  /**
   * Where the editor should grow from and shrink back into.
   *
   * Captured at the press, in client coordinates. The layout changes when the
   * editor takes over, so this is the point the button occupied a moment ago
   * rather than a live position — close enough that the sheet still reads as
   * coming out of the control that was pressed.
   */
  const origin = useRef(null);
  const markOrigin = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const recipes = useMemo(() => {
    const all = Object.values(state.recipes || {}).filter((r) => r && !r._deleted);
    const q = query.trim();
    const list = q ? all.filter((r) => r.name.includes(q)) : all;
    return list.sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [state.recipes, query]);

  const save = async (recipe) => {
    const id = recipe.id || `r${now().toString(36)}`;
    const clean = {
      ...recipe,
      id,
      name: recipe.name.trim(),
      ings: recipe.ings.filter((i) => i.n.trim() && Number(i.q) > 0),
    };
    if (!clean.name) { toast('למתכון חייב להיות שם', 'danger'); return false; }
    if (!clean.ings.length) { toast('צריך לפחות מצרך אחד עם כמות', 'danger'); return false; }

    // Recipes save immediately rather than on the debounce, and the editor
    // only closes once the write is confirmed.
    const ok = await saveNow((s) => ({
      ...s,
      recipes: { ...s.recipes, [id]: touch(clean) },
    }));
    if (ok) {
      toast(recipe.id ? 'המתכון עודכן' : 'המתכון נשמר');
      // Leave the same way it arrived — saving is a close, not a disappearance.
      setClosing(true);
      setEditing(null);
      setAdding(null);
    } else {
      toast('השמירה נכשלה — ראה את הבאנר למעלה', 'danger');
    }
    return ok;
  };

  const remove = (id) => {
    // A tombstone, not a delete: a teammate's stale device must not push
    // this recipe back into the camp document.
    update((s) => ({
      ...s,
      recipes: { ...s.recipes, [id]: { id, _deleted: true, _ts: now() } },
    }));
    toast('המתכון נמחק');
  };

  if (adding === 'text') return <FromText onCancel={() => setAdding(null)} onDraft={setEditing} />;
  if (adding === 'image') return <FromImage onCancel={() => setAdding(null)} onDraft={setEditing} />;

  const editorOpen = !!editing || adding === 'manual';
  const closeEditor = () => { setClosing(true); setEditing(null); setAdding(null); };

  if (editorOpen || closing) {
    return (
      <Sheet open={editorOpen} originRef={origin} onExited={() => setClosing(false)}>
        <RecipeEditor initial={editing || blank()} onCancel={closeEditor} onSave={save} />
      </Sheet>
    );
  }

  return (
    <div className="stack">
      <div className="card">
        <h2 style={{ marginBottom: '0.75rem' }}>הוספת מתכון</h2>
        <div className="row wrap">
          <button type="button" className="btn btn-primary"
                  onClick={(e) => { markOrigin(e); setAdding('manual'); }}>
            <Icon name="add" />ידני
          </button>
          <button type="button" className="btn" onClick={() => setAdding('text')}>
            <Icon name="text" />מטקסט
          </button>
          <button type="button" className="btn" onClick={() => setAdding('image')}>
            <Icon name="image" />מתמונה
          </button>
        </div>
      </div>

      <div className="row">
        <div className="grow" style={{ position: 'relative' }}>
          <input
            className="input"
            placeholder="חפש מתכון"
            value={query}
            aria-label="חיפוש מתכון"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="tag num">{recipes.length}</span>
      </div>

      {recipes.length === 0 ? (
        <Empty icon="recipes" title={query ? 'לא נמצאו מתכונים' : 'המאגר ריק'}
               hint={query ? 'נסה חיפוש אחר.' : 'הוסף מתכון ראשון כדי להתחיל.'} />
      ) : (
        recipes.map((r) => (
          <div key={r.id} className="card">
            <div className="row" style={{ gap: '0.7rem', alignItems: 'flex-start' }}>
              <RecipeMark item={r} />
              <div className="grow">
                <h3>{r.name}</h3>
                <div className="tiny dim">{r.ings.length} מצרכים</div>
                {r.steps && (
                  <div className="small muted" style={{
                    marginTop: '0.35rem',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>{r.steps}</div>
                )}
              </div>
            </div>
            <div className="row" style={{ marginTop: '0.75rem', gap: '0.4rem' }}>
              <button type="button" className="btn btn-sm"
                      onClick={(e) => { markOrigin(e); setEditing(r); }}>
                <Icon name="edit" />ערוך
              </button>
              <ConfirmButton onConfirm={() => remove(r.id)} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------- editor */

function RecipeEditor({ initial, onCancel, onSave }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const identify = async (dataUrl) => {
    setBusy(true);
    setError(null);
    try {
      const result = await identifyFromImage(toImageBlock(dataUrl));
      set({
        name: draft.name || result.dish,
        steps: result.steps || draft.steps,
        ings: result.ings,
        iconKey: result.iconKey,
      });
      toast(`זוהתה מנה: ${result.dish}`);
      if (result.dropped?.length) {
        toast(`${result.dropped.length} מצרכים לא היו תקינים ולא נוספו`, 'danger');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const suggestSteps = async () => {
    const ings = draft.ings.filter((i) => i.n.trim());
    if (!ings.length) { setError('צריך מצרכים לפני שאפשר להציע הוראות'); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await stepsForIngredients(draft.name || 'מנה', ings);
      set({ steps: result.steps });
      toast('נוספו הוראות הכנה');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  return (
    <div className="stack">
      <div className="card stack">
        <div className="spread">
          <h2>{initial.id ? 'עריכת מתכון' : 'מתכון חדש'}</h2>
          <button type="button" className="btn btn-sm btn-quiet btn-icon" onClick={onCancel} aria-label="סגור">
            <Icon name="close" />
          </button>
        </div>

        <div className="field">
          <label htmlFor="r-name">שם המנה</label>
          <input id="r-name" className="input" value={draft.name}
                 onChange={(e) => set({ name: e.target.value, iconKey: draft.iconKey === 'other' ? guessIconKey(e.target.value) : draft.iconKey })} />
        </div>

        <div className="field">
          <label>סימון</label>
          <div className="row wrap" style={{ gap: '0.35rem' }}>
            {ICON_KEYS.map((k) => (
              <button key={k} type="button" className="chip"
                      aria-pressed={draft.iconKey === k} aria-label={k}
                      onClick={() => set({ iconKey: k })}>
                <Icon name={k} size="1.05em" />
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>תמונה</label>
          <ImageDrop value={draft.img} onChange={(img) => set({ img })}
                     onImageArrived={identify} busy={busy} />
        </div>

        <ErrorBox error={error} onDismiss={() => setError(null)} />

        <div className="field">
          <div className="spread">
            <label htmlFor="r-steps">הוראות הכנה</label>
            <button type="button" className="btn btn-sm btn-quiet" onClick={suggestSteps} disabled={busy}>
              <Icon name={busy ? 'spinner' : 'magic'} className={busy ? 'spin' : ''} />הצע הוראות
            </button>
          </div>
          <textarea id="r-steps" className="textarea" rows={7} value={draft.steps}
                    onChange={(e) => set({ steps: e.target.value })} />
        </div>

        <div className="field">
          <label>מצרכים</label>
          <IngredientEditor ings={draft.ings} onChange={(ings) => set({ ings })}
                            units={UNITS} categories={CATEGORIES} />
        </div>

        <div className="row">
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || busy}>
            <Icon name={saving ? 'spinner' : 'save'} className={saving ? 'spin' : ''} />
            {saving ? 'שומר…' : 'שמור מתכון'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onCancel}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- AI entry points */

function FromText({ onCancel, onDraft }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!text.trim()) { setError('כתוב תיאור של המנה'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await recipeFromText(text.trim());
      onDraft({ id: '', name: r.dish, iconKey: r.iconKey, steps: r.steps, img: null, ings: r.ings });
      toast('נוצר מתכון — בדוק ותקן לפני שמירה');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <div className="spread">
        <h2>מתכון מטקסט</h2>
        <button type="button" className="btn btn-sm btn-quiet btn-icon" onClick={onCancel} aria-label="סגור">
          <Icon name="close" />
        </button>
      </div>
      <div className="field">
        <label htmlFor="ai-text">תאר את המנה</label>
        <textarea id="ai-text" className="textarea" rows={4} value={text}
                  placeholder="למשל: תבשיל עדשים כתומות עם ירקות שורש וקארי, מנה עיקרית לפסטיבל"
                  onChange={(e) => setText(e.target.value)} />
      </div>
      <ErrorBox error={error} onRetry={run} onDismiss={() => setError(null)} />
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
          <Icon name={busy ? 'spinner' : 'magic'} className={busy ? 'spin' : ''} />
          {busy ? 'יוצר…' : 'צור מתכון'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

function FromImage({ onCancel, onDraft }) {
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const identify = async (dataUrl) => {
    setBusy(true);
    setError(null);
    try {
      const r = await identifyFromImage(toImageBlock(dataUrl));
      onDraft({ id: '', name: r.dish, iconKey: r.iconKey, steps: r.steps, img: dataUrl, ings: r.ings });
      toast(`זוהתה מנה: ${r.dish}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <div className="spread">
        <h2>מתכון מתמונה</h2>
        <button type="button" className="btn btn-sm btn-quiet btn-icon" onClick={onCancel} aria-label="סגור">
          <Icon name="close" />
        </button>
      </div>
      <div className="small muted">בחר, גרור או הדבק תמונה של המנה — הזיהוי מתחיל אוטומטית.</div>
      <ImageDrop value={img} onChange={setImg} onImageArrived={identify} busy={busy} />
      <ErrorBox error={error} onRetry={() => img && identify(img)} onDismiss={() => setError(null)} />
      <div className="row">
        <button type="button" className="btn" onClick={() => img && identify(img)} disabled={!img || busy}>
          <Icon name={busy ? 'spinner' : 'magic'} className={busy ? 'spin' : ''} />זהה שוב
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

export default Recipes;
