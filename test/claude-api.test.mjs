import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/claude.js';

function res() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

/** A stand-in Anthropic client. `impl` receives the request params. */
const fakeClient = (impl) => ({ beta: { messages: { create: impl } } });

const textReply = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });

const GOOD = {
  dish: 'מרק עדשים כתומות',
  steps: '1. לטגן בצל.\n2. להוסיף עדשים ומים.',
  ings: [{ n: 'עדשים כתומות', q: 60, u: 'גרם', c: 'יבשים' }],
};

const req = (body = { mode: 'text', text: 'מרק עדשים' }) => ({ method: 'POST', body });

test('the happy path returns the recipe from the structured call', async () => {
  const calls = [];
  const client = fakeClient(async (params) => { calls.push(params); return textReply(GOOD); });
  const o = res();
  await handler(req(), o, client);

  assert.equal(o.code, 200);
  assert.equal(o.body.recipe.dish, 'מרק עדשים כתומות');
  assert.equal(o.body.fallback, undefined, 'should not have needed the fallback');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].output_format.type, 'json_schema');
});

test('the schema sent to the API constrains units and categories', async () => {
  let sent = null;
  const client = fakeClient(async (p) => { sent = p; return textReply(GOOD); });
  await handler(req(), res(), client);

  const schema = sent.output_format.schema;
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['dish', 'steps', 'ings']);
  const ing = schema.properties.ings.items;
  assert.deepEqual(ing.properties.u.enum, ['גרם', 'מ"ל', "יח'"]);
  assert.ok(ing.properties.c.enum.includes('קירור'));
  assert.equal(ing.additionalProperties, false);
  // It must be plain JSON — a Zod object would not survive this.
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(schema)));
});

test('REGRESSION: a local throw in the structured path falls back instead of escaping', async () => {
  // This is exactly the shipped bug: `z.toJSONSchema is not a function` was a
  // TypeError raised before any request, with no `status`. The old fallback
  // only caught HTTP 400, so it escaped to the user as a raw JS error.
  const calls = [];
  const client = fakeClient(async (params) => {
    calls.push(params);
    if (params.output_format) throw new TypeError('z.toJSONSchema is not a function');
    return textReply(GOOD);
  });
  const o = res();
  await handler(req(), o, client);

  assert.equal(o.code, 200, 'must recover, not fail');
  assert.equal(o.body.recipe.dish, 'מרק עדשים כתומות');
  assert.equal(o.body.fallback, true, 'should be flagged as the fallback path');
  assert.equal(calls.length, 2, 'structured attempt, then plain retry');
  assert.equal(calls[1].output_format, undefined, 'the retry must drop output_format');

  const serialised = JSON.stringify(o.body);
  assert.ok(!/toJSONSchema/.test(serialised), 'the raw TypeError must never reach the user');
});

test('an API rejection of output_format also falls back', async () => {
  const client = fakeClient(async (params) => {
    if (params.output_format) {
      const e = new Error('output_format is not supported');
      e.status = 400;
      throw e;
    }
    return textReply(GOOD);
  });
  const o = res();
  await handler(req(), o, client);
  assert.equal(o.code, 200);
  assert.equal(o.body.fallback, true);
});

test('when both paths fail, the real API reason is reported', async () => {
  const client = fakeClient(async () => {
    const e = new Error('invalid x-api-key');
    e.status = 401;
    throw e;
  });
  const o = res();
  await handler(req(), o, client);

  assert.equal(o.code, 401);
  assert.match(o.body.error.message, /ANTHROPIC_API_KEY/);
  assert.match(o.body.error.message, /invalid x-api-key/);
});

test('a local fault plus an API failure reports the API reason, not the local one', async () => {
  const client = fakeClient(async (params) => {
    if (params.output_format) throw new TypeError('some local fault');
    const e = new Error('rate limit exceeded');
    e.status = 429;
    throw e;
  });
  const o = res();
  await handler(req(), o, client);

  assert.equal(o.code, 429);
  assert.match(o.body.error.message, /מכסת הבקשות/);
  assert.ok(!/some local fault/.test(JSON.stringify(o.body)));
});

test('a reply wrapped in prose still parses', async () => {
  const client = fakeClient(async () => ({
    content: [{ type: 'text', text: 'בטח! הנה המתכון:\n```json\n' + JSON.stringify(GOOD) + '\n```\nבתיאבון' }],
  }));
  const o = res();
  await handler(req(), o, client);
  assert.equal(o.code, 200);
  assert.equal(o.body.recipe.dish, 'מרק עדשים כתומות');
});

test('unparseable output on both paths is reported as such', async () => {
  const client = fakeClient(async () => ({ content: [{ type: 'text', text: 'אין כאן JSON' }] }));
  const o = res();
  await handler(req(), o, client);
  assert.equal(o.code, 502);
  assert.match(o.body.error.message, /לפענח/);
});

test('image mode sends a base64 image block', async () => {
  let sent = null;
  const client = fakeClient(async (p) => { sent = p; return textReply(GOOD); });
  await handler(
    req({ mode: 'image', image: { media_type: 'image/jpeg', data: 'AAAA' } }),
    res(), client,
  );
  const block = sent.messages[0].content[0];
  assert.equal(block.type, 'image');
  assert.equal(block.source.type, 'base64');
  assert.equal(block.source.media_type, 'image/jpeg');
});

test('a request with no image is refused before calling the API', async () => {
  let called = false;
  const client = fakeClient(async () => { called = true; return textReply(GOOD); });
  const o = res();
  await handler(req({ mode: 'image', image: {} }), o, client);
  assert.equal(o.code, 400);
  assert.equal(called, false);
});
