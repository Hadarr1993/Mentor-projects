import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The palette, checked against WCAG AA.
 *
 * The primary button once put white text on a fire→gold gradient, which ended
 * at 2.02:1 — unreadable, on the one control every screen depends on. Nothing
 * caught it because contrast lived only in someone's eye. It lives here now:
 * change a colour below the threshold and this fails before it ships.
 *
 * Tokens are read out of the real stylesheet rather than copied, so a palette
 * edit is measured, not shadowed by a stale duplicate.
 */

const CSS = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function token(name) {
  const m = CSS.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,8})`));
  assert.ok(m, `token --${name} not found in styles.css`);
  return m[1];
}

const rgb = (hex) => {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

/** Relative luminance, per WCAG 2.1. */
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// Sanity: the formula itself, against the two values everyone knows.
test('the contrast formula is right', () => {
  assert.equal(Math.round(ratio('#000000', '#FFFFFF')), 21);
  assert.equal(ratio('#FFFFFF', '#FFFFFF'), 1);
});

const AA = 4.5;

/**
 * Only pairs that actually meet on screen. A colour is not required to pass
 * against a background it never sits on — the gold, for instance, is a glow
 * and a border, and carries no text.
 */
const PAIRS = [
  // The primary button's gradient, at both ends. This is the one that broke.
  ['white on the primary button, start', '#FFFFFF', token('fire-btn-a')],
  ['white on the primary button, end', '#FFFFFF', token('fire-btn-b')],

  // Body and secondary text on both grounds they appear on.
  ['ink on the page', token('ink'), token('cream')],
  ['ink on a card', token('ink'), token('surface')],
  ['ink-2 on the page', token('ink-2'), token('cream')],
  ['ink-2 on a card', token('ink-2'), token('surface')],

  // Hints and small labels — smallest type, so the least forgiving.
  ['ink-3 on the page', token('ink-3'), token('cream')],
  ['ink-3 on a card', token('ink-3'), token('surface')],

  // Quiet and secondary buttons sit on the cream fill, not the page.
  ['ink on a secondary button', token('ink'), token('cream-2')],
  ['ink-2 on the cream fill', token('ink-2'), token('cream-2')],

  // Status colours, on the grounds they are actually drawn on.
  ['danger text on its own tint', token('danger'), token('danger-bg')],
  ['danger text on a card', token('danger'), token('surface')],
  ['success text on a card', token('ok'), token('surface')],
  ['fire-deep link text on a card', token('fire-deep'), token('surface')],
  ['fire-deep link text on the page', token('fire-deep'), token('cream')],
];

for (const [what, fg, bg] of PAIRS) {
  test(`${what} meets AA`, () => {
    const r = ratio(fg, bg);
    assert.ok(
      r >= AA,
      `${what}: ${fg} on ${bg} is ${r.toFixed(2)}:1, below the ${AA}:1 minimum`,
    );
  });
}
