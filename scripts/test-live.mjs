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
import { readDoc, writeDoc } from '../api/state.js';

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
