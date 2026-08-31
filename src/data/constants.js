// Closed vocabularies. The AI layer validates against these exact lists,
// so widening them here is the only place a new unit or category can enter.

export const UNITS = ['גרם', 'מ"ל', "יח'"];

export const CATEGORIES = [
  'יבשים',
  'שימורים',
  'ירקות ופירות',
  'קירור',
  'לחם ומאפים',
  'תבלינים ורטבים',
  'אחר',
];

export const CHILLED = 'קירור';

// Recipe marks. Emoji are deliberately absent from the whole UI; a recipe
// without a photo falls back to one of these line icons.
export const ICON_KEYS = [
  'pasta', 'rice', 'soup', 'grill', 'bread',
  'egg', 'wrap', 'noodles', 'salad', 'stew', 'other',
];

// Old JSON backups stored an emoji in `icon`. Map them on import so a
// backup taken before this version still loads.
export const EMOJI_TO_ICON_KEY = {
  '🍝': 'pasta', '🍜': 'noodles', '🍚': 'rice', '🍛': 'stew', '🌮': 'wrap',
  '🌯': 'wrap', '🥙': 'wrap', '🍲': 'soup', '🥘': 'stew', '🌭': 'grill',
  '🍖': 'grill', '🥩': 'grill', '🍳': 'egg', '🥚': 'egg', '🍞': 'bread',
  '🥖': 'bread', '🥗': 'salad', '🫓': 'bread', '🥔': 'other', '🧆': 'other',
};

export const MEAL_KEYS = ['lunch', 'dinner'];
export const MEAL_LABELS = { lunch: 'צהריים', dinner: 'ערב' };

export const HE_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

// Water is not optional in the desert: 4 litres per person per day.
export const DEFAULT_PANTRY = [
  { n: 'מים', q: 4000, u: 'מ"ל', c: 'אחר', perDay: true },
  { n: 'שמן קנולה', q: 15, u: 'מ"ל', c: 'תבלינים ורטבים', perDay: true },
  { n: 'מלח גס', q: 5, u: 'גרם', c: 'תבלינים ורטבים', perDay: true },
  { n: 'פלפל שחור גרוס', q: 1, u: 'גרם', c: 'תבלינים ורטבים', perDay: true },
  { n: 'פפריקה מתוקה', q: 1, u: 'גרם', c: 'תבלינים ורטבים', perDay: true },
  { n: 'כמון', q: 1, u: 'גרם', c: 'תבלינים ורטבים', perDay: true },
];

// Breakfast is self-serve; these are per person per day and feed the shopping list.
export const DEFAULT_BREAKFAST = [
  { n: 'לחם פרוס', q: 80, u: 'גרם', c: 'לחם ומאפים' },
  { n: 'ביצים', q: 1, u: "יח'", c: 'קירור' },
  { n: 'גבינה לבנה', q: 50, u: 'גרם', c: 'קירור' },
  { n: 'חמאת בוטנים', q: 15, u: 'גרם', c: 'יבשים' },
  { n: 'ריבה', q: 15, u: 'גרם', c: 'יבשים' },
  { n: 'קפה נמס', q: 4, u: 'גרם', c: 'יבשים' },
  { n: 'חלב', q: 100, u: 'מ"ל', c: 'קירור' },
  { n: 'דגני בוקר', q: 30, u: 'גרם', c: 'יבשים' },
  { n: 'בננה', q: 1, u: "יח'", c: 'ירקות ופירות' },
];
