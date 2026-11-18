// ASTRODAY 2.0 — точка подключения к бандлам API и планировщика (globalThis.ASTRODAY_V2).
// Режимы (переменная ASTRODAY_V2_MODE): off — ничего не делает; allowlist — только astroday_v2_users;
// all — все, у кого есть анкета (добавляются автоматически). По умолчанию off: выкладка без изменения поведения.
import { ensureSchema, syncUsers, runWorker, claim, processRow, prioritize, currentForecast, loadUser } from "./queue.mjs";
import { writeForecast, PROMPT_VERSION } from "./editorial.mjs";
import { createBot, splitHtml } from "./bot.mjs";
import { deliveryTick } from "./delivery.mjs";
import { localDay } from "./timefmt.mjs";
import { LUNAR_VERSION_EXPECTED } from "./versions.mjs";

export function configFromEnv(env) {
  const mode = ["off", "allowlist", "all"].includes(env.ASTRODAY_V2_MODE) ? env.ASTRODAY_V2_MODE : "off";
  return {
    mode,
    model: env.ASTRODAY_V2_MODEL || "gpt-6.2-astra",
    engineUrl: (env.ASTRODAY_V2_ENGINE_URL || "http://astroday-engine-v2c.railway.internal:8080").replace(/\/$/, ""),
    engineVersion: env.ASTRODAY_V2_ENGINE_VERSION || "astro-v2-placidus-swe-2.10",
    lunarVersion: env.ASTRODAY_V2_LUNAR_VERSION || LUNAR_VERSION_EXPECTED,
    windowDays: Math.min(62, Math.max(2, Number(env.ASTRODAY_V2_WINDOW_DAYS) || 31)),
    dailyRequestBudget: Number(env.ASTRODAY_V2_DAILY_BUDGET) || 600,
    generation: env.ASTRODAY_V2_GENERATION !== "off",
    delivery: env.ASTRODAY_V2_DELIVERY === "on",
    enableForAll: mode === "all",
    site: env.ASTRODAY_V2_SITE || "https://lizty666-stage.up.railway.app",
    apiKey: env.OPENAI_API_KEY || "",
    astroToken: env.ASTRO_INTERNAL_TOKEN || "",
    botToken: env.TELEGRAM_BOT_TOKEN || "",
    promptVersion: PROMPT_VERSION,
  };
}

export function engineClient(cfg, fetchImpl = fetch) {
  const call = async (path, body, timeout = 60000) => {
    if (cfg.astroToken.length < 32) throw Error("astro_service_unconfigured");
    const r = await fetchImpl(cfg.engineUrl + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.astroToken }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
    if (!r.ok) throw Error("engine_http_" + r.status);
    return r.json();
  };
  return {
    forecast: (req) => call("/v2/forecast", req),
    lunar: (req) => call("/v2/lunar", req, 90000),
    natal: (birth) => call("/v2/natal", { birth }),
  };
}

export function telegramClient(cfg, fetchImpl = fetch) {
  return async (method, payload) => {
    const r = await fetchImpl("https://api.telegram.org/bot" + cfg.botToken + "/" + method, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    return r.json();
  };
}

export function install(env = Bun.env, { fetchImpl = fetch, tg = null, legacy = {} } = {}) {
  const cfg = configFromEnv(env);
  const engine = engineClient(cfg, fetchImpl);
  const send = tg || telegramClient(cfg, fetchImpl);
  const writer = (ctx, x = {}) => writeForecast(ctx, { apiKey: cfg.apiKey, model: cfg.model, fetchImpl, ...x });
  const deps = { engine, writer, engineVersion: cfg.engineVersion, lunarVersion: cfg.lunarVersion, dailyRequestBudget: cfg.dailyRequestBudget };
  const onReady = async (row, r) => {
    if (!row.notify_on_ready) return;
    const parts = splitHtml(r.html);
    for (const p of parts) await send("sendMessage", { chat_id: row.notify_on_ready, text: p, parse_mode: "HTML", disable_web_page_preview: true });
    await db0?.unsafe("UPDATE astroday_v2_forecasts SET notify_on_ready=NULL WHERE telegram_id=$1 AND forecast_date=$2::date AND generation_key=$3", [row.telegram_id, row.day, row.generation_key]);
  };
  let db0 = null;
  const inflight = new Set();
  async function processNow(db, id, day) {
    const k = id + ":" + day;
    if (inflight.has(k) || !cfg.generation) return;
    inflight.add(k);
    try {
      const [row] = await claim(db, { limit: 1, onlyId: id, onlyDay: day });
      if (!row) return;
      const r = await processRow(db, row, deps);
      if (r.status === "ready") await onReady({ ...row, notify_on_ready: row.notify_on_ready || id }, r);
    } catch (e) { console.error("V2_PROCESS_NOW_FAIL " + String(e?.message || e).slice(0, 120)); }
    finally { inflight.delete(k); }
  }
  async function isUser(db, id) {
    if (cfg.mode === "off") return false;
    await ensureSchema(db);
    const r = await db.unsafe("SELECT enabled FROM astroday_v2_users WHERE telegram_id=$1", [String(id)]);
    if (r[0]) return r[0].enabled;
    return cfg.mode === "all" && (await db.unsafe("SELECT 1 FROM liz_birth_profiles WHERE telegram_id=$1", [String(id)])).length > 0;
  }
  return {
    cfg,
    active: cfg.mode !== "off",
    isUser,
    // Таблицы v2 создаются всегда (аддитивно): старые конвейеры исключают пользователей v2 через astroday_v2_users.
    async ensure(db) { await ensureSchema(db); },
    bot(db, legacyDeps = {}) {
      db0 = db;
      if (cfg.mode === "off") return { handleUpdate: async () => false };
      return createBot({ db, tg: send, site: cfg.site, cfg, engine, processNow: (id, day) => { processNow(db, id, day); }, ...legacy, ...legacyDeps });
    },
    // Первый результат после оплаты/теста для v2: генерация периода + сегодняшний прогноз сразу в чат.
    async firstResult(db, id) {
      await syncUsers(db, cfg, { onlyId: String(id) });
      const u = await loadUser(db, String(id));
      const day = localDay(u.time_zone);
      const f = await currentForecast(db, String(id), day);
      if (f?.status === "ready" && f.body_html) { for (const p of splitHtml(f.body_html)) await send("sendMessage", { chat_id: String(id), text: p, parse_mode: "HTML", disable_web_page_preview: true }); return "sent"; }
      await prioritize(db, String(id), day, String(id));
      return "queued";
    },
    async schedulerTick(db, { alert = async () => {}, budgetMs = 150000 } = {}) {
      db0 = db;
      if (cfg.mode === "off") return { mode: "off" };
      await ensureSchema(db);
      if (cfg.mode === "all") await db.unsafe("INSERT INTO astroday_v2_users(telegram_id, added_by) SELECT p.telegram_id,'auto' FROM liz_birth_profiles p JOIN liz_subscriptions s USING(telegram_id) WHERE s.valid_until>NOW() ON CONFLICT DO NOTHING");
      const sync = await syncUsers(db, cfg);
      const work = cfg.generation ? await runWorker(db, { ...deps, onReady }, { budgetMs, concurrency: 3, maxRows: 60 }) : { disabled: true };
      const delivery = cfg.delivery ? await deliveryTick(db, { tg: send, alert }) : { disabled: true };
      return { mode: cfg.mode, model: cfg.model, sync, work, delivery };
    },
  };
}
