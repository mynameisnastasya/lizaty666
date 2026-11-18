// Fakes for ASTRODAY 2.0 tests: engine (contract of astro-v2 + /v2/lunar) and OpenAI Responses API.
import { createHash } from "node:crypto";
const h = (s) => parseInt(createHash("sha256").update(String(s)).digest("hex").slice(0, 8), 16);
const P = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const A = ["conjunction", "sextile", "square", "trine", "opposition"];
const S = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
export const ENGINE_VERSION = "astro-v2-placidus-swe-2.10", LUNAR_VERSION = "astroday-lunar-v1";
export function fakeEngine({ failOn = new Set(), calls = { forecast: 0, lunar: 0 } } = {}) {
  return {
    calls,
    async forecast(req) {
      calls.forecast++;
      if (failOn.has(req.day)) throw Error("engine_http_503");
      const seed = h(JSON.stringify(req.birth) + req.day);
      const quiet = seed % 5 === 0;
      const known = req.birth.accurateBirthTime === true;
      const aspects = quiet ? [] : [
        { scope: "transit_natal", transit: P[seed % 9], natal: P[(seed >>> 5) % 9] === P[seed % 9] ? "Venus" : P[(seed >>> 5) % 9], aspect: A[(seed >>> 9) % 5], orbDeg: (seed % 7) / 10, orbLimitDeg: 6, state: "applying" },
        { scope: "transit_natal", transit: "Moon", natal: "Sun", aspect: "trine", orbDeg: 2.5, orbLimitDeg: 6, state: "separating" },
      ];
      return { version: ENGINE_VERSION, day: req.day, calculationStatus: "verified_v2", houseSystem: "placidus", houseKnown: known, natalMoonReliable: known, timeZone: req.timeZone,
        transitingMoon: { sign: S[seed % 12], natalHouse: known ? 1 + (seed % 12) : null },
        transitingPlanets: Object.fromEntries(P.map((p, i) => [p, { natalHouse: known ? 1 + ((seed + i) % 12) : null }])),
        activeAspects: aspects, dayEvents: [], natalProfile: { natalPositions: Object.fromEntries([...P, "Moon"].map((p, i) => [p, { longitude: i * 33 }])), houseCusps: known ? [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] : null } };
    },
    async lunar({ startDay, days, timeZone }) {
      calls.lunar++;
      const out = [];
      for (let i = 0; i < days; i++) {
        const day = new Date(Date.parse(startDay + "T00:00:00Z") + i * 86400000).toISOString().slice(0, 10);
        const n = ((h(day) % 29) + 1);
        const voc = h(day + "v") % 3 === 0 ? [{ startTs: Math.floor(Date.parse(day + "T05:10:00Z") / 1000), endTs: Math.floor(Date.parse(day + "T09:40:00Z") / 1000), moonSign: "Leo", nextSign: "Virgo" }] : [];
        out.push({ day, lunarDayAtNoon: n, changesDuringDay: true, segments: [], voidOfCourse: voc });
      }
      return { lunarVersion: LUNAR_VERSION, timeZone, days: out };
    },
  };
}
const WORDS = ["спокойно", "смело", "внимательно", "мягко", "честно", "бережно", "уверенно", "легко", "тихо", "весело", "собранно", "ясно", "нежно", "ровно", "просто", "твёрдо"];
// OpenAI Responses API mock: valid structured output referencing fact ids from the prompt.
export function fakeOpenAI({ mode = "valid", log = [] } = {}) {
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    log.push(body);
    const user = body.input[1].content;
    if (mode === "500") return new Response(JSON.stringify({ error: { type: "server_error" } }), { status: 500 });
    const ids = [...user.matchAll(/\[(a:[^\]]+)\]/g)].map((m) => m[1]);
    const k = log.length; const w = WORDS[k % WORDS.length], w2 = WORDS[Math.floor(k / WORDS.length) % WORDS.length];
    const day = /ДАТА: ([^\n(]+)/.exec(user)?.[1].trim().replace(/\d+/g, "").trim();
    const bad = mode === "profane" ? " Короче, пипец какой-то." : mode === "digits" ? " В пять минут десятого — 9:10." : "";
    const out = { headline: "День, когда можно " + w, opening: w[0].toUpperCase() + w.slice(1) + " и " + w2 + " — вот как сегодня лучше всего действовать.",
      sections: [{ fact_ids: ids.slice(0, 1), title: "", text: "Ситуация может подтолкнуть к быстрым решениям, но лучше сначала выдохнуть и посмотреть, что на самом деле важно. Если захочется ответить резко, дай себе паузу и вернись к разговору чуть позже — так будет проще договориться." + bad }],
      lunar_note: user.includes("ЛУННЫЕ СУТКИ: есть") ? "Эти сутки традиционно про внимание к себе и аккуратность в делах." : "",
      voc_note: "",
      advice: "Выбери одно дело и доведи его до конца — без героизма." };
    return new Response(JSON.stringify({ id: "resp_" + log.length, model: body.model, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(out) }] }], usage: { input_tokens: 1200, output_tokens: 400 } }), { status: 200 });
  };
  f.log = log;
  return f;
}
