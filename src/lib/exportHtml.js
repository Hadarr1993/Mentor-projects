import { formatQty, dayList, mealIngredients, mealPeople, shoppingList, groupByCategory, mealId, sortedTasks } from './calc.js';
import { CATEGORIES, MEAL_KEYS, MEAL_LABELS } from '../data/constants.js';
import { iconSvg } from './exportIcons.js';

/** Escape everything that comes from the user. Recipe names and shift
 *  names end up inside markup, and a stray < would break the document. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const esc = escapeHtml;

/* The exported file gets its own stylesheet: it is opened standalone, with
   no bundler, no network and often straight into a printer. */
const STYLES = `
:root{--cream:#FBF0E4;--surface:#FFFAF3;--fire:#E0521B;--gold:#F2A65A;
--plum:#6B3B6E;--ink:#3A2317;--ink2:#6B5344;--ink3:#9A8574;--edge:#E7D6C2}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);
font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Hebrew",Arial,sans-serif;
font-size:15px;line-height:1.55}
.wrap{max-width:860px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:30px;line-height:1.1;letter-spacing:-.022em;margin:0 0 4px}
h2{font-size:20px;line-height:1.2;letter-spacing:-.015em;margin:0 0 10px}
h3{font-size:16px;margin:0 0 6px}
.sub{color:var(--ink2);font-size:14px;margin-bottom:22px}
.hero{background:linear-gradient(160deg,#6B3B6E,#D96A8A 55%,#F2A65A);
color:#fff;border-radius:20px;padding:26px 24px;margin-bottom:26px}
.hero h1{color:#fff}.hero .sub{color:rgba(255,255,255,.88);margin:0}
.card{background:var(--surface);border-radius:16px;padding:18px 20px;margin-bottom:16px;
box-shadow:0 2px 10px rgba(58,35,23,.07)}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:start;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
color:var(--ink3);padding:0 8px 6px;font-weight:700}
td{padding:6px 8px;border-top:1px solid var(--edge)}
.qty{text-align:end;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.grid{width:100%;border-collapse:collapse;font-size:13px}
.grid th,.grid td{border:1px solid var(--edge);padding:8px 10px;vertical-align:top}
.grid th{background:#F3E3D0;color:var(--ink2)}
.tag{display:inline-flex;align-items:center;gap:4px;background:#F3E3D0;color:var(--ink2);
border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600}
.ic{vertical-align:-.15em}
.row{display:flex;align-items:center;gap:8px}
.spread{display:flex;align-items:center;justify-content:space-between;gap:12px}
.steps{white-space:pre-wrap;line-height:1.65;color:var(--ink2);margin:0}
.photo{width:100%;max-height:230px;object-fit:cover;border-radius:12px;margin-bottom:12px}
.muted{color:var(--ink2)}.tiny{font-size:12px;color:var(--ink3)}
.chk{display:flex;align-items:center;gap:9px;padding:5px 0;cursor:pointer}
.chk input{width:17px;height:17px;accent-color:var(--fire);flex:none}
.chk.done span{text-decoration:line-through;color:var(--ink3)}
.btn{border:0;border-radius:999px;background:var(--fire);color:#fff;padding:9px 18px;
font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.btn.ghost{background:#F3E3D0;color:var(--ink)}
.bar{position:sticky;top:0;background:var(--cream);padding:12px 0;margin-bottom:14px;
display:flex;gap:8px;z-index:9;box-shadow:0 8px 12px -8px rgba(58,35,23,.18)}
.page{page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
@media print{
 body{background:#fff}.bar,.noprint{display:none!important}
 .wrap{max-width:none;padding:0}
 .card{box-shadow:none;border:1px solid #ddd;break-inside:avoid}
 .hero{background:#6B3B6E!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
}`;

/** Checkbox state lives in the exported file's own localStorage. That is
 *  allowed and correct here: the file is standalone and has nothing else. */
const CHECKBOX_SCRIPT = `
(function(){
  var KEY='camp-paradise-export-'+(document.body.dataset.docid||'doc');
  var saved={};
  try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(e){}}
  document.querySelectorAll('input[type=checkbox][data-k]').forEach(function(cb){
    var k=cb.dataset.k;
    cb.checked=!!saved[k];
    cb.closest('.chk').classList.toggle('done',cb.checked);
    cb.addEventListener('change',function(){
      saved[k]=cb.checked;persist();
      cb.closest('.chk').classList.toggle('done',cb.checked);
    });
  });
  document.querySelectorAll('[data-print]').forEach(function(b){
    b.addEventListener('click',function(){window.print()});
  });
})();`;

function shell({ title, docId, body }) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLES}</style>
</head>
<body data-docid="${esc(docId)}">
<div class="wrap">
${body}
</div>
<script>${CHECKBOX_SCRIPT}</script>
</body>
</html>`;
}

const rangeLabel = (days) =>
  days.length ? `${days[0].label} – ${days[days.length - 1].label}` : '';

/* ------------------------------------------------------- full document */

export function buildFullDocument(state) {
  const days = dayList(state.settings.startDate, state.settings.days);
  const rows = shoppingList(state, days);
  const groups = groupByCategory(rows, CATEGORIES);

  const body = [
    `<div class="hero">
      <h1>המטבח של קאמפ פרדייז</h1>
      <div class="sub">${esc(rangeLabel(days))} · ${esc(state.settings.people)} סועדים · רזרבה ${esc(state.settings.reservePct)}%</div>
    </div>`,
    `<div class="bar noprint">
      <button class="btn" data-print>הדפס / שמור כ-PDF</button>
    </div>`,
    scheduleTable(state, days),
    `<h2 style="margin:26px 0 12px">דפי מתכון</h2>`,
    ...days.flatMap((day) =>
      MEAL_KEYS
        .map((mk) => recipeCard(state, day, mk))
        .filter(Boolean),
    ),
    shoppingSection(groups, state, rows),
    tasksSection(state),
  ].join('\n');

  return shell({ title: 'המטבח של קאמפ פרדייז', docId: 'full', body });
}

function scheduleTable(state, days) {
  const cell = (day, mk) => {
    const meal = state.meals[mealId(day.key, mk)];
    const recipe = meal && state.recipes[meal.recipeId];
    if (!recipe || recipe._deleted) return '<td class="tiny">—</td>';
    const sides = (meal.sides || [])
      .map((id) => state.sides[id]?.name)
      .filter(Boolean);
    return `<td>
      <b>${esc(recipe.name)}</b>
      ${sides.length ? `<div class="tiny">${esc(sides.join(' · '))}</div>` : ''}
      ${meal.tornim ? `<div class="tiny">תורנים: ${esc(meal.tornim)}</div>` : ''}
    </td>`;
  };

  return `<div class="card">
    <h2>לוח זמנים שבועי</h2>
    <table class="grid">
      <thead><tr>
        <th>יום</th>
        <th>${iconSvg('lunch', 14)} צהריים</th>
        <th>${iconSvg('dinner', 14)} ערב</th>
      </tr></thead>
      <tbody>
        ${days.map((d) => `<tr>
          <th style="white-space:nowrap">${esc(d.weekday)}<div class="tiny">${esc(d.short)}</div></th>
          ${cell(d, 'lunch')}
          ${cell(d, 'dinner')}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function recipeCard(state, day, mealKey, { standalone = false } = {}) {
  const meal = state.meals[mealId(day.key, mealKey)];
  const recipe = meal && state.recipes[meal.recipeId];
  if (!recipe || recipe._deleted) return '';

  const diners = mealPeople(meal, state.settings);
  const rows = mealIngredients(meal, state);
  const sides = (meal.sides || []).map((id) => state.sides[id]).filter((s) => s && !s._deleted);

  return `<div class="card${standalone ? ' page' : ''}">
    <div class="spread" style="margin-bottom:10px">
      <div>
        <div class="tag">${iconSvg(mealKey, 13)} ${esc(day.weekday)} · ${esc(MEAL_LABELS[mealKey])}</div>
        <h2 style="margin-top:8px">${esc(recipe.name)}</h2>
      </div>
      <div class="tag">${esc(diners)} סועדים</div>
    </div>

    ${recipe.img ? `<img class="photo" src="${esc(recipe.img)}" alt="">` : ''}

    ${meal.tornim ? `<p class="muted"><b>תורנים:</b> ${esc(meal.tornim)}</p>` : ''}
    ${sides.length ? `<p class="muted"><b>תוספות:</b> ${esc(sides.map((s) => s.name).join(' · '))}</p>` : ''}

    ${recipe.steps ? `<h3>הוראות הכנה</h3><p class="steps">${esc(recipe.steps)}</p>` : ''}
    ${sides.filter((s) => s.steps).map((s) => `
      <h3 style="margin-top:14px">${esc(s.name)}</h3>
      <p class="steps">${esc(s.steps)}</p>`).join('')}

    <h3 style="margin-top:16px">מצרכים</h3>
    <table>
      <thead><tr><th>מצרך</th><th>לאדם</th><th class="qty">סה"כ ל-${esc(diners)}</th></tr></thead>
      <tbody>
        ${rows.map((r) => {
          const perPerson = r.q / Math.max(1, diners) / (1 + state.settings.reservePct / 100);
          return `<tr>
            <td>${iconSvg(`cat-${r.c}`, 14)} ${esc(r.n)}</td>
            <td class="tiny">${esc(formatQty(perPerson, r.u))}</td>
            <td class="qty">${esc(formatQty(r.q, r.u))}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function shoppingSection(groups, state, rows) {
  const totalPriced = rows.reduce(
    (s, r) => s + (Number(state.shopping?.items?.[r.key]?.price) || 0), 0);
  return `<h2 style="margin:26px 0 12px">רשימת קניות</h2>
  <div class="card">
    <div class="spread" style="margin-bottom:12px">
      <span class="tag">${iconSvg('list', 13)} ${rows.length} פריטים</span>
      ${totalPriced > 0 ? `<span class="tag">≈ ${Math.round(totalPriced)} ₪</span>` : ''}
    </div>
    ${groups.map((g) => `
      <h3 style="margin:16px 0 6px">${iconSvg(`cat-${g.category}`, 15)} ${esc(g.category)}</h3>
      ${g.items.map((r) => `
        <label class="chk">
          <input type="checkbox" data-k="${esc(r.key)}">
          <span>${esc(r.n)} — <b>${esc(formatQty(r.q, r.u))}</b></span>
        </label>`).join('')}
    `).join('')}
  </div>`;
}

function tasksSection(state) {
  const tasks = sortedTasks(state.tasks);
  if (!tasks.length) return '';
  const done = tasks.filter((t) => t.done).length;

  return `<h2 style="margin:26px 0 12px">משימות צוות</h2>
  <div class="card">
    <div class="spread" style="margin-bottom:12px">
      <span class="tag">${iconSvg('list', 13)} ${done}/${tasks.length} נסגרו</span>
    </div>
    ${tasks.map((t) => `
      <label class="chk${t.done ? ' done' : ''}">
        <input type="checkbox" data-k="task-${esc(t.id)}"${t.done ? ' checked' : ''}>
        <span>${esc(t.text)}${
          t.owner ? ` <span class="tiny">· ${esc(t.owner)}</span>` : ''
        }${
          t.done && t.doneBy ? ` <span class="tiny">· נסגר על ידי ${esc(t.doneBy)}</span>` : ''
        }</span>
      </label>`).join('')}
  </div>`;
}

/* ------------------------------------------------- cut-out recipe pages */

/** One meal per printed page, for pinning up in the kitchen. */
export function buildCutOutPages(state) {
  const days = dayList(state.settings.startDate, state.settings.days);
  const pages = days.flatMap((day) =>
    MEAL_KEYS
      .map((mk) => recipeCard(state, day, mk, { standalone: true }))
      .filter(Boolean),
  );

  const body = `
    <div class="bar noprint">
      <button class="btn" data-print>הדפס הכל</button>
      <span class="tiny" style="align-self:center">כל ארוחה בעמוד נפרד</span>
    </div>
    ${pages.length ? pages.join('\n') : '<div class="card"><p class="muted">אין ארוחות משובצות.</p></div>'}`;

  return shell({ title: 'דפי מתכון לגזייה — קאמפ פרדייז', docId: 'cutout', body });
}

/** A single meal, for the per-meal PDF button in the week view. */
export function buildSingleMealPage(state, dayKey, mealKey) {
  const days = dayList(state.settings.startDate, state.settings.days);
  const day = days.find((d) => d.key === dayKey);
  if (!day) return null;
  const card = recipeCard(state, day, mealKey);
  if (!card) return null;

  const body = `
    <div class="bar noprint"><button class="btn" data-print>הדפס / שמור כ-PDF</button></div>
    ${card}`;
  return shell({
    title: `${day.weekday} ${MEAL_LABELS[mealKey]} — קאמפ פרדייז`,
    docId: `${dayKey}-${mealKey}`,
    body,
  });
}

/* -------------------------------------------------------------- output */

export function downloadFile(filename, content, type = 'text/html;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open a document in a new tab and hand it straight to the print dialog. */
export function printDocument(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.addEventListener('load', () => setTimeout(() => w.print(), 250));
  return true;
}
