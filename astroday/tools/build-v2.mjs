// ASTRODAY 2.0 — воспроизводимая сборка релиза поверх ТОЧНО развёрнутого кода (deployed/*.mjs, сверка по SHA-256).
// Патчи — проверяемые замены строк: каждая должна сработать ровно ожидаемое число раз, иначе сборка падает.
// Результат: release-v2/api.mjs, release-v2/scheduler.mjs, release-v2/daily7.ts, release-v2/MANIFEST.json
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const read = (p) => readFileSync(ROOT + p, "utf8");
export const RELEASE = { api: "astroday-api-20261118-v2-r1", scheduler: "astroday-scheduler-20261118-v2-r1", daily7: "astroday-daily7-20261118-v2-r1" };
const BASE = { api: "33744dc6f7c9a216d1e32ff56575fc9a5f8384c76e05f9805f7e6f3578b06c32", scheduler: "c33aa4373821654498fd701ec5335fcdb351051019cbb9f7d3430c0e2c166d8e" };

function apply(src, patches, label) {
  let out = src;
  for (const [from, to, times = 1] of patches) {
    const n = out.split(from).length - 1;
    if (n !== times) throw Error(label + ": patch anchor found " + n + "x (expected " + times + "): " + from.slice(0, 90));
    out = out.split(from).join(to);
  }
  return out;
}

export async function buildV2Bundle() {
  const r = await Bun.build({ entrypoints: [ROOT + "v2/entry-global.mjs"], target: "bun", format: "iife", minify: false });
  if (!r.success) throw Error("v2 bundle failed: " + r.logs.map(String).join("\n"));
  return (await r.outputs[0].text()).replace(/^\/\/ @bun[^\n]*\n/, "");
}

// v2-ветка выполнения заказа: вместо старого конвейера — период v2 и сегодняшний прогноз сразу.
const FULFILL_ANCHOR = "        const day = localForecastDay(acc.time_zone);\n        let item;\n";
const FULFILL_V2 = "        if (globalThis.ASTRODAY_V2_RUNTIME && await astrodayV2Instance().isUser(db, job.telegram_id)) {\n          const v2r = await astrodayV2Instance().firstResult(db, job.telegram_id);\n          console.log(\"V2_FIRST_RESULT \" + JSON.stringify({ order: job.order_id, result: v2r }));\n          stats.done++; await release(\"done\", { day: localForecastDay(acc.time_zone) }); continue;\n        }\n" + FULFILL_ANCHOR;
const INSTANCE = "\nfunction astrodayV2Instance() { if (!globalThis.__astrodayV2) globalThis.__astrodayV2 = globalThis.ASTRODAY_V2_RUNTIME.install(Bun.env); return globalThis.__astrodayV2; }\n" +
  "// Старые конвейеры исключают пользователей v2, только пока v2 включён (ASTRODAY_V2_MODE≠off): выключение мгновенно возвращает их в старую схему.\n" +
  "function astrodayV2Excl(col) { return globalThis.ASTRODAY_V2_RUNTIME && astrodayV2Instance().active ? \" AND NOT EXISTS(SELECT 1 FROM astroday_v2_users v2u WHERE v2u.telegram_id=\" + col + \" AND v2u.enabled)\" : \"\"; }\n";

export async function build({ write = true } = {}) {
  const apiBase = read("deployed/api.mjs"), schBase = read("deployed/scheduler.mjs");
  if (sha(apiBase) !== BASE.api || sha(schBase) !== BASE.scheduler) throw Error("deployed base changed — rebuild deployed/ first");
  const v2 = await buildV2Bundle();
  const banner = (rel) => "// ASTRODAY " + rel + " (base: deployed " + "SHA api " + BASE.api.slice(0, 12) + ", scheduler " + BASE.scheduler.slice(0, 12) + ") + ASTRODAY 2.0 runtime\n";

  const api = apply(apiBase, [
    ["// ASTRODAY astroday-api-20261118-claude-polish1 (base astroday-api-20261118-profile-fix1)\n", banner(RELEASE.api) + v2 + INSTANCE],
    ["astroday-api-20261118-claude-polish1", RELEASE.api, 2],
    // «Я в деле» в режиме v2: без старых сообщений после привязки (меню покажет v2)
    ["async function astrodayJoinOnce(id,t){", "async function astrodayJoinOnce(id,t,quiet=false){"],
    [' if(joined===null)return sendBotMessage(id,"Котик, не получилось подключить твой профиль 🖤 Напиши Лизе — она проверит.");', ' if(joined===null){await sendBotMessage(id,"Котик, не получилось подключить твой профиль 🖤 Напиши Лизе — она проверит.");return quiet?false:undefined}'],
    [" if(!joined)return adCompact(id);", " if(!joined)return quiet?true:adCompact(id);"],
    [' console.log("ASTRO_JOIN_OK");return astrodaySecondMessage(id);', ' console.log("ASTRO_JOIN_OK");return quiet?true:astrodaySecondMessage(id);'],
    // Никаких опросов: убираем просьбу «замечай, что совпало» из приветствия
    ["\\n\\nИ обязательно замечай, что совпало, а что вообще мимо. Потом будем обсуждать в нашем чате первооткрывателей))", ""],
    // Бот v2 перехватывает апдейты своих пользователей; ошибка → повтор Telegram (обёртка снимает отметку)
    ["async function telegramUpdate(up) {\n", "async function telegramUpdate(up) {\n  if (globalThis.ASTRODAY_V2_RUNTIME && db) {\n    const v2 = astrodayV2Instance();\n    if (v2.active) {\n      await v2.ensure(db);\n      const inv = astrodayV2Invite(up);\n      if (inv) await inv;\n      if (await astrodayV2Bot().handleUpdate(up)) return resp({ ok: true, v2: true });\n    }\n  }\n"],
    ["var adTodayInFlight = new Map();\n", `var adTodayInFlight = new Map();
// ---- ASTRODAY 2.0: бот и зависимости старого кода ------------------------------------
var astrodayV2BotInstance = null;
function astrodayV2Bot() {
  if (astrodayV2BotInstance) return astrodayV2BotInstance;
  astrodayV2BotInstance = astrodayV2Instance().bot(db, {
    async testerState(id, username) { const t = await astrodayTesterById(id, username); return t ? { joined: !!(await adJoined(id)) } : null; },
    async legacyJoin(id, username) {
      const t = await astrodayTesterById(id, username);
      if (!t) { await sendBotMessage(id, "Котик, пока не нашла твою анкету 🖤 Напиши Лизе, чтобы подключила тебя."); return false; }
      return astrodayJoinOnce(id, t, true);
    },
    async markStarted(id) { await db.unsafe("UPDATE liz_clients SET chat_started_at=COALESCE(chat_started_at,NOW()),bot_blocked_at=NULL,updated_at=NOW() WHERE telegram_id=$1", [id]); },
    async legacyConsent(id, on) {
      await db.begin(async (tx) => {
        await tx.unsafe("UPDATE astroday_tester_joins SET notifications_enabled=$2 WHERE telegram_id=$1", [id, on]);
        await tx.unsafe("UPDATE liz_clients SET notify_enabled=$2,updated_at=now() WHERE telegram_id=$1", [id, on]);
        await tx.unsafe("UPDATE liz_birth_profiles SET consented_to_daily=$2,updated_at=now() WHERE telegram_id=$1", [id, on]);
        await tx.unsafe("UPDATE liz_tg_consents SET daily_delivery=$2 WHERE telegram_id=$1", [id, on]);
      });
    },
  });
  return astrodayV2BotInstance;
}
// Подключение к v2 по приглашению: «/v2 КОД» (код — переменная ASTRODAY_V2_INVITE, ≥ 12 символов)
function astrodayV2Invite(up) {
  const m = up?.message, code = Bun.env.ASTRODAY_V2_INVITE || "";
  if (!m || m.chat?.type !== "private" || code.length < 12) return null;
  const [cmd, arg] = String(m.text || "").trim().split(/\\s+/);
  if (cmd !== "/v2" || arg !== code) return null;
  const id = tgId(m.from?.id);
  if (!id || tgId(m.chat?.id) !== id) return null;
  return db.unsafe("INSERT INTO astroday_v2_users(telegram_id, added_by) VALUES($1,'invite') ON CONFLICT(telegram_id) DO UPDATE SET enabled=TRUE", [id]).then(() => { m.text = "/start"; console.log("V2_INVITE_OK"); });
}
`],
    [FULFILL_ANCHOR, FULFILL_V2],
  ], "api");

  const scheduler = apply(schBase, [
    ["// liz-ty666-scheduler.ts — astroday-scheduler-20261118-facts-fix1\n", "// liz-ty666-scheduler.ts — " + RELEASE.scheduler + "\n" + v2 + INSTANCE],
    ["    await ensureForecastSchema(db);\n    await db.unsafe(\"INSERT INTO liz_delivery_health", "    await ensureForecastSchema(db);\n    if (globalThis.ASTRODAY_V2_RUNTIME) await astrodayV2Instance().ensure(db);\n    await db.unsafe(\"INSERT INTO liz_delivery_health"],
    ["    console.log(\"ASTRODAY_WORKER_DELIVERY \" + JSON.stringify(await deliver(db)));\n", "    console.log(\"ASTRODAY_WORKER_DELIVERY \" + JSON.stringify(await deliver(db)));\n    if (globalThis.ASTRODAY_V2_RUNTIME) console.log(\"ASTRODAY_V2_TICK \" + JSON.stringify(await astrodayV2Instance().schedulerTick(db, { alert: (t) => adminNotify(db, \"v2_alert\", t) }).catch((e) => ({ error: String(e?.message || e).slice(0, 160) }))));\n"],
    // старые конвейеры не трогают пользователей v2 (иначе двойная генерация и двойная рассылка)
    ["WHERE s.valid_until>NOW() AND NOT EXISTS(SELECT 1 FROM liz_astro_testers", "WHERE s.valid_until>NOW()\" + astrodayV2Excl(\"p.telegram_id\") + \" AND NOT EXISTS(SELECT 1 FROM liz_astro_testers"],
    ["JOIN liz_birth_profiles p ON p.telegram_id=m.telegram_id WHERE NOT EXISTS(SELECT 1 FROM liz_astro_testers", "JOIN liz_birth_profiles p ON p.telegram_id=m.telegram_id WHERE TRUE\" + astrodayV2Excl(\"m.telegram_id\") + \" AND NOT EXISTS(SELECT 1 FROM liz_astro_testers"],
    [FULFILL_ANCHOR, FULFILL_V2],
  ], "scheduler");

  const daily7Base = read("deployed/daily7.ts");
  const daily7 = apply(daily7Base, [
    ["// ASTRODAY_DAILY7_V2 (2026-11-18): чистка повторов в тексте и проверка актуальности анкеты.", "// ASTRODAY_DAILY7_V2 (2026-11-18): чистка повторов в тексте и проверка актуальности анкеты.\n// " + RELEASE.daily7 + ": пользователи ASTRODAY 2.0 (astroday_v2_users) получают прогнозы своей рассылкой — здесь пропускаются."],
    ["  const people=await db.unsafe(\"SELECT t.handle_key", "  await db.unsafe(\"CREATE TABLE IF NOT EXISTS astroday_v2_users(telegram_id TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT TRUE, added_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())\");\n  const people=await db.unsafe(\"SELECT t.handle_key"],
    ["AND NOT EXISTS(SELECT 1 FROM liz_clients c WHERE c.telegram_id=t.verified_telegram_id AND c.notify_enabled=false)\");", "AND NOT EXISTS(SELECT 1 FROM liz_clients c WHERE c.telegram_id=t.verified_telegram_id AND c.notify_enabled=false) AND NOT EXISTS(SELECT 1 FROM astroday_v2_users v WHERE v.telegram_id=t.verified_telegram_id AND v.enabled)\");"],
  ], "daily7");

  const manifest = { release: RELEASE, base: BASE, apiSha256: sha(api), schedulerSha256: sha(scheduler), daily7Sha256: sha(daily7), v2BundleSha256: sha(v2), builtAt: new Date().toISOString(), bytes: { api: api.length, scheduler: scheduler.length, v2: v2.length } };
  if (write) {
    mkdirSync(ROOT + "release-v2", { recursive: true });
    writeFileSync(ROOT + "release-v2/api.mjs", api);
    writeFileSync(ROOT + "release-v2/scheduler.mjs", scheduler);
    writeFileSync(ROOT + "release-v2/daily7.ts", daily7);
    // Упаковка для переменных Railway (как у действующего загрузчика): brotli → base64 → куски по 14 000
    const pack = (s) => { const b = brotliCompressSync(Buffer.from(s, "utf8"), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).toString("base64"); const parts = []; for (let i = 0; i < b.length; i += 14000) parts.push(b.slice(i, i + 14000)); return parts; };
    const apiParts = pack(api), schParts = pack(scheduler);
    writeFileSync(ROOT + "release-v2/api.pkg.json", JSON.stringify(apiParts));
    writeFileSync(ROOT + "release-v2/scheduler.pkg.json", JSON.stringify(schParts));
    manifest.apiChunks = apiParts.map((p) => sha(p).slice(0, 8));
    manifest.schedulerChunks = schParts.map((p) => sha(p).slice(0, 8));
    writeFileSync(ROOT + "release-v2/MANIFEST.json", JSON.stringify(manifest, null, 2));
  }
  return { api, scheduler, daily7, manifest };
}

if (import.meta.main) {
  const r = await build();
  console.log(JSON.stringify(r.manifest, null, 2));
}
