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
  assert.deepEqual(out.shopping.items, {}, 'shopping arrives in the v2 per-item shape');
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

/* ── v1 -> v2: shopping becomes per-item ───────────────────────────── */

test('MIGRATION v1->v2: prices and ticks survive the reshape', async () => {
  // This runs against real user data on the next deploy, so it is checked
  // against a document shaped exactly like one already in the wild.
  const live = {
    schemaVersion: 1,
    campCode: 'PRDS-LIVEDATA01',
    settings: { people: 40, reservePct: 12, members: [{ id: 'a', name: 'הדר' }] },
    recipes: { r: { id: 'r', name: 'שלי', iconKey: 'pasta', steps: 'x', ings: [], _ts: 5 } },
    shopping: {
      prices: { 'אורז|גרם': 25, "בצל|יח'": 8, 'מלח|גרם': 3 },
      bought: { 'אורז|גרם': true, 'מלח|גרם': false },
      _ts: 1700000000000,
    },
  };
  const out = hydrate(live);

  assert.equal(out.schemaVersion, 2);
  assert.equal(out.shopping.items['אורז|גרם'].price, 25);
  assert.equal(out.shopping.items['אורז|גרם'].bought, true);
  assert.equal(out.shopping.items["בצל|יח'"].price, 8);
  assert.equal(out.shopping.items['מלח|גרם'].price, 3);
  // A false tick carries no flag; absence is the same as unticked.
  assert.ok(!out.shopping.items['מלח|גרם'].bought);
  // Every record must be stamped, or it can never win a merge.
  for (const item of Object.values(out.shopping.items)) {
    assert.equal(typeof item._ts, 'number');
  }
  // The legacy maps must not linger and shadow the new shape.
  assert.equal(out.shopping.prices, undefined);
  assert.equal(out.shopping.bought, undefined);
  // Everything else is untouched.
  assert.equal(out.settings.people, 40);
  assert.equal(out.settings.members[0].name, 'הדר');
  assert.equal(out.campCode, 'PRDS-LIVEDATA01');
  assert.equal(out.recipes.r.name, 'שלי');
});

test('migrating twice is idempotent', async () => {
  const once = hydrate({ schemaVersion: 1, shopping: { prices: { 'a|גרם': 5 }, bought: { 'a|גרם': true }, _ts: 1 } });
  const twice = hydrate(once);
  assert.deepEqual(twice.shopping.items, once.shopping.items);
  assert.equal(twice.schemaVersion, 2);
});

test('a v2 document is left alone', async () => {
  const out = hydrate({
    schemaVersion: 2,
    shopping: { items: { 'x|גרם': { price: 9, bought: true, _ts: 77 } }, _ts: 77 },
  });
  assert.equal(out.shopping.items['x|גרם'].price, 9);
  assert.equal(out.shopping.items['x|גרם']._ts, 77);
});

test('THE FIX: two people ticking different items both keep their work', async () => {
  // The failure this replaces: shopping merged as one object, so whoever
  // saved last replaced the other's entire tick list.
  const mine = {
    recipes: {}, sides: {}, meals: {},
    shopping: { items: {
      'אורז|גרם': { bought: true, _ts: 200 },
      'בצל|גרם': { bought: false, _ts: 100 },
    }, _ts: 200 },
  };
  const theirs = {
    recipes: {}, sides: {}, meals: {},
    shopping: { items: {
      'אורז|גרם': { bought: false, _ts: 100 },
      'בצל|גרם': { bought: true, _ts: 300 },
      'מלח|גרם': { bought: true, price: 4, _ts: 150 },
    }, _ts: 300 },
  };
  const out = mergeState(mine, theirs);

  assert.equal(out.shopping.items['אורז|גרם'].bought, true, 'my newer tick survives');
  assert.equal(out.shopping.items['בצל|גרם'].bought, true, 'their newer tick survives');
  assert.equal(out.shopping.items['מלח|גרם'].price, 4, 'an item only they have is kept');
});

test('a price set by one person is not lost when the other ticks something', async () => {
  const shopper = { recipes: {}, sides: {}, meals: {},
    shopping: { items: { 'אורז|גרם': { bought: true, _ts: 500 } }, _ts: 500 } };
  const pricer = { recipes: {}, sides: {}, meals: {},
    shopping: { items: { 'בצל|גרם': { price: 12, _ts: 400 } }, _ts: 400 } };
  const out = mergeState(shopper, pricer);
  assert.equal(out.shopping.items['אורז|גרם'].bought, true);
  assert.equal(out.shopping.items['בצל|גרם'].price, 12);
});
