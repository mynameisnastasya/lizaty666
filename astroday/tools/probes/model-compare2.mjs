// ASTRODAY 2.0 probe #6 — READ ONLY: round 2 (prompt v2.1) gpt-6.2-astra vs gpt-6.2-sol + 3-day sequence variety check. Fictional profiles.
import { selectTopics } from "../../v2/topics.mjs";
import { writeForecast, PROMPT_VERSION } from "../../v2/editorial.mjs";
const out = (k, v) => console.log("R2 " + k + " " + JSON.stringify(v));
const ENGINE = "http://liz-astro-v2.railway.internal:8080/v2/forecast";
const F = [
  ["f1", "Настя", "f", "Europe/Moscow", "Москва", "2026-11-19", { at: "1991-06-12T10:20:00Z", accurateBirthTime: true, latitude: 55.7558, longitude: 37.6173 }, 10, []],
  ["f2", "Лена", "f", "Asia/Novokuznetsk", "Кемерово", "2026-11-20", { at: "1988-01-23T02:45:00Z", accurateBirthTime: true, latitude: 55.3547, longitude: 86.0873 }, 11, [{ startTs: 1795139168, endTs: 1795153931 }]],
  ["f3", "", null, "Asia/Ho_Chi_Minh", "Вьетнам", "2026-11-21", { at: "1995-09-03T05:00:00Z", accurateBirthTime: false, latitude: 21.0278, longitude: 105.8342 }, 12, []],
  ["f4", "Маша", "f", "Asia/Novosibirsk", "Новосибирск", "2026-11-22", { at: "1983-12-30T17:10:00Z", accurateBirthTime: true, latitude: 55.0084, longitude: 82.9357 }, 13, [{ startTs: 1795333115, endTs: 1795342181 }]],
  ["f5", "Саша", "m", "Europe/Moscow", "Москва", "2026-11-23", { at: "1979-03-08T21:30:00Z", accurateBirthTime: true, latitude: 59.9343, longitude: 30.3351 }, 14, []],
];
const calc = async (day, zone, birth) => { const r = await fetch(ENGINE, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + Bun.env.ASTRO_INTERNAL_TOKEN }, body: JSON.stringify({ day, timeZone: zone, localHour: 12, includeSky: true, birth }) }); return r.ok ? r.json() : null; };
const key = Bun.env.OPENAI_API_KEY;
const run = async (m, id, name, gender, zone, city, day, birth, ld, voc, recent = []) => {
  const c = await calc(day, zone, birth);
  const ctx = { day, zone, cityName: city, name, gender, selection: selectTopics(c), lunar: { lunarDayAtNoon: ld, changesDuringDay: true, nextPart: "вечеру" }, voc, recentOpenings: recent };
  const t0 = Date.now();
  try {
    const res = await writeForecast(ctx, { apiKey: key, model: m, maxAttempts: 2 });
    out("result", { m, id, day, ok: res.ok, ms: Date.now() - t0, att: res.attempts.map((a) => ({ model: a.model, ok: a.ok, p: a.problems, in: a.usage?.input_tokens, out: a.usage?.output_tokens, cached: a.usage?.input_tokens_details?.cached_tokens })) });
    if (res.ok) console.log("R2TEXT " + m + " " + id + " " + day + " " + JSON.stringify(res.plain));
    return res.ok ? [res.output.headline, res.output.opening] : [];
  } catch (e) { out("error", { m, id, e: String(e.message), d: e.detail }); return []; }
};
for (const m of ["gpt-6.2-astra", "gpt-6.2-sol"]) for (const f of F) await run(m, ...f);
// variety: 3 consecutive days for f1 with recent openings fed back
for (const m of ["gpt-6.2-astra"]) {
  let recent = [];
  for (const [day, ld] of [["2026-11-20", 11], ["2026-11-21", 12], ["2026-11-22", 13]]) recent = [...(await run(m, "seq", "Настя", "f", "Europe/Moscow", "Москва", day, F[0][6], ld, [], recent)), ...recent];
}
out("prompt", PROMPT_VERSION);
out("done", true);
