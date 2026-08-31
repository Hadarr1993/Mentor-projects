#!/usr/bin/env node
/** Builds the export documents and opens them in a browser with all network
 *  blocked — the condition they will actually be opened in. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { makeDefaults } from '../src/state/schema.js';
import { buildFullDocument, buildCutOutPages, buildSingleMealPage } from '../src/lib/exportHtml.js';
import { dayList, assignTornim } from '../src/lib/calc.js';

const SCRATCH = '/tmp/claude-0/-home-user-Mentor-projects/d352fa57-50fb-5ebf-b111-4be071049ebf/scratchpad';

// A realistic plan: every day filled, sides, crew, prices.
const state = makeDefaults();
state.settings.members = ['הדר', 'שי', 'נועה', 'איתי', 'רוני'].map((n, i) => ({ id: `m${i}`, name: n }));
const days = dayList(state.settings.startDate, state.settings.days);
const recipeIds = Object.keys(state.recipes);
const sideIds = Object.keys(state.sides);
days.forEach((d, i) => {
  state.meals[`${d.key}-lunch`] = {
    recipeId: recipeIds[i % recipeIds.length], sides: [sideIds[i % sideIds.length]], tornim: '', _ts: 1,
  };
  state.meals[`${d.key}-dinner`] = {
    recipeId: recipeIds[(i + 3) % recipeIds.length],
    sides: [sideIds[(i + 2) % sideIds.length], sideIds[(i + 4) % sideIds.length]],
    people: i === 2 ? 35 : null, tornim: '', _ts: 1,
  };
});
for (const [id, names] of Object.entries(assignTornim(state, days))) {
  state.meals[id].tornim = names;
}
// A name containing markup, to prove escaping holds.
state.recipes.evil = {
  id: 'evil', name: '<script>alert("xss")</script> & "מרכאות"', iconKey: 'soup',
  steps: 'שלב <b>אחד</b>', ings: [{ n: 'עגבניות & בצל', q: 1, u: "יח'", c: 'ירקות ופירות' }], _ts: 1,
};
state.meals['d0-lunch'].recipeId = 'evil';

const docs = {
  full: buildFullDocument(state),
  cutout: buildCutOutPages(state),
  single: buildSingleMealPage(state, 'd1', 'dinner'),
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };

for (const [name, html] of Object.entries(docs)) {
  if (!html) { fail(`${name}: produced nothing`); continue; }
  const path = `${SCRATCH}/export-${name}.html`;
  writeFileSync(path, html);

  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, locale: 'he-IL' });
  // Airplane mode: nothing may load from the network.
  const blocked = [];
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blocked.push(url);
    return route.abort();
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`file://${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const stats = await page.evaluate(() => ({
    text: document.body.innerText.length,
    checkboxes: document.querySelectorAll('input[type=checkbox]').length,
    svgs: document.querySelectorAll('svg.ic').length,
    pages: document.querySelectorAll('.page').length,
    escaped: document.body.innerHTML.includes('&lt;script&gt;'),
    rawScript: /<script>alert/.test(document.body.innerHTML),
  }));

  console.log(`\n${name}: ${Math.round(html.length / 1024)} KB, ${stats.text} chars of text, ` +
              `${stats.svgs} icons, ${stats.checkboxes} checkboxes, ${stats.pages} print pages`);
  if (blocked.length) fail(`${name}: tried to load ${blocked.length} external resources: ${blocked.slice(0, 3)}`);
  else console.log(`  ok  loaded with zero network requests`);
  if (errors.length) fail(`${name}: console errors: ${errors.slice(0, 3).join(' | ')}`);
  else console.log(`  ok  no console errors`);
  if (stats.text < 300) fail(`${name}: suspiciously little text`);
  if (stats.rawScript) fail(`${name}: UNESCAPED SCRIPT TAG in output`);
  else console.log(`  ok  user content is escaped`);

  if (name === 'full') {
    // Checkbox persistence lives in the exported file's own localStorage.
    await page.locator('input[type=checkbox]').first().check();
    await page.waitForTimeout(150);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(300);
    const stillChecked = await page.locator('input[type=checkbox]').first().isChecked();
    if (!stillChecked) fail('full: checkbox state did not survive a reload');
    else console.log('  ok  checkbox state survived a reload');
    await page.screenshot({ path: `${SCRATCH}/export-full.png`, fullPage: false });
  }
  if (name === 'cutout' && stats.pages < 10) fail(`cutout: expected one page per meal, got ${stats.pages}`);

  await ctx.close();
}

await browser.close();
console.log(failed ? '\nEXPORT TEST FAILED' : '\nEXPORT TEST PASSED');
process.exitCode = failed ? 1 : 0;
