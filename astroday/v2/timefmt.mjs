// ASTRODAY 2.0 — локальные даты, «сегодня/завтра» пользователя и отображение интервалов (МСК + местное).
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const MSK = "Europe/Moscow";

export function validZone(zone) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0); return typeof zone === "string" && zone.includes("/") || zone === "UTC"; } catch { return false; }
}
function parts(ms, zone) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return Object.fromEntries(f.formatToParts(new Date(ms)).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
}
export function localDay(zone, ms = Date.now()) {
  const p = parts(ms, zone);
  return p.year + "-" + p.month + "-" + p.day;
}
export function localHM(zone, ms) {
  const p = parts(ms, zone);
  return p.hour + ":" + p.minute;
}
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function tomorrowOf(zone, ms = Date.now()) { return addDays(localDay(zone, ms), 1); }
export function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }

// UTC-момент для местного времени (учитывает DST). Несуществующее время (переход вперёд) → ближайшее следующее.
export function zonedToUtc(day, hh, mm, zone) {
  const target = Date.parse(day + "T" + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":00Z");
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(guess, zone);
    const wall = Date.parse(p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute + ":" + p.second + "Z");
    if (wall === target) return guess;
    guess += target - wall;
  }
  return guess;
}
export function ruDate(day, withWeekday = false) {
  const [y, m, d] = day.split("-").map(Number);
  const wd = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return d + " " + MONTHS[m - 1] + (withWeekday ? ", " + wd : "");
}
const CITY_FALLBACK = { "Europe/Moscow": "Москва", "Asia/Novokuznetsk": "Кемерово", "Asia/Novosibirsk": "Новосибирск", "Asia/Ho_Chi_Minh": "Вьетнам", "Asia/Krasnoyarsk": "Красноярск", "Asia/Yekaterinburg": "Екатеринбург", "Asia/Omsk": "Омск", "Asia/Irkutsk": "Иркутск", "Asia/Vladivostok": "Владивосток", "Europe/Kaliningrad": "Калининград", "Asia/Makassar": "Бали", "Asia/Bangkok": "Таиланд" };
export function zoneLabel(zone, cityName) { return cityName || CITY_FALLBACK[zone] || zone; }

function sameOffset(zone, a, b) { return localHM(zone, a) === localHM(MSK, a) && localHM(zone, b) === localHM(MSK, b) && localDay(zone, a) === localDay(MSK, a); }

// Луна без курса: один геоцентрический интервал; показываем местное время (приоритетно) и Москву как ориентир.
// forecastDay — локальная дата прогноза; дата добавляется, если начало/конец выпадают на другой день.
export function formatVoc({ startMs, endMs, zone, cityName, forecastDay }) {
  const label = (ms, z, refDay) => (localDay(z, ms) !== refDay ? ruDate(localDay(z, ms)) + " " : "") + localHM(z, ms);
  const local = "с " + label(startMs, zone, forecastDay) + " до " + label(endMs, zone, forecastDay);
  if (zone === MSK || sameOffset(zone, startMs, endMs)) return { line: local + " по Москве", local, msk: null };
  const msk = "с " + label(startMs, MSK, forecastDay) + " до " + label(endMs, MSK, forecastDay);
  return { line: local + " по твоему времени (" + zoneLabel(zone, cityName) + ")\nпо Москве: " + msk, local, msk };
}

// «UTC+7», «UTC+5:30» — понятная подпись вместо английского имени зоны IANA
export function utcOffsetLabel(zone, ms = Date.now()) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date(ms)).find((x) => x.type === "timeZoneName")?.value || "";
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(p);
    if (!m) return "UTC";
    return "UTC" + m[1] + Number(m[2]) + (m[3] !== "00" ? ":" + m[3] : "");
  } catch { return ""; }
}
