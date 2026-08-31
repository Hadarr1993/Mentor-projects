#!/usr/bin/env node
/** Verifies free-form shopping items end to end in a real browser. */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173';
const SCRATCH = '/tmp/claude-0/-home-user-Mentor-projects/d352fa57-50fb-5ebf-b111-4be071049ebf/scratchpad';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });

let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`  ok  ${m}`);
const tab = (n) => page.getByRole('tab', { name: n, exact: true }).click();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');

// Plan a meal so the list has recipe-derived rows too.
await tab('שבוע');
await page.waitForTimeout(300);
await page.locator('main select').first().selectOption({ label: 'מוג׳דרה עם סלט' });
await page.waitForTimeout(250);

await tab('קניות');
await page.waitForTimeout(400);

console.log('\nadding a fixed-quantity item:');
await page.getByRole('button', { name: /פריטים שהוספת/ }).click();
await page.waitForTimeout(250);
await page.getByLabel('שם הפריט').fill('גליל אלומיניום');
await page.getByLabel('כמות').fill('2');
await page.getByLabel('יחידה').selectOption("יח'");
// 'כמות קבועה' is the default; assert that rather than clicking it.
const fixedPressed = await page.getByRole('button', { name: 'כמות קבועה' }).getAttribute('aria-pressed');
if (fixedPressed !== 'true') fail('fixed should be the default scale');
else ok('"כמות קבועה" is the default');
await page.getByRole('button', { name: /הוסף לרשימה/ }).click();
await page.waitForTimeout(400);

const listText = await page.locator('main').innerText();
if (!listText.includes('גליל אלומיניום')) fail('item not in the list');
else ok('item appears in the shopping list');

// The whole point of the feature: 2 stays 2.
const row = page.locator('.check', { hasText: 'גליל אלומיניום' }).first();
const rowText = await row.innerText();
if (!/\b2 יח'/.test(rowText)) fail(`expected "2 יח'", got: ${rowText.replace(/\n/g, ' ')}`);
else ok(`flat quantity held: ${rowText.replace(/\n/g, ' ').trim()}`);
if (/112/.test(rowText)) fail('quantity was multiplied by head count');

console.log('\nper-person mode:');
await page.getByLabel('שם הפריט').fill('כוס רב-פעמית');
await page.getByLabel('כמות').fill('1');
await page.getByRole('button', { name: 'לפי אדם', exact: true }).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: /הוסף לרשימה/ }).click();
await page.waitForTimeout(400);
const cupRow = await page.locator('.check', { hasText: 'כוס רב-פעמית' }).first().innerText();
if (!/56 יח'/.test(cupRow)) fail(`expected 56 (50 x 1.12), got: ${cupRow.replace(/\n/g, ' ')}`);
else ok(`per-person scaled: ${cupRow.replace(/\n/g, ' ').trim()}`);

console.log('\npersistence:');
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');
await tab('קניות');
await page.waitForTimeout(500);
const after = await page.locator('main').innerText();
if (!after.includes('גליל אלומיניום') || !after.includes('כוס רב-פעמית')) {
  fail('free items did not survive a reload');
} else ok('both items survived a reload');
const foilAfter = await page.locator('.check', { hasText: 'גליל אלומיניום' }).first().innerText();
if (!/\b2 יח'/.test(foilAfter)) fail('flat quantity changed after reload');
else ok('flat quantity still 2 after reload');

console.log('\nintegration with the rest of the list:');
await page.locator('.check', { hasText: 'גליל אלומיניום' }).first().click();
await page.waitForTimeout(300);
const progress = await page.locator('main').innerText();
if (!/1\/\d+/.test(progress)) fail('checking a free item did not update progress');
else ok('free items participate in the bought/progress counter');

const chips = await page.locator('.chip-static').allInnerTexts();
ok(`chips show what was added: ${chips.join(' | ').replace(/\n/g, ' ')}`);

await page.screenshot({ path: `${SCRATCH}/extras.png` });

console.log(`\nunexpected console errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 140)}`));
if (errors.length) failed = true;

await browser.close();
console.log(failed ? '\nEXTRAS FAILED' : '\nEXTRAS PASSED');
process.exitCode = failed ? 1 : 0;
