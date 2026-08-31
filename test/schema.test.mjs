import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, makeDefaults, deepMergeDefaults, SCHEMA_VERSION } from '../src/state/schema.js';
import { mergeState, pruneTombstones } from '../src/state/sync.js';

test('defaults carry 8 recipes and 8 sides', () => {
  const d = makeDefaults();
  assert.equal(Object.keys(d.recipes).length, 8);
  assert.equal(Object.keys(d.sides).length, 8);
  assert.equal(d.settings.people, 50);
  assert.equal(d.settings.reservePct, 12);
});

test('THE MIGRATION GUARANTEE: a new default field appears without touching user data', () => {
  // Simulate a document saved by an older build: user edits present,
  // and a field that a future version will add is absent.
  const stored = {
    schemaVersion: 1,
    campCode: 'PRDS-USERCODE1',
    settings: { people: 33, reservePct: 20, members: [{ id: 'a', name: 'הדר' }] },
    recipes: { mine: { id: 'mine', name: 'המנה שלי', iconKey: 'pasta', steps: 'ערבב', ings: [], _ts: 5 } },
    meals: { 'd0-lunch': { recipeId: 'mine', tornim: 'הדר', sides: [], _ts: 5 } },
  };
  const out = hydrate(stored);

  // User data survived, exactly.
  assert.equal(out.settings.people, 33);
  assert.equal(out.settings.reservePct, 20);
  assert.equal(out.settings.members[0].name, 'הדר');
  assert.equal(out.campCode, 'PRDS-USERCODE1');
  assert.equal(out.recipes.mine.name, 'המנה שלי');
  assert.equal(out.meals['d0-lunch'].tornim, 'הדר');

  // Fields the stored doc never had are filled from defaults.
  assert.equal(out.settings.startDate, '2026-11-02');
  assert.equal(out.settings.tornimPerMeal, 2);
  assert.ok(out.breakfast.ings.length > 0);
  assert.ok(out.pantry.ings.some((i) => i.n === 'מים'));
  assert.deepEqual(out.shopping.prices, {});
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
});

test('an unversioned pre-release document is upgraded, not discarded', () => {
  const out = hydrate({ settings: { people: 12 }, recipes: {} });
  assert.equal(out.settings.people, 12);
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
});

test('an old backup with emoji icons is converted to iconKey', () => {
  const out = hydrate({
    schemaVersion: 1,
    recipes: { r: { id: 'r', name: 'פסטה', icon: '🍝', steps: '', ings: [], _ts: 1 } },
  });
  assert.equal(out.recipes.r.iconKey, 'pasta');
  assert.equal(out.recipes.r.icon, undefined);
});

test('an unknown emoji falls back to "other" rather than breaking', () => {
  const out = hydrate({ schemaVersion: 1, recipes: { r: { id: 'r', name: 'x', icon: '🛸', ings: [] } } });
  assert.equal(out.recipes.r.iconKey, 'other');
});

test('ingredients with illegal units or categories are dropped, not kept invalid', () => {
  const out = hydrate({
    schemaVersion: 1,
    recipes: { r: { id: 'r', name: 'x', iconKey: 'other', ings: [
      { n: 'טוב', q: 1, u: 'גרם', c: 'יבשים' },
      { n: 'רע', q: 1, u: 'כפית', c: 'יבשים' },
      { n: 'גם רע', q: 1, u: 'גרם', c: 'קטגוריה מומצאת' },
    ] } },
  });
  assert.equal(out.recipes.r.ings.length, 1);
  assert.equal(out.recipes.r.ings[0].n, 'טוב');
});

test('deepMergeDefaults never replaces a present value with a default', () => {
  const merged = deepMergeDefaults({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 99 } });
  assert.equal(merged.a, 1);
  assert.equal(merged.b.c, 99);
  assert.equal(merged.b.d, 3);
});

test('arrays are taken whole from stored data, not merged element-wise', () => {
  const merged = deepMergeDefaults({ xs: [1, 2, 3] }, { xs: [9] });
  assert.deepEqual(merged.xs, [9]);
});

test('sync merge keeps the newest version of each entity, per entity', () => {
  const mine   = { recipes: { a: { name: 'שלי חדש', _ts: 200 }, b: { name: 'שלי ישן', _ts: 50 } }, sides: {}, meals: {} };
  const theirs = { recipes: { a: { name: 'שלהם ישן', _ts: 100 }, b: { name: 'שלהם חדש', _ts: 150 },
                              c: { name: 'רק אצלם', _ts: 10 } }, sides: {}, meals: {} };
  const out = mergeState(mine, theirs);
  assert.equal(out.recipes.a.name, 'שלי חדש');    // mine is newer
  assert.equal(out.recipes.b.name, 'שלהם חדש');   // theirs is newer
  assert.equal(out.recipes.c.name, 'רק אצלם');    // theirs only — not lost
});

test('a delete tombstone is not resurrected by a stale peer', () => {
  const mine   = { recipes: { a: { _deleted: true, _ts: 300 } }, sides: {}, meals: {} };
  const theirs = { recipes: { a: { name: 'הוחזר לחיים', _ts: 100 } }, sides: {}, meals: {} };
  assert.equal(mergeState(mine, theirs).recipes.a._deleted, true);
});

test('old tombstones are pruned, fresh ones are kept', () => {
  const old = Date.now() - 1000 * 60 * 60 * 24 * 90;
  const s = pruneTombstones({ recipes: { a: { _deleted: true, _ts: old }, b: { _deleted: true, _ts: Date.now() } } });
  assert.equal(s.recipes.a, undefined);
  assert.ok(s.recipes.b);
});
