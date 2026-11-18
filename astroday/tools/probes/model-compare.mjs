// ASTRODAY 2.0 — проба сравнения моделей OpenAI на реальных расчётах движка (READ ONLY: без отправок в Telegram, без записи в БД).
// Профили — вымышленные (не пользователи). Запускается как Railway Function с OPENAI_API_KEY и ASTRO_INTERNAL_TOKEN.
import { selectTopics } from "../../v2/topics.mjs";
import { writeForecast, PROMPT_VERSION } from "../../v2/editorial.mjs";
import { findProfanity } from "../../v2/profanity.mjs";
const out = (k, v) => console.log("CMP " + k + " " + JSON.stringify(v));
const ENGINE = "http://liz-astro-v2.railway.internal:8080/v2/forecast";
const FIXTURES = [
  { id: "f1_msk_known", name: "Настя", gender: "f", zone: "Europe/Moscow", city: "Москва", day: "2026-11-19", birth: { at: "1991-06-12T10:20:00Z", accurateBirthTime: true, latitude: 55.7558, longitude: 37.6173 }, lunar: { lunarDayAtNoon: 10, changesDuringDay: true }, voc: [] },
  { id: "f2_kem_known", name: "Лена", gender: "f", zone: "Asia/Novokuznetsk", city: "Кемерово", day: "2026-11-20", birth: { at: "1988-01-23T02:45:00Z", accurateBirthTime: true, latitude: 55.3547, longitude: 86.0873 }, lunar: { lunarDayAtNoon: 12, changesDuringDay: true }, voc: [{ startTs: 1795653996, endTs: 1795658765 }] },
  { id: "f3_vn_notime", name: "", gender: null, zone: "Asia/Ho_Chi_Minh", city: "Вьетнам", day: "2026-11-21", birth: { at: "1995-09-03T05:00:00Z", accurateBirthTime: false, latitude: 21.0278, longitude: 105.8342 }, lunar: { lunarDayAtNoon: 13, changesDuringDay: true }, voc: [] },
  { id: "f4_nsk_known", name: "Маша", gender: "f", zone: "Asia/Novosibirsk", city: "Новосибирск", day: "2026-11-22", birth: { at: "1983-12-30T17:10:00Z", accurateBirthTime: true, latitude: 55.0084, longitude: 82.9357 }, lunar: { lunarDayAtNoon: 14, changesDuringDay: true }, voc: [{ startTs: 1795795200, endTs: 1795812300 }] },
  { id: "f5_msk_male", name: "Саша", gender: "m", zone: "Europe/Moscow", city: "Москва", day: "2026-11-23", birth: { at: "1979-03-08T21:30:00Z", accurateBirthTime: true, latitude: 59.9343, longitude: 30.3351 }, lunar: { lunarDayAtNoon: 15, changesDuringDay: true }, voc: [] },
];
const MODELS = (Bun.env.CMP_MODELS || "gpt-6-sol,gpt-6.2-astra,gpt-6.2-sol").split(",");
const key = Bun.env.OPENAI_API_KEY;
// rate-limit headers + model metadata
for (const m of MODELS) {
  try {
    const r = await fetch("https://api.openai.com/v1/models/" + m, { headers: { Authorization: "Bearer " + key } });
    out("model_meta", { m, http: r.status, body: r.ok ? await r.json() : null });
  } catch (e) { out("model_meta_err", { m, e: String(e.message) }); }
}
const calcs = {};
for (const f of FIXTURES) {
  const r = await fetch(ENGINE, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + Bun.env.ASTRO_INTERNAL_TOKEN }, body: JSON.stringify({ day: f.day, timeZone: f.zone, localHour: 12, includeSky: true, birth: f.birth }) });
  calcs[f.id] = r.ok ? await r.json() : null;
  const sel = calcs[f.id] ? selectTopics(calcs[f.id]) : null;
  out("calc", { id: f.id, http: r.status, version: calcs[f.id]?.version, intensity: sel?.intensity, themes: sel?.themes.map((t) => ({ d: t.domain, s: t.score, f: t.facts.map((x) => x.id) })) });
}
const headersSeen = {};
const tapFetch = async (u, i) => { const r = await fetch(u, i); for (const h of ["x-ratelimit-limit-requests", "x-ratelimit-limit-tokens", "x-ratelimit-remaining-requests", "openai-processing-ms"]) if (r.headers.get(h)) headersSeen[h] = r.headers.get(h); return r; };
for (const m of MODELS) {
  for (const f of FIXTURES) {
    if (!calcs[f.id]) continue;
    const selection = selectTopics(calcs[f.id]);
    const ctx = { day: f.day, zone: f.zone, cityName: f.city, name: f.name, gender: f.gender, selection, lunar: f.lunar, voc: f.voc, recentOpenings: [] };
    const t0 = Date.now();
    try {
      const res = await writeForecast(ctx, { apiKey: key, model: m, fetchImpl: tapFetch, maxAttempts: 2 });
      out("result", { model: m, fixture: f.id, ok: res.ok, ms: Date.now() - t0, attempts: res.attempts.map((a) => ({ returnedModel: a.model, ms: a.ms, ok: a.ok, problems: a.problems, in: a.usage?.input_tokens, out: a.usage?.output_tokens, cached: a.usage?.input_tokens_details?.cached_tokens, reasoning: a.usage?.output_tokens_details?.reasoning_tokens })), profanity: res.ok ? findProfanity(res.plain).length : null });
      if (res.ok) console.log("CMPTEXT " + m + " " + f.id + " " + JSON.stringify(res.plain));
    } catch (e) { out("error", { model: m, fixture: f.id, e: String(e.message), status: e.status, detail: e.detail }); }
  }
}
out("ratelimit_headers", headersSeen);
// Batch API: поддерживает ли проект /v1/responses в батче (создаём и сразу отменяем)
try {
  const line = JSON.stringify({ custom_id: "probe-1", method: "POST", url: "/v1/responses", body: { model: MODELS[1] || MODELS[0], input: "Скажи одно слово: привет", max_output_tokens: 16 } });
  const fd = new FormData();
  fd.append("purpose", "batch");
  fd.append("file", new Blob([line + "\n"], { type: "application/jsonl" }), "probe.jsonl");
  const up = await (await fetch("https://api.openai.com/v1/files", { method: "POST", headers: { Authorization: "Bearer " + key }, body: fd })).json();
  out("batch_file", { id: up.id, status: up.status, error: up.error?.code });
  if (up.id) {
    const b = await fetch("https://api.openai.com/v1/batches", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ input_file_id: up.id, endpoint: "/v1/responses", completion_window: "24h" }) });
    const bj = await b.json();
    out("batch_create", { http: b.status, id: bj.id, status: bj.status, error: bj.error?.code || bj.errors });
    if (bj.id) { const c = await (await fetch("https://api.openai.com/v1/batches/" + bj.id + "/cancel", { method: "POST", headers: { Authorization: "Bearer " + key } })).json(); out("batch_cancel", { status: c.status }); }
    await fetch("https://api.openai.com/v1/files/" + up.id, { method: "DELETE", headers: { Authorization: "Bearer " + key } });
  }
} catch (e) { out("batch_err", String(e.message)); }
out("prompt_version", PROMPT_VERSION);
out("done", true);
