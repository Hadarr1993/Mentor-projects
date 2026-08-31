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
  const t = shoppingTotals(rows, { prices: { [rows[0].key]: 30, [rows[1].key]: 20 }, bought: { [rows[0].key]: true } }, 50);
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
