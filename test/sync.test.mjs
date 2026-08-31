import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/state.js';

/** An in-memory stand-in for Upstash, so the revision protocol can be
 *  driven for real without a network. */
const fake = new Map();
const store = {
  get: async (k) => fake.get(k) ?? null,
  set: async (k, v) => void fake.set(k, v),
};

function res() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const CODE = 'PRDS-ABCDEFGH12';
const get = async () => {
  const o = res();
  await handler({ method: 'GET', query: { code: CODE } }, o, store);
  return o;
};
const put = async (rev, data) => {
  const o = res();
  await handler({ method: 'PUT', query: { code: CODE }, body: { rev, data } }, o, store);
  return o;
};

test('an empty camp reads back as revision zero', async () => {
  const r = await get();
  assert.equal(r.code, 200);
  assert.equal(r.body.rev, 0);
  assert.equal(r.body.data, null);
});

test('a first write lands and bumps the revision', async () => {
  const r = await put(0, { recipes: { a: { name: 'ראשון', _ts: 1 } } });
  assert.equal(r.code, 200);
  assert.equal(r.body.rev, 1);
  const back = await get();
  assert.equal(back.body.data.recipes.a.name, 'ראשון');
});

test('a stale write is rejected and the newer document is handed back', async () => {
  await put(1, { recipes: { a: { name: 'שני', _ts: 2 } } }); // rev -> 2
  const stale = await put(1, { recipes: { a: { name: 'מכשיר מיושן', _ts: 1 } } });

  assert.equal(stale.code, 409, 'a stale write must not overwrite');
  assert.match(stale.body.error.message, /conflict/);
  // The response carries what the client needs to merge, not just an error.
  assert.equal(stale.body.rev, 2);
  assert.equal(stale.body.data.recipes.a.name, 'שני');

  const after = await get();
  assert.equal(after.body.data.recipes.a.name, 'שני', 'the stale write must not have landed');
});

test('a write at the current revision succeeds after a conflict is merged', async () => {
  const merged = await put(2, { recipes: { a: { name: 'שני', _ts: 2 }, b: { name: 'חדש', _ts: 3 } } });
  assert.equal(merged.code, 200);
  assert.equal(merged.body.rev, 3);
  const back = await get();
  assert.equal(Object.keys(back.body.data.recipes).length, 2);
});

test('a malformed camp code is refused', async () => {
  const o = res();
  await handler({ method: 'GET', query: { code: 'not-a-code' } }, o, store);
  assert.equal(o.code, 400);
});

test('an oversized document is refused with an actionable message', async () => {
  const huge = { blob: 'x'.repeat(5 * 1024 * 1024) };
  const r = await put(3, huge);
  assert.equal(r.code, 413);
  assert.match(r.body.error.message, /תמונות/);
});
