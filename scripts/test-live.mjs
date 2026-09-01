#!/usr/bin/env node
/**
 * Two devices, one camp.
 *
 * The endpoint is not reachable from vite preview, so this stands a tiny
 * server in front of the real api/state.js logic and points both browser
 * contexts at it. What is exercised is the actual client sync path.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { readDoc, writeDoc, key } from '../api/state.js';

const PREVIEW = 'http://localhost:4173';
const SCRATCH = '/tmp/claude-0/-home-user-Mentor-projects/d352fa57-50fb-5ebf-b111-4be071049ebf/scratchpad';

/* ── a stand-in camp server ─────────────────────────────────────────── */
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
await new Promise((r) => server.listen(4175, r));

/**
 * The camp document as the server holds it.
 *
 * Reading the UI only proves a device kept something for itself. Recipes were
 * saved locally and never pushed for weeks and every screen still showed
 * them, so the assertion that matters is what is actually in the store.
 */
const serverDoc = async (code) => {
  const record = kv.get(key(code));          // { rev, updatedAt, data }
  return record?.data ?? null;
};

/** Wait for the camp document to satisfy a predicate, or give up. */
const waitForServer = async (code, predicate, tries = 25) => {
  for (let i = 0; i < tries; i++) {
    const doc = await serverDoc(code);
    if (doc && predicate(doc)) return doc;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`  ok  ${m}`);

/** A fresh device: its own storage, with /api/state routed to our server. */
async function device(label) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL' });
  await ctx.route('**/api/state**', async (route) => {
    const u = new URL(route.request().url());
    const target = `http://localhost:4175${u.pathname}${u.search}`;
    const r = await route.fetch({ url: target });
    await route.fulfill({ response: r });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`  ! ${label}: ${e.message}`));
  await page.goto(PREVIEW, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tabbar');
  return { ctx, page };
}

const tab = (p, n) => p.getByRole('tab', { name: n, exact: true }).click();

/* ── device A plans a camp ──────────────────────────────────────────── */
console.log('\ndevice A — planning:');
const A = await device('A');
await tab(A.page, 'הגדרות');
await A.page.waitForTimeout(400);
await A.page.getByLabel('מספר אנשים').fill('37');
await A.page.getByLabel('שם חבר מחנה').fill('תורן א');
await A.page.getByRole('button', { name: /הוסף/ }).first().click();
await A.page.waitForTimeout(900);
const campCode = await A.page.locator('#s-code').inputValue();
ok(`camp ${campCode} — 37 people, one crew member`);

await tab(A.page, 'משימות');
await A.page.waitForTimeout(300);
await A.page.getByLabel('תיאור המשימה').fill('לפרוק את הרכב');
await A.page.getByRole('button', { name: /^הוסף$/ }).click();
await A.page.waitForTimeout(1200);
ok('added a task');

/* ── the bug this suite missed: saves that never left the device ────── */

console.log('\nwhat A saved is actually in the camp document:');

// Every earlier assertion here went through `update()`. Recipes and sides go
// through `saveNow()`, which wrote to IndexedDB and pushed nothing — so the
// crew got a camp with no cooking in it and every screen looked correct.
await tab(A.page, 'מתכונים');
await A.page.waitForTimeout(600);
await A.page.getByRole('button', { name: /ערוך/ }).first().click();
await A.page.waitForTimeout(700);
await A.page.locator('#r-name').fill('הקדרה של קאמפ פרדייז');
await A.page.getByRole('button', { name: /שמור מתכון/ }).click();
await A.page.waitForTimeout(1500);

const withRecipe = await waitForServer(campCode, (d) =>
  Object.values(d.recipes || {}).some((r) => r?.name === 'הקדרה של קאמפ פרדייז'));
if (!withRecipe) fail('the recipe never reached the camp document — saveNow is not syncing');
else ok('a saved recipe is in the camp document on the server');

// Same path, different bag.
await tab(A.page, 'הגדרות');
await A.page.waitForTimeout(600);
const sideCard = A.page.locator('.card', { hasText: 'מאגר תוספות' }).first();
await sideCard.locator('button[aria-expanded]').first().click();
await A.page.waitForTimeout(600);

const settingsDoc = await serverDoc(campCode);
if (!settingsDoc) fail('no camp document on the server at all');
else ok('the camp document exists on the server');

/* ── device B joins ─────────────────────────────────────────────────── */
console.log('\ndevice B — joining:');
const B = await device('B');
await tab(B.page, 'הגדרות');
await B.page.waitForTimeout(400);
await B.page.getByLabel('הצטרף למחנה אחר').fill(campCode);
await B.page.getByRole('button', { name: /^הצטרף$/ }).click();
await B.page.waitForTimeout(1500);

const bPeople = await B.page.getByLabel('מספר אנשים').inputValue();
if (bPeople !== '37') fail(`B sees ${bPeople} people, expected 37`);
else ok('B sees A\'s head count of 37');

const bCrew = await B.page.locator('.chip-static').allInnerTexts();
if (!bCrew.join(' ').includes('תורן א')) fail(`B did not get the crew list: ${bCrew}`);
else ok('B sees A\'s crew list');

await tab(B.page, 'משימות');
await B.page.waitForTimeout(400);
if (!(await B.page.locator('main').innerText()).includes('לפרוק את הרכב')) {
  fail('B did not receive the task');
} else ok('B sees A\'s task');

await tab(B.page, 'מתכונים');
await B.page.waitForTimeout(700);
if (!(await B.page.locator('main').innerText()).includes('הקדרה של קאמפ פרדייז')) {
  fail("B did not get A's recipe — this is the bug a teammate actually hit");
} else ok("B sees A's recipe");

/* ── the old bug: B joining must not have clobbered A ───────────────── */
console.log('\nA is untouched by B joining:');
await A.page.reload({ waitUntil: 'networkidle' });
await A.page.waitForSelector('.tabbar');
await tab(A.page, 'הגדרות');
await A.page.waitForTimeout(1200);
const aPeopleAfter = await A.page.getByLabel('מספר אנשים').inputValue();
if (aPeopleAfter !== '37') fail(`A's head count became ${aPeopleAfter} after B joined`);
else ok('A still has 37 — a join no longer overwrites the camp');

/* ── live: B edits, A sees it without touching anything ─────────────── */
console.log('\nlive update:');
await tab(B.page, 'משימות');
await B.page.waitForTimeout(300);
await B.page.getByLabel('תיאור המשימה').fill('למלא מים');
await B.page.getByRole('button', { name: /^הוסף$/ }).click();
await B.page.waitForTimeout(1200);
ok('B added a second task');

await tab(A.page, 'משימות');
let sawIt = false;
for (let i = 0; i < 20 && !sawIt; i++) {          // poll backs off; give it room
  await A.page.waitForTimeout(1000);
  sawIt = (await A.page.locator('main').innerText()).includes('למלא מים');
}
if (!sawIt) fail('A never received B\'s task');
else ok('A received B\'s task with no button pressed');

await A.page.screenshot({ path: `${SCRATCH}/live-A.png` });

await browser.close();
server.close();
console.log(failed ? '\nLIVE FAILED' : '\nLIVE PASSED');
process.exitCode = failed ? 1 : 0;
