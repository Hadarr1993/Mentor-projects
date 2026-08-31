import { UNITS, CATEGORIES, ICON_KEYS } from '../data/constants.js';

/**
 * The one place the app talks to Claude.
 *
 * All three features — identify from photo, build from text, write method
 * steps — go through callAI. Errors come back as thrown Error objects with
 * the real reason; callers render them in a red box in the interface, never
 * in a blocking alert.
 */
export async function callAI(payload) {
  let res;
  try {
    res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(
      `לא ניתן להגיע לשרת ה-AI. ${navigator.onLine ? 'ייתכן שהפונקציה לא נפרסה.' : 'אין חיבור לאינטרנט.'}\n(${err.message})`,
    );
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body usually means a platform error page rather than the API.
    throw new Error(`תשובה לא צפויה מהשרת (${res.status}).\n${text.slice(0, 300)}`);
  }

  if (!res.ok || json?.error) {
    if (res.status === 404 && !json?.error) {
      // The endpoint itself is absent, which is different from the API
      // failing — say which, so nobody hunts for the wrong problem.
      throw new Error(
        'נקודת הקצה /api/claude לא נמצאה.\n' +
        'פיצ׳רי ה-AI עובדים רק כשהאפליקציה פרוסה ב-Vercel (או דרך "vercel dev"), ' +
        'לא בתצוגה מקומית של vite preview.',
      );
    }
    throw new Error(json?.error?.message || `שגיאת שרת ${res.status}`);
  }
  if (!json?.recipe) throw new Error('השרת לא החזיר מתכון');

  return validateRecipe(json.recipe);
}

export const identifyFromImage = (image) => callAI({ mode: 'image', image });
export const recipeFromText = (text) => callAI({ mode: 'text', text });
export const stepsForIngredients = (name, ings) => callAI({ mode: 'steps', name, ings });

/**
 * Re-validate on arrival. The server constrains units and categories via a
 * schema, but the fallback path does not, so nothing is trusted blindly.
 */
export function validateRecipe(raw) {
  const dish = String(raw?.dish || '').trim();
  if (!dish) throw new Error('המתכון שהתקבל חסר שם מנה');

  const ings = [];
  const dropped = [];
  for (const item of Array.isArray(raw.ings) ? raw.ings : []) {
    const n = String(item?.n || '').trim();
    const q = Number(item?.q);
    if (!n || !Number.isFinite(q) || q <= 0) {
      if (n) dropped.push(n);
      continue;
    }
    ings.push({
      n,
      q,
      u: UNITS.includes(item.u) ? item.u : coerceUnit(item.u),
      c: CATEGORIES.includes(item.c) ? item.c : 'אחר',
    });
  }

  if (!ings.length) throw new Error('המתכון שהתקבל לא כלל מצרכים תקינים');

  return {
    dish,
    steps: String(raw.steps || '').trim(),
    ings,
    iconKey: guessIconKey(dish),
    dropped,
  };
}

/** Map a stray unit onto the closest allowed one rather than discarding. */
function coerceUnit(u) {
  const s = String(u || '').trim();
  if (/ק"?ג|קילו|kg/i.test(s)) return 'גרם';
  if (/ליטר|l\b/i.test(s)) return 'מ"ל';
  if (/מ"?ל|ml|כוס|כף|כפית/i.test(s)) return 'מ"ל';
  if (/גר|g\b/i.test(s)) return 'גרם';
  return "יח'";
}

const ICON_HINTS = [
  [/פסטה|ספגטי|מקרוני|נודל|לזניה/, 'pasta'],
  [/אטריות|ראמן|נודלס/, 'noodles'],
  [/אורז|ריזוטו|פילאף|מוג'?דרה|קוסקוס/, 'rice'],
  [/מרק|ציר/, 'soup'],
  [/צ'?ילי|תבשיל|יאכני|קדרה|סטו/, 'stew'],
  [/גריל|נקניק|המבורגר|סטייק|בשר|עוף|שיפוד/, 'grill'],
  [/לחם|פיתה|לחמני|באגט|טוסט/, 'bread'],
  [/ביצ|שקשוק|חביתה|אומלט/, 'egg'],
  [/טורטי|בוריטו|פחיט|ראפ|שווארמה|פלאפל בפיתה/, 'wrap'],
  [/סלט|ירקות/, 'salad'],
];

export function guessIconKey(name) {
  const s = String(name || '');
  for (const [re, key] of ICON_HINTS) {
    if (re.test(s) && ICON_KEYS.includes(key)) return key;
  }
  return 'other';
}
