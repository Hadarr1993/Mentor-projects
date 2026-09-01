import test from 'node:test';
import assert from 'node:assert/strict';
import { unpublished } from '../src/state/useKitchen.js';

/**
 * The repair for recipes that never reached the camp.
 *
 * For a while `saveNow` wrote recipes and sides locally and never queued
 * them, so devices are carrying work the server has never seen. This finds
 * that backlog and publishes it once.
 *
 * It is the one place that pushes based on what a device holds rather than
 * what a person just did, so it has to be provably add-only. The whole reason
 * the sync was rewritten was that a document merge let one device's stale
 * copy flatten another's real work; these tests exist so this cannot become
 * that by accident.
 */

const doc = (recipes = {}, sides = {}) => ({ recipes, sides });
const r = (id, name) => ({ id, name, _ts: 1 });

test('nothing to do when the camp already has everything', () => {
  const mine = doc({ a: r('a', 'תבשיל') });
  assert.equal(unpublished(mine, doc({ a: r('a', 'תבשיל') })), null);
});

test('nothing to do for an empty device', () => {
  assert.equal(unpublished(doc(), doc({ a: r('a', 'x') })), null);
});

test('a recipe the camp has never seen is published', () => {
  const mine = doc({ mine: r('mine', 'הקדרה שלי') });
  const transform = unpublished(mine, doc());
  assert.ok(transform, 'expected a transform');
  const out = transform(doc());
  assert.equal(out.recipes.mine.name, 'הקדרה שלי');
});

test('sides are published too', () => {
  const transform = unpublished(doc({}, { s: r('s', 'סלט') }), doc());
  assert.equal(transform(doc()).sides.s.name, 'סלט');
});

test("the server's version of an id always wins", () => {
  // The device is stale — it must not push its copy over the camp's.
  const mine = doc({ a: { ...r('a', 'הישן שלי'), _ts: 999 } });
  const theirs = doc({ a: r('a', 'מה שהצוות ערך') });
  assert.equal(unpublished(mine, theirs), null);
});

test('a tombstoned recipe is never resurrected', () => {
  // Someone deleted it; this device never saw that. Pushing it back would
  // undo a deliberate deletion, which is exactly the old merge bug.
  const mine = doc({ gone: r('gone', 'נמחק') });
  const theirs = doc({ gone: { id: 'gone', _deleted: true, _ts: 5 } });
  assert.equal(unpublished(mine, theirs), null);
});

test('a local tombstone is not published as if it were content', () => {
  const mine = doc({ gone: { id: 'gone', _deleted: true, _ts: 5 } });
  assert.equal(unpublished(mine, doc()), null);
});

test('the transform only fills gaps in the document it is replayed against', () => {
  // A conflict replays this against a newer server document. Anything that
  // arrived in the meantime has to survive.
  const transform = unpublished(doc({ mine: r('mine', 'שלי') }), doc());
  const newer = doc({
    mine: r('mine', 'מישהו כבר פרסם את זה'),
    theirs: r('theirs', 'ובנוסף זה'),
  });
  const out = transform(newer);
  assert.equal(out.recipes.mine.name, 'מישהו כבר פרסם את זה', 'must not clobber');
  assert.equal(out.recipes.theirs.name, 'ובנוסף זה', 'must not drop');
});

test('replaying against an empty camp still works', () => {
  const transform = unpublished(doc({ a: r('a', 'x') }), doc());
  assert.equal(transform(null).recipes.a.name, 'x');
  assert.equal(transform(undefined).recipes.a.name, 'x');
});

test('only recipes and sides are touched', () => {
  const mine = { ...doc({ a: r('a', 'x') }), tasks: { t: { id: 't' } } };
  const out = unpublished(mine, doc())({ tasks: {} });
  assert.deepEqual(out.tasks, {}, 'tasks sync through their own edits');
});
