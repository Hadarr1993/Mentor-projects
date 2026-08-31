import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleIngredient, mergeIngredients, formatQty, dayList, todayIndex,
  shoppingList, mealIngredients, assignTornim, icePlan, shoppingTotals, ingKey,
} from '../src/lib/calc.js';
import { makeDefaults } from '../src/state/schema.js';

test('scaling applies head count and reserve', () => {
  assert.equal(Math.round(scaleIngredient({ q: 120 }, 50, 12)), 6720);
  assert.equal(scaleIngredient({ q: 100 }, 10, 0), 1000);
});

test('display units roll up and counts round up', () => {
  assert.equal(formatQty(1200, 'גרם'), '1.2 ק"ג');
  assert.equal(formatQty(999, 'גרם'), '999 גרם');
  assert.equal(formatQty(1000, 'גרם'), '1 ק"ג');
  assert.equal(formatQty(2500, 'מ"ל'), '2.5 ליטר');
  assert.equal(formatQty(3.2, "יח'"), "4 יח'");
  assert.equal(formatQty(4.0, "יח'"), "4 יח'");
});

test('counts landing on a whole number are not inflated by float noise', () => {
  // 1 x 50 x 1.12 is 56.00000000000001 in IEEE754. A naive ceil orders 57.
  assert.equal(formatQty(1 * 50 * 1.12, "יח'"), "56 יח'");
  assert.equal(formatQty(2 * 50 * 1.12, "יח'"), "112 יח'");
  // Genuine fractions must still round up.
  assert.equal(formatQty(56.3, "יח'"), "57 יח'");
  assert.equal(formatQty(0.1, "יח'"), "1 יח'");
});

test('identical ingredients from many sources collapse to one row', () => {
  const rows = mergeIngredients([
    { n: 'אורז', u: 'גרם', q: 100, c: 'יבשים', from: 'מוג׳דרה' },
    { n: 'אורז', u: 'גרם', q: 250, c: 'יבשים', from: 'צ׳ילי' },
    { n: 'אורז', u: 'גרם', q: 50, c: 'יבשים', from: 'אורז לבן' },
    { n: 'בצל', u: "יח'", q: 2, c: 'ירקות ופירות' },
  ]);
  assert.equal(rows.length, 2);
  const rice = rows.find((r) => r.n === 'אורז');
  assert.equal(rice.q, 400);
  assert.equal(rice.from.length, 3);
});

test('the same name in a different unit stays a separate row', () => {
  const rows = mergeIngredients([
    { n: 'חלב', u: 'מ"ל', q: 100, c: 'קירור' },
    { n: 'חלב', u: 'גרם', q: 100, c: 'קירור' },
  ]);
  assert.equal(rows.length, 2);
});

test('the festival week is derived from the start date', () => {
  const days = dayList('2026-11-02', 6);
  assert.equal(days.length, 6);
  assert.equal(days[0].weekday, 'שני');
  assert.equal(days[0].label, '2 בנובמבר');
  assert.equal(days[5].short, '7.11');
  assert.equal(todayIndex(days), null); // we are not in the window
});

test('a per-meal head count overrides the global default', () => {
  const s = makeDefaults();
  s.meals['d0-lunch'] = { recipeId: 'bolognese', people: 10, sides: [], _ts: 1 };
  const rows = mealIngredients(s.meals['d0-lunch'], s);
  const pasta = rows.find((r) => r.n === 'פסטה יבשה');
  assert.equal(Math.round(pasta.q), Math.round(120 * 10 * 1.12));
});

test('sides are counted at the same head count as the main dish', () => {
  const s = makeDefaults();
  s.meals['d0-lunch'] = { recipeId: 'chili', people: 20, sides: ['whiterice'], _ts: 1 };
  const rows = mealIngredients(s.meals['d0-lunch'], s);
  const rice = rows.find((r) => r.n === 'אורז');
  assert.equal(Math.round(rice.q), Math.round(70 * 20 * 1.12));
});

test('shopping list includes breakfast for every day and water for everyone', () => {
  const s = makeDefaults();
  const days = dayList(s.settings.startDate, s.settings.days);
  const rows = shoppingList(s, days);
  const water = rows.find((r) => r.n === 'מים');
  // 4L per person per day, 50 people, 6 days, +12%
  assert.equal(Math.round(water.q), Math.round(4000 * 50 * 1.12 * 6));
  const eggs = rows.find((r) => r.n === 'ביצים');
  assert.ok(eggs.q > 0, 'breakfast eggs reach the shopping list');
});

test('rice from a recipe and a side becomes a single shopping row', () => {
  const s = makeDefaults();
  s.meals['d0-lunch'] = { recipeId: 'mujadara', sides: ['whiterice'], _ts: 1 };
  s.meals['d1-dinner'] = { recipeId: 'chili', sides: ['whiterice'], _ts: 1 };
  const days = dayList(s.settings.startDate, s.settings.days);
  const rice = shoppingList(s, days).filter((r) => r.n === 'אורז');
  assert.equal(rice.length, 1);
  assert.equal(rice[0].from.length, 2); // מוג׳דרה + אורז לבן
});

test('shopping totals track spend, per-person cost and progress', () => {
  const rows = [
    { key: ingKey('אורז', 'גרם'), n: 'אורז', u: 'גרם', q: 1000, c: 'יבשים' },
    { key: ingKey('בצל', "יח'"), n: 'בצל', u: "יח'", q: 10, c: 'ירקות ופירות' },
  ];
  const t = shoppingTotals(rows, {
    items: {
      [rows[0].key]: { price: 30, bought: true, _ts: 1 },
      [rows[1].key]: { price: 20, _ts: 1 },
    },
  }, 50);
  assert.equal(t.total, 50);
  assert.equal(t.perPerson, 1);
  assert.equal(t.progress, 0.5);
});

test('auto-assign spreads shifts fairly across the crew', () => {
  const s = makeDefaults();
  s.settings.members = ['א', 'ב', 'ג', 'ד', 'ה'].map((n, i) => ({ id: String(i), name: n }));
  const days = dayList(s.settings.startDate, s.settings.days);
  for (const d of days) {
    s.meals[`${d.key}-lunch`] = { recipeId: 'chili', sides: [], _ts: 1 };
    s.meals[`${d.key}-dinner`] = { recipeId: 'chili', sides: [], _ts: 1 };
  }
  const assigned = assignTornim(s, days);
  assert.equal(Object.keys(assigned).length, 12);

  const counts = {};
  for (const names of Object.values(assigned)) {
    for (const n of names.split(', ')) counts[n] = (counts[n] || 0) + 1;
  }
  // 12 meals x 2 shifts = 24 slots across 5 people: nobody more than one
  // shift ahead of anybody else.
  const vals = Object.values(counts);
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, `uneven: ${JSON.stringify(counts)}`);
});

test('ice plan finds chilled dishes and sizes the bags', () => {
  const s = makeDefaults();
  s.meals['d0-lunch'] = { recipeId: 'shakshuka', sides: [], _ts: 1 }; // eggs = chilled
  const days = dayList(s.settings.startDate, s.settings.days);
  const plan = icePlan(s, days);
  assert.ok(plan[0].chilledGrams > 0);
  assert.ok(plan[0].bags >= 1);
  assert.equal(plan[0].meals[0].name, 'שקשוקה עם פיתות');
  assert.equal(plan[1].chilledGrams, 0);
});

/* ── free-form shopping items ──────────────────────────────────────── */

test('a fixed item is NOT multiplied by head count', async () => {
  const { extraQuantity } = await import('../src/lib/calc.js');
  // The whole point: two rolls of foil are two rolls, not 2 x 50 x 1.12.
  assert.equal(extraQuantity({ q: 2, scale: 'fixed' }, 50, 6, 12), 2);
  // A missing scale defaults to fixed rather than silently scaling.
  assert.equal(extraQuantity({ q: 3 }, 50, 6, 12), 3);
});

test('a per-person item scales by head count and reserve', async () => {
  const { extraQuantity } = await import('../src/lib/calc.js');
  assert.equal(Math.round(extraQuantity({ q: 2, scale: 'person' }, 50, 6, 12)), 112);
});

test('a per-person-per-day item also scales by days', async () => {
  const { extraQuantity } = await import('../src/lib/calc.js');
  assert.equal(Math.round(extraQuantity({ q: 2, scale: 'personDay' }, 50, 6, 12)), 672);
});

test('free items reach the shopping list with a flat quantity', async () => {
  const s = makeDefaults();
  s.extras.items = [
    { id: 'x1', n: 'גליל אלומיניום', q: 2, u: "יח'", c: 'אחר', scale: 'fixed' },
    { id: 'x2', n: 'שקיות אשפה', q: 1, u: "יח'", c: 'אחר', scale: 'fixed' },
  ];
  const days = dayList(s.settings.startDate, s.settings.days);
  const rows = shoppingList(s, days);
  const foil = rows.find((r) => r.n === 'גליל אלומיניום');
  assert.equal(foil.q, 2, 'must stay 2, not become 112');
  assert.deepEqual(foil.from, ['נוסף ידנית']);
  assert.ok(rows.find((r) => r.n === 'שקיות אשפה'));
});

test('a free item merges with a recipe ingredient of the same name and unit', async () => {
  const s = makeDefaults();
  s.meals['d0-lunch'] = { recipeId: 'mujadara', sides: [], _ts: 1 }; // uses אורז
  s.extras.items = [{ id: 'x1', n: 'אורז', q: 500, u: 'גרם', c: 'יבשים', scale: 'fixed' }];
  const days = dayList(s.settings.startDate, s.settings.days);
  const rice = shoppingList(s, days).filter((r) => r.n === 'אורז');

  assert.equal(rice.length, 1, 'should be one consolidated row');
  // 80g/person x 50 x 1.12 = 4480, plus the flat 500.
  assert.equal(Math.round(rice[0].q), Math.round(80 * 50 * 1.12) + 500);
  assert.ok(rice[0].from.includes('נוסף ידנית'));
});

test('an existing document gains extras without losing anything', async () => {
  const { hydrate } = await import('../src/state/schema.js');
  const before = {
    schemaVersion: 1,
    campCode: 'PRDS-KEEPTHIS1',
    settings: { people: 42, reservePct: 8 },
    recipes: { mine: { id: 'mine', name: 'שלי', iconKey: 'pasta', steps: '', ings: [], _ts: 9 } },
    shopping: { prices: { 'אורז|גרם': 25 }, bought: { 'אורז|גרם': true }, _ts: 9 },
  };
  const after = hydrate(before);

  assert.deepEqual(after.extras.items, [], 'extras appears, empty');
  assert.equal(after.settings.people, 42);
  assert.equal(after.campCode, 'PRDS-KEEPTHIS1');
  assert.equal(after.recipes.mine.name, 'שלי');
  // v2 folded the flat maps into per-item records; the values must survive.
  assert.equal(after.shopping.items['אורז|גרם'].price, 25);
  assert.equal(after.shopping.items['אורז|גרם'].bought, true);
});

test('an extra with an invalid scale is dropped on load, not kept broken', async () => {
  const { hydrate } = await import('../src/state/schema.js');
  const out = hydrate({
    schemaVersion: 1,
    extras: { items: [
      { id: 'ok', n: 'תקין', q: 1, u: "יח'", c: 'אחר', scale: 'fixed' },
      { id: 'bad', n: 'רע', q: 1, u: "יח'", c: 'אחר', scale: 'מומצא' },
    ], _ts: 1 },
  });
  assert.equal(out.extras.items.length, 1);
  assert.equal(out.extras.items[0].n, 'תקין');
});

/* ── task ordering ─────────────────────────────────────────────────── */

test('open tasks sit above closed ones, newest close at the very bottom', async () => {
  const { sortedTasks } = await import('../src/lib/calc.js');
  const order = sortedTasks({
    a: { id: 'a', text: 'ראשונה', createdAt: 100, done: false },
    b: { id: 'b', text: 'נסגרה מזמן', createdAt: 200, done: true, doneAt: 500 },
    c: { id: 'c', text: 'שנייה', createdAt: 300, done: false },
    d: { id: 'd', text: 'נסגרה עכשיו', createdAt: 50, done: true, doneAt: 900 },
  }).map((t) => t.text);

  assert.deepEqual(order, ['ראשונה', 'שנייה', 'נסגרה מזמן', 'נסגרה עכשיו']);
});

test('deleted tasks are excluded from the list and the count', async () => {
  const { sortedTasks, taskProgress } = await import('../src/lib/calc.js');
  const tasks = {
    a: { id: 'a', text: 'חיה', createdAt: 1, done: false },
    z: { id: 'z', _deleted: true, _ts: 2 },
  };
  assert.equal(sortedTasks(tasks).length, 1);
  assert.equal(taskProgress(tasks).count, 1);
});

test('task progress counts what is closed', async () => {
  const { taskProgress } = await import('../src/lib/calc.js');
  const p = taskProgress({
    a: { id: 'a', done: true, doneAt: 1 },
    b: { id: 'b', done: false },
    c: { id: 'c', done: false },
  });
  assert.equal(p.done, 1);
  assert.equal(p.open, 2);
  assert.equal(p.count, 3);
  assert.ok(Math.abs(p.ratio - 1 / 3) < 1e-9);
});

test('an empty or missing task bag is handled', async () => {
  const { sortedTasks, taskProgress } = await import('../src/lib/calc.js');
  assert.deepEqual(sortedTasks(undefined), []);
  assert.equal(taskProgress(undefined).ratio, 0);
});
