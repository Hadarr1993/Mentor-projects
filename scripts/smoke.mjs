#!/usr/bin/env node
/** Drives the built app in a real browser: visits every tab, exercises the
 *  main flows, and asserts that data actually survives a reload. */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173';
const shot = (n) => `/tmp/claude-0/-home-user-Mentor-projects/d352fa57-50fb-5ebf-b111-4be071049ebf/scratchpad/${n}.png`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL' });
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };
const ok = (msg) => console.log(`  ok  ${msg}`);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar', { timeout: 10000 });

// ── every tab renders ────────────────────────────────────────────────
console.log('\ntabs:');
const tabs = ['היום', 'שבוע', 'מתכונים', 'קניות', 'קרח', 'ייצוא', 'הגדרות'];
for (const label of tabs) {
  await page.getByRole('tab', { name: label, exact: true }).click();
  await page.waitForTimeout(320);
  const text = await page.locator('main').innerText();
  if (!text.trim()) fail(`tab ${label} rendered empty`);
  else ok(`${label} (${text.trim().split('\n')[0].slice(0, 40)})`);
}

// ── no emoji anywhere in the rendered UI ─────────────────────────────
console.log('\nicons:');
for (const label of tabs) {
  await page.getByRole('tab', { name: label, exact: true }).click();
  await page.waitForTimeout(250);
  const body = await page.locator('body').innerText();
  const emoji = body.match(/\p{Extended_Pictographic}/gu);
  if (emoji) fail(`emoji found in ${label}: ${[...new Set(emoji)].join(' ')}`);
}
if (!process.exitCode) ok('no emoji in any tab');
const svgCount = await page.locator('.tabbar svg').count();
if (svgCount < 7) fail(`expected 7 tab icons, found ${svgCount}`);
else ok(`${svgCount} line icons in the tab bar`);

// ── plan a meal, then check the shopping list picks it up ────────────
console.log('\nplanning:');
await page.getByRole('tab', { name: 'שבוע', exact: true }).click();
await page.waitForTimeout(300);
const firstSelect = page.locator('main select').first();
await firstSelect.selectOption({ label: 'פסטה בולונז צמחוני' });
await page.waitForTimeout(200);
ok('assigned a recipe to the first meal');

await page.getByRole('button', { name: /שבץ תורנים אוטומטית/ }).click();
await page.waitForTimeout(300);
const toastText = await page.locator('.toast').first().innerText().catch(() => '');
ok(`auto-assign responded: ${toastText.replace(/\n/g, ' ')}`);

await page.getByRole('tab', { name: 'קניות', exact: true }).click();
await page.waitForTimeout(400);
const shopping = await page.locator('main').innerText();
if (!shopping.includes('פסטה יבשה')) fail('planned recipe did not reach the shopping list');
else ok('the planned recipe reached the shopping list');
if (!shopping.includes('מים')) fail('pantry water missing from the shopping list');
else ok('pantry water is in the shopping list');

// ── persistence across a reload ──────────────────────────────────────
console.log('\npersistence:');
await page.waitForTimeout(900); // let the debounce commit
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');
await page.getByRole('tab', { name: 'שבוע', exact: true }).click();
await page.waitForTimeout(500);
const afterReload = await page.locator('main select').first().inputValue();
if (afterReload !== 'bolognese') fail(`meal did not survive reload (got "${afterReload}")`);
else ok('the planned meal survived a reload');

const tornim = await page.locator('main input[placeholder*="פסיק"]').first().inputValue();
ok(`tornim field after reload: "${tornim || '(empty — no members configured)'}"`);

// ── the today tab and screenshots ────────────────────────────────────
console.log('\nscreenshots:');
await page.getByRole('tab', { name: 'היום', exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: shot('today') });
ok('today');
await page.getByRole('tab', { name: 'מתכונים', exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: shot('recipes') });
ok('recipes');
await page.getByRole('tab', { name: 'קניות', exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: shot('shopping') });
ok('shopping');
await page.getByRole('tab', { name: 'שבוע', exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: shot('week') });
ok('week');

// ── AI error path must be an in-page box, never an alert ─────────────
console.log('\nai error path:');
let alerted = false;
page.on('dialog', async (d) => { alerted = true; await d.dismiss(); });
await page.getByRole('tab', { name: 'מתכונים', exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /מטקסט/ }).click();
await page.waitForTimeout(250);
await page.locator('#ai-text').fill('מרק עדשים');
await page.getByRole('button', { name: /צור מתכון/ }).click();
await page.waitForTimeout(2500);
const box = await page.locator('.errorbox').count();
if (alerted) fail('an alert() was used for an AI error');
else ok('no alert() dialog');
if (!box) fail('no in-page error box after a failed AI call');
else ok(`error shown in-page: "${(await page.locator('.errorbox').first().innerText()).split('\n')[0].slice(0, 70)}"`);
await page.screenshot({ path: shot('ai-error') });

// vite preview does not run the serverless functions, so a 404 on /api is
// expected here and is exactly what the AI error-path check above asserts.
const unexpected = errors.filter((e) => !/404/.test(e));
console.log(`\nconsole errors: ${errors.length} (${unexpected.length} unexpected)`);
for (const e of errors.slice(0, 10)) console.log(`  ! ${e.slice(0, 160)}`);
if (unexpected.length) process.exitCode = 1;

await browser.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
