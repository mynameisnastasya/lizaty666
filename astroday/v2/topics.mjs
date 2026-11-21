import { selectMoonGuidance } from "./moon-guidance.mjs";
// ASTRODAY 2.0 — отбор тем дня из расчёта движка.
// Не пишем про все сферы: 1 главная тема, вторая — только если она сопоставима по силе и про другое.
// Слабые указания → короткий спокойный прогноз. Тема всегда опирается на конкретные факты расчёта.

export const TOPICS_VERSION = "astroday-topics-v1";
const PLANET_W = { Sun: 3, Moon: 0.9, Mercury: 2, Venus: 2.4, Mars: 2.8, Jupiter: 2.8, Saturn: 3.2, Uranus: 3, Neptune: 2.5, Pluto: 3 };
const NATAL_W = { Sun: 1.3, Moon: 1.25, Mercury: 1.05, Venus: 1.15, Mars: 1.1, Jupiter: 0.85, Saturn: 0.9, Uranus: 0.65, Neptune: 0.65, Pluto: 0.7 };
const ASPECT_W = { conjunction: 1, opposition: 0.92, square: 0.92, trine: 0.7, sextile: 0.6 };
const TONE = { conjunction: "mixed", opposition: "tense", square: "tense", trine: "soft", sextile: "soft" };

export const DOMAINS = {
  self: "ты сама/сам, самочувствие, как тебя видят",
  money: "деньги, покупки, ценность, ресурсы",
  communication: "разговоры, переписки, документы, поездки по городу",
  home: "дом, семья, быт, эмоциональная опора",
  love: "симпатии, романтика, удовольствие, творчество",
  routine: "рабочие задачи, режим дня, дела по списку",
  partners: "партнёр, договорённости, близкие один на один",
  depth: "общие деньги, доверие, глубокие переживания",
  horizons: "учёба, планы на будущее, дальние дороги",
  career: "работа, статус, ответственность, начальство",
  friends: "друзья, команда, сообщества, мечты",
  inner: "отдых, тишина, интуиция, то, что за кадром",
};
const HOUSE_DOMAIN = [null, "self", "money", "communication", "home", "love", "routine", "partners", "depth", "horizons", "career", "friends", "inner"];
// Без домов — по смыслу пары планет
const PLANET_DOMAIN = { Sun: "self", Moon: "home", Mercury: "communication", Venus: "love", Mars: "routine", Jupiter: "horizons", Saturn: "career", Uranus: "friends", Neptune: "inner", Pluto: "depth" };
export const PLANET_RU = { Sun: "Солнце", Moon: "Луна", Mercury: "Меркурий", Venus: "Венера", Mars: "Марс", Jupiter: "Юпитер", Saturn: "Сатурн", Uranus: "Уран", Neptune: "Нептун", Pluto: "Плутон" };
export const PLANET_GEN = { Sun: "Солнцу", Moon: "Луне", Mercury: "Меркурию", Venus: "Венере", Mars: "Марсу", Jupiter: "Юпитеру", Saturn: "Сатурну", Uranus: "Урану", Neptune: "Нептуну", Pluto: "Плутону" };
export const ASPECT_RU = { conjunction: "соединение", opposition: "оппозиция", square: "квадрат", trine: "трин", sextile: "секстиль" };
export const SIGN_RU_IN = { Aries: "в Овне", Taurus: "в Тельце", Gemini: "в Близнецах", Cancer: "в Раке", Leo: "во Льве", Virgo: "в Деве", Libra: "в Весах", Scorpio: "в Скорпионе", Sagittarius: "в Стрельце", Capricorn: "в Козероге", Aquarius: "в Водолее", Pisces: "в Рыбах" };
export const MEANING = {
  Sun: "воля, энергия, желание быть заметной/заметным", Moon: "эмоции, привычки, чувство безопасности", Mercury: "мысли, слова, сообщения, документы, мелкие поездки",
  Venus: "симпатии, удовольствие, красота, деньги и ценности", Mars: "действие, напор, спешка, раздражение, смелость", Jupiter: "рост, возможности, щедрость, преувеличение",
  Saturn: "ответственность, сроки, ограничения, усталость, зрелость", Uranus: "внезапность, перемены, свобода, неожиданные решения", Neptune: "интуиция, вдохновение, туман, иллюзии, усталость",
  Pluto: "контроль, сила, глубокие перемены, ревность",
};
export const ASPECT_MEANING = { conjunction: "слияние: тема звучит громко", opposition: "качели: баланс между двумя сторонами, другой человек как зеркало", square: "напряжение, которое толкает к действию", trine: "лёгкость и поддержка, если ей воспользоваться", sextile: "возможность, которую надо взять самой/самому" };

function natalHouseOf(lon, cusps) {
  if (!Array.isArray(cusps) || cusps.length !== 12) return null;
  const a = ((lon % 360) + 360) % 360;
  for (let i = 0; i < 12; i++) {
    const w = (((cusps[(i + 1) % 12] - cusps[i]) % 360) + 360) % 360;
    if ((((a - cusps[i]) % 360) + 360) % 360 < w) return i + 1;
  }
  return null;
}

export function factId(a) { return "a:" + a.transit + ":" + a.aspect + ":" + a.natal; }

export function selectTopics(calc) {
  const houseKnown = calc.houseKnown === true;
  const cusps = calc.natalProfile?.houseCusps || null;
  const natal = calc.natalProfile?.natalPositions || {};
  const exactToday = new Set((calc.dayEvents || []).filter((e) => e.type === "exact_personal_aspect").map((e) => e.transit + ":" + (e.aspect) + ":" + e.natal));
  const cands = [];
  for (const a of calc.activeAspects || []) {
    if (a.scope && a.scope !== "transit_natal") continue;
    if (!natal[a.natal] || !PLANET_W[a.transit] || !ASPECT_W[a.aspect]) continue;
    if (a.natal === "Moon" && calc.natalMoonReliable === false) continue;
    const limit = Number(a.orbLimitDeg) || 6, orb = Number(a.orbDeg);
    if (!Number.isFinite(orb) || orb > limit) continue;
    const orbF = Math.max(0, 1 - orb / limit) ** 1.3;
    const stateF = a.state === "applying" ? 1 : a.state === "stationary" ? 1.05 : 0.72;
    const exact = exactToday.has(a.transit + ":" + a.aspect + ":" + a.natal);
    const score = PLANET_W[a.transit] * (NATAL_W[a.natal] || 0.7) * ASPECT_W[a.aspect] * orbF * stateF * (exact ? 1.3 : 1);
    const tHouse = houseKnown ? (calc.transitingPlanets?.[a.transit]?.natalHouse ?? null) : null;
    const nHouse = houseKnown ? natalHouseOf(natal[a.natal].longitude, cusps) : null;
    const domain = (tHouse && HOUSE_DOMAIN[tHouse]) || (nHouse && HOUSE_DOMAIN[nHouse]) || (a.transit === "Moon" ? PLANET_DOMAIN[a.natal] : PLANET_DOMAIN[a.natal] === "self" ? PLANET_DOMAIN[a.transit] : PLANET_DOMAIN[a.natal]);
    cands.push({ id: factId(a), transit: a.transit, natal: a.natal, aspect: a.aspect, orbDeg: orb, state: a.state, exactToday: exact, transitHouse: tHouse, natalHouse: nHouse, domain, tone: TONE[a.aspect], score: Math.round(score * 1000) / 1000 });
  }
  cands.sort((x, y) => y.score - x.score);
  const themes = [];
  const MIN = 0.55;
  for (const c of cands) {
    if (c.score < MIN) break;
    const same = themes.find((t) => t.domain === c.domain);
    if (same) { if (same.facts.length < 2 && c.score >= same.score * 0.5) same.facts.push(c); continue; }
    if (themes.length === 0) themes.push({ domain: c.domain, score: c.score, facts: [c] });
    else if (themes.length === 1 && c.score >= themes[0].score * 0.6 && c.transit !== "Moon") themes.push({ domain: c.domain, score: c.score, facts: [c] });
    if (themes.length >= 2) break;
  }
  const top = themes[0]?.score || 0;
  const intensity = top >= 3.2 ? "strong" : top >= 1.4 ? "normal" : "quiet";
  const moon = calc.transitingMoon || {};
  const moonFact = { id: "m:moon", sign: moon.sign, house: houseKnown ? (moon.natalHouse ?? null) : null };
  const moonGuidance = selectMoonGuidance(calc);
  const events = (calc.dayEvents || []).filter((e) => ["new_moon", "full_moon", "planet_station", "planet_sign_ingress"].includes(e.type)).map((e) => ({ id: "e:" + e.type + ":" + (e.body || "") + ":" + (e.toSign || e.motion || e.sign || ""), ...e }));
  return { version: TOPICS_VERSION, intensity, themes, moon: moonFact, skyEvents: events.slice(0, 2), candidates: cands.slice(0, 8), houseKnown, moonGuidance };
}

// Компактное описание фактов для модели (без персональных данных).
export function factsForPrompt(sel) {
  const lines = [];
  for (const t of sel.themes) {
    lines.push("ТЕМА: " + t.domain + " — " + DOMAINS[t.domain]);
    for (const f of t.facts) {
      lines.push("  [" + f.id + "] транзитный " + PLANET_RU[f.transit] + " — " + ASPECT_RU[f.aspect] + " к натальной планете " + PLANET_RU[f.natal] + (f.exactToday ? " (точный аспект сегодня)" : f.state === "applying" ? " (сближается)" : " (расходится)") + (f.transitHouse ? ", транзит идёт по " + f.transitHouse + " дому" : "") + ".");
      lines.push("    смысл: " + PLANET_RU[f.transit] + " = " + MEANING[f.transit] + "; " + PLANET_RU[f.natal] + " = " + MEANING[f.natal] + "; " + ASPECT_RU[f.aspect] + " = " + ASPECT_MEANING[f.aspect] + ".");
    }
  }
  if (sel.moon?.sign) lines.push("[m:moon] Луна в расчёте " + SIGN_RU_IN[sel.moon.sign] + " — личный блок о её натальном доме и аспектах формирует программа. НЕ дублируй лунные рекомендации своими словами и НЕ придумывай событий.");
  for (const e of sel.skyEvents) lines.push("[" + e.id + "] событие неба: " + e.type + " " + (PLANET_RU[e.body] || "") + " " + (e.toSign ? SIGN_RU_IN[e.toSign] : e.motion || ""));
  return lines.join("\n");
}

export function allowedPlanets(sel) {
  const s = new Set(["Moon"]);
  for (const t of sel.themes) for (const f of t.facts) { s.add(f.transit); s.add(f.natal); }
  for (const e of sel.skyEvents) if (e.body) s.add(e.body);
  if ((sel.skyEvents || []).some((e) => e.type === "new_moon" || e.type === "full_moon")) s.add("Sun");
  return s;
}
