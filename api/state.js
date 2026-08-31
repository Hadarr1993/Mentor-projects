import { Redis } from '@upstash/redis';

/**
 * Camp state, shared across the crew's devices.
 *
 * The document is keyed by the camp code and versioned with a revision
 * counter. A PUT carrying a stale revision is rejected with 409 rather
 * than silently overwriting, and the response carries the newer document
 * so the client can merge and retry. That is what keeps two people editing
 * at once from erasing each other.
 *
 * The revision protocol below is transport-agnostic on purpose: `store` is
 * any { get, set } pair, which keeps the rules testable without a network.
 */

const TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days
const MAX_BYTES = 4 * 1024 * 1024;
const CODE_RE = /^PRDS-[A-Z0-9]{6,32}$/;

export const key = (code) => `kitchen:${code}`;

/* --------------------------------------------------------------- rules */

export async function readDoc(store, code) {
  const doc = await store.get(key(code));
  return { status: 200, body: doc || { rev: 0, data: null } };
}

export async function writeDoc(store, code, rev, data) {
  if (!data || typeof data !== 'object') {
    return { status: 400, body: { error: { message: 'לא התקבלו נתונים לשמירה', status: 400 } } };
  }

  const size = JSON.stringify(data).length;
  if (size > MAX_BYTES) {
    return {
      status: 413,
      body: {
        error: {
          message: `הנתונים גדולים מדי לסנכרון (${Math.round(size / 1024)} ק"ב). מחק תמונות מתכונים כבדות.`,
          status: 413,
        },
      },
    };
  }

  const current = await store.get(key(code));
  const currentRev = current?.rev || 0;

  if (Number(rev) !== currentRev) {
    // Hand back the newer document so the client can merge rather than guess.
    return {
      status: 409,
      body: {
        error: { message: 'conflict: הנתונים בענן התעדכנו', status: 409 },
        rev: currentRev,
        data: current?.data || null,
      },
    };
  }

  const next = { rev: currentRev + 1, updatedAt: new Date().toISOString(), data };
  await store.set(key(code), next, { ex: TTL_SECONDS });
  return { status: 200, body: { rev: next.rev, updatedAt: next.updatedAt } };
}

/* ----------------------------------------------------------- transport */

let cached = null;
function redisStore() {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  cached = {
    get: (k) => redis.get(k),
    set: (k, v, opts) => redis.set(k, v, opts),
  };
  return cached;
}

export default async function handler(req, res, store = redisStore()) {
  if (!store) {
    return res.status(503).json({
      error: {
        message:
          'שיתוף בענן לא מוגדר. חבר Upstash Redis ב-Vercel Marketplace ' +
          '(משתני KV_REST_API_URL ו-KV_REST_API_TOKEN). האפליקציה ממשיכה לעבוד מקומית.',
        status: 503,
        code: 'no_backend',
      },
    });
  }

  const code = String(req.query?.code || '').trim();
  if (!CODE_RE.test(code)) {
    return res.status(400).json({ error: { message: 'קוד מחנה לא תקין', status: 400 } });
  }

  try {
    if (req.method === 'GET') {
      const { status, body } = await readDoc(store, code);
      return res.status(status).json(body);
    }
    if (req.method === 'PUT') {
      let payload = req.body;
      if (typeof payload === 'string') payload = JSON.parse(payload);
      const { status, body } = await writeDoc(store, code, payload?.rev, payload?.data);
      return res.status(status).json(body);
    }
    return res.status(405).json({ error: { message: 'שיטת בקשה לא נתמכת', status: 405 } });
  } catch (err) {
    return res.status(500).json({ error: { message: `שגיאת אחסון בענן: ${err.message}`, status: 500 } });
  }
}
