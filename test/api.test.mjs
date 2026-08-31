import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../api/claude.js';

/** Minimal req/res doubles so the handlers can be driven without a server. */
function mockRes() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const load = async (mod) => (await import(mod)).default;

test('tolerant JSON extraction survives wrapping prose and code fences', () => {
  assert.deepEqual(extractJson('בטח! הנה:\n```json\n{"dish":"מרק"}\n```\nבתיאבון'), { dish: 'מרק' });
  assert.deepEqual(extractJson('{"a":{"b":1}} trailing'), { a: { b: 1 } });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson(''), null);
  assert.equal(extractJson('{ broken'), null);
});

test('claude endpoint reports a missing API key rather than failing opaquely', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const handler = await load('../api/claude.js');
  const res = mockRes();
  await handler({ method: 'POST', body: { mode: 'text', text: 'x' } }, res);
  process.env.ANTHROPIC_API_KEY = saved;

  assert.equal(res.code, 401);
  assert.match(res.body.error.message, /ANTHROPIC_API_KEY/);
  assert.match(res.body.error.message, /Vercel/);
});

test('claude endpoint rejects a non-POST', async () => {
  const handler = await load('../api/claude.js');
  const res = mockRes();
  await handler({ method: 'GET' }, res);
  assert.equal(res.code, 405);
});

test('state endpoint explains a missing backend instead of crashing', async () => {
  for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    delete process.env[k];
  }
  const handler = await load('../api/state.js');
  const res = mockRes();
  await handler({ method: 'GET', query: { code: 'PRDS-ABCDEFGH12' } }, res, null);

  assert.equal(res.code, 503);
  assert.equal(res.body.error.code, 'no_backend');
  assert.match(res.body.error.message, /Upstash/);
  // The message must make clear the app still works without it.
  assert.match(res.body.error.message, /מקומית/);
});
