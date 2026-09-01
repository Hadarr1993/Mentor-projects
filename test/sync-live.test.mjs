import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDefaults, hydrate } from '../src/state/schema.js';
import * as sync from '../src/state/sync.js';
import { readDoc, writeDoc } from '../api/state.js';

/** An in-memory camp server, driven through the real endpoint logic. */
function server(initial = null) {
  const store = new Map();
  if (initial) store.set('kitchen:PRDS-TESTCAMP1', { rev: 1, data: initial });
  const backing = {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => void store.set(k, v),
  };
  return {
    backing,
    doc: () => store.get('kitchen:PRDS-TESTCAMP1')?.data ?? null,
    rev: () => store.get('kitchen:PRDS-TESTCAMP1')?.rev ?? 0,
  };
}

/** Point global fetch at the endpoint so sync.js exercises its real paths. */
function wire(srv) {
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url, 'http://localhost');
    const code = u.searchParams.get('code');
    const method = opts.method || 'GET';
    let out = { code: 0, body: null };
    const res = {
      status: (c) => { out.code = c; return res; },
      json: (b) => { out.body = b; return res; },
    };
    if (method === 'GET') {
      const { status, body } = await readDoc(srv.backing, code, u.searchParams.get('since'));
      out = { code: status, body };
    } else {
      const b = JSON.parse(opts.body);
      const { status, body } = await writeDoc(srv.backing, code, b.rev, b.data);
      out = { code: status, body };
    }
    return {
      ok: out.code >= 200 && out.code < 300,
      status: out.code,
      text: async () => JSON.stringify(out.body),
    };
  };
}

const CODE = 'PRDS-TESTCAMP1';

/** `navigator` is a getter-only global in Node, so it has to be redefined. */
function setOnline(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: value }, configurable: true, writable: true,
  });
}

test('THE BUG THAT STARTED THIS: joining a camp cannot overwrite it', async () => {
  // A camp planned three days ago.
  const old = Date.now() - 1000 * 60 * 60 * 24 * 3;
  const camp = makeDefaults();
  camp.settings = { ...camp.settings, people: 40, members: [{ id: '1', name: 'תורן א' }], _ts: old };
  for (const r of Object.values(camp.recipes)) r._ts = old;
  camp.recipes.bolognese = { ...camp.recipes.bolognese, name: 'בולונז ששונה', _ts: old + 5000 };
  camp.meals['d0-lunch'] = { recipeId: 'bolognese', tornim: 'תורן א', sides: [], _ts: old };

  const srv = server(camp);
  wire(srv);

  // A phone opened for the first time today joins. Under the old peer-merge
  // its fresh defaults had newer timestamps and won.
  sync.__cache.reset();
  sync.setCampCode(CODE);
  const got = await sync.fetchDoc();
  const joined = hydrate(got);

  assert.equal(joined.settings.people, 40, 'head count must survive');
  assert.equal(joined.settings.members.length, 1, 'crew list must survive');
  assert.equal(joined.recipes.bolognese.name, 'בולונז ששונה', 'edited recipe must survive');
  assert.ok(joined.meals['d0-lunch'], 'planned meal must survive');
  // And joining alone must not have written anything back.
  assert.equal(srv.rev(), 1, 'a join is a read; it must not push');
});

test('a queued edit is replayed onto a newer document, keeping both', async () => {
  const camp = makeDefaults();
  camp.tasks = {};
  const srv = server(camp);
  wire(srv);

  sync.__cache.reset();
  sync.setCampCode(CODE);
  await sync.fetchDoc();

  // Someone else pushes while we hold rev 1.
  await writeDoc(srv.backing, CODE, 1, {
    ...camp,
    tasks: { theirs: { id: 'theirs', text: 'שלהם', done: false, _ts: 500 } },
  });

  // Our edit is a pure transform, so replaying it keeps their task.
  await sync.enqueue((doc) => ({
    ...doc,
    tasks: { ...doc.tasks, mine: { id: 'mine', text: 'שלי', done: false, _ts: 900 } },
  }));

  const final = srv.doc();
  assert.ok(final.tasks.theirs, 'their task survived our push');
  assert.ok(final.tasks.mine, 'our task landed');
  assert.equal(sync.__cache.queueLength(), 0, 'queue cleared after acceptance');
});

test('an unchanged poll costs a tiny response, not the whole document', async () => {
  const camp = makeDefaults();
  const srv = server(camp);
  wire(srv);

  sync.__cache.reset();
  sync.setCampCode(CODE);
  await sync.fetchDoc();
  const rev = sync.__cache.get().rev;

  const { body } = await readDoc(srv.backing, CODE, String(rev));
  assert.equal(body.unchanged, true);
  assert.equal(body.data, undefined, 'must not ship the document again');
});

test('the rendered view is the server document with local edits on top', async () => {
  const camp = makeDefaults();
  camp.settings = { ...camp.settings, people: 33 };
  const srv = server(camp);
  wire(srv);

  sync.__cache.reset();
  sync.setCampCode(CODE);
  await sync.fetchDoc();

  // Go offline so the edit stays queued.
  setOnline(false);
  await sync.enqueue((doc) => ({ ...doc, settings: { ...doc.settings, people: 99, _ts: Date.now() } }));

  assert.equal(sync.view().settings.people, 99, 'the edit shows immediately');
  assert.equal(srv.doc().settings.people, 33, 'but has not reached the server');
  assert.equal(sync.__cache.queueLength(), 1, 'it is waiting in the queue');

  // Reception returns.
  setOnline(true);
  await sync.flush();
  assert.equal(srv.doc().settings.people, 99, 'the queued edit lands');
  assert.equal(sync.__cache.queueLength(), 0);
});

test('an empty camp is seeded by the first device rather than staying blank', async () => {
  const srv = server(null);
  wire(srv);

  sync.__cache.reset();
  sync.setCampCode(CODE);
  const got = await sync.fetchDoc();
  assert.equal(got, null, 'nothing published yet');

  const mine = makeDefaults();
  await sync.enqueue((doc) => doc || mine);
  assert.ok(srv.doc(), 'the camp now exists');
  assert.equal(srv.doc().settings.people, 50);
});
