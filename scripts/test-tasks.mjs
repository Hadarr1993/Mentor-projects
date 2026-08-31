#!/usr/bin/env node
/** Kitchen crew tasks, end to end in a real browser. */
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
const rowTexts = () => page.locator('[data-flip-key] .task-text').allInnerTexts();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');

/* ── crew + identity ───────────────────────────────────────────────── */
console.log('\nsetup:');
await tab('הגדרות');
await page.waitForTimeout(300);
for (const name of ['הדר', 'שי']) {
  await page.getByLabel('שם חבר מחנה').fill(name);
  await page.getByRole('button', { name: /הוסף/ }).first().click();
  await page.waitForTimeout(100);
}
ok('added two crew members');

const whoCard = page.locator('.card', { hasText: 'מי אני במכשיר הזה' });
await whoCard.getByRole('button', { name: 'הדר', exact: true }).click();
await page.waitForTimeout(300);
if (!(await whoCard.locator('.tag-ok').innerText()).includes('הדר')) fail('identity not set');
else ok('device identity set to הדר');

/* ── add tasks ─────────────────────────────────────────────────────── */
console.log('\nadding tasks:');
await tab('משימות');
await page.waitForTimeout(300);

const addTask = async (text, owner) => {
  await page.getByLabel('תיאור המשימה').fill(text);
  if (owner) {
    await page.locator('.card', { hasText: 'משימה חדשה' })
      .getByRole('button', { name: owner, exact: true }).click();
  }
  await page.getByRole('button', { name: /^הוסף$/ }).click();
  await page.waitForTimeout(250);
};

await addTask('לנקות שולחנות', 'שי');
await addTask('למלא מים', null);
await addTask('לפרוק את הרכב', 'הדר');

let order = await rowTexts();
if (order.length !== 3) fail(`expected 3 tasks, got ${order.length}`);
else ok(`three tasks in creation order: ${order.join(' → ')}`);
if (order[0] !== 'לנקות שולחנות') fail('creation order wrong');

const firstRow = page.locator('[data-flip-key]').first();
if (!(await firstRow.innerText()).includes('שי')) fail('owner chip did not attach a name');
else ok('owner assigned via chip');

/* ── tick: moves to bottom, struck through, records who ────────────── */
console.log('\nclosing a task:');
// The real input is visually hidden behind the custom control, so click the
// label — which is what a person actually does.
await page.locator('[data-flip-key]', { hasText: 'לנקות שולחנות' })
  .locator('.check').click();
await page.waitForTimeout(700); // let the FLIP spring settle

order = await rowTexts();
if (order[order.length - 1] !== 'לנקות שולחנות') {
  fail(`closed task did not move to the bottom: ${order.join(' → ')}`);
} else ok(`moved to the bottom: ${order.join(' → ')}`);

const closed = page.locator('[data-flip-key]', { hasText: 'לנקות שולחנות' });
if (!(await closed.getAttribute('class')).includes('task-done')) fail('no task-done class');
else ok('marked as done (strike-through class applied)');

// The line is drawn with a real scaled pseudo-element, not just a colour swap.
const lineScale = await closed.locator('.task-text').evaluate(
  (el) => getComputedStyle(el, '::after').transform,
);
if (lineScale === 'none' || /matrix\(0,/.test(lineScale)) fail(`strike line not drawn (${lineScale})`);
else ok(`strike line drawn (${lineScale})`);

const closedText = await closed.innerText();
if (!closedText.includes('נסגר על ידי הדר')) fail(`closer not recorded: ${closedText.replace(/\n/g, ' ')}`);
else ok('recorded "נסגר על ידי הדר"');

const progress = await page.locator('.card', { hasText: 'נשארו' }).innerText();
if (!/1\/3/.test(progress)) fail(`progress wrong: ${progress.replace(/\n/g, ' ')}`);
else ok(`progress shows ${progress.split('\n').join(' ')}`);

/* ── persistence ───────────────────────────────────────────────────── */
console.log('\npersistence:');
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');
await tab('משימות');
await page.waitForTimeout(500);

order = await rowTexts();
if (order.length !== 3 || order[order.length - 1] !== 'לנקות שולחנות') {
  fail(`tasks did not survive reload: ${order.join(' → ')}`);
} else ok('tasks and their order survived a reload');
if (!(await page.locator('[data-flip-key]', { hasText: 'לנקות שולחנות' }).innerText()).includes('הדר')) {
  fail('closer name lost after reload');
} else ok('closer name survived');

/* ── reopening ─────────────────────────────────────────────────────── */
console.log('\nreopening:');
await page.locator('[data-flip-key]', { hasText: 'לנקות שולחנות' })
  .locator('.check').click();
await page.waitForTimeout(700);
order = await rowTexts();
if (order[order.length - 1] === 'לנקות שולחנות') fail('reopened task stayed at the bottom');
else ok(`returned to the open group: ${order.join(' → ')}`);
const reopened = await page.locator('[data-flip-key]', { hasText: 'לנקות שולחנות' }).innerText();
if (/נסגר על ידי/.test(reopened)) fail('stale closer left on a reopened task');
else ok('closer record cleared on reopen');

/* ── delete needs two presses ──────────────────────────────────────── */
console.log('\ndeleting:');
const target = page.locator('[data-flip-key]', { hasText: 'למלא מים' });
await target.getByRole('button').last().click();
await page.waitForTimeout(150);
if ((await rowTexts()).length !== 3) fail('deleted on the first press');
else ok('first press only arms the confirmation');
// ConfirmButton's accessible name when armed is "לאשר מחיקה"; match the
// visible text instead.
await target.locator('button:has-text("בטוח")').click();
await page.waitForTimeout(400);
if ((await rowTexts()).length !== 2) fail('second press did not delete');
else ok('second press deleted');

await page.screenshot({ path: `${SCRATCH}/tasks.png` });

console.log(`\nunexpected console errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 140)}`));
if (errors.length) failed = true;

await browser.close();
console.log(failed ? '\nTASKS FAILED' : '\nTASKS PASSED');
process.exitCode = failed ? 1 : 0;
