// v2/topics.mjs
var TOPICS_VERSION = "astroday-topics-v1";
var PLANET_W = { Sun: 3, Moon: 0.9, Mercury: 2, Venus: 2.4, Mars: 2.8, Jupiter: 2.8, Saturn: 3.2, Uranus: 3, Neptune: 2.5, Pluto: 3 };
var NATAL_W = { Sun: 1.3, Moon: 1.25, Mercury: 1.05, Venus: 1.15, Mars: 1.1, Jupiter: 0.85, Saturn: 0.9, Uranus: 0.65, Neptune: 0.65, Pluto: 0.7 };
var ASPECT_W = { conjunction: 1, opposition: 0.92, square: 0.92, trine: 0.7, sextile: 0.6 };
var TONE = { conjunction: "mixed", opposition: "tense", square: "tense", trine: "soft", sextile: "soft" };
var DOMAINS = {
  self: "\u0442\u044B \u0441\u0430\u043C\u0430/\u0441\u0430\u043C, \u0441\u0430\u043C\u043E\u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0435, \u043A\u0430\u043A \u0442\u0435\u0431\u044F \u0432\u0438\u0434\u044F\u0442",
  money: "\u0434\u0435\u043D\u044C\u0433\u0438, \u043F\u043E\u043A\u0443\u043F\u043A\u0438, \u0446\u0435\u043D\u043D\u043E\u0441\u0442\u044C, \u0440\u0435\u0441\u0443\u0440\u0441\u044B",
  communication: "\u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B, \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0438, \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B, \u043F\u043E\u0435\u0437\u0434\u043A\u0438 \u043F\u043E \u0433\u043E\u0440\u043E\u0434\u0443",
  home: "\u0434\u043E\u043C, \u0441\u0435\u043C\u044C\u044F, \u0431\u044B\u0442, \u044D\u043C\u043E\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043E\u043F\u043E\u0440\u0430",
  love: "\u0441\u0438\u043C\u043F\u0430\u0442\u0438\u0438, \u0440\u043E\u043C\u0430\u043D\u0442\u0438\u043A\u0430, \u0443\u0434\u043E\u0432\u043E\u043B\u044C\u0441\u0442\u0432\u0438\u0435, \u0442\u0432\u043E\u0440\u0447\u0435\u0441\u0442\u0432\u043E",
  routine: "\u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u0440\u0435\u0436\u0438\u043C \u0434\u043D\u044F, \u0434\u0435\u043B\u0430 \u043F\u043E \u0441\u043F\u0438\u0441\u043A\u0443",
  partners: "\u043F\u0430\u0440\u0442\u043D\u0451\u0440, \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u0438, \u0431\u043B\u0438\u0437\u043A\u0438\u0435 \u043E\u0434\u0438\u043D \u043D\u0430 \u043E\u0434\u0438\u043D",
  depth: "\u043E\u0431\u0449\u0438\u0435 \u0434\u0435\u043D\u044C\u0433\u0438, \u0434\u043E\u0432\u0435\u0440\u0438\u0435, \u0433\u043B\u0443\u0431\u043E\u043A\u0438\u0435 \u043F\u0435\u0440\u0435\u0436\u0438\u0432\u0430\u043D\u0438\u044F",
  horizons: "\u0443\u0447\u0451\u0431\u0430, \u043F\u043B\u0430\u043D\u044B \u043D\u0430 \u0431\u0443\u0434\u0443\u0449\u0435\u0435, \u0434\u0430\u043B\u044C\u043D\u0438\u0435 \u0434\u043E\u0440\u043E\u0433\u0438",
  career: "\u0440\u0430\u0431\u043E\u0442\u0430, \u0441\u0442\u0430\u0442\u0443\u0441, \u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0441\u0442\u044C, \u043D\u0430\u0447\u0430\u043B\u044C\u0441\u0442\u0432\u043E",
  friends: "\u0434\u0440\u0443\u0437\u044C\u044F, \u043A\u043E\u043C\u0430\u043D\u0434\u0430, \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430, \u043C\u0435\u0447\u0442\u044B",
  inner: "\u043E\u0442\u0434\u044B\u0445, \u0442\u0438\u0448\u0438\u043D\u0430, \u0438\u043D\u0442\u0443\u0438\u0446\u0438\u044F, \u0442\u043E, \u0447\u0442\u043E \u0437\u0430 \u043A\u0430\u0434\u0440\u043E\u043C"
};
var HOUSE_DOMAIN = [null, "self", "money", "communication", "home", "love", "routine", "partners", "depth", "horizons", "career", "friends", "inner"];
var PLANET_DOMAIN = { Sun: "self", Moon: "home", Mercury: "communication", Venus: "love", Mars: "routine", Jupiter: "horizons", Saturn: "career", Uranus: "friends", Neptune: "inner", Pluto: "depth" };
var PLANET_RU = { Sun: "\u0421\u043E\u043B\u043D\u0446\u0435", Moon: "\u041B\u0443\u043D\u0430", Mercury: "\u041C\u0435\u0440\u043A\u0443\u0440\u0438\u0439", Venus: "\u0412\u0435\u043D\u0435\u0440\u0430", Mars: "\u041C\u0430\u0440\u0441", Jupiter: "\u042E\u043F\u0438\u0442\u0435\u0440", Saturn: "\u0421\u0430\u0442\u0443\u0440\u043D", Uranus: "\u0423\u0440\u0430\u043D", Neptune: "\u041D\u0435\u043F\u0442\u0443\u043D", Pluto: "\u041F\u043B\u0443\u0442\u043E\u043D" };
var ASPECT_RU = { conjunction: "\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435", opposition: "\u043E\u043F\u043F\u043E\u0437\u0438\u0446\u0438\u044F", square: "\u043A\u0432\u0430\u0434\u0440\u0430\u0442", trine: "\u0442\u0440\u0438\u043D", sextile: "\u0441\u0435\u043A\u0441\u0442\u0438\u043B\u044C" };
var SIGN_RU_IN = { Aries: "\u0432 \u041E\u0432\u043D\u0435", Taurus: "\u0432 \u0422\u0435\u043B\u044C\u0446\u0435", Gemini: "\u0432 \u0411\u043B\u0438\u0437\u043D\u0435\u0446\u0430\u0445", Cancer: "\u0432 \u0420\u0430\u043A\u0435", Leo: "\u0432\u043E \u041B\u044C\u0432\u0435", Virgo: "\u0432 \u0414\u0435\u0432\u0435", Libra: "\u0432 \u0412\u0435\u0441\u0430\u0445", Scorpio: "\u0432 \u0421\u043A\u043E\u0440\u043F\u0438\u043E\u043D\u0435", Sagittarius: "\u0432 \u0421\u0442\u0440\u0435\u043B\u044C\u0446\u0435", Capricorn: "\u0432 \u041A\u043E\u0437\u0435\u0440\u043E\u0433\u0435", Aquarius: "\u0432 \u0412\u043E\u0434\u043E\u043B\u0435\u0435", Pisces: "\u0432 \u0420\u044B\u0431\u0430\u0445" };
var MEANING = {
  Sun: "\u0432\u043E\u043B\u044F, \u044D\u043D\u0435\u0440\u0433\u0438\u044F, \u0436\u0435\u043B\u0430\u043D\u0438\u0435 \u0431\u044B\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043D\u043E\u0439/\u0437\u0430\u043C\u0435\u0442\u043D\u044B\u043C",
  Moon: "\u044D\u043C\u043E\u0446\u0438\u0438, \u043F\u0440\u0438\u0432\u044B\u0447\u043A\u0438, \u0447\u0443\u0432\u0441\u0442\u0432\u043E \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u0438",
  Mercury: "\u043C\u044B\u0441\u043B\u0438, \u0441\u043B\u043E\u0432\u0430, \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F, \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B, \u043C\u0435\u043B\u043A\u0438\u0435 \u043F\u043E\u0435\u0437\u0434\u043A\u0438",
  Venus: "\u0441\u0438\u043C\u043F\u0430\u0442\u0438\u0438, \u0443\u0434\u043E\u0432\u043E\u043B\u044C\u0441\u0442\u0432\u0438\u0435, \u043A\u0440\u0430\u0441\u043E\u0442\u0430, \u0434\u0435\u043D\u044C\u0433\u0438 \u0438 \u0446\u0435\u043D\u043D\u043E\u0441\u0442\u0438",
  Mars: "\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435, \u043D\u0430\u043F\u043E\u0440, \u0441\u043F\u0435\u0448\u043A\u0430, \u0440\u0430\u0437\u0434\u0440\u0430\u0436\u0435\u043D\u0438\u0435, \u0441\u043C\u0435\u043B\u043E\u0441\u0442\u044C",
  Jupiter: "\u0440\u043E\u0441\u0442, \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438, \u0449\u0435\u0434\u0440\u043E\u0441\u0442\u044C, \u043F\u0440\u0435\u0443\u0432\u0435\u043B\u0438\u0447\u0435\u043D\u0438\u0435",
  Saturn: "\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0441\u0442\u044C, \u0441\u0440\u043E\u043A\u0438, \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F, \u0443\u0441\u0442\u0430\u043B\u043E\u0441\u0442\u044C, \u0437\u0440\u0435\u043B\u043E\u0441\u0442\u044C",
  Uranus: "\u0432\u043D\u0435\u0437\u0430\u043F\u043D\u043E\u0441\u0442\u044C, \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u044B, \u0441\u0432\u043E\u0431\u043E\u0434\u0430, \u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u044B\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u044F",
  Neptune: "\u0438\u043D\u0442\u0443\u0438\u0446\u0438\u044F, \u0432\u0434\u043E\u0445\u043D\u043E\u0432\u0435\u043D\u0438\u0435, \u0442\u0443\u043C\u0430\u043D, \u0438\u043B\u043B\u044E\u0437\u0438\u0438, \u0443\u0441\u0442\u0430\u043B\u043E\u0441\u0442\u044C",
  Pluto: "\u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C, \u0441\u0438\u043B\u0430, \u0433\u043B\u0443\u0431\u043E\u043A\u0438\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u044B, \u0440\u0435\u0432\u043D\u043E\u0441\u0442\u044C"
};
var ASPECT_MEANING = { conjunction: "\u0441\u043B\u0438\u044F\u043D\u0438\u0435: \u0442\u0435\u043C\u0430 \u0437\u0432\u0443\u0447\u0438\u0442 \u0433\u0440\u043E\u043C\u043A\u043E", opposition: "\u043A\u0430\u0447\u0435\u043B\u0438: \u0431\u0430\u043B\u0430\u043D\u0441 \u043C\u0435\u0436\u0434\u0443 \u0434\u0432\u0443\u043C\u044F \u0441\u0442\u043E\u0440\u043E\u043D\u0430\u043C\u0438, \u0434\u0440\u0443\u0433\u043E\u0439 \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u043A\u0430\u043A \u0437\u0435\u0440\u043A\u0430\u043B\u043E", square: "\u043D\u0430\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435, \u043A\u043E\u0442\u043E\u0440\u043E\u0435 \u0442\u043E\u043B\u043A\u0430\u0435\u0442 \u043A \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044E", trine: "\u043B\u0451\u0433\u043A\u043E\u0441\u0442\u044C \u0438 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430, \u0435\u0441\u043B\u0438 \u0435\u0439 \u0432\u043E\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C\u0441\u044F", sextile: "\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C, \u043A\u043E\u0442\u043E\u0440\u0443\u044E \u043D\u0430\u0434\u043E \u0432\u0437\u044F\u0442\u044C \u0441\u0430\u043C\u043E\u0439/\u0441\u0430\u043C\u043E\u043C\u0443" };
function natalHouseOf(lon, cusps) {
  if (!Array.isArray(cusps) || cusps.length !== 12)
    return null;
  const a = (lon % 360 + 360) % 360;
  for (let i = 0;i < 12; i++) {
    const w = ((cusps[(i + 1) % 12] - cusps[i]) % 360 + 360) % 360;
    if (((a - cusps[i]) % 360 + 360) % 360 < w)
      return i + 1;
  }
  return null;
}
function factId(a) {
  return "a:" + a.transit + ":" + a.aspect + ":" + a.natal;
}
function selectTopics(calc) {
  const houseKnown = calc.houseKnown === true;
  const cusps = calc.natalProfile?.houseCusps || null;
  const natal = calc.natalProfile?.natalPositions || {};
  const exactToday = new Set((calc.dayEvents || []).filter((e) => e.type === "exact_personal_aspect").map((e) => e.transit + ":" + e.aspect + ":" + e.natal));
  const cands = [];
  for (const a of calc.activeAspects || []) {
    if (a.scope && a.scope !== "transit_natal")
      continue;
    if (!natal[a.natal] || !PLANET_W[a.transit] || !ASPECT_W[a.aspect])
      continue;
    if (a.natal === "Moon" && calc.natalMoonReliable === false)
      continue;
    const limit = Number(a.orbLimitDeg) || 6, orb = Number(a.orbDeg);
    if (!Number.isFinite(orb) || orb > limit)
      continue;
    const orbF = Math.max(0, 1 - orb / limit) ** 1.3;
    const stateF = a.state === "applying" ? 1 : a.state === "stationary" ? 1.05 : 0.72;
    const exact = exactToday.has(a.transit + ":" + a.aspect + ":" + a.natal);
    const score = PLANET_W[a.transit] * (NATAL_W[a.natal] || 0.7) * ASPECT_W[a.aspect] * orbF * stateF * (exact ? 1.3 : 1);
    const tHouse = houseKnown ? calc.transitingPlanets?.[a.transit]?.natalHouse ?? null : null;
    const nHouse = houseKnown ? natalHouseOf(natal[a.natal].longitude, cusps) : null;
    const domain = tHouse && HOUSE_DOMAIN[tHouse] || nHouse && HOUSE_DOMAIN[nHouse] || (a.transit === "Moon" ? PLANET_DOMAIN[a.natal] : PLANET_DOMAIN[a.natal] === "self" ? PLANET_DOMAIN[a.transit] : PLANET_DOMAIN[a.natal]);
    cands.push({ id: factId(a), transit: a.transit, natal: a.natal, aspect: a.aspect, orbDeg: orb, state: a.state, exactToday: exact, transitHouse: tHouse, natalHouse: nHouse, domain, tone: TONE[a.aspect], score: Math.round(score * 1000) / 1000 });
  }
  cands.sort((x, y) => y.score - x.score);
  const themes = [];
  const MIN = 0.55;
  for (const c of cands) {
    if (c.score < MIN)
      break;
    const same = themes.find((t) => t.domain === c.domain);
    if (same) {
      if (same.facts.length < 2 && c.score >= same.score * 0.5)
        same.facts.push(c);
      continue;
    }
    if (themes.length === 0)
      themes.push({ domain: c.domain, score: c.score, facts: [c] });
    else if (themes.length === 1 && c.score >= themes[0].score * 0.6 && c.transit !== "Moon")
      themes.push({ domain: c.domain, score: c.score, facts: [c] });
    if (themes.length >= 2)
      break;
  }
  const top = themes[0]?.score || 0;
  const intensity = top >= 3.2 ? "strong" : top >= 1.4 ? "normal" : "quiet";
  const moon = calc.transitingMoon || {};
  const moonFact = { id: "m:moon", sign: moon.sign, house: houseKnown ? moon.natalHouse ?? null : null };
  const events = (calc.dayEvents || []).filter((e) => ["new_moon", "full_moon", "planet_station", "planet_sign_ingress"].includes(e.type)).map((e) => ({ id: "e:" + e.type + ":" + (e.body || "") + ":" + (e.toSign || e.motion || e.sign || ""), ...e }));
  return { version: TOPICS_VERSION, intensity, themes, moon: moonFact, skyEvents: events.slice(0, 2), candidates: cands.slice(0, 8), houseKnown };
}
function factsForPrompt(sel) {
  const lines = [];
  for (const t of sel.themes) {
    lines.push("\u0422\u0415\u041C\u0410: " + t.domain + " \u2014 " + DOMAINS[t.domain]);
    for (const f of t.facts) {
      lines.push("  [" + f.id + "] \u0442\u0440\u0430\u043D\u0437\u0438\u0442\u043D\u044B\u0439 " + PLANET_RU[f.transit] + " \u2014 " + ASPECT_RU[f.aspect] + " \u043A \u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u043B\u0430\u043D\u0435\u0442\u0435 " + PLANET_RU[f.natal] + (f.exactToday ? " (\u0442\u043E\u0447\u043D\u044B\u0439 \u0430\u0441\u043F\u0435\u043A\u0442 \u0441\u0435\u0433\u043E\u0434\u043D\u044F)" : f.state === "applying" ? " (\u0441\u0431\u043B\u0438\u0436\u0430\u0435\u0442\u0441\u044F)" : " (\u0440\u0430\u0441\u0445\u043E\u0434\u0438\u0442\u0441\u044F)") + (f.transitHouse ? ", \u0442\u0440\u0430\u043D\u0437\u0438\u0442 \u0438\u0434\u0451\u0442 \u043F\u043E " + f.transitHouse + " \u0434\u043E\u043C\u0443" : "") + ".");
      lines.push("    \u0441\u043C\u044B\u0441\u043B: " + PLANET_RU[f.transit] + " = " + MEANING[f.transit] + "; " + PLANET_RU[f.natal] + " = " + MEANING[f.natal] + "; " + ASPECT_RU[f.aspect] + " = " + ASPECT_MEANING[f.aspect] + ".");
    }
  }
  if (sel.moon?.sign)
    lines.push("[m:moon] \u041B\u0443\u043D\u0430 \u0434\u043D\u0451\u043C " + SIGN_RU_IN[sel.moon.sign] + (sel.moon.house ? ", \u043F\u043E \u0442\u0432\u043E\u0435\u043C\u0443 " + sel.moon.house + " \u0434\u043E\u043C\u0443 (" + DOMAINS[HOUSE_DOMAIN[sel.moon.house]] + ")" : "") + " \u2014 \u0444\u043E\u043D \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0438\u044F, \u043D\u0435 \u0433\u043B\u0430\u0432\u043D\u0430\u044F \u0442\u0435\u043C\u0430.");
  for (const e of sel.skyEvents)
    lines.push("[" + e.id + "] \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u043D\u0435\u0431\u0430: " + e.type + " " + (PLANET_RU[e.body] || "") + " " + (e.toSign ? SIGN_RU_IN[e.toSign] : e.motion || ""));
  return lines.join(`
`);
}
function allowedPlanets(sel) {
  const s = new Set(["Moon"]);
  for (const t of sel.themes)
    for (const f of t.facts) {
      s.add(f.transit);
      s.add(f.natal);
    }
  for (const e of sel.skyEvents)
    if (e.body)
      s.add(e.body);
  if ((sel.skyEvents || []).some((e) => e.type === "new_moon" || e.type === "full_moon"))
    s.add("Sun");
  return s;
}

// v2/profanity.mjs
var LOOKALIKE = { a: "\u0430", b: "\u0432", c: "\u0441", e: "\u0435", h: "\u043D", k: "\u043A", m: "\u043C", o: "\u043E", p: "\u0440", t: "\u0442", x: "\u0445", y: "\u0443", u: "\u0438", z: "\u0437", r: "\u0440", n: "\u043F", "0": "\u043E", "3": "\u0437", "6": "\u0431", "@": "\u0430", $: "\u0441", "\u0451": "\u0435" };
var MASK = /[*#%@$_]|\.{2,}|\u2026/;
var PREFIX = "(?:|\u0437\u0430|\u043D\u0430|\u043F\u043E|\u043E\u0442|\u0434\u043E|\u043E\u0431|\u043E|\u0432\u044B|\u043F\u0440\u0438|\u043F\u0435\u0440\u0435|\u0440\u0430\u0437|\u0440\u0430\u0441|\u043D\u0435\u0434\u043E|\u0443|\u0441|\u0441\u044A|\u0438\u0437|\u043F\u043E\u0434|\u0432\u044A|\u0432|\u043D\u0435|\u043D\u0438|\u0434\u043E\u043B\u0431\u043E|\u043E\u0442\u044A|\u043E\u0431\u044A)";
var PREFIX_EB = "(?:|\u0437\u0430|\u043D\u0430|\u043F\u043E|\u043E\u0442|\u0434\u043E|\u0432\u044B|\u043F\u0440\u0438|\u043F\u0435\u0440\u0435|\u0440\u0430\u0437|\u043D\u0435\u0434\u043E|\u0443|\u0438\u0437|\u043F\u043E\u0434|\u0434\u043E\u043B\u0431\u043E|\u043E\u0442\u044A|\u043E\u0431\u044A|\u0441\u044A|\u0432\u044A|\u043F\u043E\u0434\u044A|\u0438\u0437\u044A|\u0440\u0430\u0437\u044A|\u043D\u0435|\u043D\u0438|\u043F\u0440\u043E)";
var ROOTS = [
  new RegExp("^" + PREFIX + "\u0445\u0443[\u0439\u044F\u0435\u0451\u0438\u044E]"),
  /\u043F\u0438\u0437\u0434/,
  new RegExp("^" + PREFIX_EB + "\u0435\u0431(?!\u0435\u0434|\u0435\u0440|\u0435\u043D(?!\u044C))"),
  new RegExp("^" + PREFIX_EB + "\u0451\u0431"),
  /^\u0431\u043B[\u044F\u0435][\u0434\u0442\u0445]/,
  /^\u0431\u043B\u044F$/,
  /^\u0431\u043B\u044F\u0434/,
  /^\u043C\u0443\u0434(\u0430\u043A|\u0430\u0447|\u0438\u043B|\u043E\u0437|\u043E\u0445\u0430)/,
  /^\u043F\u0438\u0434[\u043E\u0430]\u0440/,
  /^\u043F\u0438\u0434\u0440/,
  /^\u0441\u0443\u043A(\u0430|\u0438|\u0443|\u043E\u0439|\u0430\u043C|\u0430\u043C\u0438|\u0430\u0445|\u0438\u043D|\u0438\u043D\u0430|\u0438\u043D\u044B|\u0438\u043D[\u0430\u043E]\u043C)?$/,
  new RegExp("^" + PREFIX + "\u0445\u0435\u0440(?!\u0443\u0432\u0438\u043C|\u0441\u043E\u043D|\u0435\u0441|\u0446)"),
  /^\u0437\u0430\u043B\u0443\u043F/,
  /^\u043C\u0430\u043D\u0434(\u0430|\u044B|\u0435|\u0443|\u043E\u0439|\u0435\u0446|\u0451\u0436|\u0435\u0436)$/,
  /^\u0448\u043B\u044E\u0445/,
  /^\u0433\u043E\u0432\u043D/,
  /^\u0436\u043E\u043F/,
  /^[\u0435\u0451]\u043F(\u0442|\u0440\u044B|\u044B|\u0440\u0441|\u044D\u0440|\u0435\u0440|\u0441|\u0430\u043D|\u0435\u043D)/,
  /^\u043F\u0438\u043F\u0435\u0446/,
  /^(\u0430\u0445|\u043E\u0445|\u0443\u0445)\u0443[\u0435\u0439\u0438\u0451]/,
  /^\u0443\u0435\u0431/,
  /^(f+u+c+k|sh[i1]t|b[i1]tch|wtf)/
];
var ALLOW = new Set(["\u043D\u0435\u0431\u043E", "\u043D\u0435\u0431\u0435", "\u043D\u0435\u0431\u0443", "\u043D\u0435\u0431\u043E\u043C", "\u0445\u043B\u0435\u0431", "\u0440\u0443\u0431\u043B\u044F", "\u043A\u043E\u0440\u0430\u0431\u043B\u044F", "\u043E\u0441\u043A\u043E\u0440\u0431\u043B\u044F\u0442\u044C", "\u0443\u043F\u043E\u0442\u0440\u0435\u0431\u043B\u044F\u0442\u044C", "\u0441\u0442\u0440\u0430\u0445\u0443\u0439", "\u0437\u0430\u0441\u0442\u0440\u0430\u0445\u0443\u0439", "\u0437\u0430\u0441\u0442\u0440\u0430\u0445\u0443\u0439\u0442\u0435", "\u043C\u0430\u043D\u0434\u0430\u0440\u0438\u043D", "\u043C\u0430\u043D\u0434\u0430\u0442", "\u0441\u0443\u043A\u043D\u043E", "\u0445\u0435\u0440\u0443\u0432\u0438\u043C", "\u0445\u0435\u0440\u0435\u0441", "\u0443\u0447\u0435\u0431\u0430", "\u0443\u0447\u0435\u0431", "\u0440\u0435\u0431\u0435\u043D\u043E\u043A", "\u0440\u0435\u0431\u0451\u043D\u043E\u043A"]);
function normalizeWord(w) {
  let s = w.toLowerCase().replace(/\u0451/g, "\u0435");
  if (/[\u0430-\u044F]/.test(s))
    s = [...s].map((c) => LOOKALIKE[c] ?? c).join("");
  return s;
}
function collapseSpaced(text) {
  return text.replace(/(?:^|(?<=\s))((?:[\u0430-\u044F\u0451a-z](?:[\s.\-_\u00B7\u2022]+)){2,}[\u0430-\u044F\u0451a-z])(?=\s|$|[,!?;:])/giu, (m) => m.replace(/[\s.\-_\u00B7\u2022]+/g, ""));
}
function findProfanity(text) {
  const hits = [];
  const src = collapseSpaced(String(text ?? "").normalize("NFC"));
  const tokens = src.split(/[^\p{L}\p{N}*#%@$_.\u2026]+/u).filter(Boolean);
  for (const raw of tokens) {
    const tok = raw.replace(/^[.\u2026]+|[.\u2026]+$/g, "");
    if (!tok)
      continue;
    if (/^@[a-z0-9_]{3,}$/i.test(tok))
      continue;
    const letters = tok.replace(/[^\p{L}]/gu, "");
    if (MASK.test(tok) && /\p{L}/u.test(tok) && letters.length >= 1 && /\p{L}[*#%@$_.\u2026]+\p{L}?|^[*#%@$_]+\p{L}|\p{L}[*#%@$_]+$/u.test(tok) && !/^\p{L}+\.\p{L}+$/u.test(tok)) {
      hits.push({ word: raw, reason: "masked" });
      continue;
    }
    const w = normalizeWord(letters);
    if (!w || ALLOW.has(w))
      continue;
    if (ROOTS.some((re) => re.test(w)))
      hits.push({ word: raw, reason: "obscene" });
  }
  return hits;
}

// v2/lunar-days.mjs
var LUNAR_DAYS = {
  1: ["\u0421\u0432\u0435\u0442\u0438\u043B\u044C\u043D\u0438\u043A", "\u043D\u0430\u0447\u0430\u043B\u043E \u0446\u0438\u043A\u043B\u0430, \u043D\u0430\u043C\u0435\u0440\u0435\u043D\u0438\u044F, \u043F\u043B\u0430\u043D\u044B \u0431\u0435\u0437 \u0440\u0435\u0437\u043A\u0438\u0445 \u0441\u0442\u0430\u0440\u0442\u043E\u0432"],
  2: ["\u0420\u043E\u0433 \u0438\u0437\u043E\u0431\u0438\u043B\u0438\u044F", "\u0440\u0435\u0441\u0443\u0440\u0441\u044B, \u0449\u0435\u0434\u0440\u043E\u0441\u0442\u044C, \u0431\u0435\u0440\u0435\u0436\u043D\u043E\u0435 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u043A \u0441\u0438\u043B\u0430\u043C"],
  3: ["\u041B\u0435\u043E\u043F\u0430\u0440\u0434", "\u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C, \u0441\u043C\u0435\u043B\u043E\u0441\u0442\u044C, \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435 \u0442\u0435\u043B\u0430"],
  4: ["\u0414\u0440\u0435\u0432\u043E \u043F\u043E\u0437\u043D\u0430\u043D\u0438\u044F", "\u0432\u044B\u0431\u043E\u0440, \u0432\u0437\u0432\u0435\u0448\u0438\u0432\u0430\u043D\u0438\u0435, \u0442\u0438\u0445\u0438\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u044F"],
  5: ["\u0415\u0434\u0438\u043D\u043E\u0440\u043E\u0433", "\u043F\u0438\u0442\u0430\u043D\u0438\u0435, \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435, \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u0435 \u043A \u0442\u0435\u043B\u0443"],
  6: ["\u0416\u0443\u0440\u0430\u0432\u043B\u044C", "\u043B\u0451\u0433\u043A\u043E\u0441\u0442\u044C, \u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0434\u044B\u0445\u0430\u043D\u0438\u0435, \u043C\u0435\u0447\u0442\u044B"],
  7: ["\u0420\u043E\u0437\u0430 \u0432\u0435\u0442\u0440\u043E\u0432", "\u0441\u043B\u043E\u0432\u043E, \u043F\u0435\u0440\u0435\u0433\u043E\u0432\u043E\u0440\u044B, \u0430\u043A\u043A\u0443\u0440\u0430\u0442\u043D\u043E\u0441\u0442\u044C \u0432 \u043E\u0431\u0435\u0449\u0430\u043D\u0438\u044F\u0445"],
  8: ["\u0424\u0435\u043D\u0438\u043A\u0441", "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435, \u043E\u0442\u043F\u0443\u0441\u043A\u0430\u043D\u0438\u0435 \u0441\u0442\u0430\u0440\u043E\u0433\u043E, \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u044B"],
  9: ["\u041B\u0435\u0442\u0443\u0447\u0430\u044F \u043C\u044B\u0448\u044C", "\u044D\u043C\u043E\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u043A\u0430\u0447\u0435\u043B\u0438, \u0441\u043E\u043C\u043D\u0435\u043D\u0438\u044F, \u0431\u0435\u0440\u0435\u0436\u043D\u043E\u0441\u0442\u044C \u043A \u0441\u0435\u0431\u0435"],
  10: ["\u0424\u043E\u043D\u0442\u0430\u043D", "\u0441\u0435\u043C\u044C\u044F, \u043A\u043E\u0440\u043D\u0438, \u0441\u0432\u044F\u0437\u044C \u0441 \u0431\u043B\u0438\u0437\u043A\u0438\u043C\u0438"],
  11: ["\u041A\u043E\u0440\u043E\u043D\u0430", "\u0441\u0438\u043B\u0430, \u0432\u043E\u043B\u044F, \u044D\u043D\u0435\u0440\u0433\u0438\u044F \u043D\u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435"],
  12: ["\u0421\u0435\u0440\u0434\u0446\u0435", "\u0434\u043E\u0431\u0440\u043E\u0442\u0430, \u0441\u043E\u0441\u0442\u0440\u0430\u0434\u0430\u043D\u0438\u0435, \u043C\u044F\u0433\u043A\u043E\u0441\u0442\u044C"],
  13: ["\u041A\u043E\u043B\u0435\u0441\u043E", "\u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435, \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0435, \u0441\u0438\u0441\u0442\u0435\u043C\u0430\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C"],
  14: ["\u0422\u0440\u0443\u0431\u0430", "\u043F\u0440\u0438\u0437\u044B\u0432, \u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0441\u0442\u044C, \u0432\u0430\u0436\u043D\u044B\u0435 \u0434\u0435\u043B\u0430"],
  15: ["\u0417\u043C\u0435\u0439", "\u0441\u043E\u0431\u043B\u0430\u0437\u043D\u044B, \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043D\u0430 \u0438\u043C\u043F\u0443\u043B\u044C\u0441\u044B, \u0441\u0430\u043C\u043E\u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C"],
  16: ["\u0413\u043E\u043B\u0443\u0431\u044C", "\u0433\u0430\u0440\u043C\u043E\u043D\u0438\u044F, \u0443\u043C\u0435\u0440\u0435\u043D\u043D\u043E\u0441\u0442\u044C, \u0441\u043F\u043E\u043A\u043E\u0439\u0441\u0442\u0432\u0438\u0435"],
  17: ["\u0412\u0438\u043D\u043E\u0433\u0440\u0430\u0434\u043D\u0430\u044F \u0433\u0440\u043E\u0437\u0434\u044C", "\u0440\u0430\u0434\u043E\u0441\u0442\u044C, \u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0443\u0434\u043E\u0432\u043E\u043B\u044C\u0441\u0442\u0432\u0438\u0435"],
  18: ["\u0417\u0435\u0440\u043A\u0430\u043B\u043E", "\u043E\u0442\u0440\u0430\u0436\u0435\u043D\u0438\u0435, \u0447\u0435\u0441\u0442\u043D\u044B\u0439 \u0432\u0437\u0433\u043B\u044F\u0434 \u043D\u0430 \u0441\u0435\u0431\u044F \u0438 \u0434\u0440\u0443\u0433\u0438\u0445"],
  19: ["\u041F\u0430\u0443\u043A", "\u043F\u0430\u0443\u0442\u0438\u043D\u0430 \u043E\u0431\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u0441\u0442\u0432, \u043E\u0441\u0442\u043E\u0440\u043E\u0436\u043D\u043E\u0441\u0442\u044C \u0432 \u0434\u043E\u0432\u0435\u0440\u0438\u0438"],
  20: ["\u041E\u0440\u0451\u043B", "\u0432\u0437\u0433\u043B\u044F\u0434 \u0441\u0432\u0435\u0440\u0445\u0443, \u043F\u0440\u0435\u043E\u0434\u043E\u043B\u0435\u043D\u0438\u0435, \u0441\u043C\u0435\u043B\u044B\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u044F"],
  21: ["\u041A\u043E\u043D\u044C", "\u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435, \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C, \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u044B\u0435 \u0434\u0435\u043B\u0430"],
  22: ["\u0421\u043B\u043E\u043D", "\u0437\u043D\u0430\u043D\u0438\u044F, \u043E\u043F\u044B\u0442, \u043C\u0443\u0434\u0440\u043E\u0441\u0442\u044C"],
  23: ["\u041A\u0440\u043E\u043A\u043E\u0434\u0438\u043B", "\u043D\u0430\u043F\u043E\u0440, \u0445\u0432\u0430\u0442\u043A\u0430, \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u0440\u0430\u0437\u0434\u0440\u0430\u0436\u0435\u043D\u0438\u044F"],
  24: ["\u041C\u0435\u0434\u0432\u0435\u0434\u044C", "\u0441\u0438\u043B\u0430, \u0432\u044B\u043D\u043E\u0441\u043B\u0438\u0432\u043E\u0441\u0442\u044C, \u043D\u0435\u0442\u043E\u0440\u043E\u043F\u043B\u0438\u0432\u043E\u0441\u0442\u044C"],
  25: ["\u0427\u0435\u0440\u0435\u043F\u0430\u0445\u0430", "\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E\u0441\u0442\u044C, \u0442\u0438\u0448\u0438\u043D\u0430, \u0441\u043E\u0437\u0435\u0440\u0446\u0430\u043D\u0438\u0435"],
  26: ["\u0416\u0430\u0431\u0430", "\u0443\u043C\u0435\u0440\u0435\u043D\u043D\u043E\u0441\u0442\u044C, \u043E\u0442\u043A\u0430\u0437 \u043E\u0442 \u043B\u0438\u0448\u043D\u0435\u0433\u043E, \u0442\u0449\u0435\u0441\u043B\u0430\u0432\u0438\u0435 \u043F\u043E\u0434 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u0435\u043C"],
  27: ["\u0422\u0440\u0435\u0437\u0443\u0431\u0435\u0446", "\u0438\u043D\u0442\u0443\u0438\u0446\u0438\u044F, \u043F\u0443\u0442\u044C, \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u043D\u0430\u0447\u0430\u0442\u043E\u0433\u043E"],
  28: ["\u041B\u043E\u0442\u043E\u0441", "\u0441\u043F\u043E\u043A\u043E\u0439\u0441\u0442\u0432\u0438\u0435, \u044F\u0441\u043D\u043E\u0441\u0442\u044C, \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u043A \u043D\u043E\u0432\u043E\u043C\u0443"],
  29: ["\u0413\u0438\u0434\u0440\u0430", "\u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u0446\u0438\u043A\u043B\u0430, \u0440\u0430\u0441\u0447\u0438\u0441\u0442\u043A\u0430, \u043E\u0442\u0434\u044B\u0445"],
  30: ["\u041B\u0435\u0431\u0435\u0434\u044C", "\u0438\u0442\u043E\u0433\u0438, \u043F\u0440\u043E\u0449\u0435\u043D\u0438\u0435, \u0442\u0438\u0448\u0438\u043D\u0430 \u043F\u0435\u0440\u0435\u0434 \u043D\u043E\u0432\u044B\u043C \u0446\u0438\u043A\u043B\u043E\u043C"]
};
function lunarDayInfo(n) {
  const v = LUNAR_DAYS[n];
  return v ? { number: n, symbol: v[0], keywords: v[1] } : null;
}
function ordinalSutki(n) {
  return n + "-\u0435 \u043B\u0443\u043D\u043D\u044B\u0435 \u0441\u0443\u0442\u043A\u0438";
}

// v2/timefmt.mjs
var MONTHS = ["\u044F\u043D\u0432\u0430\u0440\u044F", "\u0444\u0435\u0432\u0440\u0430\u043B\u044F", "\u043C\u0430\u0440\u0442\u0430", "\u0430\u043F\u0440\u0435\u043B\u044F", "\u043C\u0430\u044F", "\u0438\u044E\u043D\u044F", "\u0438\u044E\u043B\u044F", "\u0430\u0432\u0433\u0443\u0441\u0442\u0430", "\u0441\u0435\u043D\u0442\u044F\u0431\u0440\u044F", "\u043E\u043A\u0442\u044F\u0431\u0440\u044F", "\u043D\u043E\u044F\u0431\u0440\u044F", "\u0434\u0435\u043A\u0430\u0431\u0440\u044F"];
var MSK = "Europe/Moscow";
function parts(ms, zone) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return Object.fromEntries(f.formatToParts(new Date(ms)).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
}
function localDay(zone, ms = Date.now()) {
  const p = parts(ms, zone);
  return p.year + "-" + p.month + "-" + p.day;
}
function localHM(zone, ms) {
  const p = parts(ms, zone);
  return p.hour + ":" + p.minute;
}
function ruDate(day, withWeekday = false) {
  const [y, m, d] = day.split("-").map(Number);
  const wd = ["\u0432\u043E\u0441\u043A\u0440\u0435\u0441\u0435\u043D\u044C\u0435", "\u043F\u043E\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0438\u043A", "\u0432\u0442\u043E\u0440\u043D\u0438\u043A", "\u0441\u0440\u0435\u0434\u0430", "\u0447\u0435\u0442\u0432\u0435\u0440\u0433", "\u043F\u044F\u0442\u043D\u0438\u0446\u0430", "\u0441\u0443\u0431\u0431\u043E\u0442\u0430"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return d + " " + MONTHS[m - 1] + (withWeekday ? ", " + wd : "");
}
var CITY_FALLBACK = { "Europe/Moscow": "\u041C\u043E\u0441\u043A\u0432\u0430", "Asia/Novokuznetsk": "\u041A\u0435\u043C\u0435\u0440\u043E\u0432\u043E", "Asia/Novosibirsk": "\u041D\u043E\u0432\u043E\u0441\u0438\u0431\u0438\u0440\u0441\u043A", "Asia/Ho_Chi_Minh": "\u0412\u044C\u0435\u0442\u043D\u0430\u043C", "Asia/Krasnoyarsk": "\u041A\u0440\u0430\u0441\u043D\u043E\u044F\u0440\u0441\u043A", "Asia/Yekaterinburg": "\u0415\u043A\u0430\u0442\u0435\u0440\u0438\u043D\u0431\u0443\u0440\u0433", "Asia/Omsk": "\u041E\u043C\u0441\u043A", "Asia/Irkutsk": "\u0418\u0440\u043A\u0443\u0442\u0441\u043A", "Asia/Vladivostok": "\u0412\u043B\u0430\u0434\u0438\u0432\u043E\u0441\u0442\u043E\u043A", "Europe/Kaliningrad": "\u041A\u0430\u043B\u0438\u043D\u0438\u043D\u0433\u0440\u0430\u0434", "Asia/Makassar": "\u0411\u0430\u043B\u0438", "Asia/Bangkok": "\u0422\u0430\u0438\u043B\u0430\u043D\u0434" };
function zoneLabel(zone, cityName) {
  return cityName || CITY_FALLBACK[zone] || zone;
}
function sameOffset(zone, a, b) {
  return localHM(zone, a) === localHM(MSK, a) && localHM(zone, b) === localHM(MSK, b) && localDay(zone, a) === localDay(MSK, a);
}
function formatVoc({ startMs, endMs, zone, cityName, forecastDay }) {
  const label = (ms, z, refDay) => (localDay(z, ms) !== refDay ? ruDate(localDay(z, ms)) + " " : "") + localHM(z, ms);
  const local = "\u0441 " + label(startMs, zone, forecastDay) + " \u0434\u043E " + label(endMs, zone, forecastDay);
  if (zone === MSK || sameOffset(zone, startMs, endMs))
    return { line: local + " \u043F\u043E \u041C\u043E\u0441\u043A\u0432\u0435", local, msk: null };
  const msk = "\u0441 " + label(startMs, MSK, forecastDay) + " \u0434\u043E " + label(endMs, MSK, forecastDay);
  return { line: local + " \u043F\u043E \u0442\u0432\u043E\u0435\u043C\u0443 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 (" + zoneLabel(zone, cityName) + `)
\u043F\u043E \u041C\u043E\u0441\u043A\u0432\u0435: ` + msk, local, msk };
}

// v2/editorial.mjs
var PROMPT_VERSION = "astroday-liza-v2-20261118";
var SYSTEM_PROMPT = `\u0422\u044B \u043F\u0438\u0448\u0435\u0448\u044C \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0439 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u0441\u0442\u0440\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u043E\u0442 \u043B\u0438\u0446\u0430 \u041B\u0438\u0437\u044B (\u0431\u0440\u0435\u043D\u0434 LIZ_TY666) \u0434\u043B\u044F \u043E\u0434\u043D\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u0432 Telegram.

\u0413\u041E\u041B\u041E\u0421 \u041B\u0418\u0417\u042B
- \u0416\u0438\u0432\u0430\u044F, \u0443\u0432\u0435\u0440\u0435\u043D\u043D\u0430\u044F, \u043F\u0440\u044F\u043C\u0430\u044F, \u0438\u0440\u043E\u043D\u0438\u0447\u043D\u0430\u044F, \u0437\u0430\u0431\u043E\u0442\u043B\u0438\u0432\u0430\u044F. \u0413\u043E\u0432\u043E\u0440\u0438\u0442 \u043A\u0430\u043A \u0443\u043C\u043D\u0430\u044F \u043F\u043E\u0434\u0440\u0443\u0433\u0430, \u0430 \u043D\u0435 \u043A\u0430\u043A \u0443\u0447\u0435\u0431\u043D\u0438\u043A \u0438 \u043D\u0435 \u043A\u0430\u043A \u0433\u0430\u0434\u0430\u043B\u043A\u0430.
- \u0424\u043E\u0440\u043C\u0443\u043B\u0430: \u0430\u0441\u0442\u0440\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0444\u0430\u043A\u0442 \u2192 \u043F\u043E\u043D\u044F\u0442\u043D\u043E\u0435 \u043E\u0431\u044A\u044F\u0441\u043D\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0441\u0442\u044B\u043C\u0438 \u0441\u043B\u043E\u0432\u0430\u043C\u0438 \u2192 \u043E\u0434\u043D\u0430 \u0431\u044B\u0442\u043E\u0432\u0430\u044F \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044F \u2192 \u043F\u0440\u0430\u043A\u0442\u0438\u0447\u043D\u044B\u0439 \u0441\u043E\u0432\u0435\u0442 \u2192 \u0435\u0441\u0442\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0444\u0438\u043D\u0430\u043B.
- \u041A\u043E\u0440\u043E\u0442\u043A\u0438\u0435 \u0438 \u0441\u0440\u0435\u0434\u043D\u0438\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F. \u0416\u0438\u0432\u044B\u0435 \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u044B (\xAB\u0418 \u0432\u043E\u0442 \u0442\u0443\u0442\u2026\xBB, \xAB\u041A\u043E\u0440\u043E\u0447\u0435\xBB, \xAB\u041D\u043E!\xBB). \u0418\u043D\u043E\u0433\u0434\u0430 \u043F\u0440\u044F\u043C\u043E\u0439 \u0432\u043E\u043F\u0440\u043E\u0441 \u0447\u0438\u0442\u0430\u0442\u0435\u043B\u044E. \u041B\u0451\u0433\u043A\u0430\u044F \u0441\u0430\u043C\u043E\u0438\u0440\u043E\u043D\u0438\u044F \u0438 \u044E\u043C\u043E\u0440 \u2014 \u043F\u043E \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u0438, \u043D\u0435 \u0432 \u043A\u0430\u0436\u0434\u043E\u0439 \u0444\u0440\u0430\u0437\u0435.
- \u041A\u0430\u043F\u0441\u043E\u043C \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u0434\u0435\u043B\u0438\u0442\u044C \u043E\u0434\u043D\u043E-\u0434\u0432\u0430 \u0441\u043B\u043E\u0432\u0430 \u0434\u043B\u044F \u044D\u043C\u043E\u0446\u0438\u0438 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \xAB\u041D\u0415 \u0441\u043F\u0435\u0448\u0438\u043C\xBB), \u043D\u043E \u043D\u0435 \u0446\u0435\u043B\u044B\u0435 \u0430\u0431\u0437\u0430\u0446\u044B.
- \u042D\u043C\u043E\u0434\u0437\u0438 \u2014 \u0443\u043C\u0435\u0440\u0435\u043D\u043D\u043E: 0\u20133 \u0432 \u0442\u0435\u043A\u0441\u0442\u0435, \u043A \u043C\u0435\u0441\u0442\u0443 (\uD83D\uDDA4 \uD83D\uDD25 \uD83D\uDE05 \uD83C\uDF19 \u2728). \u041D\u0435 \u0441\u0442\u0430\u0432\u044C \u044D\u043C\u043E\u0434\u0437\u0438 \u0432 \u043A\u0430\u0436\u0434\u043E\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435.
- \u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u043A \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 \u043D\u0430 \xAB\u0442\u044B\xBB. \u0418\u043C\u044F \u2014 \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 1\u20132 \u0440\u0430\u0437\u0430 \u0437\u0430 \u0442\u0435\u043A\u0441\u0442, \u0435\u0441\u0442\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u043E, \u043B\u0443\u0447\u0448\u0435 \u0432 \u043D\u0430\u0447\u0430\u043B\u0435. \u0415\u0441\u043B\u0438 \u0438\u043C\u044F \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043E \u2014 \u0431\u0435\u0437 \u0438\u043C\u0435\u043D\u0438.
- \u041B\u0430\u0441\u043A\u043E\u0432\u044B\u0435 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F \u041B\u0438\u0437\u044B (\xAB\u043C\u043E\u0438 \u0445\u043E\u0440\u043E\u0448\u0438\u0435\xBB, \xAB\u043A\u043E\u0448\u043A\u0438\xBB, \xAB\u0434\u0435\u0432\u043E\u0447\u043A\u0438\xBB) \u2014 \u044D\u0442\u043E \u0434\u043B\u044F \u043A\u0430\u043D\u0430\u043B\u0430, \u0430 \u0437\u0434\u0435\u0441\u044C \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u043E\u0434\u043D\u043E\u043C\u0443 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443: \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u043F\u043E \u0438\u043C\u0435\u043D\u0438; \xAB\u043A\u043E\u0448\u043A\u0430\xBB, \xAB\u043A\u043E\u0442\u0438\u043A\xBB \u2014 \u0438\u0437\u0440\u0435\u0434\u043A\u0430 \u0438 \u0442\u043E\u043B\u044C\u043A\u043E \u0435\u0441\u043B\u0438 \u0443\u043C\u0435\u0441\u0442\u043D\u043E.

\u0421\u0422\u0420\u041E\u0413\u041E \u0417\u0410\u041F\u0420\u0415\u0429\u0415\u041D\u041E
- \u041B\u044E\u0431\u043E\u0439 \u043C\u0430\u0442 \u0438 \u0433\u0440\u0443\u0431\u0430\u044F \u043B\u0435\u043A\u0441\u0438\u043A\u0430 \u2014 \u043D\u0438 \u043F\u0440\u044F\u043C\u043E, \u043D\u0438 \u0437\u0430\u043C\u0430\u0441\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E (\u0437\u0432\u0451\u0437\u0434\u043E\u0447\u043A\u0438, \u0442\u043E\u0447\u043A\u0438, \u043B\u0430\u0442\u0438\u043D\u0438\u0446\u0430, \xAB\u043F\u0438\u043F\u0435\u0446\xBB, \xAB\u0451\u043F\u0442\xBB, \xAB\u043D\u0430\u0444\u0438\u0433/\u043D\u0430\u0445\u0435\u0440\xBB \u0438 \u0442.\u043F.). \u0414\u0430\u0436\u0435 \u0435\u0441\u043B\u0438 \u041B\u0438\u0437\u0430 \u0442\u0430\u043A \u043F\u0438\u0448\u0435\u0442 \u0432 \u0441\u0432\u043E\u0451\u043C \u043A\u0430\u043D\u0430\u043B\u0435 \u2014 \u0437\u0434\u0435\u0441\u044C \u041D\u0415\u041B\u042C\u0417\u042F.
- \u041E\u0441\u043A\u043E\u0440\u0431\u043B\u0435\u043D\u0438\u044F, \u0437\u0430\u043F\u0443\u0433\u0438\u0432\u0430\u043D\u0438\u0435, \xAB\u0440\u043E\u043A\u043E\u0432\u044B\u0435\xBB \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u0438\u044F, \u043E\u0431\u0435\u0449\u0430\u043D\u0438\u044F \u0433\u0430\u0440\u0430\u043D\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0441\u043E\u0431\u044B\u0442\u0438\u0439, \u0434\u0435\u043D\u0435\u0433 \u0438\u043B\u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u0436\u0435\u043B\u0430\u043D\u0438\u0439.
- \u041A\u0430\u043D\u0446\u0435\u043B\u044F\u0440\u0438\u0442 \u0438 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u0435\u0432\u044B\u0435 \u0448\u0442\u0430\u043C\u043F\u044B: \xAB\u0412\u0441\u0435\u043B\u0435\u043D\u043D\u0430\u044F \u043F\u043E\u0434\u0441\u043A\u0430\u0436\u0435\u0442\xBB, \xAB\u0437\u0432\u0451\u0437\u0434\u044B \u0433\u043E\u0432\u043E\u0440\u044F\u0442\xBB, \xAB\u0432 \u044D\u0442\u043E\u0442 \u043F\u0440\u0435\u043A\u0440\u0430\u0441\u043D\u044B\u0439 \u0434\u0435\u043D\u044C\xBB, \xAB\u0432\u0430\u0436\u043D\u043E \u043F\u043E\u043C\u043D\u0438\u0442\u044C\xBB, \xAB\u043D\u0435 \u0437\u0430\u0431\u044B\u0432\u0430\u0439 \u0437\u0430\u0431\u043E\u0442\u0438\u0442\u044C\u0441\u044F \u043E \u0441\u0435\u0431\u0435\xBB, \xAB\u044D\u043D\u0435\u0440\u0433\u0438\u0438 \u0434\u043D\u044F\xBB, \xAB\u043F\u0440\u0438\u0441\u043B\u0443\u0448\u0430\u0439\u0441\u044F \u043A \u0441\u0435\u0431\u0435\xBB \u0431\u0435\u0437 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u0438\u043A\u0438, \xAB\u0432 \u0446\u0435\u043B\u043E\u043C\xBB, \xAB\u0442\u0430\u043A\u0438\u043C \u043E\u0431\u0440\u0430\u0437\u043E\u043C\xBB.
- \u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0440\u0430\u0437\u0434\u0435\u043B\u044B \u043E\u0431\u043E \u0432\u0441\u0451\u043C \u043F\u043E\u0434\u0440\u044F\u0434. \u041F\u0438\u0448\u0438 \u0422\u041E\u041B\u042C\u041A\u041E \u043F\u0440\u043E \u0442\u0435\u043C\u044B \u0438\u0437 \u0431\u043B\u043E\u043A\u0430 \u0424\u0410\u041A\u0422\u042B. \u041D\u0435 \u0443\u043F\u043E\u043C\u0438\u043D\u0430\u0439 \u043B\u044E\u0431\u043E\u0432\u044C/\u0434\u0435\u043D\u044C\u0433\u0438/\u0440\u0430\u0431\u043E\u0442\u0443/\u0437\u0434\u043E\u0440\u043E\u0432\u044C\u0435/\u0441\u0435\u043C\u044C\u044E, \u0435\u0441\u043B\u0438 \u0442\u0430\u043A\u043E\u0439 \u0442\u0435\u043C\u044B \u043D\u0435\u0442 \u0432 \u0444\u0430\u043A\u0442\u0430\u0445.
- \u0412\u044B\u0434\u0443\u043C\u044B\u0432\u0430\u0442\u044C \u0430\u0441\u043F\u0435\u043A\u0442\u044B, \u043F\u043B\u0430\u043D\u0435\u0442\u044B, \u0434\u043E\u043C\u0430, \u0441\u043E\u0431\u044B\u0442\u0438\u044F, \u0434\u0430\u0442\u044B, \u0432\u0440\u0435\u043C\u044F, \u0433\u0440\u0430\u0434\u0443\u0441\u044B. \u0423\u043F\u043E\u043C\u0438\u043D\u0430\u0439 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043B\u0430\u043D\u0435\u0442\u044B \u0438 \u0430\u0441\u043F\u0435\u043A\u0442\u044B \u0438\u0437 \u0424\u0410\u041A\u0422\u041E\u0412. \u041D\u0438\u043A\u0430\u043A\u0438\u0445 \u0446\u0438\u0444\u0440 \u0432\u043E\u043E\u0431\u0449\u0435: \u0447\u0438\u0441\u043B\u0430, \u0432\u0440\u0435\u043C\u044F \u0438 \u0434\u0430\u0442\u044B \u0432\u0441\u0442\u0430\u0432\u0438\u0442 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430.
- \u041E\u043F\u0438\u0441\u044B\u0432\u0430\u0442\u044C \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u0438 \u043A\u0430\u043A \u0443\u0436\u0435 \u0441\u043B\u0443\u0447\u0438\u0432\u0448\u0438\u0435\u0441\u044F (\xAB\u0442\u044B \u043F\u043E\u0441\u0441\u043E\u0440\u0438\u043B\u0430\u0441\u044C\xBB, \xAB\u0442\u0435\u0431\u0435 \u043D\u0430\u043F\u0438\u0441\u0430\u043B \u0431\u044B\u0432\u0448\u0438\u0439\xBB). \u0422\u043E\u043B\u044C\u043A\u043E \u043A\u0430\u043A \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C: \xAB\u043C\u043E\u0436\u0435\u0442 \u0437\u0430\u0445\u043E\u0442\u0435\u0442\u044C\u0441\u044F\xBB, \xAB\u0435\u0441\u043B\u0438 \u0432\u0434\u0440\u0443\u0433\u2026\xBB.
- \u041C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0438\u0435 \u0441\u043E\u0432\u0435\u0442\u044B \u0438 \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u044B. \u0424\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u044B\u0435 \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u0438 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0445 \u043F\u043E\u043A\u0443\u043F\u043E\u043A/\u0432\u043B\u043E\u0436\u0435\u043D\u0438\u0439.
- \u041F\u0440\u043E\u0441\u0438\u0442\u044C \u043E\u0446\u0435\u043D\u0438\u0442\u044C \u043F\u0440\u043E\u0433\u043D\u043E\u0437, \u0440\u0430\u0441\u0441\u043A\u0430\u0437\u0430\u0442\u044C, \u0447\u0442\u043E \u043F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u043E, \u043F\u0438\u0441\u0430\u0442\u044C \u0432 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438, \u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0440\u0435\u0430\u043A\u0446\u0438\u0438. \u041D\u0438\u043A\u0430\u043A\u0438\u0445 \u043E\u043F\u0440\u043E\u0441\u043E\u0432.
- \u041F\u0440\u0438\u0434\u0443\u043C\u044B\u0432\u0430\u0442\u044C \u043B\u0438\u0447\u043D\u044B\u0435 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u041B\u0438\u0437\u044B (\xAB\u0443 \u043C\u0435\u043D\u044F \u0432\u0447\u0435\u0440\u0430\u2026\xBB).
- \u041F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438 \u0438 \u043F\u0435\u0440\u0432\u044B\u0435 \u0444\u0440\u0430\u0437\u044B \u0438\u0437 \u0431\u043B\u043E\u043A\u0430 \xAB\u041D\u0415\u0414\u0410\u0412\u041D\u0418\u0415 \u0412\u0421\u0422\u0423\u041F\u041B\u0415\u041D\u0418\u042F\xBB.

\u0414\u041B\u0418\u041D\u0410 \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043E\u0442 \u0441\u0438\u043B\u044B \u0434\u043D\u044F (\u043F\u043E\u043B\u0435 intensity): quiet \u2014 \u043A\u043E\u0440\u043E\u0442\u043A\u043E \u0438 \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E (2\u20134 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0432 \u043E\u0434\u043D\u043E\u043C \u0440\u0430\u0437\u0434\u0435\u043B\u0435); normal \u2014 \u043E\u0434\u0438\u043D \u0440\u0430\u0437\u0434\u0435\u043B 4\u20137 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0439, \u0432\u0442\u043E\u0440\u043E\u0439 \u0440\u0430\u0437\u0434\u0435\u043B \u0442\u043E\u043B\u044C\u043A\u043E \u0435\u0441\u043B\u0438 \u0435\u0441\u0442\u044C \u0432\u0442\u043E\u0440\u0430\u044F \u0442\u0435\u043C\u0430; strong \u2014 \u0434\u043E \u0434\u0432\u0443\u0445 \u0440\u0430\u0437\u0434\u0435\u043B\u043E\u0432 \u043F\u043E 5\u20138 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0439. \u041D\u0435 \u0440\u0430\u0441\u0442\u044F\u0433\u0438\u0432\u0430\u0439 \u0441\u043B\u0430\u0431\u044B\u0439 \u0430\u0441\u043F\u0435\u043A\u0442 \u0434\u043E \u0431\u043E\u043B\u044C\u0448\u043E\u0433\u043E \u0441\u043E\u0431\u044B\u0442\u0438\u044F.

\u041B\u0423\u041D\u041D\u042B\u0419 \u0411\u041B\u041E\u041A: \u0435\u0441\u043B\u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u043D \u043D\u043E\u043C\u0435\u0440 \u043B\u0443\u043D\u043D\u044B\u0445 \u0441\u0443\u0442\u043E\u043A \u2014 1\u20132 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043E \u0442\u0440\u0430\u0434\u0438\u0446\u0438\u043E\u043D\u043D\u043E\u0439 \u0441\u0438\u043C\u0432\u043E\u043B\u0438\u043A\u0435 \u044D\u0442\u0438\u0445 \u0441\u0443\u0442\u043E\u043A \u0441\u0432\u043E\u0438\u043C\u0438 \u0441\u043B\u043E\u0432\u0430\u043C\u0438, \u043C\u044F\u0433\u043A\u043E \u0438 \u043F\u0440\u0430\u043A\u0442\u0438\u0447\u043D\u043E, \u0431\u0435\u0437 \u043C\u0438\u0441\u0442\u0438\u043A\u0438 \u0438 \u0437\u0430\u043F\u0443\u0433\u0438\u0432\u0430\u043D\u0438\u044F. \u041D\u043E\u043C\u0435\u0440 \u043D\u0435 \u043F\u0438\u0448\u0438 \u2014 \u0435\u0433\u043E \u0432\u0441\u0442\u0430\u0432\u0438\u0442 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430.
\u041B\u0423\u041D\u0410 \u0411\u0415\u0417 \u041A\u0423\u0420\u0421\u0410: \u0435\u0441\u043B\u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043E, \u0447\u0442\u043E \u043F\u0435\u0440\u0438\u043E\u0434 \u0435\u0441\u0442\u044C, \u2014 \u043E\u0434\u043D\u0430 \u0444\u0440\u0430\u0437\u0430 \u0441\u043E\u0432\u0435\u0442\u0430 \u0432 \u0434\u0443\u0445\u0435 \u0442\u0440\u0430\u0434\u0438\u0446\u0438\u0438 (\u043D\u0435 \u0442\u043E\u0440\u043E\u043F\u0438\u0442\u044C\u0441\u044F \u0441 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u043C \u043D\u043E\u0432\u043E\u0433\u043E, \u0434\u043E\u0434\u0435\u043B\u044B\u0432\u0430\u0442\u044C \u043D\u0430\u0447\u0430\u0442\u043E\u0435). \u0412\u0440\u0435\u043C\u044F \u043D\u0435 \u043F\u0438\u0448\u0438.

\u041E\u0442\u0432\u0435\u0442 \u0441\u0442\u0440\u043E\u0433\u043E \u043F\u043E JSON-\u0441\u0445\u0435\u043C\u0435.`;
var FORECAST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "opening", "sections", "lunar_note", "voc_note", "advice"],
  properties: {
    headline: { type: "string", description: "\u041A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 \u044F\u0440\u043A\u0438\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0434\u043D\u044F, 3\u20139 \u0441\u043B\u043E\u0432, \u0431\u0435\u0437 \u0446\u0438\u0444\u0440 \u0438 \u0431\u0435\u0437 \u0434\u0430\u0442\u044B" },
    opening: { type: "string", description: "1\u20132 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0432\u0445\u043E\u0434\u0430 \u0432 \u0434\u0435\u043D\u044C; \u043C\u043E\u0436\u043D\u043E \u043E\u0431\u0440\u0430\u0442\u0438\u0442\u044C\u0441\u044F \u043F\u043E \u0438\u043C\u0435\u043D\u0438" },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fact_ids", "title", "text"],
        properties: { fact_ids: { type: "array", items: { type: "string" } }, title: { type: "string", description: "\u041A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0440\u0430\u0437\u0434\u0435\u043B\u0430 \u043A\u0430\u043F\u0441\u043E\u043C \u0438\u043B\u0438 \u043F\u0443\u0441\u0442\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430" }, text: { type: "string" } }
      }
    },
    lunar_note: { type: "string", description: "1\u20132 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043E \u0441\u0438\u043C\u0432\u043E\u043B\u0438\u043A\u0435 \u043B\u0443\u043D\u043D\u044B\u0445 \u0441\u0443\u0442\u043E\u043A \u0438\u043B\u0438 \u043F\u0443\u0441\u0442\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430" },
    voc_note: { type: "string", description: "\u041E\u0434\u043D\u0430 \u0444\u0440\u0430\u0437\u0430 \u043F\u0440\u043E \u041B\u0443\u043D\u0443 \u0431\u0435\u0437 \u043A\u0443\u0440\u0441\u0430 \u0438\u043B\u0438 \u043F\u0443\u0441\u0442\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430" },
    advice: { type: "string", description: "1\u20132 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F: \u043D\u0430 \u0447\u0442\u043E \u043E\u0431\u0440\u0430\u0442\u0438\u0442\u044C \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u0435, \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E" }
  }
};
function buildUserPrompt(ctx) {
  const lines = [];
  lines.push("\u0414\u0410\u0422\u0410: " + ruDate(ctx.day, true) + " (\u043D\u0435 \u043F\u0438\u0448\u0438 \u0434\u0430\u0442\u0443 \u0432 \u0442\u0435\u043A\u0441\u0442\u0435)");
  lines.push("\u0418\u041C\u042F \u0414\u041B\u042F \u041E\u0411\u0420\u0410\u0429\u0415\u041D\u0418\u042F: " + (ctx.name ? ctx.name : "(\u0431\u0435\u0437 \u0438\u043C\u0435\u043D\u0438)"));
  lines.push("\u0413\u0420\u0410\u041C\u041C\u0410\u0422\u0418\u0427\u0415\u0421\u041A\u0418\u0419 \u0420\u041E\u0414: " + (ctx.gender === "f" ? "\u0436\u0435\u043D\u0441\u043A\u0438\u0439" : ctx.gender === "m" ? "\u043C\u0443\u0436\u0441\u043A\u043E\u0439" : "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043D \u2014 \u043F\u0438\u0448\u0438 \u0431\u0435\u0437 \u0440\u043E\u0434\u043E\u0432\u044B\u0445 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u0439 (\u043D\u0435 \xAB\u0443\u0441\u0442\u0430\u043B\u0430/\u0443\u0441\u0442\u0430\u043B\xBB, \u0430 \xAB\u0443\u0441\u0442\u0430\u043B\u043E\u0441\u0442\u044C\xBB, \xAB\u043C\u043E\u0436\u0435\u0442 \u0437\u0430\u0445\u043E\u0442\u0435\u0442\u044C\u0441\u044F\xBB)"));
  lines.push("\u0421\u0418\u041B\u0410 \u0414\u041D\u042F (intensity): " + ctx.selection.intensity);
  lines.push("\u0412\u0420\u0415\u041C\u042F \u0420\u041E\u0416\u0414\u0415\u041D\u0418\u042F \u0418\u0417\u0412\u0415\u0421\u0422\u041D\u041E: " + (ctx.selection.houseKnown ? "\u0434\u0430 (\u0434\u043E\u043C\u0430 \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F)" : "\u043D\u0435\u0442 \u2014 \u043D\u0435 \u0443\u043F\u043E\u043C\u0438\u043D\u0430\u0439 \u0434\u043E\u043C\u0430"));
  lines.push("");
  lines.push("\u0424\u0410\u041A\u0422\u042B (\u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 fact_ids \u0438\u0437 \u043A\u0432\u0430\u0434\u0440\u0430\u0442\u043D\u044B\u0445 \u0441\u043A\u043E\u0431\u043E\u043A):");
  lines.push(factsForPrompt(ctx.selection) || "(\u0432\u044B\u0440\u0430\u0436\u0435\u043D\u043D\u044B\u0445 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0445 \u0430\u0441\u043F\u0435\u043A\u0442\u043E\u0432 \u043D\u0435\u0442 \u2014 \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u044B\u0439 \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u043F\u0440\u043E \u0444\u043E\u043D \u041B\u0443\u043D\u044B)");
  lines.push("");
  const ld = ctx.lunar?.lunarDayAtNoon ? lunarDayInfo(ctx.lunar.lunarDayAtNoon) : null;
  lines.push("\u041B\u0423\u041D\u041D\u042B\u0415 \u0421\u0423\u0422\u041A\u0418: " + (ld ? "\u0435\u0441\u0442\u044C; \u0442\u0440\u0430\u0434\u0438\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0441\u0438\u043C\u0432\u043E\u043B \u2014 " + ld.symbol + "; \u0442\u0435\u043C\u044B: " + ld.keywords + (ctx.lunar.changesDuringDay ? "; \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 \u0434\u043D\u044F \u043D\u0430\u0447\u043D\u0443\u0442\u0441\u044F \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0435 \u0441\u0443\u0442\u043A\u0438 \u2014 \u043D\u0435 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0439, \u0447\u0442\u043E \u044D\u0442\u0438 \u0441\u0443\u0442\u043A\u0438 \u0432\u0435\u0441\u044C \u0434\u0435\u043D\u044C" : "") : "\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u2014 lunar_note \u043F\u0443\u0441\u0442\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430"));
  lines.push("\u041B\u0423\u041D\u0410 \u0411\u0415\u0417 \u041A\u0423\u0420\u0421\u0410 \u0412 \u042D\u0422\u0418 \u0421\u0423\u0422\u041A\u0418: " + (ctx.voc?.length ? "\u0434\u0430" : "\u043D\u0435\u0442 \u2014 voc_note \u043F\u0443\u0441\u0442\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430"));
  if (ctx.recentOpenings?.length) {
    lines.push("");
    lines.push("\u041D\u0415\u0414\u0410\u0412\u041D\u0418\u0415 \u0412\u0421\u0422\u0423\u041F\u041B\u0415\u041D\u0418\u042F (\u043D\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C):");
    for (const r of ctx.recentOpenings.slice(0, 7))
      lines.push("- " + r);
  }
  return lines.join(`
`);
}
function extractOutputText(data) {
  if (typeof data?.output_text === "string")
    return data.output_text;
  for (const item of data?.output || [])
    for (const c of item?.content || [])
      if (c?.type === "output_text" && typeof c.text === "string")
        return c.text;
  return null;
}
async function callOpenAI({ apiKey, model, system, user, fetchImpl = fetch, reasoningEffort = null, timeoutMs = 90000, cacheKey = null, baseUrl = "https://api.openai.com/v1/responses" }) {
  const body = { model, input: [{ role: "system", content: system }, { role: "user", content: user }], store: false, max_output_tokens: 2400, text: { format: { type: "json_schema", name: "astroday_forecast_v2", strict: true, schema: FORECAST_SCHEMA } } };
  if (reasoningEffort)
    body.reasoning = { effort: reasoningEffort };
  if (cacheKey)
    body.prompt_cache_key = cacheKey;
  const started = Date.now();
  const r = await fetchImpl(baseUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const e = Error("openai_http_" + r.status);
    e.status = r.status;
    e.retryable = r.status === 429 || r.status >= 500;
    e.detail = data?.error?.code || data?.error?.type || null;
    throw e;
  }
  const text = extractOutputText(data);
  if (!text) {
    const e = Error("openai_empty_output");
    e.retryable = true;
    throw e;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const e = Error("openai_invalid_json");
    e.retryable = true;
    throw e;
  }
  return { output: parsed, id: data?.id ?? null, model: data?.model ?? model, usage: data?.usage ?? null, ms: Date.now() - started };
}
var PLANET_STEMS = { Sun: /\u0441\u043E\u043B\u043D\u0446/i, Moon: /\u043B\u0443\u043D(?!\u043A)/i, Mercury: /\u043C\u0435\u0440\u043A\u0443\u0440\u0438/i, Venus: /\u0432\u0435\u043D\u0435\u0440/i, Mars: /\b\u043C\u0430\u0440\u0441/i, Jupiter: /\u044E\u043F\u0438\u0442\u0435\u0440/i, Saturn: /\u0441\u0430\u0442\u0443\u0440\u043D/i, Uranus: /\b\u0443\u0440\u0430\u043D(?!\u0438)/i, Neptune: /\u043D\u0435\u043F\u0442\u0443\u043D/i, Pluto: /\u043F\u043B\u0443\u0442\u043E\u043D/i };
var CLICHES = [/\u0432\u0441\u0435\u043B\u0435\u043D\u043D/i, /\u0437\u0432\u0451\u0437\u0434\u044B \u0433\u043E\u0432\u043E\u0440\u044F\u0442|\u0437\u0432\u0435\u0437\u0434\u044B \u0433\u043E\u0432\u043E\u0440\u044F\u0442/i, /\u0432 \u044D\u0442\u043E\u0442 \u043F\u0440\u0435\u043A\u0440\u0430\u0441\u043D\u044B\u0439 \u0434\u0435\u043D\u044C/i, /\u0432\u0430\u0436\u043D\u043E \u043F\u043E\u043C\u043D\u0438\u0442\u044C/i, /\u043D\u0435 \u0437\u0430\u0431\u044B\u0432\u0430\u0439(\u0442\u0435)? \u0437\u0430\u0431\u043E\u0442\u0438\u0442\u044C\u0441\u044F/i, /\u044D\u043D\u0435\u0440\u0433\u0438[\u044F\u0438] \u0434\u043D\u044F/i, /\u0442\u0430\u043A\u0438\u043C \u043E\u0431\u0440\u0430\u0437\u043E\u043C/i, /\u0432 \u0446\u0435\u043B\u043E\u043C,/i];
var SURVEY = [/\u043E\u0442\u043A\u043B\u0438\u043A\u043D\u0443\u043B/i, /\u043D\u0430\u043F\u0438\u0448\u0438(\u0442\u0435)? (\u043C\u043D\u0435 )?\u0432 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438/i, /\u043E\u0446\u0435\u043D\u0438(\u0442\u0435)? \u043F\u0440\u043E\u0433\u043D\u043E\u0437/i, /\u043F\u043E\u0434\u0435\u043B\u0438\u0441\u044C|\u043F\u043E\u0434\u0435\u043B\u0438\u0442\u0435\u0441\u044C/i, /\u0440\u0430\u0441\u0441\u043A\u0430\u0436\u0438(\u0442\u0435)?,? \u043A\u0430\u043A (\u043F\u0440\u043E\u0448|\u0431\u044B\u043B)/i, /\u0441\u0442\u0430\u0432\u044C(\u0442\u0435)? \u0440\u0435\u0430\u043A\u0446/i, /\u043D\u0430\u043F\u0438\u0448\u0438(\u0442\u0435)? (\u043C\u043D\u0435 )?(\u0432 \u043B\u0438\u0447\u043A\u0443|\u0432 \u043B\u0438\u0447\u043D\u044B\u0435|\u0432 \u0434\u0438\u0440\u0435\u043A\u0442)/i];
var PAST_EVENTS = [/\b\u0442\u044B (\u0443\u0436\u0435 )?(\u043F\u043E\u0441\u0441\u043E\u0440\u0438\u043B|\u043F\u043E\u043B\u0443\u0447\u0438\u043B|\u0432\u0441\u0442\u0440\u0435\u0442\u0438\u043B|\u043F\u043E\u0442\u0435\u0440\u044F\u043B|\u0440\u0430\u0441\u0441\u0442\u0430\u043B\u0430\u0441\u044C|\u0440\u0430\u0441\u0441\u0442\u0430\u043B\u0441\u044F)/i, /\b\u0442\u0435\u0431\u0435 (\u0443\u0436\u0435 )?(\u043D\u0430\u043F\u0438\u0441\u0430\u043B|\u043F\u043E\u0437\u0432\u043E\u043D\u0438\u043B|\u043F\u0440\u0438\u0448\u043B)/i];
var SPHERES = { love: /\u043B\u044E\u0431\u043E\u0432|\u0440\u043E\u043C\u0430\u043D\u0442|\u0441\u0432\u0438\u0434\u0430\u043D|\u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438|\u043F\u0430\u0440\u0442\u043D[\u0435\u0451]\u0440/i, money: /\u0434\u0435\u043D\u044C\u0433|\u0444\u0438\u043D\u0430\u043D\u0441|\u0437\u0430\u0440\u043F\u043B\u0430\u0442|\u043F\u043E\u043A\u0443\u043F\u043A|\u0442\u0440\u0430\u0442/i, career: /\u043A\u0430\u0440\u044C\u0435\u0440|\u043D\u0430\u0447\u0430\u043B\u044C\u0441\u0442\u0432|\u0440\u0430\u0431\u043E\u0442/i, health: /\u0437\u0434\u043E\u0440\u043E\u0432|\u0431\u043E\u043B\u0435\u0437\u043D|\u0441\u0430\u043C\u043E\u0447\u0443\u0432\u0441\u0442\u0432/i, family: /\u0441\u0435\u043C\u044C[\u044F\u0435\u0438]|\u0440\u043E\u0434\u0438\u0442\u0435\u043B|\u043C\u0430\u043C\u0430|\u043F\u0430\u043F\u0430|\u0434\u0435\u0442(\u0438|\u0435\u0439)/i };
var DOMAIN_SPHERE = { love: ["love"], partners: ["love"], money: ["money"], depth: ["money", "love"], career: ["career"], routine: ["career", "health"], home: ["family"], self: ["health"], communication: [], horizons: [], friends: [], inner: ["health"] };
function modelText(out) {
  return [out.headline, out.opening, ...(out.sections || []).flatMap((s) => [s.title, s.text]), out.lunar_note, out.voc_note, out.advice].filter(Boolean).join(`
`);
}
function validateForecast(out, ctx) {
  const problems = [];
  if (!out || typeof out !== "object")
    return { ok: false, problems: ["no_output"] };
  const all = modelText(out);
  const prof = findProfanity(all);
  if (prof.length)
    problems.push("profanity:" + prof.map((p) => p.reason).join(","));
  if (/\d/.test(all))
    problems.push("digits_in_model_text");
  for (const re of CLICHES)
    if (re.test(all))
      problems.push("cliche:" + re.source.slice(0, 20));
  for (const re of SURVEY)
    if (re.test(all))
      problems.push("survey_or_cta");
  for (const re of PAST_EVENTS)
    if (re.test(all))
      problems.push("invented_past_event");
  const allowed = allowedPlanets(ctx.selection);
  for (const [p, re] of Object.entries(PLANET_STEMS))
    if (re.test(all) && !allowed.has(p))
      problems.push("planet_not_in_facts:" + p);
  if (!ctx.selection.houseKnown && /(\u043F\u0435\u0440\u0432|\u0432\u0442\u043E\u0440|\u0442\u0440\u0435\u0442|\u0447\u0435\u0442\u0432[\u0435\u0451]\u0440\u0442|\u043F\u044F\u0442|\u0448\u0435\u0441\u0442|\u0441\u0435\u0434\u044C\u043C|\u0432\u043E\u0441\u044C\u043C|\u0434\u0435\u0432\u044F\u0442|\u0434\u0435\u0441\u044F\u0442|\u043E\u0434\u0438\u043D\u043D\u0430\u0434\u0446\u0430\u0442|\u0434\u0432\u0435\u043D\u0430\u0434\u0446\u0430\u0442|\u043D\u0430\u0442\u0430\u043B\u044C\u043D)\S*\s+\u0434\u043E\u043C/i.test(all))
    problems.push("houses_without_birth_time");
  const ids = new Set([...(ctx.selection.themes || []).flatMap((t) => t.facts.map((f) => f.id)), "m:moon", ...(ctx.selection.skyEvents || []).map((e) => e.id)]);
  for (const s of out.sections || [])
    for (const id of s.fact_ids || [])
      if (!ids.has(id))
        problems.push("unknown_fact_id");
  const themeCount = Math.max(1, ctx.selection.themes.length);
  if ((out.sections || []).length > themeCount)
    problems.push("more_sections_than_themes");
  const allowedSpheres = new Set((ctx.selection.themes || []).flatMap((t) => DOMAIN_SPHERE[t.domain] || []));
  const extra = Object.entries(SPHERES).filter(([k, re]) => re.test((out.sections || []).map((s) => s.text).join(" ") + " " + out.advice) && !allowedSpheres.has(k)).map(([k]) => k);
  if (extra.length >= 2)
    problems.push("too_many_spheres:" + extra.join(","));
  if (ctx.name) {
    const n = (all.match(new RegExp(ctx.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (n > 2)
      problems.push("name_overused");
  }
  const caps = (all.match(/\b[\u0410-\u042F\u0401]{4,}\b/g) || []).filter((w) => !out.headline.includes(w));
  if (caps.length > 4)
    problems.push("too_much_caps");
  const emoji = (all.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emoji > 6)
    problems.push("too_many_emoji");
  const norm = (s) => String(s || "").toLowerCase().replace(/\u0451/g, "\u0435").replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  for (const r of ctx.recentOpenings || [])
    if (norm(r) && (norm(r) === norm(out.opening) || norm(r) === norm(out.headline)))
      problems.push("repeated_opening");
  const len = (out.sections || []).reduce((a, s) => a + s.text.length, 0);
  const max = { quiet: 700, normal: 1500, strong: 2300 }[ctx.selection.intensity] || 1500;
  if (len > max)
    problems.push("too_long");
  if (len < 120)
    problems.push("too_short");
  if (!ctx.voc?.length && out.voc_note)
    problems.push("voc_note_without_voc");
  if (!ctx.lunar?.lunarDayAtNoon && out.lunar_note)
    problems.push("lunar_note_without_data");
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}
var esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
var para = (s) => esc(String(s || "").trim()).replace(/\n{3,}/g, `

`);
function renderForecast(out, ctx) {
  const parts = [];
  parts.push("\uD83D\uDD2E <b>" + esc(ctx.kind === "tomorrow" ? "\u0422\u0412\u041E\u0419 \u041F\u0420\u041E\u0413\u041D\u041E\u0417 \u041D\u0410 \u0417\u0410\u0412\u0422\u0420\u0410, " : "\u0422\u0412\u041E\u0419 \u041F\u0420\u041E\u0413\u041D\u041E\u0417 \u041D\u0410 ") + esc(ruDate(ctx.day).toUpperCase()) + "</b>");
  parts.push("<b>" + para(out.headline).toUpperCase() + "</b>");
  parts.push(para(out.opening));
  for (const s of out.sections)
    parts.push((s.title ? "<b>" + para(s.title).toUpperCase() + `</b>
` : "") + para(s.text));
  if (ctx.lunar?.lunarDayAtNoon) {
    parts.push("\uD83C\uDF19 <b>" + esc(ordinalSutki(ctx.lunar.lunarDayAtNoon).toUpperCase()) + "</b>" + (out.lunar_note ? `
` + para(out.lunar_note) : ""));
  }
  if (ctx.voc?.length) {
    const lines = ctx.voc.map((v) => esc(formatVoc({ startMs: v.startTs * 1000, endMs: v.endTs * 1000, zone: ctx.zone, cityName: ctx.cityName, forecastDay: ctx.day }).line));
    parts.push(`\uD83C\uDF19 <b>\u041B\u0423\u041D\u0410 \u0411\u0415\u0417 \u041A\u0423\u0420\u0421\u0410</b>
` + lines.join(`
`) + (out.voc_note ? `
` + para(out.voc_note) : ""));
  }
  parts.push(`\u2728 <b>\u041D\u0410 \u0427\u0422\u041E \u041E\u0411\u0420\u0410\u0422\u0418\u0422\u042C \u0412\u041D\u0418\u041C\u0410\u041D\u0418\u0415</b>
` + para(out.advice));
  const html = parts.filter(Boolean).join(`

`);
  return html;
}
function htmlToPlain(html) {
  return String(html).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
async function writeForecast(ctx, { apiKey, model, fetchImpl = fetch, maxAttempts = 3, reasoningEffort = null, onUsage = async () => {} }) {
  const system = SYSTEM_PROMPT;
  let user = buildUserPrompt(ctx);
  const attempts = [];
  for (let i = 0;i < maxAttempts; i++) {
    const answer = await callOpenAI({ apiKey, model, system, user, fetchImpl, reasoningEffort, cacheKey: "astroday-" + PROMPT_VERSION });
    await onUsage(answer.usage, answer);
    const check = validateForecast(answer.output, ctx);
    attempts.push({ id: answer.id, model: answer.model, ms: answer.ms, ok: check.ok, problems: check.problems, usage: answer.usage });
    if (check.ok) {
      const html = renderForecast(answer.output, ctx);
      const plain = htmlToPlain(html);
      const final = findProfanity(plain);
      if (final.length || html.length > 4000) {
        attempts[attempts.length - 1].ok = false;
        attempts[attempts.length - 1].problems.push(final.length ? "profanity_after_render" : "telegram_too_long");
      } else
        return { ok: true, output: answer.output, html, plain, attempts, model: answer.model, responseId: answer.id };
    }
    user = buildUserPrompt(ctx) + `

\u041F\u0420\u0415\u0414\u042B\u0414\u0423\u0429\u0418\u0419 \u0412\u0410\u0420\u0418\u0410\u041D\u0422 \u041E\u0422\u041A\u041B\u041E\u041D\u0401\u041D \u041F\u0420\u041E\u0412\u0415\u0420\u041A\u041E\u0419: ` + check.problems.join("; ") + ". \u041F\u0435\u0440\u0435\u043F\u0438\u0448\u0438 \u0441 \u043D\u0443\u043B\u044F, \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0432 \u044D\u0442\u043E.";
  }
  return { ok: false, attempts };
}

// tools/probes/model-compare.mjs
var out = (k, v) => console.log("CMP " + k + " " + JSON.stringify(v));
var ENGINE = "http://liz-astro-v2.railway.internal:8080/v2/forecast";
var FIXTURES = [
  { id: "f1_msk_known", name: "\u041D\u0430\u0441\u0442\u044F", gender: "f", zone: "Europe/Moscow", city: "\u041C\u043E\u0441\u043A\u0432\u0430", day: "2026-11-19", birth: { at: "1991-06-12T10:20:00Z", accurateBirthTime: true, latitude: 55.7558, longitude: 37.6173 }, lunar: { lunarDayAtNoon: 10, changesDuringDay: true }, voc: [] },
  { id: "f2_kem_known", name: "\u041B\u0435\u043D\u0430", gender: "f", zone: "Asia/Novokuznetsk", city: "\u041A\u0435\u043C\u0435\u0440\u043E\u0432\u043E", day: "2026-11-20", birth: { at: "1988-01-23T02:45:00Z", accurateBirthTime: true, latitude: 55.3547, longitude: 86.0873 }, lunar: { lunarDayAtNoon: 12, changesDuringDay: true }, voc: [{ startTs: 1795653996, endTs: 1795658765 }] },
  { id: "f3_vn_notime", name: "", gender: null, zone: "Asia/Ho_Chi_Minh", city: "\u0412\u044C\u0435\u0442\u043D\u0430\u043C", day: "2026-11-21", birth: { at: "1995-09-03T05:00:00Z", accurateBirthTime: false, latitude: 21.0278, longitude: 105.8342 }, lunar: { lunarDayAtNoon: 13, changesDuringDay: true }, voc: [] },
  { id: "f4_nsk_known", name: "\u041C\u0430\u0448\u0430", gender: "f", zone: "Asia/Novosibirsk", city: "\u041D\u043E\u0432\u043E\u0441\u0438\u0431\u0438\u0440\u0441\u043A", day: "2026-11-22", birth: { at: "1983-12-30T17:10:00Z", accurateBirthTime: true, latitude: 55.0084, longitude: 82.9357 }, lunar: { lunarDayAtNoon: 14, changesDuringDay: true }, voc: [{ startTs: 1795795200, endTs: 1795812300 }] },
  { id: "f5_msk_male", name: "\u0421\u0430\u0448\u0430", gender: "m", zone: "Europe/Moscow", city: "\u041C\u043E\u0441\u043A\u0432\u0430", day: "2026-11-23", birth: { at: "1979-03-08T21:30:00Z", accurateBirthTime: true, latitude: 59.9343, longitude: 30.3351 }, lunar: { lunarDayAtNoon: 15, changesDuringDay: true }, voc: [] }
];
var MODELS = (Bun.env.CMP_MODELS || "gpt-6-sol,gpt-6.2-astra,gpt-6.2-sol").split(",");
var key = Bun.env.OPENAI_API_KEY;
for (const m of MODELS) {
  try {
    const r = await fetch("https://api.openai.com/v1/models/" + m, { headers: { Authorization: "Bearer " + key } });
    out("model_meta", { m, http: r.status, body: r.ok ? await r.json() : null });
  } catch (e) {
    out("model_meta_err", { m, e: String(e.message) });
  }
}
var calcs = {};
for (const f of FIXTURES) {
  const r = await fetch(ENGINE, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + Bun.env.ASTRO_INTERNAL_TOKEN }, body: JSON.stringify({ day: f.day, timeZone: f.zone, localHour: 12, includeSky: true, birth: f.birth }) });
  calcs[f.id] = r.ok ? await r.json() : null;
  const sel = calcs[f.id] ? selectTopics(calcs[f.id]) : null;
  out("calc", { id: f.id, http: r.status, version: calcs[f.id]?.version, intensity: sel?.intensity, themes: sel?.themes.map((t) => ({ d: t.domain, s: t.score, f: t.facts.map((x) => x.id) })) });
}
var headersSeen = {};
var tapFetch = async (u, i) => {
  const r = await fetch(u, i);
  for (const h of ["x-ratelimit-limit-requests", "x-ratelimit-limit-tokens", "x-ratelimit-remaining-requests", "openai-processing-ms"])
    if (r.headers.get(h))
      headersSeen[h] = r.headers.get(h);
  return r;
};
for (const m of MODELS) {
  for (const f of FIXTURES) {
    if (!calcs[f.id])
      continue;
    const selection = selectTopics(calcs[f.id]);
    const ctx = { day: f.day, zone: f.zone, cityName: f.city, name: f.name, gender: f.gender, selection, lunar: f.lunar, voc: f.voc, recentOpenings: [] };
    const t0 = Date.now();
    try {
      const res = await writeForecast(ctx, { apiKey: key, model: m, fetchImpl: tapFetch, maxAttempts: 2 });
      out("result", { model: m, fixture: f.id, ok: res.ok, ms: Date.now() - t0, attempts: res.attempts.map((a) => ({ returnedModel: a.model, ms: a.ms, ok: a.ok, problems: a.problems, in: a.usage?.input_tokens, out: a.usage?.output_tokens, cached: a.usage?.input_tokens_details?.cached_tokens, reasoning: a.usage?.output_tokens_details?.reasoning_tokens })), profanity: res.ok ? findProfanity(res.plain).length : null });
      if (res.ok)
        console.log("CMPTEXT " + m + " " + f.id + " " + JSON.stringify(res.plain));
    } catch (e) {
      out("error", { model: m, fixture: f.id, e: String(e.message), status: e.status, detail: e.detail });
    }
  }
}
out("ratelimit_headers", headersSeen);
try {
  const line = JSON.stringify({ custom_id: "probe-1", method: "POST", url: "/v1/responses", body: { model: MODELS[1] || MODELS[0], input: "\u0421\u043A\u0430\u0436\u0438 \u043E\u0434\u043D\u043E \u0441\u043B\u043E\u0432\u043E: \u043F\u0440\u0438\u0432\u0435\u0442", max_output_tokens: 16 } });
  const fd = new FormData;
  fd.append("purpose", "batch");
  fd.append("file", new Blob([line + `
`], { type: "application/jsonl" }), "probe.jsonl");
  const up = await (await fetch("https://api.openai.com/v1/files", { method: "POST", headers: { Authorization: "Bearer " + key }, body: fd })).json();
  out("batch_file", { id: up.id, status: up.status, error: up.error?.code });
  if (up.id) {
    const b = await fetch("https://api.openai.com/v1/batches", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ input_file_id: up.id, endpoint: "/v1/responses", completion_window: "24h" }) });
    const bj = await b.json();
    out("batch_create", { http: b.status, id: bj.id, status: bj.status, error: bj.error?.code || bj.errors });
    if (bj.id) {
      const c = await (await fetch("https://api.openai.com/v1/batches/" + bj.id + "/cancel", { method: "POST", headers: { Authorization: "Bearer " + key } })).json();
      out("batch_cancel", { status: c.status });
    }
    await fetch("https://api.openai.com/v1/files/" + up.id, { method: "DELETE", headers: { Authorization: "Bearer " + key } });
  }
} catch (e) {
  out("batch_err", String(e.message));
}
out("prompt_version", PROMPT_VERSION);
out("done", true);
