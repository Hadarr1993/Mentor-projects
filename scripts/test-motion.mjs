#!/usr/bin/env node
/**
 * The screen transitions, checked for what they leave behind.
 *
 * Motion bugs do not throw. A spring whose callback captured a stale `open`
 * closed the extras panel to opacity 0 while it kept its full height — the
 * content vanished and a blank gap stayed behind, and every existing suite
 * still passed. What this asserts is the settled state after each transition:
 * the right things mounted, no inline styles stranded mid-flight.
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });

let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`  ok  ${m}`);

// Long enough for a 0.35s-response spring to reach its target and settle.
const SETTLE = 1200;

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');

/* ── collapsible panels ───────────────────────────────────────────────── */

console.log('\ncollapsible panels open and close without leaving a hole:');

await page.getByRole('tab', { name: 'קניות', exact: true }).click();
await page.waitForTimeout(SETTLE);

const toggle = page.locator('button[aria-expanded]').first();
const field = page.getByPlaceholder('שם הפריט');

/** The panel's settled geometry, read off the element that actually animates. */
const panel = () => page.evaluate(() => {
  const input = document.querySelector('input[placeholder="שם הפריט"]');
  const box = input
    ? input.closest('div[style*="overflow"]')
    : document.querySelector('div[style*="overflow: hidden"]');
  return {
    mounted: !!input,
    height: box?.style.height ?? null,
    opacity: box?.style.opacity ?? null,
  };
});

let p = await panel();
if (p.mounted) fail('a closed panel still has its controls in the document');
else ok('closed: nothing focusable left behind');

await toggle.click();
await page.waitForTimeout(SETTLE);
p = await panel();
if (!p.mounted || p.height !== 'auto' || p.opacity !== '1') {
  fail(`open panel settled wrong: ${JSON.stringify(p)}`);
} else ok('open: full height, fully opaque');

await toggle.click();
await page.waitForTimeout(SETTLE);
p = await panel();
// This is the exact bug: opacity reached 0 but the height stayed on `auto`.
if (p.height === 'auto') fail('closed panel kept its height — a blank gap is left on the page');
else if (p.mounted) fail('closed panel did not unmount its controls');
else if (p.height !== '0px') fail(`closed panel settled at height ${p.height}`);
else ok('closed again: collapsed to zero and unmounted');

await toggle.click();
await page.waitForTimeout(SETTLE);
p = await panel();
if (!p.mounted || p.height !== 'auto') fail(`reopening did not restore the panel: ${JSON.stringify(p)}`);
else ok('reopens after a close — the spring is not stuck at zero');

await toggle.click();
await page.waitForTimeout(SETTLE);

/* ── the recipe editor as a sheet ─────────────────────────────────────── */

console.log('\nthe recipe editor enters and leaves along the same path:');

await page.getByRole('tab', { name: 'מתכונים', exact: true }).click();
await page.waitForTimeout(SETTLE);

const editButtons = () => page.getByRole('button', { name: /ערוך/ }).count();
const before = await editButtons();
if (before < 1) fail('no recipes to edit — the fixture is empty');

await page.getByRole('button', { name: /ערוך/ }).first().click();
await page.waitForTimeout(SETTLE);

if ((await page.locator('h2').first().innerText()) !== 'עריכת מתכון') fail('the editor did not open');
else ok('the editor took over the screen');
if ((await editButtons()) !== 0) fail('the list is still rendered underneath the open editor');
else ok('the list is not stacked underneath it');

await page.getByRole('button', { name: 'סגור' }).first().click();
await page.waitForTimeout(SETTLE);

if ((await editButtons()) !== before) {
  fail(`the list did not come back intact (${await editButtons()} of ${before} recipes)`);
} else ok('closing returns the list exactly as it was');

/* ── one motion per action ────────────────────────────────────────────── */

console.log('\nswitching tabs runs one transition, not ten:');

// The regression this catches: `.card { animation: fadeUp }` replayed on
// every mount, so arriving at a tab put eight cards in vertical motion
// underneath a panel already sliding in horizontally. Nothing threw; it
// just looked like smear. Counted here rather than judged by eye.
await page.getByRole('tab', { name: 'היום', exact: true }).click();
await page.waitForTimeout(SETTLE);

await page.getByRole('tab', { name: 'קניות', exact: true }).click();
await page.waitForTimeout(90);

const midFlight = await page.evaluate(() =>
  document.getAnimations()
    .filter((a) => a.playState === 'running')
    .map((a) => a.animationName || 'transition'));

const cardEntrances = midFlight.filter((n) => n === 'fadeUp').length;
if (cardEntrances) {
  fail(`${cardEntrances} card(s) replaying their entrance on a tab switch`);
} else ok('the cards do not re-enter — the stagger is first paint only');

if (midFlight.length > 2) {
  fail(`${midFlight.length} animations running at once mid-switch: ${midFlight.join(', ')}`);
} else ok(`${midFlight.length} animation(s) mid-switch`);

// And it must actually be over quickly — this is a navigation, not a scene.
await page.waitForTimeout(310);
const stillGoing = await page.evaluate(() =>
  document.getAnimations().filter((a) => a.playState === 'running').length);
if (stillGoing) fail(`${stillGoing} animation(s) still running 400ms after the switch`);
else ok('settled well inside 400ms');

/* ── nothing is stranded mid-animation ────────────────────────────────── */

console.log('\nno transition leaves an inline style behind:');

for (const label of ['היום', 'שבוע', 'מתכונים', 'משימות', 'קניות', 'קרח', 'ייצוא', 'הגדרות']) {
  await page.getByRole('tab', { name: label, exact: true }).click();
  await page.waitForTimeout(700);
}
await page.waitForTimeout(SETTLE);

const stranded = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('[style]')) {
    const s = el.style;
    // A collapsed panel is legitimately transparent and zero-high; what this
    // is looking for is something still on screen and still half-way there.
    const shown = el.getBoundingClientRect().height > 0;
    const tag = el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(/\s+/)[0]}` : '');
    if (shown && s.opacity && Number(s.opacity) < 1) bad.push(`${tag} opacity ${s.opacity}`);
    if (s.willChange) bad.push(`${tag} will-change ${s.willChange}`);
    if (shown && s.transform && s.transform !== 'none') bad.push(`${tag} transform ${s.transform}`);
  }
  return bad;
});
if (stranded.length) {
  fail(`${stranded.length} element(s) left mid-animation: ${stranded.slice(0, 4).join(', ')}`);
} else ok('every panel settled and cleaned up after itself');

console.log(`\nunexpected console errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 140)}`));
if (errors.length) failed = true;

await browser.close();
console.log(failed ? '\nMOTION FAILED' : '\nMOTION PASSED');
process.exitCode = failed ? 1 : 0;
