/**
 * המטבח של קאמפ פרדייז — בונה את הגיליון מאפס.
 *
 * הרצה אחת יוצרת את כל הלשוניות, הנוסחאות, הצבעים והתיקופים.
 * אפשר להריץ שוב בכל רגע — הסקריפט מוחק ובונה מחדש, אז מה שמילאת ביד יימחק.
 *
 * החישוב זהה בדיוק ללוגיקה של האפליקציה (src/lib/calc.js):
 *   מצרך במתכון      כמות לאדם x כמה פעמים המנה בתפריט x סועדים x (1+רזרבה)
 *   בוקר / מזווה      כמות לאדם x ימים x סועדים x (1+רזרבה)
 *   פריט נוסף         קבוע | לפי אדם | לפי אדם ליום
 */

// ── הפלטה, זהה לאפליקציה ────────────────────────────────────────────────
var C = {
  cream: '#FBF0E4', cream2: '#F6E7D6', surface: '#FFFAF3',
  fire: '#E0521B', fireDeep: '#B93F12', gold: '#F2A65A',
  plum: '#6B3B6E', rose: '#D96A8A', terracotta: '#C4643C',
  ink: '#3A2317', ink2: '#6B5344', ink3: '#7E6857',
  ok: '#2E6B4F', okBg: '#E8F0EA', danger: '#B3261E', dangerBg: '#FDECEA',
  edge: '#E4D5C3', white: '#FFFFFF'
};

var LAST = { rec: 140, sid: 90, bm: 45, ex: 30, wk: 16, sh: 200, tk: 60 };

function buildKitchenSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // מוחקים לשוניות ישנות כדי שהרצה חוזרת תהיה נקייה
  var keep = ss.insertSheet('__tmp__');
  ss.getSheets().forEach(function (s) { if (s.getName() !== '__tmp__') ss.deleteSheet(s); });

  settings(ss); recipes(ss); sides(ss); menu(ss);
  breakfastPantry(ss); extras(ss); steps(ss); shopping(ss); tasks(ss); dashboard(ss);

  ss.deleteSheet(keep);
  ss.setActiveSheet(ss.getSheetByName('דאשבורד'));
  SpreadsheetApp.getUi().alert('הגיליון מוכן. התחל מלשונית "הגדרות".');
}

// ── עזרים ────────────────────────────────────────────────────────────────
function mk(ss, name, title, subtitle, headers, widths, tabColor) {
  var sh = ss.insertSheet(name);
  sh.setRightToLeft(true);
  sh.setTabColor(tabColor);
  sh.getRange('A1').setValue(title)
    .setFontSize(16).setFontWeight('bold').setFontColor(C.ink);
  sh.getRange('A2').setValue(subtitle).setFontSize(10).setFontColor(C.ink3);
  sh.setRowHeight(1, 28); sh.setRowHeight(3, 6);
  var hr = sh.getRange(4, 1, 1, headers.length);
  hr.setValues([headers]).setBackground(C.fireDeep).setFontColor(C.white)
    .setFontWeight('bold').setHorizontalAlignment('center')
    .setVerticalAlignment('middle').setBorder(true, true, true, true, true, true, C.edge, SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(4, 26);
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(4);
  if (sh.getMaxColumns() > headers.length) {
    sh.deleteColumns(headers.length + 1, sh.getMaxColumns() - headers.length);
  }
  return sh;
}

function grid(sh, first, last, ncols) {
  var r = sh.getRange(first, 1, last - first + 1, ncols);
  r.setBorder(true, true, true, true, true, true, C.edge, SpreadsheetApp.BorderStyle.SOLID);
  r.setFontSize(11).setFontColor(C.ink).setVerticalAlignment('middle');
  return r;
}

/** פסים מתחלפים — השיפור היחיד שהכי מקל על קריאה של טבלה ארוכה. */
function bands(sh, first, last, ncols) {
  var rng = sh.getRange(first, 1, last - first + 1, ncols);
  try { rng.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
          .setHeaderRowColor(null).setFirstRowColor(C.surface).setSecondRowColor(C.cream); } catch (e) {}
}

function dropdown(sh, a1, values, strict) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true).setAllowInvalid(!strict).build();
  sh.getRange(a1).setDataValidation(rule);
}

function dropdownRange(sh, a1, sourceRange) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sourceRange, true).setAllowInvalid(true).build();
  sh.getRange(a1).setDataValidation(rule);
}

function ruleEq(sh, a1, value, bg, fg, strike) {
  var b = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(value).setBackground(bg).setFontColor(fg)
    .setRanges([sh.getRange(a1)]);
  if (strike) b = b.setStrikethrough(true);
  var rules = sh.getConditionalFormatRules(); rules.push(b.build());
  sh.setConditionalFormatRules(rules);
}

function ruleFormula(sh, a1, formula, bg, fg, strike) {
  var b = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula).setBackground(bg).setRanges([sh.getRange(a1)]);
  if (fg) b = b.setFontColor(fg);
  if (strike) b = b.setStrikethrough(true);
  var rules = sh.getConditionalFormatRules(); rules.push(b.build());
  sh.setConditionalFormatRules(rules);
}

// ═══════════════════════════════════════════════ הגדרות
function settings(ss) {
  var sh = mk(ss, 'הגדרות', 'הגדרות המחנה',
    'כל מספר כאן מזיז את כל שאר הגיליון. זה חדר הבקרה — התחל מכאן.',
    ['מה', 'ערך', 'הסבר', '', 'צוות המטבח', 'טלפון'],
    [22 * 8, 16 * 8, 46 * 8, 30, 20 * 8, 16 * 8], C.plum);

  var rows = [
    ['מספר סועדים', 50, 'כל הכמויות במתכונים הן לאדם אחד, ומוכפלות במספר הזה.'],
    ['מספר ימים', 6, 'משפיע על ארוחות בוקר, מזווה וכמות הקרח.'],
    ['אחוז רזרבה', 0.12, 'כרית ביטחון על כל כמות. 12% = פי 1.12.'],
    ['תאריך התחלה', new Date(2026, 10, 2), 'היום הראשון של הבישול.'],
    ['תקציב יעד', 6000, '0 = בלי תקציב. מופיע בדאשבורד.'],
    ['תורנים לארוחה', 2, 'כמה אנשים משובצים לכל ארוחה.']
  ];
  sh.getRange(5, 1, rows.length, 3).setValues(rows);
  grid(sh, 5, 10, 3);
  sh.getRange('A5:A10').setFontWeight('bold');
  sh.getRange('B5:B10').setBackground(C.white).setHorizontalAlignment('center');
  sh.getRange('C5:C10').setFontSize(10).setFontColor(C.ink3);
  sh.getRange('B7').setNumberFormat('0%');
  sh.getRange('B8').setNumberFormat('dd/mm/yyyy');
  sh.getRange('B9').setNumberFormat('#,##0" ₪"');

  sh.getRange('E5').setValue('הדר');
  var crew = sh.getRange('E5:F12');
  crew.setBorder(true, true, true, true, true, true, C.edge, SpreadsheetApp.BorderStyle.SOLID);
  crew.setBackground(C.white).setFontSize(11).setFontColor(C.ink);
  sh.getRange('E14').setValue('הוסף כאן שמות — הם יופיעו כבחירה במשימות ובתורנויות.')
    .setFontSize(10).setFontColor(C.ink3);

  sh.getRange('A16').setValue('איך קוראים את הגיליון').setFontWeight('bold');
  sh.getRange('A17').setValue('לבן = ממלאים ביד').setFontSize(10).setFontColor(C.ink2);
  sh.getRange('B17').setBackground(C.white)
    .setBorder(true, true, true, true, null, null, C.edge, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange('A18').setValue("בז' = מחושב אוטומטית, לא לגעת").setFontSize(10).setFontColor(C.ink2);
  sh.getRange('B18').setBackground(C.cream2)
    .setBorder(true, true, true, true, null, null, C.edge, SpreadsheetApp.BorderStyle.SOLID);

  ss.setNamedRange('CREW', sh.getRange('E5:E12'));
  ss.setNamedRange('PEOPLE', sh.getRange('B5'));
  ss.setNamedRange('DAYS', sh.getRange('B6'));
  ss.setNamedRange('RESERVE', sh.getRange('B7'));
  ss.setNamedRange('STARTDATE', sh.getRange('B8'));
  ss.setNamedRange('BUDGET', sh.getRange('B9'));
}

// ═══════════════════════════════════════════════ מתכונים / תוספות
var UNITS = ["גרם", "מ\"ל", "יח'"];
var CATS  = ["יבשים", "שימורים", "ירקות ופירות", "קירור", "לחם ומאפים", "תבלינים ורטבים", "אחר"];
var REC_ROWS = [["פסטה בולונז צמחוני", "פסטה יבשה", 120, "גרם", "יבשים"], ["פסטה בולונז צמחוני", "עגבניות מרוסקות (קופסה)", 150, "גרם", "שימורים"], ["פסטה בולונז צמחוני", "רסק עגבניות", 20, "גרם", "שימורים"], ["פסטה בולונז צמחוני", "חלבון סויה", 40, "גרם", "יבשים"], ["פסטה בולונז צמחוני", "בצל", 0.4, "יח'", "ירקות ופירות"], ["פסטה בולונז צמחוני", "גזר", 0.3, "יח'", "ירקות ופירות"], ["פסטה בולונז צמחוני", "שום", 4, "גרם", "ירקות ופירות"], ["פסטה בולונז צמחוני", "שמן זית", 8, "מ\"ל", "תבלינים ורטבים"], ["פסטה בולונז צמחוני", "אורגנו יבש", 1, "גרם", "תבלינים ורטבים"], ["פסטה בולונז צמחוני", "מלח גס", 4, "גרם", "תבלינים ורטבים"], ["שקשוקה עם פיתות", "ביצים", 2, "יח'", "קירור"], ["שקשוקה עם פיתות", "עגבניות מרוסקות (קופסה)", 200, "גרם", "שימורים"], ["שקשוקה עם פיתות", "רסק עגבניות", 15, "גרם", "שימורים"], ["שקשוקה עם פיתות", "פלפל אדום", 0.5, "יח'", "ירקות ופירות"], ["שקשוקה עם פיתות", "בצל", 0.3, "יח'", "ירקות ופירות"], ["שקשוקה עם פיתות", "שום", 4, "גרם", "ירקות ופירות"], ["שקשוקה עם פיתות", "פיתות", 1.5, "יח'", "לחם ומאפים"], ["שקשוקה עם פיתות", "פטרוזיליה", 5, "גרם", "ירקות ופירות"], ["שקשוקה עם פיתות", "שמן זית", 10, "מ\"ל", "תבלינים ורטבים"], ["שקשוקה עם פיתות", "פפריקה מתוקה", 2, "גרם", "תבלינים ורטבים"], ["שקשוקה עם פיתות", "כמון", 1, "גרם", "תבלינים ורטבים"], ["מוג׳דרה עם סלט", "אורז", 80, "גרם", "יבשים"], ["מוג׳דרה עם סלט", "עדשים שחורות", 50, "גרם", "יבשים"], ["מוג׳דרה עם סלט", "בצל", 1, "יח'", "ירקות ופירות"], ["מוג׳דרה עם סלט", "שמן קנולה", 15, "מ\"ל", "תבלינים ורטבים"], ["מוג׳דרה עם סלט", "כמון", 2, "גרם", "תבלינים ורטבים"], ["מוג׳דרה עם סלט", "קינמון", 0.5, "גרם", "תבלינים ורטבים"], ["מוג׳דרה עם סלט", "מלח גס", 4, "גרם", "תבלינים ורטבים"], ["נקניקיות בלחמנייה", "נקניקיות", 2, "יח'", "קירור"], ["נקניקיות בלחמנייה", "לחמניות הוט דוג", 2, "יח'", "לחם ומאפים"], ["נקניקיות בלחמנייה", "בצל", 0.3, "יח'", "ירקות ופירות"], ["נקניקיות בלחמנייה", "קטשופ", 20, "גרם", "תבלינים ורטבים"], ["נקניקיות בלחמנייה", "חרדל", 10, "גרם", "תבלינים ורטבים"], ["נקניקיות בלחמנייה", "חמוצים", 25, "גרם", "שימורים"], ["קוסקוס עם ירקות", "קוסקוס", 90, "גרם", "יבשים"], ["קוסקוס עם ירקות", "גזר", 0.7, "יח'", "ירקות ופירות"], ["קוסקוס עם ירקות", "קישוא", 0.7, "יח'", "ירקות ופירות"], ["קוסקוס עם ירקות", "דלעת", 80, "גרם", "ירקות ופירות"], ["קוסקוס עם ירקות", "בצל", 0.4, "יח'", "ירקות ופירות"], ["קוסקוס עם ירקות", "חומוס משומר", 40, "גרם", "שימורים"], ["קוסקוס עם ירקות", "רסק עגבניות", 15, "גרם", "שימורים"], ["קוסקוס עם ירקות", "כורכום", 1, "גרם", "תבלינים ורטבים"], ["קוסקוס עם ירקות", "כמון", 1.5, "גרם", "תבלינים ורטבים"], ["קוסקוס עם ירקות", "שמן קנולה", 10, "מ\"ל", "תבלינים ורטבים"], ["אטריות מוקפצות", "אטריות אורז", 100, "גרם", "יבשים"], ["אטריות מוקפצות", "גזר", 0.5, "יח'", "ירקות ופירות"], ["אטריות מוקפצות", "פלפל אדום", 0.4, "יח'", "ירקות ופירות"], ["אטריות מוקפצות", "כרוב לבן", 80, "גרם", "ירקות ופירות"], ["אטריות מוקפצות", "ברוקולי", 60, "גרם", "ירקות ופירות"], ["אטריות מוקפצות", "שום", 4, "גרם", "ירקות ופירות"], ["אטריות מוקפצות", "ג'ינג'ר טרי", 4, "גרם", "ירקות ופירות"], ["אטריות מוקפצות", "רוטב סויה", 20, "מ\"ל", "תבלינים ורטבים"], ["אטריות מוקפצות", "שמן שומשום", 5, "מ\"ל", "תבלינים ורטבים"], ["צ׳ילי עם אורז", "שעועית אדומה משומרת", 120, "גרם", "שימורים"], ["צ׳ילי עם אורז", "תירס משומר", 40, "גרם", "שימורים"], ["צ׳ילי עם אורז", "עגבניות מרוסקות (קופסה)", 120, "גרם", "שימורים"], ["צ׳ילי עם אורז", "רסק עגבניות", 15, "גרם", "שימורים"], ["צ׳ילי עם אורז", "בצל", 0.4, "יח'", "ירקות ופירות"], ["צ׳ילי עם אורז", "פלפל אדום", 0.4, "יח'", "ירקות ופירות"], ["צ׳ילי עם אורז", "שום", 4, "גרם", "ירקות ופירות"], ["צ׳ילי עם אורז", "כמון", 2, "גרם", "תבלינים ורטבים"], ["צ׳ילי עם אורז", "פפריקה מתוקה", 2, "גרם", "תבלינים ורטבים"], ["צ׳ילי עם אורז", "צ׳ילי גרוס", 0.5, "גרם", "תבלינים ורטבים"], ["צ׳ילי עם אורז", "שמן קנולה", 8, "מ\"ל", "תבלינים ורטבים"], ["פחיטות (טורטיות)", "טורטיות", 2, "יח'", "לחם ומאפים"], ["פחיטות (טורטיות)", "פלפל אדום", 0.5, "יח'", "ירקות ופירות"], ["פחיטות (טורטיות)", "פלפל צהוב", 0.4, "יח'", "ירקות ופירות"], ["פחיטות (טורטיות)", "בצל סגול", 0.4, "יח'", "ירקות ופירות"], ["פחיטות (טורטיות)", "שעועית שחורה משומרת", 70, "גרם", "שימורים"], ["פחיטות (טורטיות)", "תירס משומר", 30, "גרם", "שימורים"], ["פחיטות (טורטיות)", "גבינה צהובה מגוררת", 30, "גרם", "קירור"], ["פחיטות (טורטיות)", "לימון", 0.2, "יח'", "ירקות ופירות"], ["פחיטות (טורטיות)", "פפריקה מתוקה", 2, "גרם", "תבלינים ורטבים"], ["פחיטות (טורטיות)", "כמון", 1, "גרם", "תבלינים ורטבים"], ["פחיטות (טורטיות)", "שמן קנולה", 8, "מ\"ל", "תבלינים ורטבים"]];
var SID_ROWS = [["אורז לבן", "אורז", 70, "גרם", "יבשים"], ["אורז לבן", "שמן קנולה", 5, "מ\"ל", "תבלינים ורטבים"], ["אורז לבן", "מלח גס", 3, "גרם", "תבלינים ורטבים"], ["סלט ישראלי", "עגבניות", 1, "יח'", "ירקות ופירות"], ["סלט ישראלי", "מלפפונים", 1, "יח'", "ירקות ופירות"], ["סלט ישראלי", "בצל סגול", 0.2, "יח'", "ירקות ופירות"], ["סלט ישראלי", "לימון", 0.2, "יח'", "ירקות ופירות"], ["סלט ישראלי", "שמן זית", 7, "מ\"ל", "תבלינים ורטבים"], ["סלט ישראלי", "מלח גס", 2, "גרם", "תבלינים ורטבים"], ["קוסקוס", "קוסקוס", 70, "גרם", "יבשים"], ["קוסקוס", "שמן קנולה", 6, "מ\"ל", "תבלינים ורטבים"], ["קוסקוס", "מלח גס", 2, "גרם", "תבלינים ורטבים"], ["פירה", "תפוחי אדמה", 250, "גרם", "ירקות ופירות"], ["פירה", "חמאה", 15, "גרם", "קירור"], ["פירה", "חלב", 40, "מ\"ל", "קירור"], ["פירה", "מלח גס", 3, "גרם", "תבלינים ורטבים"], ["לחם / פיתות", "פיתות", 1.5, "יח'", "לחם ומאפים"], ["צ׳יפס בתנור", "תפוחי אדמה", 220, "גרם", "ירקות ופירות"], ["צ׳יפס בתנור", "שמן קנולה", 12, "מ\"ל", "תבלינים ורטבים"], ["צ׳יפס בתנור", "פפריקה מתוקה", 1.5, "גרם", "תבלינים ורטבים"], ["צ׳יפס בתנור", "מלח גס", 3, "גרם", "תבלינים ורטבים"], ["ירקות מוקפצים", "קישוא", 0.6, "יח'", "ירקות ופירות"], ["ירקות מוקפצים", "גזר", 0.5, "יח'", "ירקות ופירות"], ["ירקות מוקפצים", "פלפל אדום", 0.4, "יח'", "ירקות ופירות"], ["ירקות מוקפצים", "בצל", 0.3, "יח'", "ירקות ופירות"], ["ירקות מוקפצים", "שום", 3, "גרם", "ירקות ופירות"], ["ירקות מוקפצים", "רוטב סויה", 10, "מ\"ל", "תבלינים ורטבים"], ["ירקות מוקפצים", "שמן קנולה", 8, "מ\"ל", "תבלינים ורטבים"], ["חומוס / טחינה", "חומוס משומר", 80, "גרם", "שימורים"], ["חומוס / טחינה", "טחינה גולמית", 25, "גרם", "יבשים"], ["חומוס / טחינה", "לימון", 0.2, "יח'", "ירקות ופירות"], ["חומוס / טחינה", "שום", 2, "גרם", "ירקות ופירות"], ["חומוס / טחינה", "שמן זית", 5, "מ\"ל", "תבלינים ורטבים"], ["חומוס / טחינה", "מלח גס", 2, "גרם", "תבלינים ורטבים"]];
var BM_ROWS  = [["ארוחת בוקר", "לחם פרוס", 80, "גרם", "לחם ומאפים", "כן"], ["ארוחת בוקר", "ביצים", 1, "יח'", "קירור", "כן"], ["ארוחת בוקר", "גבינה לבנה", 50, "גרם", "קירור", "כן"], ["ארוחת בוקר", "חמאת בוטנים", 15, "גרם", "יבשים", "כן"], ["ארוחת בוקר", "ריבה", 15, "גרם", "יבשים", "כן"], ["ארוחת בוקר", "קפה נמס", 4, "גרם", "יבשים", "כן"], ["ארוחת בוקר", "חלב", 100, "מ\"ל", "קירור", "כן"], ["ארוחת בוקר", "דגני בוקר", 30, "גרם", "יבשים", "כן"], ["ארוחת בוקר", "בננה", 1, "יח'", "ירקות ופירות", "כן"], ["מזווה קבוע", "מים", 4000, "מ\"ל", "אחר", "כן"], ["מזווה קבוע", "שמן קנולה", 15, "מ\"ל", "תבלינים ורטבים", "כן"], ["מזווה קבוע", "מלח גס", 5, "גרם", "תבלינים ורטבים", "כן"], ["מזווה קבוע", "פלפל שחור גרוס", 1, "גרם", "תבלינים ורטבים", "כן"], ["מזווה קבוע", "פפריקה מתוקה", 1, "גרם", "תבלינים ורטבים", "כן"], ["מזווה קבוע", "כמון", 1, "גרם", "תבלינים ורטבים", "כן"]];

function ingTable(ss, name, title, subtitle, data, last, tabColor) {
  var sh = mk(ss, name, title, subtitle,
    ['מנה', 'מצרך', 'כמות לאדם', 'יחידה', 'קטגוריה'],
    [210, 240, 105, 90, 145], tabColor);
  if (data.length) sh.getRange(5, 1, data.length, 5).setValues(data);
  grid(sh, 5, last, 5);
  sh.getRange(5, 1, last - 4, 5).setBackground(C.white);
  sh.getRange(5, 3, last - 4, 1).setNumberFormat('0.###').setHorizontalAlignment('center');
  sh.getRange(5, 4, last - 4, 2).setHorizontalAlignment('center');
  dropdown(sh, 'D5:D' + last, UNITS, false);
  dropdown(sh, 'E5:E' + last, CATS, false);
  bands(sh, 5, last, 5);
  return sh;
}

function recipes(ss) {
  var sh = ingTable(ss, 'מתכונים', 'מאגר המתכונים',
    'כמויות לאדם אחד. שורה לכל מצרך. מנה חדשה = פשוט להתחיל לכתוב בשורה ריקה.',
    REC_ROWS, LAST.rec, C.fireDeep);
  ss.setNamedRange('RECIPE_NAMES', sh.getRange('A5:A' + LAST.rec));
}

function sides(ss) {
  var sh = ingTable(ss, 'תוספות', 'מאגר התוספות',
    'אותו דבר, לתוספות שמלוות מנה עיקרית.', SID_ROWS, LAST.sid, C.gold);
  ss.setNamedRange('SIDE_NAMES', sh.getRange('A5:A' + LAST.sid));
}

// ═══════════════════════════════════════════════ תפריט השבוע
function menu(ss) {
  var sh = mk(ss, 'תפריט השבוע', 'תפריט השבוע',
    'בחר מנה מהרשימה הנפתחת. כל בחירה כאן מזיזה מיד את רשימת הקניות ואת התקציב.',
    ['יום', 'תאריך', 'ארוחה', 'מנה עיקרית', 'תוספת 1', 'תוספת 2', 'תוספת 3', 'תורנים'],
    [90, 110, 95, 220, 170, 170, 170, 200], C.fire);

  var vals = [];
  for (var d = 0; d < 6; d++) {
    ['צהריים', 'ערב'].forEach(function (m) {
      vals.push([
        '=TEXT(STARTDATE+' + d + ',"ddd")',
        '=STARTDATE+' + d,
        m, '', '', '', '', ''
      ]);
    });
  }
  sh.getRange(5, 1, vals.length, 8).setValues(vals);
  grid(sh, 5, LAST.wk, 8);
  sh.getRange(5, 1, 12, 3).setBackground(C.cream2).setHorizontalAlignment('center');
  sh.getRange(5, 4, 12, 5).setBackground(C.white);
  sh.getRange(5, 2, 12, 1).setNumberFormat('dd/mm');
  for (var r = 5; r <= LAST.wk; r++) sh.setRowHeight(r, 24);

  dropdownRange(sh, 'D5:D' + LAST.wk, ss.getRangeByName('RECIPE_NAMES'));
  dropdownRange(sh, 'E5:G' + LAST.wk, ss.getRangeByName('SIDE_NAMES'));
  dropdownRange(sh, 'H5:H' + LAST.wk, ss.getRangeByName('CREW'));

  // ארוחה בלי מנה עיקרית לא נכנסת לקניות — שיהיה רועש
  ruleFormula(sh, 'A5:H' + LAST.wk, '=$D5=""', C.dangerBg, null, false);
  sh.getRange(LAST.wk + 2, 1).setValue('שורה אדומה = אין מנה עיקרית, והארוחה לא נכנסת לרשימת הקניות.')
    .setFontSize(10).setFontColor(C.ink3);
}

// ═══════════════════════════════════════════════ בוקר, מזווה, נוספים
function breakfastPantry(ss) {
  var sh = mk(ss, 'בוקר ומזווה', 'ארוחת בוקר ומזווה קבוע',
    'כמות לאדם ליום. בוקר הוא שירות עצמי; מזווה זה מה שתמיד צריך להיות במטבח.',
    ['מקור', 'מצרך', 'כמות לאדם', 'יחידה', 'קטגוריה', 'כפול ימים?'],
    [140, 240, 105, 90, 145, 110], C.terracotta);
  sh.getRange(5, 1, BM_ROWS.length, 6).setValues(BM_ROWS);
  grid(sh, 5, LAST.bm, 6);
  sh.getRange(5, 1, LAST.bm - 4, 6).setBackground(C.white);
  sh.getRange(5, 3, LAST.bm - 4, 1).setNumberFormat('0.###');
  sh.getRange(5, 3, LAST.bm - 4, 2).setHorizontalAlignment('center');
  sh.getRange(5, 6, LAST.bm - 4, 1).setHorizontalAlignment('center');
  dropdown(sh, 'D5:D' + LAST.bm, UNITS, false);
  dropdown(sh, 'E5:E' + LAST.bm, CATS, false);
  dropdown(sh, 'F5:F' + LAST.bm, ['כן', 'לא'], false);
  bands(sh, 5, LAST.bm, 6);
}

var SCALES = ['כמות קבועה', 'לפי אדם', 'לפי אדם ליום'];

function extras(ss) {
  var sh = mk(ss, 'פריטים נוספים', 'פריטים נוספים',
    'מה שלא מגיע ממתכון — נייר כסף, שקיות אשפה, גז. בחר איך הכמות מתחשבנת.',
    ['פריט', 'כמות', 'יחידה', 'קטגוריה', 'איך מחשבים', 'הערה'],
    [240, 90, 90, 145, 160, 240], C.plum);
  sh.getRange(5, 1, 3, 6).setValues([
    ['שקיות אשפה גדולות', 3, "יח'", 'אחר', 'לפי אדם', 'בערך 3 לאדם לכל האירוע'],
    ['נייר כסף (גליל)', 4, "יח'", 'אחר', 'כמות קבועה', ''],
    ['כוס רב-פעמית', 1, "יח'", 'אחר', 'לפי אדם', '']
  ]);
  grid(sh, 5, LAST.ex, 6);
  sh.getRange(5, 1, LAST.ex - 4, 6).setBackground(C.white);
  sh.getRange(5, 2, LAST.ex - 4, 2).setHorizontalAlignment('center');
  dropdown(sh, 'C5:C' + LAST.ex, UNITS, false);
  dropdown(sh, 'D5:D' + LAST.ex, CATS, false);
  dropdown(sh, 'E5:E' + LAST.ex, SCALES, true);
  bands(sh, 5, LAST.ex, 6);
}

// ═══════════════════════════════════════════════ קניות
function shopping(ss) {
  var sh = mk(ss, 'קניות', 'רשימת קניות',
    'נבנית לבד מהתפריט, מהבוקר ומהמזווה — לפי הסועדים והרזרבה שבהגדרות. ' +
    'אל תערוך כמות כאן; שנה את התפריט.',
    ['קטגוריה', 'מצרך', 'יחידה', 'כמות גולמית', 'כמות לקנייה', 'נקנה',
     'מחיר ל-ק"ג / ליטר / יח\'', 'עלות'],
    [145, 250, 80, 105, 140, 75, 155, 105], C.ok);

  var R = "מתכונים!$B$5:$B$" + LAST.rec, RU = "מתכונים!$D$5:$D$" + LAST.rec,
      RQ = "מתכונים!$C$5:$C$" + LAST.rec, RN = "מתכונים!$A$5:$A$" + LAST.rec;
  var S = "תוספות!$B$5:$B$" + LAST.sid, SU = "תוספות!$D$5:$D$" + LAST.sid,
      SQ = "תוספות!$C$5:$C$" + LAST.sid, SN = "תוספות!$A$5:$A$" + LAST.sid;
  var B = "'בוקר ומזווה'!$B$5:$B$" + LAST.bm, BU = "'בוקר ומזווה'!$D$5:$D$" + LAST.bm,
      BQ = "'בוקר ומזווה'!$C$5:$C$" + LAST.bm, BD = "'בוקר ומזווה'!$F$5:$F$" + LAST.bm;
  var X = "'פריטים נוספים'!$A$5:$A$" + LAST.ex, XU = "'פריטים נוספים'!$C$5:$C$" + LAST.ex,
      XQ = "'פריטים נוספים'!$B$5:$B$" + LAST.ex, XS = "'פריטים נוספים'!$E$5:$E$" + LAST.ex;
  var MAIN = "'תפריט השבוע'!$D$5:$D$" + LAST.wk;
  var SIDES = "'תפריט השבוע'!$E$5:$G$" + LAST.wk;
  var FACTOR = 'PEOPLE*(1+RESERVE)';

  /* הרשימה בונה את עצמה: כל מצרך שקיים באחד המקורות מופיע כאן מיד.
     זה ההבדל מגיליון ידני — מתכון חדש לא דורש לזכור להוסיף שורה. */
  sh.getRange('A5').setFormula(
    '=SORT(UNIQUE(QUERY({' +
      'מתכונים!E5:E' + LAST.rec + ',מתכונים!B5:B' + LAST.rec + ',מתכונים!D5:D' + LAST.rec + ';' +
      'תוספות!E5:E' + LAST.sid + ',תוספות!B5:B' + LAST.sid + ',תוספות!D5:D' + LAST.sid + ';' +
      "'בוקר ומזווה'!E5:E" + LAST.bm + ",'בוקר ומזווה'!B5:B" + LAST.bm + ",'בוקר ומזווה'!D5:D" + LAST.bm + ';' +
      "'פריטים נוספים'!D5:D" + LAST.ex + ",'פריטים נוספים'!A5:A" + LAST.ex + ",'פריטים נוספים'!C5:C" + LAST.ex +
    '},"select Col1, Col2, Col3 where Col2 is not null",0)),1,TRUE,2,TRUE)');

  var qty = [], show = [], cost = [];
  for (var r = 5; r <= LAST.sh; r++) {
    qty.push(['=IF($B' + r + '="","",ROUND((' +
      'SUMPRODUCT((' + R + '=$B' + r + ')*(' + RU + '=$C' + r + ')*' + RQ + '*COUNTIF(' + MAIN + ',' + RN + '))' +
      '+SUMPRODUCT((' + S + '=$B' + r + ')*(' + SU + '=$C' + r + ')*' + SQ + '*COUNTIF(' + SIDES + ',' + SN + '))' +
      '+SUMPRODUCT((' + B + '=$B' + r + ')*(' + BU + '=$C' + r + ')*' + BQ +
        '*((' + BD + '="כן")*DAYS+(' + BD + '<>"כן")*1))' +
      ')*' + FACTOR +
      '+SUMPRODUCT((' + X + '=$B' + r + ')*(' + XU + '=$C' + r + ')*' + XQ + '*(' +
        '(' + XS + '="כמות קבועה")*1' +
        '+(' + XS + '="לפי אדם")*' + FACTOR +
        '+(' + XS + '="לפי אדם ליום")*' + FACTOR + '*DAYS))' +
      ',2))']);
    // אותו עיגול כמו באפליקציה: יחידות תמיד למעלה, משקל מתגלגל לק"ג
    show.push(['=IF($D' + r + '="","",IF($C' + r + '="יח\'",TEXT(ROUNDUP($D' + r + ',0),"0")&" יח\'",' +
      'IF($D' + r + '>=1000,TEXT(ROUND($D' + r + '/1000,1),"0.#")&IF($C' + r + '="גרם"," ק""ג"," ליטר"),' +
      'TEXT(ROUND($D' + r + ',0),"0")&" "&$C' + r + ')))']);
    cost.push(['=IF(OR($D' + r + '="",$G' + r + '=""),"",' +
      'IF($C' + r + '="יח\'",ROUNDUP($D' + r + ',0)*$G' + r + ',ROUND($D' + r + '/1000,3)*$G' + r + '))']);
  }
  var n = LAST.sh - 4;
  sh.getRange(5, 4, n, 1).setFormulas(qty).setNumberFormat('0.##');
  sh.getRange(5, 5, n, 1).setFormulas(show);
  sh.getRange(5, 8, n, 1).setFormulas(cost).setNumberFormat('#,##0.0" ₪"');
  sh.getRange(5, 6, n, 1).insertCheckboxes();
  sh.getRange(5, 7, n, 1).setNumberFormat('#,##0.0" ₪"').setBackground(C.white);

  grid(sh, 5, LAST.sh, 8);
  sh.getRange(5, 1, n, 5).setBackground(C.cream2);
  sh.getRange(5, 6, n, 1).setBackground(C.white);
  sh.getRange(5, 3, n, 3).setHorizontalAlignment('center');
  sh.getRange(5, 5, n, 1).setFontWeight('bold');
  sh.hideColumns(4);                               // הכמות הגולמית היא אינסטלציה

  ruleFormula(sh, 'A5:H' + LAST.sh, '=$F5=TRUE', C.okBg, C.ink3, true);
  ss.setNamedRange('SH_NAME', sh.getRange('B5:B' + LAST.sh));
  ss.setNamedRange('SH_CAT', sh.getRange('A5:A' + LAST.sh));
  ss.setNamedRange('SH_BOUGHT', sh.getRange('F5:F' + LAST.sh));
  ss.setNamedRange('SH_PRICE', sh.getRange('G5:G' + LAST.sh));
  ss.setNamedRange('SH_COST', sh.getRange('H5:H' + LAST.sh));

  /* עמודות מחושבות מוגנות: אזהרה בלבד, לא נעילה — מי שבאמת צריך יכול
     להמשיך, אבל אף אחד לא ידרוס נוסחה בלי לשים לב. */
  try {
    var p = sh.getRange('A5:E' + LAST.sh).protect()
      .setDescription('כמויות מחושבות — שנה את התפריט, לא את זה');
    p.setWarningOnly(true);
  } catch (e) {}
}

// ═══════════════════════════════════════════════ משימות
function tasks(ss) {
  var sh = mk(ss, 'משימות', 'משימות צוות המטבח',
    'כל אחד מסנן לעצמו: תצוגת מסנן אישית לא מזיזה כלום לאחרים.',
    ['המשימה', 'אחראי', 'בוצע', 'מתי', 'דחיפות', 'הערות'],
    [330, 140, 75, 110, 120, 230], C.rose);
  sh.getRange(5, 1, 3, 5).setValues([
    ['לפרוק את הרכב ולסדר את המזווה', '', false, '', 'גבוה'],
    ['למלא את מיכל המים', '', false, '', 'גבוה'],
    ['לשטוף את הסירים הגדולים', '', false, '', 'רגיל']
  ]);
  var n = LAST.tk - 4;
  grid(sh, 5, LAST.tk, 6);
  sh.getRange(5, 1, n, 6).setBackground(C.white);
  sh.getRange(5, 3, n, 1).insertCheckboxes();
  sh.getRange(5, 3, n, 3).setHorizontalAlignment('center');
  sh.getRange(5, 4, n, 1).setNumberFormat('dd/mm');
  dropdownRange(sh, 'B5:B' + LAST.tk, ss.getRangeByName('CREW'));
  dropdown(sh, 'E5:E' + LAST.tk, ['גבוה', 'רגיל', 'נמוך'], false);
  ruleFormula(sh, 'A5:F' + LAST.tk, '=$C5=TRUE', C.okBg, C.ink3, true);
  ruleEq(sh, 'E5:E' + LAST.tk, 'גבוה', C.dangerBg, C.danger, false);
  ss.setNamedRange('TK_TEXT', sh.getRange('A5:A' + LAST.tk));
  ss.setNamedRange('TK_OWNER', sh.getRange('B5:B' + LAST.tk));
  ss.setNamedRange('TK_DONE', sh.getRange('C5:C' + LAST.tk));
}

// ═══════════════════════════════════════════════ דאשבורד
function dashboard(ss) {
  var sh = ss.insertSheet('דאשבורד', 0);
  sh.setRightToLeft(true);
  sh.setTabColor(C.ink);
  sh.setHiddenGridlines(true);
  [30, 230, 170, 40, 230, 170, 40, 240].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  sh.getRange('B2').setValue('המטבח של קאמפ פרדייז')
    .setFontSize(22).setFontWeight('bold').setFontColor(C.fireDeep);
  sh.getRange('B3').setFormula(
    '=TEXT(STARTDATE,"dd/MM")&" – "&TEXT(STARTDATE+DAYS-1,"dd/MM")' +
    '&"   ·   "&PEOPLE&" סועדים   ·   "&DAYS&" ימים"');
  sh.getRange('B3').setFontSize(10).setFontColor(C.ink3);
  sh.setRowHeight(2, 34);

  function card(row, col, eyebrow, formula, fmt, note, colour) {
    sh.getRange(row, col).setValue(eyebrow)
      .setFontSize(9).setFontWeight('bold').setFontColor(C.ink3);
    var v = sh.getRange(row + 1, col).setFormula(formula)
      .setFontSize(20).setFontWeight('bold').setFontColor(colour || C.ink);
    if (fmt) v.setNumberFormat(fmt);
    if (note) sh.getRange(row + 2, col).setFormula(note).setFontSize(9).setFontColor(C.ink3);
    sh.getRange(row, col, 3, 2).setBackground(C.surface)
      .setBorder(true, true, true, true, false, false, C.edge, SpreadsheetApp.BorderStyle.SOLID);
    sh.setRowHeight(row + 1, 32);
  }

  card(5, 2, 'עלות משוערת', '=SUM(SH_COST)', '#,##0" ₪"',
    '=TEXT(COUNTIF(SH_PRICE,">0"),"0")&" מתוך "&TEXT(COUNTA(SH_NAME),"0")&" פריטים מתומחרים"');
  card(5, 5, 'עלות לאדם', '=IFERROR(SUM(SH_COST)/PEOPLE,0)', '#,##0.0" ₪"',
    '="לפי "&PEOPLE&" סועדים"');
  card(9, 2, 'מול התקציב', '=IF(BUDGET=0,0,BUDGET-SUM(SH_COST))', '#,##0" ₪"',
    '=IF(BUDGET=0,"לא הוגדר תקציב",IF(BUDGET-SUM(SH_COST)<0,"חריגה מהתקציב","נשאר מהתקציב"))');
  card(9, 5, 'עלות ליום', '=IFERROR(SUM(SH_COST)/DAYS,0)', '#,##0" ₪"');
  card(13, 2, 'התקדמות בקניות',
    '=IFERROR(COUNTIF(SH_BOUGHT,TRUE)/COUNTA(SH_NAME),0)', '0%',
    '=TEXT(COUNTIF(SH_BOUGHT,TRUE),"0")&" מתוך "&TEXT(COUNTA(SH_NAME),"0")&" נקנו"');
  card(13, 5, 'משימות פתוחות',
    '=COUNTA(TK_TEXT)-COUNTIF(TK_DONE,TRUE)', '0',
    '=TEXT(COUNTIF(TK_DONE,TRUE),"0")&" נסגרו מתוך "&TEXT(COUNTA(TK_TEXT),"0")');
  card(17, 2, 'ארוחות ללא מנה',
    "=COUNTBLANK('תפריט השבוע'!D5:D" + LAST.wk + ")", '0',
    '="מתוך 12 ארוחות בשבוע"', C.danger);
  card(17, 5, 'קרח משוער', '=ROUNDUP(PEOPLE*DAYS*1.5,0)&" ק""ג"', null,
    '="1.5 ק""ג לאדם ליום"');

  sh.getRange('B21').setValue('עלות לפי קטגוריה').setFontWeight('bold');
  var cats = ["יבשים", "שימורים", "ירקות ופירות", "קירור", "לחם ומאפים", "תבלינים ורטבים", "אחר"];
  for (var i = 0; i < cats.length; i++) {
    var r = 22 + i;
    sh.getRange(r, 2).setValue(cats[i]);
    sh.getRange(r, 3).setFormula('=SUMIF(SH_CAT,$B' + r + ',SH_COST)').setNumberFormat('#,##0" ₪"');
    sh.getRange(r, 2, 1, 2).setBackground(C.surface)
      .setBorder(true, true, true, true, false, false, C.edge, SpreadsheetApp.BorderStyle.SOLID);
  }

  sh.getRange('E21').setValue('בדיקות שפיות').setFontWeight('bold');
  var checks = [
    ['ארוחות בלי מנה עיקרית', "=COUNTBLANK('תפריט השבוע'!D5:D" + LAST.wk + ")"],
    ['ארוחות בלי תורנים', "=COUNTBLANK('תפריט השבוע'!H5:H" + LAST.wk + ")"],
    ['משימות בלי אחראי', '=COUNTA(TK_TEXT)-COUNTA(TK_OWNER)'],
    ['פריטים בלי מחיר', '=COUNTA(SH_NAME)-COUNTIF(SH_PRICE,">0")'],
    ['מצרכים ברשימה', '=COUNTA(SH_NAME)']
  ];
  for (var k = 0; k < checks.length; k++) {
    var rr = 22 + k;
    sh.getRange(rr, 5).setValue(checks[k][0]);
    sh.getRange(rr, 6).setFormula(checks[k][1]).setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(rr, 5, 1, 2).setBackground(C.surface)
      .setBorder(true, true, true, true, false, false, C.edge, SpreadsheetApp.BorderStyle.SOLID);
  }
  // רק הראשונים ארבעה הם "בעיה אם גדול מאפס"; האחרון הוא ספירה בלבד.
  var warn = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0).setBackground(C.dangerBg).setFontColor(C.danger).setBold(true)
    .setRanges([sh.getRange('F22:F25')]).build();
  var good = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberEqualTo(0).setFontColor(C.ok).setBold(true)
    .setRanges([sh.getRange('F22:F25')]).build();
  sh.setConditionalFormatRules([warn, good]);

  sh.getRange('B29').setValue(
    'כל מספר כאן מחושב. אם משהו נראה לא נכון — תקן בהגדרות או בתפריט, לא כאן.')
    .setFontSize(10).setFontColor(C.ink3);
  sh.setFrozenRows(3);
}

// ═══════════════════════════════════════════════ הוראות הכנה
/* בלי הלשונית הזאת המעבר לגיליון היה מאבד את כל הוראות הבישול שכבר נכתבו,
   וזה הדבר היחיד שבאמת קוראים מול הסיר. */
function steps(ss) {
  var sh = mk(ss, 'הוראות הכנה', 'הוראות הכנה',
    'מה שקוראים מול הסיר. אפשר להדפיס את הלשונית הזאת ולתלות במטבח.',
    ['מנה', 'שלבים'], [230, 760], C.ink2);
  var rows = [["פסטה בולונז צמחוני", "1. מקציפים בצל וגזר קצוצים בשמן עד ריכוך, כ-8 דקות.\n2. מוסיפים שום כתוש ומטגנים חצי דקה עד שעולה ריח.\n3. מוסיפים את חלבון הסויה (או העדשים) ומערבבים דקה.\n4. שופכים רסק ועגבניות מרוסקות, מתבלים באורגנו, מלח ופלפל.\n5. מבשלים על אש נמוכה 25 דקות עד שהרוטב סמיך.\n6. במקביל מבשלים את הפסטה במים רותחים ומומלחים היטב.\n7. מסננים, מערבבים עם הרוטב ומגישים."], ["שקשוקה עם פיתות", "1. מטגנים בצל ופלפל אדום קצוצים בשמן עד ריכוך.\n2. מוסיפים שום, פפריקה וכמון ומערבבים חצי דקה — לא לשרוף את התבלינים.\n3. מוסיפים עגבניות מרוסקות ורסק, מתבלים ומבשלים 15 דקות עד סמיכות.\n4. יוצרים גומות ברוטב ושוברים לתוכן את הביצים.\n5. מכסים ומבשלים 6–8 דקות עד שהחלבון נקרש והחלמון עדיין רך.\n6. מפזרים פטרוזיליה קצוצה ומגישים עם פיתות."], ["מוג׳דרה עם סלט", "1. מטגנים המון בצל פרוס דק בשמן על אש בינונית 20 דקות עד שחום עמוק — זה כל הטעם.\n2. מוציאים חצי מהבצל המקורמל בצד לקישוט.\n3. מבשלים עדשים במים 15 דקות עד חצי ריכוך ומסננים.\n4. מוסיפים לסיר את האורז, העדשים, כמון וקינמון.\n5. מוסיפים מים ברמה של 1.5 ס\"מ מעל האורז, מביאים לרתיחה.\n6. מנמיכים, מכסים ומבשלים 18 דקות. מכבים ונותנים לנוח 10 דקות.\n7. מפזרים את הבצל השמור ומגישים עם סלט."], ["נקניקיות בלחמנייה", "1. מחממים מים בסיר גדול (לא מרתיחים) ומכניסים את הנקניקיות ל-8 דקות.\n2. לחלופין צולים על הגריל 5 דקות תוך סיבוב — עדיף.\n3. חוצים את הלחמניות ומחממים אותן דקה על הגריל.\n4. מטגנים בצל קצוץ עד קרמול, כ-10 דקות.\n5. מרכיבים: לחמנייה, נקניקייה, בצל, חרדל וקטשופ."], ["קוסקוס עם ירקות", "1. חותכים גזר, קישוא, דלעת ובצל לקוביות גדולות.\n2. מטגנים את הבצל בסיר גדול, מוסיפים את שאר הירקות ומערבבים.\n3. מוסיפים חומוס משומר, רסק עגבניות, כורכום, כמון ומלח.\n4. מכסים במים ומבשלים 30 דקות עד שהירקות רכים והמרק טעים.\n5. במקביל: שופכים על הקוסקוס מים רותחים ביחס 1:1, מכסים ל-8 דקות.\n6. מפרידים במזלג עם קצת שמן ומגישים עם המרק והירקות מעל."], ["אטריות מוקפצות", "1. מכינים את האטריות לפי ההוראות, מסננים ושוטפים במים קרים כדי שלא יידבקו.\n2. חותכים את כל הירקות ברצועות דקות לפני שמתחילים — ההקפצה מהירה.\n3. מחממים ווק גדול או מחבת רחבה עד עשן קל.\n4. מקפיצים גזר ופלפל 2 דקות, מוסיפים כרוב וברוקולי עוד 2 דקות.\n5. מוסיפים שום וג׳ינג׳ר, מערבבים חצי דקה.\n6. מוסיפים את האטריות, סויה ושמן שומשום ומקפיצים עוד 2 דקות."], ["צ׳ילי עם אורז", "1. מטגנים בצל ופלפל קצוצים בשמן 8 דקות.\n2. מוסיפים שום, כמון, פפריקה וצ׳ילי — חצי דקה בלבד.\n3. מוסיפים שעועית אדומה מסוננת, תירס, עגבניות מרוסקות ורסק.\n4. מבשלים על אש נמוכה 25 דקות, מערבבים מדי פעם.\n5. מתקנים תיבול; מי שאוהב חריף — עוד צ׳ילי בצד ולא בסיר.\n6. מגישים על אורז לבן."], ["פחיטות (טורטיות)", "1. פורסים פלפלים ובצל לרצועות דקות.\n2. מקפיצים על אש גבוהה במחבת יבשה כמעט, עד חריכה קלה — לא לבשל אותם רך.\n3. מתבלים בפפריקה, כמון, שום גרוס ומלח.\n4. מוסיפים שעועית שחורה מסוננת ותירס, מחממים 3 דקות.\n5. מחממים את הטורטיות על הגריל 20 שניות מכל צד.\n6. כל אחד מרכיב לעצמו: טורטייה, מילוי, גבינה מגוררת ולימון."], ["אורז לבן", "1. שוטפים את האורז עד שהמים כמעט צלולים.\n2. מחממים שמן בסיר ומערבבים בו את האורז דקה.\n3. מוסיפים מים ביחס 1:1.5, מלח, ומביאים לרתיחה.\n4. מנמיכים לאש הכי קטנה, מכסים, 18 דקות. לא לפתוח.\n5. מכבים, נותנים 10 דקות מנוחה ומפרידים במזלג."], ["סלט ישראלי", "1. חותכים עגבניות, מלפפונים ובצל לקוביות קטנות ואחידות.\n2. מסננים עודפי נוזלים מהעגבניות כדי שהסלט לא יהיה מימי.\n3. מתבלים בלימון סחוט, שמן זית ומלח.\n4. מערבבים רק לפני ההגשה — סלט שיושב מתבשל במלח ונובל."], ["קוסקוס", "1. מודדים קוסקוס לקערה עמידה בחום.\n2. שופכים מים רותחים ביחס 1:1 ומוסיפים שמן ומלח.\n3. מכסים היטב ל-8 דקות.\n4. מפרידים במזלג עד שאין גושים."], ["פירה", "1. מקלפים ומבשלים תפוחי אדמה במים מומלחים 20 דקות עד שמזלג נכנס בקלות.\n2. מסננים היטב ומחזירים לסיר החם לדקה כדי לאדות נוזלים.\n3. מועכים עם חמאה וחלב חמים.\n4. מתבלים במלח ופלפל. לא לערבב יותר מדי — פירה נעשה דביק."], ["לחם / פיתות", "1. מחממים על הגריל או במחבת יבשה 20–30 שניות מכל צד.\n2. עוטפים במגבת בד כדי לשמור רך וחם עד ההגשה."], ["צ׳יפס בתנור", "1. חותכים תפוחי אדמה לאצבעות בעובי אחיד.\n2. משרים במים קרים 15 דקות ומייבשים היטב — זה מה שעושה אותם פריכים.\n3. מערבבים עם שמן, פפריקה ומלח.\n4. אופים ב-220 מעלות 25–30 דקות, הופכים באמצע."], ["ירקות מוקפצים", "1. חותכים את כל הירקות ברצועות דקות מראש.\n2. מחממים מחבת רחבה על אש גבוהה עד עשן קל.\n3. מקפיצים במנות קטנות — מחבת עמוסה מאדה במקום לצרוב.\n4. מתבלים בסויה ושום בסוף, לא בהתחלה."], ["חומוס / טחינה", "1. טחינה גולמית + מים קרים ביחס 1:1, מערבבים עד שמתבהר ומסמיך.\n2. מוסיפים לימון סחוט, שום כתוש ומלח.\n3. לחומוס: מועכים חומוס משומר מסונן ומערבבים עם חצי מהטחינה.\n4. מגישים עם שמן זית ופפריקה מעל."]];
  sh.getRange(5, 1, rows.length, 2).setValues(rows);
  grid(sh, 5, rows.length + 4, 2);
  sh.getRange(5, 1, rows.length, 2).setBackground(C.white).setVerticalAlignment('top');
  sh.getRange(5, 1, rows.length, 1).setFontWeight('bold');
  sh.getRange(5, 2, rows.length, 1).setWrap(true);
  bands(sh, 5, rows.length + 4, 2);
  for (var i = 0; i < rows.length; i++) {
    var lines = String(rows[i][1]).split('\n').length;
    sh.setRowHeight(5 + i, Math.max(40, lines * 18));
  }
}

/* תפריט משלנו בשורת התפריטים, כדי שאפשר יהיה לבנות מחדש בלי Apps Script. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('קאמפ פרדייז')
    .addItem('בנה מחדש את כל הגיליון', 'buildKitchenSheet')
    .addToUi();
}
