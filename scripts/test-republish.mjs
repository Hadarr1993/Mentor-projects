#!/usr/bin/env node
/**
 * Recipes that were saved before the sync bug was fixed.
 *
 * Fixing `saveNow` makes new saves reach the camp; it does nothing for work
 * already sitting in IndexedDB, because the queue only ever holds new edits.
 * On load the app publishes that backlog once.
 *
 * This is the only place that pushes based on what a device is holding rather
 * than on something a person just did, so the two guards matter as much as the
 * feature: the server's copy always wins, and a deleted recipe stays deleted.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { readDoc, writeDoc, key } from '../api/state.js';

const PREVIEW = process.env.SMOKE_URL || 'http://localhost:4173';
const CODE = 'PRDS-REPUBLISH1';

const kv = new Map();
const store = { get: async (k) => kv.get(k) ?? null, set: async (k, v) => void kv.set(k, v) };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const code = u.searchParams.get('code');
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET') {
    const { status, body } = await readDoc(store, code, u.searchParams.get('since'));
    return send(status, body);
  }
  let raw = '';
  for await (const c of req) raw += c;
  const b = JSON.parse(raw);
  const { status, body } = await writeDoc(store, code, b.rev, b.data);
  return send(status, body);
});
await new Promise((r) => server.listen(4176, r));

let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`  ok  ${m}`);

const camp = () => kv.get(key(CODE))?.data ?? null;

const recipe = (id, name) => ({
  id, name, iconKey: 'stew', steps: '1. לבשל.',
  ings: [{ n: 'עדשים', q: 60, u: 'גרם', c: 'יבשים' }], _ts: 1700000000000,
});

/* The camp already exists, published by a teammate. It has one recipe of its
   own, and a tombstone for a recipe somebody deliberately deleted. */
const seedCamp = {
  schemaVersion: 3,
  campCode: CODE,
  settings: { people: 42, reservePct: 12, budget: 0, startDate: '2026-11-02',
              days: 6, tornimPerMeal: 2, members: [], _ts: 1700000000000 },
  recipes: {
    theirs: recipe('theirs', 'המתכון של הצוות'),
    shared: recipe('shared', 'הגרסה שבענן'),
    deleted: { id: 'deleted', _deleted: true, _ts: Date.now() - 60000 },
  },
  sides: {}, meals: {}, tasks: {},
  breakfast: { ings: [], _ts: 1 }, pantry: { ings: [], _ts: 1 },
  shopping: { items: {}, _ts: 1 }, extras: { items: [], _ts: 1 },
};
await writeDoc(store, CODE, 0, seedCamp);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL' });
await ctx.route('**/api/state**', async (route) => {
  const u = new URL(route.request().url());
  const r = await route.fetch({ url: `http://localhost:4176${u.pathname}${u.search}` });
  await route.fulfill({ response: r });
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error(`  ! ${e.message}`));

await page.goto(PREVIEW, { waitUntil: 'domcontentloaded' });

/* This device is carrying the aftermath of the bug: three recipes saved
   locally, none of which the camp has ever heard of. */
console.log('\nseeding a device with recipes that never left it:');
await page.evaluate(async ({ code, mine }) => {
  const doc = {
    schemaVersion: 3, campCode: code,
    settings: { people: 42, reservePct: 12, budget: 0, startDate: '2026-11-02',
                days: 6, tornimPerMeal: 2, members: [], _ts: 1700000000000 },
    recipes: mine, sides: {}, meals: {}, tasks: {},
    breakfast: { ings: [], _ts: 1 }, pantry: { ings: [], _ts: 1 },
    shopping: { items: {}, _ts: 1 }, extras: { items: [], _ts: 1 },
  };
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('camp-paradise-kitchen', 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(JSON.stringify(doc), 'midburn-kitchen');
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}, {
  code: CODE,
  mine: {
    stranded: recipe('stranded', 'הקדרה שנתקעה במכשיר'),
    // Same id as the camp's, different content — the camp's must win.
    shared: { ...recipe('shared', 'הגרסה הישנה שלי'), _ts: 1799999999999 },
    // Deleted in the camp; this device never saw that.
    deleted: recipe('deleted', 'מתכון שמישהו מחק'),
  },
});
ok('device holds 3 recipes the camp does not have');

console.log('\nopening the app on top of it:');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');
for (let i = 0; i < 25 && !camp()?.recipes?.stranded; i++) await page.waitForTimeout(400);
await page.waitForTimeout(1200);

const published = camp()?.recipes || {};

if (published.stranded?.name !== 'הקדרה שנתקעה במכשיר') {
  fail(`the stranded recipe was not published: ${JSON.stringify(published.stranded)}`);
} else ok('the stranded recipe is now in the camp document');

if (published.theirs?.name !== 'המתכון של הצוות') {
  fail("the teammate's own recipe was damaged");
} else ok("the teammate's recipe is untouched");

if (published.shared?.name !== 'הגרסה שבענן') {
  fail(`the camp's version was overwritten by this device: "${published.shared?.name}"`);
} else ok("the camp's version of a shared id wins, even against a newer local copy");

if (!published.deleted?._deleted) {
  fail(`a deleted recipe came back: "${published.deleted?.name}"`);
} else ok('a deleted recipe stays deleted — no resurrection');

if (camp()?.settings?.people !== 42) {
  fail(`settings changed: ${camp()?.settings?.people}`);
} else ok('nothing else in the camp document moved');

/* ── it must be a migration, not a standing second writer ───────────── */

console.log('\nthe repair runs once, not on every launch:');

// A tombstone eventually ages past its TTL and is pruned from the camp. If
// the repair still ran, this device — which never saw the deletion — would
// find the id missing and put the recipe back.
const store2 = kv.get(key(CODE));
const aged = JSON.parse(JSON.stringify(store2.data));
delete aged.recipes.deleted;                       // as pruneTombstones would
kv.set(key(CODE), { ...store2, rev: store2.rev + 1, data: aged });
ok('tombstone pruned from the camp, as it would be after 60 days');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');
await page.waitForTimeout(2500);

if (camp()?.recipes?.deleted) {
  fail(`the repair ran again and resurrected a deleted recipe: "${camp().recipes.deleted.name}"`);
} else ok('a second launch republishes nothing — the deleted recipe stays gone');

if (camp()?.recipes?.stranded?.name !== 'הקדרה שנתקעה במכשיר') {
  fail('the previously published recipe was lost on the second launch');
} else ok('what was already published is still there');

await browser.close();
server.close();
console.log(failed ? '\nREPUBLISH FAILED' : '\nREPUBLISH PASSED');
process.exitCode = failed ? 1 : 0;
