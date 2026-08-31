#!/usr/bin/env node
/**
 * The real test: write a v1 document into IndexedDB exactly as the shipped
 * version would have, then load the new build on top of it and confirm the
 * user's prices and ticks are still there.
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });

let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`  ok  ${m}`);

// Land on the origin so IndexedDB is available, but seed before the app reads.
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

console.log('\nseeding a v1 document (the shape already on real devices):');
const seeded = await page.evaluate(async () => {
  const v1 = {
    schemaVersion: 1,
    campCode: 'PRDS-OLDDEVICE1',
    settings: {
      people: 37, reservePct: 15, budget: 3000, startDate: '2026-11-02', days: 6,
      tornimPerMeal: 2, members: [{ id: 'm1', name: 'הדר' }, { id: 'm2', name: 'שי' }],
      shared: false, _ts: 1700000000000,
    },
    recipes: {
      old: { id: 'old', name: 'המתכון הישן שלי', iconKey: 'stew',
             steps: '1. לבשל.', ings: [{ n: 'עדשים', q: 60, u: 'גרם', c: 'יבשים' }], _ts: 1700000000000 },
    },
    sides: {},
    meals: { 'd0-lunch': { recipeId: 'old', tornim: 'הדר, שי', sides: [], _ts: 1700000000000 } },
    breakfast: { ings: [{ n: 'לחם פרוס', q: 80, u: 'גרם', c: 'לחם ומאפים' }], _ts: 1700000000000 },
    pantry: { ings: [{ n: 'מים', q: 4000, u: 'מ"ל', c: 'אחר', perDay: true }], _ts: 1700000000000 },
    // The old flat shape — this is what must survive.
    shopping: {
      prices: { 'עדשים|גרם': 42, 'לחם פרוס|גרם': 18 },
      bought: { 'עדשים|גרם': true },
      _ts: 1700000000000,
    },
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
    tx.objectStore('kv').put(JSON.stringify(v1), 'midburn-kitchen');
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return { people: v1.settings.people, prices: v1.shopping.prices };
});
ok(`seeded v1: ${seeded.people} people, prices ${JSON.stringify(seeded.prices)}`);

console.log('\nloading the new build on top of it:');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');
await page.waitForTimeout(900);

const stored = await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const r = indexedDB.open('camp-paradise-kitchen', 1);
    r.onsuccess = () => res(r.result);
  });
  const raw = await new Promise((res) => {
    const t = db.transaction('kv', 'readonly').objectStore('kv').get('midburn-kitchen');
    t.onsuccess = () => res(t.result);
  });
  return JSON.parse(raw);
});

if (stored.schemaVersion !== 2) fail(`expected schemaVersion 2, got ${stored.schemaVersion}`);
else ok('document upgraded to schemaVersion 2');

const items = stored.shopping.items || {};
if (items['עדשים|גרם']?.price !== 42) fail(`price lost: ${JSON.stringify(items['עדשים|גרם'])}`);
else ok('price 42 carried into the per-item record');
if (items['עדשים|גרם']?.bought !== true) fail('tick lost in migration');
else ok('tick carried into the per-item record');
if (items['לחם פרוס|גרם']?.price !== 18) fail('second price lost');
else ok('second price carried over');
if (stored.shopping.prices || stored.shopping.bought) fail('legacy maps still present');
else ok('legacy maps removed');

if (stored.settings.people !== 37) fail(`people changed: ${stored.settings.people}`);
else ok('settings preserved (37 people, 15% reserve)');
if (stored.recipes.old?.name !== 'המתכון הישן שלי') fail('recipe lost');
else ok('user recipe preserved');
if (stored.meals['d0-lunch']?.tornim !== 'הדר, שי') fail('meal assignment lost');
else ok('meal and shift assignment preserved');
if (stored.campCode !== 'PRDS-OLDDEVICE1') fail('camp code changed — would orphan the cloud doc');
else ok('camp code unchanged');

console.log('\nthe UI reflects the migrated data:');
await page.getByRole('tab', { name: 'קניות', exact: true }).click();
await page.waitForTimeout(500);
// The price lives in an <input value=...>, which is not part of innerText.
const lentilRow = page.locator('.check', { hasText: 'עדשים' }).first()
  .locator('xpath=..');
const priceField = lentilRow.locator('input[type=number]').first();
const shownPrice = await priceField.inputValue();
if (shownPrice !== '42') fail(`migrated price not shown in the field (got "${shownPrice}")`);
else ok('migrated price shows in the price field');
const lentils = await page.locator('.check', { hasText: 'עדשים' }).first();
if (!(await lentils.locator('input').isChecked())) fail('migrated tick not shown as checked');
else ok('migrated tick shows as checked');

console.log(`\nunexpected console errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 140)}`));
if (errors.length) failed = true;

await browser.close();
console.log(failed ? '\nMIGRATION FAILED' : '\nMIGRATION PASSED');
process.exitCode = failed ? 1 : 0;
