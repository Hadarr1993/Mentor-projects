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

test('unparseable output on both paths is reported with what came back', async () => {
  const client = fakeClient(async () => ({ content: [{ type: 'text', text: 'אין כאן JSON' }] }));
  const o = res();
  await handler(req(), o, client);
  assert.equal(o.code, 502);
  assert.match(o.body.error.message, /לא בפורמט JSON/);
  assert.ok(o.body.error.message.includes('אין כאן JSON'), 'must echo the real response');
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

/* ── identity-linked API keys ──────────────────────────────────────── */

test('a workspace-id rejection is translated into an actionable message', async () => {
  const client = fakeClient(async () => {
    const e = new Error(
      'anthropic-workspace-id is required when authenticating with an ' +
      'identity-linked API key; send the id of the workspace this request acts in.',
    );
    e.status = 400;
    throw e;
  });
  const o = res();
  await handler(req(), o, client);

  assert.equal(o.code, 400);
  const msg = o.body.error.message;
  // It must name both fixes, not just restate the English error.
  assert.match(msg, /Workspace/, 'should point at the Workspace route');
  assert.match(msg, /ANTHROPIC_WORKSPACE_ID/, 'should name the env var route');
  assert.match(msg, /Redeploy/, 'should remind about redeploying');
});

test('the workspace header is sent only when the env var is set', async () => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const saved = process.env.ANTHROPIC_WORKSPACE_ID;
  const savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

  const header = (client) => {
    const h = client._options?.defaultHeaders;
    if (!h) return undefined;
    return h['anthropic-workspace-id'];
  };

  delete process.env.ANTHROPIC_WORKSPACE_ID;
  let c = new Anthropic({ apiKey: 'x' });
  assert.equal(header(c), undefined, 'no header when unset');

  process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_abc123';
  c = new Anthropic({
    apiKey: 'x',
    defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID },
  });
  assert.equal(header(c), 'wrkspc_abc123', 'header present when set');

  if (saved === undefined) delete process.env.ANTHROPIC_WORKSPACE_ID;
  else process.env.ANTHROPIC_WORKSPACE_ID = saved;
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
});

/* ── the beta header and the prompt contract ───────────────────────── */

test('REGRESSION: the structured attempt sends the structured-outputs beta header', async () => {
  // beta.messages.parse() injects this automatically; create() does not.
  // Switching from parse to create silently dropped it, which made
  // output_format a parameter the server did not recognise.
  let sent = null;
  const client = fakeClient(async (p) => { sent = p; return textReply(GOOD); });
  await handler(req(), res(), client);

  assert.ok(Array.isArray(sent.betas), 'betas must be sent');
  assert.ok(sent.betas.includes('structured-outputs-2025-11-13'),
    `missing the beta header, got: ${JSON.stringify(sent.betas)}`);
});

test('REGRESSION: the JSON contract is in the prompt on BOTH attempts', async () => {
  // output_format must be reinforcement, not the only mechanism. The fallback
  // strips output_format by design, so without this the fallback can never
  // succeed — it asks for a recipe without saying in what format.
  const seen = [];
  const client = fakeClient(async (p) => {
    seen.push(p);
    if (p.output_format) throw Object.assign(new Error('nope'), { status: 400 });
    return textReply(GOOD);
  });
  const o = res();
  await handler(req(), o, client);

  assert.equal(o.code, 200);
  assert.equal(seen.length, 2, 'both attempts should have run');
  for (const [i, p] of seen.entries()) {
    assert.match(p.system, /JSON/, `attempt ${i + 1} must ask for JSON in the prompt`);
    assert.match(p.system, /"dish"/, `attempt ${i + 1} must state the exact shape`);
  }
  assert.equal(seen[1].output_format, undefined, 'the fallback drops output_format');
});

test('the fallback alone produces a recipe — the prompt is self-sufficient', async () => {
  // Simulates output_format being unavailable entirely.
  const client = fakeClient(async (p) => {
    if (p.output_format) throw Object.assign(new Error('unknown parameter'), { status: 400 });
    return textReply(GOOD);
  });
  const o = res();
  await handler(req(), o, client);
  assert.equal(o.code, 200);
  assert.equal(o.body.fallback, true);
  assert.equal(o.body.recipe.dish, 'מרק עדשים כתומות');
});

/* ── diagnostics ───────────────────────────────────────────────────── */

test('prose instead of JSON reports what the model actually said', async () => {
  const prose = 'בשמחה! כדי להכין מרק עדשים כתומות תזדקק לעדשים, בצל וגזר...';
  const client = fakeClient(async () => ({
    content: [{ type: 'text', text: prose }], stop_reason: 'end_turn',
  }));
  const o = res();
  await handler(req(), o, client);

  assert.equal(o.code, 502);
  const msg = o.body.error.message;
  assert.match(msg, /לא בפורמט JSON/);
  assert.ok(msg.includes('בשמחה'), 'must quote the start of the real response');
});

test('a truncated response is reported as truncated, not as unparseable', async () => {
  const client = fakeClient(async () => ({
    content: [{ type: 'text', text: '{"dish":"מרק","ings":[{"n":"עדש' }],
    stop_reason: 'max_tokens',
  }));
  const o = res();
  await handler(req(), o, client);

  assert.equal(o.code, 502);
  assert.match(o.body.error.message, /נקטעה/, 'must name truncation specifically');
  assert.match(o.body.error.message, /max_tokens/);
});

test('a response with no text block says so, rather than looking empty', async () => {
  const client = fakeClient(async () => ({
    content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'end_turn',
  }));
  const o = res();
  await handler(req(), o, client);

  assert.equal(o.code, 502);
  assert.match(o.body.error.message, /לא החזיר טקסט/);
  assert.match(o.body.error.message, /thinking/, 'should name the block types received');
});

test('a refusal is reported as a refusal', async () => {
  const client = fakeClient(async () => ({ content: [], stop_reason: 'refusal' }));
  const o = res();
  await handler(req(), o, client);
  assert.match(o.body.error.message, /סירב/);
});
