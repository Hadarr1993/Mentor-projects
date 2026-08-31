import { HE_WEEKDAYS, HE_MONTHS, MEAL_KEYS, CHILLED } from '../data/constants.js';

/** Stable identity for an ingredient line. Name + unit, nothing else —
 *  so the same rice from three recipes collapses into one row, and a saved
 *  price survives a recipe being edited or deleted. */
export const ingKey = (n, u) => `${String(n).trim()}|${u}`;

/** Quantity for one ingredient across N diners, including the reserve buffer. */
export function scaleIngredient(ing, diners, reservePct) {
  const per = Number(ing.q) || 0;
  const n = Number(diners) || 0;
  const reserve = 1 + (Number(reservePct) || 0) / 100;
  return per * n * reserve;
}

/** Collapse repeated ingredients into one line per name+unit. */
export function mergeIngredients(entries) {
  const out = new Map();
  for (const e of entries) {
    if (!e || !e.n) continue;
    const key = ingKey(e.n, e.u);
    const prev = out.get(key);
    if (prev) {
      prev.q += Number(e.q) || 0;
      // Keep the first non-"אחר" category we see; sources may disagree.
      if (prev.c === 'אחר' && e.c && e.c !== 'אחר') prev.c = e.c;
      if (e.from) prev.from.add(e.from);
    } else {
      out.set(key, {
        key,
        n: String(e.n).trim(),
        u: e.u,
        c: e.c || 'אחר',
        q: Number(e.q) || 0,
        from: new Set(e.from ? [e.from] : []),
      });
    }
  }
  return [...out.values()].map((r) => ({ ...r, from: [...r.from] }));
}

/** Display form. Grams and millilitres roll up at 1000; counts always round up. */
export function formatQty(q, u) {
  const v = Number(q) || 0;
  if (u === "יח'") return `${Math.ceil(v)} יח'`;
  if (u === 'גרם') {
    if (v >= 1000) return `${trim(v / 1000)} ק"ג`;
    return `${trim(v)} גרם`;
  }
  if (u === 'מ"ל') {
    if (v >= 1000) return `${trim(v / 1000)} ליטר`;
    return `${trim(v)} מ"ל`;
  }
  return `${trim(v)} ${u}`;
}

function trim(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/* ---------------------------------------------------------------- days */

/** The 6 festival days, derived from the start date rather than hardcoded,
 *  so changing the dates in settings just works. */
export function dayList(startDate, days) {
  const out = [];
  const base = parseISO(startDate);
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + i);
    out.push({
      key: `d${i}`,
      index: i,
      date: d,
      iso: toISO(d),
      weekday: HE_WEEKDAYS[d.getDay()],
      label: `${d.getDate()} ב${HE_MONTHS[d.getMonth()]}`,
      short: `${d.getDate()}.${d.getMonth() + 1}`,
    });
  }
  return out;
}

export function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Index of today within the festival window, or null when we're outside it. */
export function todayIndex(days) {
  const today = toISO(new Date());
  const hit = days.findIndex((d) => d.iso === today);
  return hit === -1 ? null : hit;
}

export const mealId = (dayKey, mealKey) => `${dayKey}-${mealKey}`;

/* ------------------------------------------------------------ per meal */

/** Diners for one meal: the per-meal override, else the global default. */
export function mealPeople(meal, settings) {
  const n = Number(meal?.people);
  return Number.isFinite(n) && n > 0 ? n : Number(settings.people) || 0;
}

/** Every ingredient a meal needs — main dish plus its sides, all at the
 *  same head count. Returns merged rows ready for display. */
export function mealIngredients(meal, state) {
  if (!meal) return [];
  const diners = mealPeople(meal, state.settings);
  const reserve = state.settings.reservePct;
  const rows = [];

  const recipe = state.recipes[meal.recipeId];
  if (recipe && !recipe._deleted) {
    for (const ing of recipe.ings || []) {
      rows.push({ ...ing, q: scaleIngredient(ing, diners, reserve), from: recipe.name });
    }
  }
  for (const sideId of meal.sides || []) {
    const side = state.sides[sideId];
    if (!side || side._deleted) continue;
    for (const ing of side.ings || []) {
      rows.push({ ...ing, q: scaleIngredient(ing, diners, reserve), from: side.name });
    }
  }
  return mergeIngredients(rows);
}

/** Meals that are actually planned, in chronological order. */
export function plannedMeals(state, days) {
  const out = [];
  for (const day of days) {
    for (const mk of MEAL_KEYS) {
      const id = mealId(day.key, mk);
      const meal = state.meals[id];
      if (meal && meal.recipeId && state.recipes[meal.recipeId]) {
        out.push({ id, day, mealKey: mk, meal });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------- shopping */

/** The consolidated list: every meal, every side, breakfast for the whole
 *  week, and the standing pantry. One row per name+unit. */
export function shoppingList(state, days) {
  const rows = [];
  const reserve = state.settings.reservePct;
  const people = Number(state.settings.people) || 0;
  const dayCount = days.length;

  for (const { meal } of plannedMeals(state, days)) {
    const diners = mealPeople(meal, state.settings);
    const recipe = state.recipes[meal.recipeId];
    if (recipe && !recipe._deleted) {
      for (const ing of recipe.ings || []) {
        rows.push({ ...ing, q: scaleIngredient(ing, diners, reserve), from: recipe.name });
      }
    }
    for (const sideId of meal.sides || []) {
      const side = state.sides[sideId];
      if (!side || side._deleted) continue;
      for (const ing of side.ings || []) {
        rows.push({ ...ing, q: scaleIngredient(ing, diners, reserve), from: side.name });
      }
    }
  }

  for (const ing of state.breakfast?.ings || []) {
    rows.push({
      ...ing,
      q: scaleIngredient(ing, people, reserve) * dayCount,
      from: 'ארוחת בוקר',
    });
  }

  for (const ing of state.pantry?.ings || []) {
    const mult = ing.perDay === false ? 1 : dayCount;
    rows.push({
      ...ing,
      q: scaleIngredient(ing, people, reserve) * mult,
      from: 'מזווה קבוע',
    });
  }

  return mergeIngredients(rows).sort((a, b) => a.n.localeCompare(b.n, 'he'));
}

/** Group the shopping list by category, preserving the canonical order. */
export function groupByCategory(rows, categories) {
  const map = new Map(categories.map((c) => [c, []]));
  for (const r of rows) {
    if (!map.has(r.c)) map.set(r.c, []);
    map.get(r.c).push(r);
  }
  return [...map.entries()]
    .filter(([, items]) => items.length)
    .map(([category, items]) => ({ category, items }));
}

export function shoppingTotals(rows, shopping, people) {
  let total = 0;
  let priced = 0;
  let bought = 0;
  for (const r of rows) {
    const price = Number(shopping?.prices?.[r.key]);
    if (Number.isFinite(price) && price > 0) {
      total += price;
      priced++;
    }
    if (shopping?.bought?.[r.key]) bought++;
  }
  return {
    total,
    priced,
    bought,
    count: rows.length,
    perPerson: people > 0 ? total / people : 0,
    progress: rows.length ? bought / rows.length : 0,
  };
}

/* ------------------------------------------------------------------ ice */

/** Chilled load per day. One 4kg bag of ice holds roughly 12kg of chilled
 *  goods for a day in the desert; that ratio is the estimate, not a promise. */
export const ICE_BAG_COVERS_GRAMS = 12000;

export function icePlan(state, days) {
  return days.map((day) => {
    const meals = [];
    let chilledGrams = 0;

    for (const mk of MEAL_KEYS) {
      const meal = state.meals[mealId(day.key, mk)];
      if (!meal || !meal.recipeId) continue;
      const recipe = state.recipes[meal.recipeId];
      if (!recipe || recipe._deleted) continue;

      const rows = mealIngredients(meal, state).filter((r) => r.c === CHILLED);
      if (!rows.length) continue;

      const grams = rows.reduce((s, r) => s + toGrams(r), 0);
      chilledGrams += grams;
      meals.push({ mealKey: mk, name: recipe.name, rows, grams });
    }

    return {
      day,
      meals,
      chilledGrams,
      bags: Math.ceil(chilledGrams / ICE_BAG_COVERS_GRAMS),
    };
  });
}

/** Rough mass for ice sizing. Millilitres ~ grams; a countable item is
 *  estimated at 60g (an egg), which is close enough for bag counting. */
function toGrams(r) {
  if (r.u === 'גרם') return r.q;
  if (r.u === 'מ"ל') return r.q;
  return r.q * 60;
}

/** Chilled dishes are safest early: warn when one is planned late. */
export function iceWarnings(plan) {
  return plan
    .filter((d) => d.chilledGrams > 0 && d.day.index >= 2)
    .map((d) => ({
      day: d.day,
      grams: d.chilledGrams,
      dishes: d.meals.map((m) => m.name),
    }));
}

/* ---------------------------------------------------------------- tornim */

/** Fair round-robin over every planned meal. Starts where the rotation
 *  left off each meal so nobody lands on two shifts before others get one. */
export function assignTornim(state, days) {
  const members = (state.settings.members || []).filter((m) => m.name?.trim());
  const perMeal = Math.max(1, Number(state.settings.tornimPerMeal) || 2);
  const meals = plannedMeals(state, days);
  if (!members.length || !meals.length) return {};

  const out = {};
  let cursor = 0;
  for (const { id } of meals) {
    const picked = [];
    for (let i = 0; i < perMeal && i < members.length; i++) {
      picked.push(members[cursor % members.length].name.trim());
      cursor++;
    }
    out[id] = picked.join(', ');
  }
  return out;
}
