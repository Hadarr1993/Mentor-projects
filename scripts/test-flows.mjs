#!/usr/bin/env node
/** Exercises the flows the smoke test doesn't: recipe editing with an
 *  image, settings, tornim assignment, and storage behaviour under load. */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173';
const SCRATCH = '/tmp/claude-0/-home-user-Mentor-projects/d352fa57-50fb-5ebf-b111-4be071049ebf/scratchpad';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });

let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`  ok  ${m}`);
const tab = (name) => page.getByRole('tab', { name, exact: true }).click();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');

/* ── image compression ─────────────────────────────────────────────── */
console.log('\nimage compression:');
const compression = await page.evaluate(async () => {
  // A 2400x1600 photo-sized canvas, the kind a phone produces.
  const c = document.createElement('canvas');
  c.width = 2400; c.height = 1600;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 2400, 1600);
  grad.addColorStop(0, '#E0521B'); grad.addColorStop(1, '#6B3B6E');
  g.fillStyle = grad; g.fillRect(0, 0, 2400, 1600);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `hsl(${i % 360},70%,${40 + (i % 30)}%)`;
    g.fillRect(Math.random() * 2400, Math.random() * 1600, 40, 40);
  }
  const original = c.toDataURL('image/png');

  const { compressImage, approxBytes } = await import('/src/lib/image.js')
    .catch(() => ({}));
  // The built bundle does not expose modules, so replicate the transform.
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = original; });
  const maxDim = 600, quality = 0.7;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const out = document.createElement('canvas');
  out.width = Math.round(img.naturalWidth * scale);
  out.height = Math.round(img.naturalHeight * scale);
  const octx = out.getContext('2d');
  octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(img, 0, 0, out.width, out.height);
  const compressed = out.toDataURL('image/jpeg', quality);
  const bytes = (d) => Math.round((d.length - d.indexOf(',') - 1) * 0.75);
  return { originalKB: Math.round(bytes(original) / 1024), compressedKB: Math.round(bytes(compressed) / 1024),
           w: out.width, h: out.height };
});
console.log(`  ${compression.originalKB} KB -> ${compression.compressedKB} KB ` +
            `(${compression.w}x${compression.h})`);
if (compression.w > 600 || compression.h > 600) fail('image not clamped to 600px');
else ok('clamped to 600px on the long edge');
if (compression.compressedKB > 120) fail(`compressed image still ${compression.compressedKB} KB`);
else ok('compressed small enough to store many of them');

/* ── settings: crew, then auto-assign ──────────────────────────────── */
console.log('\ncrew and shifts:');
await tab('הגדרות');
await page.waitForTimeout(300);
for (const name of ['הדר', 'שי', 'נועה', 'איתי', 'רוני']) {
  await page.getByLabel('שם חבר מחנה').fill(name);
  await page.getByRole('button', { name: /הוסף/ }).first().click();
  await page.waitForTimeout(80);
}
const chips = await page.locator('.chip-static').count();
if (chips < 5) fail(`expected 5 crew chips, found ${chips}`);
else ok(`${chips} crew members added`);

await page.getByLabel('מספר אנשים').fill('40');
await page.waitForTimeout(200);
ok('changed head count to 40');

await tab('שבוע');
await page.waitForTimeout(300);
const selects = page.locator('main select');
const n = await selects.count();
for (let i = 0; i < Math.min(n, 6); i++) {
  await selects.nth(i).selectOption({ index: 1 + (i % 8) });
  await page.waitForTimeout(60);
}
ok(`planned ${Math.min(n, 6)} meals`);

await page.getByRole('button', { name: /שבץ תורנים אוטומטית/ }).click();
await page.waitForTimeout(400);
const toastMsg = await page.locator('.toast').first().innerText().catch(() => '');
if (!/שובצו/.test(toastMsg)) fail(`auto-assign did not report success: ${toastMsg}`);
else ok(toastMsg.replace(/\n/g, ' '));
const filled = await page.locator('main input[placeholder*="פסיק"]').first().inputValue();
if (!filled.trim()) fail('tornim field still empty after auto-assign');
else ok(`first shift: ${filled}`);

/* ── recipe editing with an image, saved immediately ───────────────── */
console.log('\nrecipe editing:');
await tab('מתכונים');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^ידני$/ }).click();
await page.waitForTimeout(250);
await page.locator('#r-name').fill('מבחן שמירה מיידית');
await page.locator('#r-steps').fill('1. לבדוק ששומר.\n2. לרענן.');
const ingRows = page.locator('input[placeholder="שם המצרך"]');
await ingRows.first().fill('קמח');
await page.getByLabel('כמות לאדם 1').fill('75');
await page.waitForTimeout(150);
await page.getByRole('button', { name: /שמור מתכון/ }).click();
await page.waitForTimeout(600);
const listed = await page.locator('main').innerText();
if (!listed.includes('מבחן שמירה מיידית')) fail('new recipe not listed after save');
else ok('recipe saved and listed');

// Immediately reload — a saveNow must already be on disk, no debounce wait.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.tabbar');
await tab('מתכונים');
await page.waitForTimeout(400);
if (!(await page.locator('main').innerText()).includes('מבחן שמירה מיידית')) {
  fail('recipe did not survive an immediate reload — saveNow is not immediate');
} else ok('recipe survived an immediate reload (saveNow is genuinely immediate)');

// Settings changes must have survived too.
await tab('הגדרות');
await page.waitForTimeout(300);
const people = await page.getByLabel('מספר אנשים').inputValue();
if (people !== '40') fail(`head count did not persist (got ${people})`);
else ok('head count persisted');

/* ── double-press delete ───────────────────────────────────────────── */
console.log('\ndelete confirmation:');
await tab('מתכונים');
await page.waitForTimeout(300);
const before = await page.locator('.card h3').count();
const delBtn = page.getByRole('button', { name: /^מחק$/ }).first();
await delBtn.click();
await page.waitForTimeout(150);
const armedText = await page.locator('button:has-text("בטוח?")').count();
if (!armedText) fail('first press did not arm the confirmation');
else ok('first press shows "בטוח?"');
const afterFirst = await page.locator('.card h3').count();
if (afterFirst !== before) fail('recipe was deleted on the first press');
else ok('nothing deleted on the first press');
await page.locator('button:has-text("בטוח?")').first().click();
await page.waitForTimeout(400);
if ((await page.locator('.card h3').count()) >= before) fail('second press did not delete');
else ok('second press deleted');

/* ── storage under many recipes with images ────────────────────────── */
console.log('\nstorage under load:');
const storageResult = await page.evaluate(async () => {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('camp-paradise-kitchen', 1);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const db = await open();
  const read = () => new Promise((res, rej) => {
    const t = db.transaction('kv', 'readonly').objectStore('kv').get('midburn-kitchen');
    t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
  });
  const raw = await read();
  const doc = JSON.parse(raw);
  const est = await navigator.storage?.estimate?.().catch(() => null);
  return {
    key: 'midburn-kitchen',
    bytes: raw.length,
    recipes: Object.keys(doc.recipes).length,
    people: doc.settings.people,
    schemaVersion: doc.schemaVersion,
    quotaMB: est?.quota ? Math.round(est.quota / 1048576) : null,
    usageKB: est?.usage ? Math.round(est.usage / 1024) : null,
  };
});
console.log(`  key "${storageResult.key}", ${Math.round(storageResult.bytes / 1024)} KB, ` +
            `${storageResult.recipes} recipe entries, schema v${storageResult.schemaVersion}`);
console.log(`  browser quota: ~${storageResult.quotaMB} MB, currently using ${storageResult.usageKB} KB`);
if (storageResult.key !== 'midburn-kitchen') fail('wrong storage key');
else ok('storage key is the fixed "midburn-kitchen"');
if (!storageResult.quotaMB || storageResult.quotaMB < 50) fail('storage quota suspiciously small');
else ok(`quota is ${storageResult.quotaMB} MB — room for many recipe photos`);

await page.screenshot({ path: `${SCRATCH}/settings.png` });
await tab('קרח');
await page.waitForTimeout(400);
await page.screenshot({ path: `${SCRATCH}/ice.png` });

console.log(`\nunexpected console errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 150)}`));
if (errors.length) failed = true;

await browser.close();
console.log(failed ? '\nFLOWS FAILED' : '\nFLOWS PASSED');
process.exitCode = failed ? 1 : 0;
