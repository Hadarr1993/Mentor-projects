import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

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

const RecipeSchema = z.object({
  dish: z.string().describe('שם המנה בעברית'),
  steps: z.string().describe('הוראות הכנה בעברית, שורה ממוספרת לכל שלב'),
  ings: z.array(z.object({
    n: z.string().describe('שם המצרך בעברית'),
    q: z.number().describe('כמות לאדם אחד'),
    u: z.enum(UNITS),
    c: z.enum(CATEGORIES),
  })),
});

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return fail(res, 405, 'שיטת בקשה לא נתמכת');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
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

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const request = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  };

  try {
    // Structured output constrains units and categories at the source.
    const message = await client.beta.messages.parse({
      ...request,
      output_format: betaZodOutputFormat(RecipeSchema),
    });
    if (message.parsed_output) {
      return res.status(200).json({ recipe: message.parsed_output, model: MODEL });
    }
    // Parsed output can come back null; fall through to the text path
    // rather than failing a call that did produce an answer.
    const loose = extractJson(textOf(message));
    if (loose) return res.status(200).json({ recipe: loose, model: MODEL });
    return fail(res, 502, 'המודל החזיר תשובה שלא ניתן היה לפענח');
  } catch (err) {
    // Structured output may be unavailable for this model or account.
    // A plain call plus tolerant extraction still gets the job done.
    if (isStructuredOutputProblem(err)) {
      try {
        const message = await client.messages.create(request);
        const loose = extractJson(textOf(message));
        if (loose) return res.status(200).json({ recipe: loose, model: MODEL, fallback: true });
        return fail(res, 502, 'המודל החזיר תשובה שלא ניתן היה לפענח');
      } catch (err2) {
        return failFromApi(res, err2);
      }
    }
    return failFromApi(res, err);
  }
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

const isStructuredOutputProblem = (err) => {
  const status = err?.status;
  const msg = String(err?.message || '');
  return status === 400 && /output_format|structured|schema|beta/i.test(msg);
};

function failFromApi(res, err) {
  const status = err?.status || 500;
  const detail = err?.error?.error?.message || err?.message || String(err);
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
