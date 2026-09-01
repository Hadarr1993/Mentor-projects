#!/usr/bin/env node
/**
 * Two things a phone gets wrong that a desktop never shows you.
 *
 * 1. Fields collapsing to nothing. The ingredient editor had fixed-width
 *    quantity/unit/category fields that consumed the whole line, squeezing
 *    the name input — which is allowed to shrink — down to zero with no way
 *    to scroll to it.
 *
 * 2. Controls too small to hit. The shopping tick is the most-pressed control
 *    in the app — dozens of times in a supermarket, one-handed, holding a
 *    basket — and it shipped at 22x22. Anything a thumb has to find needs
 *    44x44, so this walks every tab, opens every panel, and measures.
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173';
const SCRATCH = process.env.SCRATCH
  || '/tmp/claude-0/-home-user-Mentor-projects/d352fa57-50fb-5ebf-b111-4be071049ebf/scratchpad';

const MIN_TAP = 44;

// The narrowest phone still in real use, plus a common modern one.
const VIEWPORTS = [
  { name: 'iPhone SE', width: 320, height: 700 },
  { name: 'iPhone 12/13', width: 390, height: 844 },
  { name: 'desktop', width: 1100, height: 900 },
];

const TABS = ['היום', 'שבוע', 'מתכונים', 'משימות', 'קניות', 'קרח', 'ייצוא', 'הגדרות'];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`  ok  ${m}`);

/**
 * Measure every interactive control on screen and report the ones a thumb
 * would miss. Runs in the page so it sees the live layout, pseudo-element
 * hit padding included.
 */
const AUDIT = (min) => {
  const SELECTOR = 'button, input, select, textarea, label.check, a[href], [role=button], [role=tab]';
  const out = [];
  for (const el of document.querySelectorAll(SELECTOR)) {
    // The real checkbox is visually hidden behind its .box; the label is the
    // control. Likewise a hidden file input behind a drop zone.
    if (el.matches('input[type=checkbox], input[type=file]')) continue;
    // An underlined word inside a sentence. Stretching it to 44px would tear
    // a hole in the paragraph, so it is exempt by name, not by accident.
    if (el.classList.contains('link')) continue;

    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;

    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    // Union in any ::after hit-padding, which is how a 22px square keeps its
    // look while reaching 44px.
    let w = r.width, h = r.height;
    for (const el2 of [el, ...el.querySelectorAll('*')]) {
      const after = getComputedStyle(el2, '::after');
      if (after.content === 'none') continue;
      const aw = parseFloat(after.width), ah = parseFloat(after.height);
      if (Number.isFinite(aw)) w = Math.max(w, aw);
      if (Number.isFinite(ah)) h = Math.max(h, ah);
    }

    if (w >= min && h >= min) continue;
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    out.push(`${el.tagName.toLowerCase()}${cls}`.slice(0, 60) + ` — ${Math.round(w)}x${Math.round(h)}`);
  }
  return [...new Set(out)];
};

/** Open everything that hides controls, so the audit actually sees them. */
async function openEverything(page) {
  const togglers = page.locator('button[aria-expanded="false"]');
  for (let i = 0; i < (await togglers.count()); i++) {
    await togglers.nth(i).click().catch(() => {});
  }
  await page.waitForTimeout(250);
}

for (const vp of VIEWPORTS) {
  console.log(`\n${vp.name} (${vp.width}px):`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'he-IL' });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tabbar');

  /* ── 1. the ingredient editor holds its shape ─────────────────────── */

  await page.getByRole('tab', { name: 'מתכונים', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /ערוך/ }).first().click();
  await page.waitForTimeout(400);

  const row = page.locator('.ing-row').first();
  await row.waitFor();

  const box = async (sel) => (await row.locator(sel).first().boundingBox()) || { width: 0, height: 0 };
  const name = await box('.ing-name');
  const qty = await box('.ing-qty');
  const unit = await box('.ing-unit');
  const cat = await box('.ing-cat');

  // The actual bug: a field wide enough to be tapped and read.
  if (name.width < 90) fail(`name field is ${Math.round(name.width)}px — too narrow to use`);
  else ok(`name field ${Math.round(name.width)}px`);
  for (const [label, b] of [['qty', qty], ['unit', unit], ['category', cat]]) {
    if (b.width < 40) fail(`${label} field collapsed to ${Math.round(b.width)}px`);
  }
  if (!failed) ok(`qty ${Math.round(qty.width)}px · unit ${Math.round(unit.width)}px · category ${Math.round(cat.width)}px`);

  // The name must be typeable and show what was typed.
  await row.locator('.ing-name').fill('בדיקת שם ארוך של מצרך');
  await page.waitForTimeout(150);
  if ((await row.locator('.ing-name').inputValue()) !== 'בדיקת שם ארוך של מצרך') fail('name not editable');
  else ok('name field accepts and holds text');

  // Nothing may push the page sideways.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) fail(`page scrolls horizontally by ${overflow}px`);
  else ok('no horizontal page overflow');

  await page.screenshot({ path: `${SCRATCH}/ing-${vp.width}.png` });

  /* ── 2. every control is reachable by thumb ───────────────────────── */

  // The editor itself first — it is a screen of its own.
  await openEverything(page);
  let small = await page.evaluate(AUDIT, MIN_TAP);
  if (small.length) fail(`recipe editor has ${small.length} control(s) under ${MIN_TAP}px`);
  small.forEach((s) => console.error(`        ${s}`));

  await page.keyboard.press('Escape').catch(() => {});
  await page.getByRole('button', { name: /ביטול|חזרה/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);

  let allBigEnough = small.length === 0;
  let audited = 0;
  for (const label of TABS) {
    const tab = page.getByRole('tab', { name: label, exact: true });
    if (!(await tab.count())) { fail(`tab "${label}" not found`); continue; }
    await tab.click();
    await page.waitForTimeout(350);
    await openEverything(page);

    small = await page.evaluate(AUDIT, MIN_TAP);
    audited++;
    if (small.length) {
      allBigEnough = false;
      fail(`"${label}" has ${small.length} control(s) under ${MIN_TAP}px`);
      small.forEach((s) => console.error(`        ${s}`));
    }
  }
  if (audited === TABS.length && allBigEnough) {
    ok(`every control on all ${TABS.length} tabs reaches ${MIN_TAP}x${MIN_TAP}`);
  }

  await ctx.close();
}

await browser.close();
console.log(failed ? '\nMOBILE FAILED' : '\nMOBILE PASSED');
process.exitCode = failed ? 1 : 0;
