import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude proxy. The API key lives here and never reaches the browser.
 *
 * Three modes, one endpoint:
 *   image  — identify a dish from a photo
 *   text   — build a recipe from a description
 *   steps  — write method steps for an existing ingredient list
 */

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// A recipe with a dozen ingredients and real method steps does not fit in
// the 1200 tokens the original brief suggested; it truncates mid-sentence.
const MAX_TOKENS = 4000;

const UNITS = ['גרם', 'מ"ל', "יח'"];
const CATEGORIES = [
  'יבשים', 'שימורים', 'ירקות ופירות', 'קירור',
  'לחם ומאפים', 'תבלינים ורטבים', 'אחר',
];

/**
 * Plain JSON Schema, written by hand.
 *
 * This deliberately does not go through Zod. The SDK's `betaZodOutputFormat`
 * helper calls `z.toJSONSchema()`, which only exists in Zod v4 — so it throws
 * a TypeError against Zod v3 even though the SDK's peer range accepts it.
 * `output_format` only ever needed a plain schema object, so building one
 * directly removes the version coupling entirely.
 *
 * This constrains what the model emits; it is not the validation boundary.
 * Responses are still checked by extractJson here and validateRecipe on the
 * client, both of which run on the fallback path too.
 */
const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    dish: { type: 'string', description: 'שם המנה בעברית' },
    steps: { type: 'string', description: 'הוראות הכנה בעברית, שורה ממוספרת לכל שלב' },
    ings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'string', description: 'שם המצרך בעברית' },
          q: { type: 'number', description: 'כמות לאדם אחד' },
          u: { type: 'string', enum: UNITS },
          c: { type: 'string', enum: CATEGORIES },
        },
        required: ['n', 'q', 'u', 'c'],
        additionalProperties: false,
      },
    },
  },
  required: ['dish', 'steps', 'ings'],
  additionalProperties: false,
};

const SYSTEM = `אתה עוזר למנהל מטבח בפסטיבל שמבשל לקבוצה גדולה.
כל התשובות בעברית בלבד.
כללים נוקשים למצרכים:
- הכמויות הן תמיד לאדם אחד, לא לכל הסיר.
- יחידות מותרות: ${UNITS.join(' | ')} בלבד.
- קטגוריות מותרות: ${CATEGORIES.join(' | ')} בלבד.
- פרט רכיבים אמיתיים שאפשר לקנות בסופר. לעולם אל תכתוב "ירקות מעורבים" או "תבלינים" כפריט אחד — פרט אותם.
- הוראות ההכנה קצרות ומעשיות, שורה ממוספרת לכל שלב, מותאמות לבישול בשטח.`;

const PROMPTS = {
  image: 'זהה את המנה בתמונה. החזר את שם המנה, הוראות הכנה, ורשימת מצרכים עם כמות לאדם אחד.',
  text: (t) => `צור מתכון מלא עבור: ${t}`,
  steps: (list) => `הנה רשימת המצרכים של מנה בשם "${list.name}":\n${list.lines}\n\nכתוב הוראות הכנה מפורטות. החזר את אותם מצרכים בדיוק ללא שינוי.`,
};

export default async function handler(req, res, clientOverride = null) {
  if (req.method !== 'POST') {
    return fail(res, 405, 'שיטת בקשה לא נתמכת');
  }
  if (!clientOverride && !process.env.ANTHROPIC_API_KEY) {
    return fail(res, 401,
      'לא הוגדר מפתח Anthropic. הוסף ANTHROPIC_API_KEY בהגדרות הפרויקט ב-Vercel ופרוס מחדש.');
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return fail(res, 400, 'גוף הבקשה אינו JSON תקין'); }
  }
  const { mode } = body || {};

  let content;
  try {
    content = buildContent(mode, body);
  } catch (err) {
    return fail(res, 400, err.message);
  }

  const client = clientOverride || makeClient();
  const request = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  };

  // Structured output constrains units and categories at the source, but the
  // plain call works perfectly well without it. So ANY failure of the
  // structured path — an API rejection, or a local error thrown before the
  // request is even sent — retries without it rather than failing the
  // feature. An earlier version only retried on HTTP 400 and let a local
  // TypeError escape to the user as a raw JavaScript error.
  let structuredError = null;
  try {
    const recipe = await askClaude(client, {
      ...request,
      output_format: { type: 'json_schema', schema: RECIPE_SCHEMA },
    });
    if (recipe) return res.status(200).json({ recipe, model: MODEL });
    structuredError = new Error('המודל החזיר תשובה שלא ניתן היה לפענח');
  } catch (err) {
    structuredError = err;
  }

  try {
    const recipe = await askClaude(client, request);
    if (recipe) {
      return res.status(200).json({ recipe, model: MODEL, fallback: true });
    }
    return fail(res, 502, 'המודל החזיר תשובה שלא ניתן היה לפענח');
  } catch (err) {
    // Report whichever error is a real API failure; a local fault in building
    // the structured request tells the user nothing useful.
    return failFromApi(res, err.status ? err : (structuredError?.status ? structuredError : err));
  }
}

/**
 * An identity-linked API key (one created against a user rather than a
 * workspace) is rejected unless the request names the workspace it acts in.
 * Set ANTHROPIC_WORKSPACE_ID for those keys; a workspace-scoped key needs
 * nothing and the header is simply omitted.
 */
function makeClient() {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
  });
}

/** One request, one parsed recipe, or null when nothing could be extracted. */
async function askClaude(client, params) {
  const message = await client.beta.messages.create(params);
  return extractJson(textOf(message));
}

function buildContent(mode, body) {
  if (mode === 'image') {
    const { media_type: mediaType, data } = body.image || {};
    if (!data) throw new Error('לא צורפה תמונה לבקשה');
    return [
      { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data } },
      { type: 'text', text: PROMPTS.image },
    ];
  }
  if (mode === 'text') {
    const t = String(body.text || '').trim();
    if (!t) throw new Error('לא התקבל תיאור מנה');
    return PROMPTS.text(t);
  }
  if (mode === 'steps') {
    const lines = (body.ings || [])
      .map((i) => `- ${i.n}: ${i.q} ${i.u} לאדם`)
      .join('\n');
    if (!lines) throw new Error('אין מצרכים שאפשר לכתוב עבורם הוראות');
    return PROMPTS.steps({ name: body.name || 'מנה', lines });
  }
  throw new Error(`מצב לא מוכר: ${mode}`);
}

const textOf = (message) =>
  (message?.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

/**
 * Tolerant JSON extraction: slice between the first { and the last }, so a
 * model that wraps its answer in prose or a code fence still parses.
 */
export function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function failFromApi(res, err) {
  const status = err?.status || 500;
  const detail = err?.error?.error?.message || err?.message || String(err);

  // This one is worth naming explicitly: the key is valid, it just needs to
  // say which workspace it acts in, and there are two different ways to fix it.
  if (/anthropic-workspace-id/i.test(detail)) {
    return fail(res, status,
      'המפתח שהוגדר הוא מפתח מקושר-זהות, שדורש לציין באיזה workspace הבקשה פועלת.\n\n' +
      'שתי דרכים לתקן, שתיהן בקונסולה של Anthropic:\n' +
      '1. הדרך הפשוטה — צור מפתח חדש מתוך Workspace ספציפי (Settings ← Workspaces ← ' +
      'בחר workspace ← API Keys), והחלף איתו את ANTHROPIC_API_KEY ב-Vercel.\n' +
      '2. או השאר את המפתח הנוכחי והוסף ב-Vercel משתנה ANTHROPIC_WORKSPACE_ID ' +
      'עם מזהה ה-workspace שלך.\n\n' +
      'בשני המקרים צריך Redeploy אחרי השינוי.');
  }

  const friendly = {
    401: 'מפתח ה-Anthropic נדחה. בדוק את ANTHROPIC_API_KEY בהגדרות Vercel.',
    403: 'אין הרשאה למפתח הזה.',
    404: `המודל ${MODEL} לא נמצא. אפשר לשנות אותו במשתנה הסביבה CLAUDE_MODEL.`,
    429: 'חריגה ממכסת הבקשות. נסה שוב בעוד רגע.',
    529: 'השירות עמוס כרגע. נסה שוב בעוד רגע.',
  }[status];
  return fail(res, status, friendly ? `${friendly}\n(${detail})` : detail);
}

function fail(res, status, message) {
  return res.status(status).json({ error: { message, status } });
}
