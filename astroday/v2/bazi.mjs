// ASTRODAY 2.0 — Ба-цзы: дневной ствол личности и дни Грабителя богатства (劫财 Jie Cai).
// Детерминированный модуль, без OpenAI. Методика: docs/BAZI_ENGINE_SPEC.md.
//
// Школа (зафиксировано):
//  * Дневной столп — непрерывный 60-ричный цикл дней; индекс = (JDN + 49) mod 60, 0 = 甲子.
//    Опорные точки: 1949-10-01 = 甲子, 2000-01-01 = 戊午, 1900-01-01 = 甲戌.
//  * Граница суток при рождении — местная полночь (современная школа). Рождение 23:00–23:59
//    помечается флагом zi_hour_ambiguity: по школе «поздний час Цзы» (子初换日) день сменился бы в 23:00.
//    Опция dayBoundary: "zi23" переключает на эту школу.
//  * Используется местное гражданское время места рождения (без поправки на истинное солнечное).
//  * Грабитель богатства = ствол той же стихии, что Дневной Мастер, но противоположной полярности.
//    Основной признак дня — небесный ствол дня; дополнительный — главный скрытый ствол (本气)
//    земной ветви дня. Месяц определяется по солнечным «цзе» (立春 = 315° … ), см. monthPillar.

export const BAZI_VERSION = "astroday-bazi-v1";
export const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
export const STEM_RU = ["Цзя", "И", "Бин", "Дин", "У", "Цзи", "Гэн", "Синь", "Жэнь", "Гуй"];
export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
export const BRANCH_RU = ["Цзы", "Чоу", "Инь", "Мао", "Чэнь", "Сы", "У", "Вэй", "Шэнь", "Ю", "Сюй", "Хай"];
export const ELEMENTS = ["wood", "fire", "earth", "metal", "water"];
export const ELEMENT_RU = { wood: "Дерево", fire: "Огонь", earth: "Земля", metal: "Металл", water: "Вода" };
// Главный скрытый ствол ветви (本气): 子癸 丑己 寅甲 卯乙 辰戊 巳丙 午丁 未己 申庚 酉辛 戌戊 亥壬
export const BRANCH_MAIN_QI = [9, 5, 0, 1, 4, 2, 3, 5, 6, 7, 4, 8];

export function stemInfo(i) {
  if (!Number.isInteger(i) || i < 0 || i > 9) throw Error("bad_stem");
  return { index: i, hanzi: STEMS[i], ru: STEM_RU[i], element: ELEMENTS[Math.floor(i / 2)], yang: i % 2 === 0 };
}
export function stemLabel(i) {
  const s = stemInfo(i);
  return ELEMENT_RU[s.element] + " " + (s.yang ? "Ян" : "Инь") + " (" + s.hanzi + ")";
}

// Julian Day Number for a Gregorian calendar date (integer, noon-based).
export function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
function parseDay(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
  if (!m) throw Error("bad_day");
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) throw Error("bad_day");
  return { y, mo, d };
}
export function addDays(day, n) {
  const { y, mo, d } = parseDay(day);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}
export function dayPillar(day) {
  const { y, mo, d } = parseDay(day);
  const idx = (((jdn(y, mo, d) + 49) % 60) + 60) % 60;
  return { cycle: idx, stem: idx % 10, branch: idx % 12, hanzi: STEMS[idx % 10] + BRANCHES[idx % 12], ru: STEM_RU[idx % 10] + "-" + BRANCH_RU[idx % 12] };
}

// Десять божеств: отношение ствола x к Дневному Мастеру dm.
const GEN = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };
const CTRL = { wood: "earth", fire: "metal", earth: "water", metal: "wood", water: "fire" };
export function tenGod(dm, x) {
  const a = stemInfo(dm), b = stemInfo(x), same = a.yang === b.yang;
  if (a.element === b.element) return same ? "bi_jian" : "jie_cai";
  if (GEN[a.element] === b.element) return same ? "shi_shen" : "shang_guan";
  if (CTRL[a.element] === b.element) return same ? "pian_cai" : "zheng_cai";
  if (CTRL[b.element] === a.element) return same ? "qi_sha" : "zheng_guan";
  if (GEN[b.element] === a.element) return same ? "pian_yin" : "zheng_yin";
  throw Error("unreachable");
}
export const TEN_GOD_RU = { bi_jian: "Друг (比肩)", jie_cai: "Грабитель богатства (劫财)", shi_shen: "Бог Еды (食神)", shang_guan: "Ранящий Чиновника (伤官)", pian_cai: "Непрямое Богатство (偏财)", zheng_cai: "Прямое Богатство (正财)", qi_sha: "Семь Убийств (七杀)", zheng_guan: "Прямой Чиновник (正官)", pian_yin: "Непрямая Печать (偏印)", zheng_yin: "Прямая Печать (正印)" };
export function jieCaiStem(dm) {
  const s = stemInfo(dm);
  return s.yang ? dm + 1 : dm - 1;
}

// Дневной Мастер: дата и время рождения в местном гражданском времени.
export function dayMaster({ birthLocalDate, birthLocalTime = null, timeKnown = false, dayBoundary = "midnight" }) {
  let day = birthLocalDate;
  let ambiguity = null;
  const hm = /^(\d{2}):(\d{2})/.exec(String(birthLocalTime || ""));
  if (timeKnown && hm && Number(hm[1]) === 23) {
    ambiguity = "zi_hour_23";
    if (dayBoundary === "zi23") day = addDays(day, 1);
  }
  const p = dayPillar(day);
  return { stem: p.stem, pillar: p, label: stemLabel(p.stem), jieCaiStem: jieCaiStem(p.stem), jieCaiLabel: stemLabel(jieCaiStem(p.stem)), ambiguity, dayBoundary, timeKnown };
}

// Солнечная долгота низкой точности (Meeus гл. 25, ~0.01°) — только для границ месяцев.
function sunLongitude(ms) {
  const jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * Math.PI / 180;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * Math.PI / 180;
  return (((L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) % 360) + 360) % 360;
}
// Месяц Ба-цзы на момент ms (UTC). Месяц 寅 начинается при долготе Солнца 315° (立春).
export function monthPillar(ms) {
  const lon = sunLongitude(ms);
  const k = Math.floor((((lon - 315) % 360) + 360) % 360 / 30); // 0 = 寅
  const branch = (k + 2) % 12;
  // Год Ба-цзы меняется на 立春: если ещё до 315° в январе–феврале, год предыдущий.
  const d = new Date(ms);
  let y = d.getUTCFullYear();
  if (d.getUTCMonth() < 2 && k >= 10) y -= 1; // 丑/子 месяцы января–февраля относятся к прошлому году
  const yearStem = (((y - 4) % 10) + 10) % 10;
  const firstMonthStem = ((yearStem % 5) * 2 + 2) % 10; // 甲/己 → 丙寅 …
  const stem = (firstMonthStem + k) % 10;
  return { stem, branch, hanzi: STEMS[stem] + BRANCHES[branch], yearStem, solarLongitude: lon };
}

// Календарь на период: локальные календарные даты пользователя [startDay, endDay] включительно.
export function jieCaiCalendar({ dm, startDay, endDay, includeHidden = true }) {
  const jc = jieCaiStem(dm.stem ?? dm);
  const out = [];
  let day = startDay;
  for (let guard = 0; day <= endDay && guard < 800; guard++) {
    const p = dayPillar(day);
    const viaStem = p.stem === jc;
    const viaBranch = includeHidden && BRANCH_MAIN_QI[p.branch] === jc;
    if (viaStem || viaBranch) out.push({ day, pillar: p.hanzi, pillarRu: p.ru, kind: viaStem ? "stem" : "branch", strength: viaStem && viaBranch ? 2 : 1 });
    day = addDays(day, 1);
  }
  return out;
}

const RU_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const RU_MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const RU_WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
export function ruDay(day) {
  const { y, mo, d } = parseDay(day);
  return d + " " + RU_MONTHS[mo - 1] + ", " + RU_WD[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Сообщения для Telegram (HTML), сгруппированные по месяцам, каждое < 3500 символов.
export function renderJieCaiMessages({ name, dm, days, startDay, endDay }) {
  const head = "💰 <b>ДНИ ГРАБИТЕЛЯ БОГАТСТВА</b>\n" + (name ? esc(name) + ", это " : "Это ") + "твой личный календарь по Ба-цзы на " + esc(ruDay(startDay).split(",")[0]) + " — " + esc(ruDay(endDay).split(",")[0]) + ".\n\n" +
    "Твой Дневной Мастер — " + esc(stemLabel(dm.stem)) + ". Грабитель богатства для тебя — " + esc(stemLabel(dm.jieCaiStem)) + ": та же стихия, только с другим знаком. В традиции Ба-цзы это «соперник за ресурс» — дни, когда деньги легче утекают на импульсы, чужие просьбы и «ну а вдруг».\n\n" +
    "Это не про то, что у тебя что-то отнимут. Это про внимательность: плановые траты — пожалуйста, а вот займы на эмоциях, спонтанные покупки и рискованные вложения лучше отложить на другой день.";
  const groups = new Map();
  for (const x of days) {
    const key = x.day.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(x);
  }
  const msgs = [head + (dm.ambiguity ? "\n\n⚠️ Время рождения — между 23:00 и 00:00. В разных школах Ба-цзы сутки меняются в разное время, поэтому Дневной Мастер посчитан по местной полуночи." : "")];
  if (!days.length) msgs.push("В этом периоде дней Грабителя богатства по твоей карте нет 🖤");
  for (const [key, list] of groups) {
    const [y, m] = key.split("-").map(Number);
    let body = "🗓 <b>" + RU_MONTHS_NOM[m - 1].toUpperCase() + " " + y + "</b>\n";
    for (const x of list) body += (x.kind === "stem" ? "💰 " : "▫️ ") + "<b>" + esc(ruDay(x.day)) + "</b>" + (x.kind === "stem" ? "" : " — мягче, через скрытый ствол") + "\n";
    msgs.push(body.trim());
  }
  msgs.push("💰 — главный день Грабителя: ствол дня совпадает с твоим Грабителем.\n▫️ — более мягкий: Грабитель спрятан в земной ветви дня.\n\nВ такие дни хорошо оплачивать то, что и так было в планах, — «добровольно», а не случайно. Деньги любят, когда ими управляют 🖤");
  return msgs;
}
