#!/usr/bin/env node
/**
 * Guards against controls collapsing to nothing on a phone.
 *
 * The ingredient editor had fixed-width quantity/unit/category fields that
 * consumed the whole line, squeezing the name input — which is allowed to
 * shrink — down to zero with no way to scroll to it.
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173';
const SCRATCH = '/tmp/claude-0/-home-user-Mentor-projects/d352fa57-50fb-5ebf-b111-4be071049ebf/scratchpad';

// The narrowest phone still in real use, plus a common modern one.
const VIEWPORTS = [
  { name: 'iPhone SE', width: 320, height: 700 },
  { name: 'iPhone 12/13', width: 390, height: 844 },
  { name: 'desktop', width: 1100, height: 900 },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`  ok  ${m}`);

for (const vp of VIEWPORTS) {
  console.log(`\n${vp.name} (${vp.width}px):`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'he-IL' });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tabbar');

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
  await ctx.close();
}

await browser.close();
console.log(failed ? '\nMOBILE FAILED' : '\nMOBILE PASSED');
process.exitCode = failed ? 1 : 0;
