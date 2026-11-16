// Builds the patched ASTRODAY API and scheduler from the verified deployed sources.
// Every patch must match its anchor exactly once, so a changed base is detected immediately.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(root + p, "utf8");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const BASE = { api: "68b245bea7d9672bee3bb97d01d20203c4bdabb8c00bcad67189b650a2addb5a", scheduler: "afe4e7295c9296c1978e25470d65d0dec53eaf68a08846c47005ecf0d75acf7a" };
export const RELEASE = { api: "astroday-api-20261117-liza-openai-r1", scheduler: "astroday-scheduler-20261117-liza-openai-r1" };

function apply(src, patches, label) {
  for (const [name, find, replace] of patches) {
    const n = find instanceof RegExp ? (src.match(new RegExp(find.source, "g")) || []).length : src.split(find).length - 1;
    if (n !== 1) throw Error(label + ": patch " + name + " matched " + n + " times");
    src = src.replace(find, (m) => (typeof replace === "function" ? replace(m) : replace));
  }
  return src;
}
const editorial = read("shared/liza-editorial.mjs");
const fulfillment = read("shared/fulfillment.mjs");
const runtimeV2 = read("shared/forecast-runtime-v2.mjs");
const bot = read("shared/api-bot.mjs");
const adminMod = read("shared/admin-notify.mjs");

const apiOrig = read("original/api.mjs"), schedOrig = read("original/scheduler.mjs");
if (sha(apiOrig) !== BASE.api || sha(schedOrig) !== BASE.scheduler) throw Error("base sources changed");
const apiLines = apiOrig.split("\n");
const oldRuntimeBlock = apiLines.slice(646, 717).join("\n"); // calculateProfileForecast .. end of ensureDailyForecast (api lines 647..717)
if (!oldRuntimeBlock.startsWith("async function calculateProfileForecast(") || !oldRuntimeBlock.trimEnd().endsWith("}")) throw Error("runtime block bounds");

// --- patches shared by both bundles ------------------------------------------
const shared = [
  ["yookassa_credentials_by_mode",
    'async function paymentProviderRequest(path, method = "GET", body, idempotency) {\n  const shop = Bun.env.YOOKASSA_SHOP_ID, key = Bun.env.YOOKASSA_SECRET_KEY;',
    'function yookassaShopFor(mode) {\n  return mode === "test" ? Bun.env.YOOKASSA_TEST_SHOP_ID : Bun.env.YOOKASSA_SHOP_ID;\n}\nfunction yookassaTestAllowed(telegramId) {\n  if (Bun.env.YOOKASSA_TEST_MODE !== "true" || !Bun.env.YOOKASSA_TEST_SHOP_ID || !Bun.env.YOOKASSA_TEST_SECRET_KEY) return false;\n  return String(Bun.env.YOOKASSA_TEST_ALLOWED_TELEGRAM_IDS || "").split(",").map((x) => x.trim()).filter(Boolean).includes(String(telegramId));\n}\nasync function paymentProviderRequest(path, method = "GET", body, idempotency, mode = "live") {\n  const shop = yookassaShopFor(mode), key = mode === "test" ? Bun.env.YOOKASSA_TEST_SECRET_KEY : Bun.env.YOOKASSA_SECRET_KEY;'],
  ["test_receipts_optional",
    'payment_subject: "service" }] } };\n}',
    'payment_subject: "service" }] }, ...order.provider_mode === "test" && Bun.env.YOOKASSA_TEST_RECEIPTS === "false" ? { receipt: undefined } : {} };\n}'],
  ["provider_mode_match",
    'if (provider?.recipient?.account_id !== Bun.env.YOOKASSA_SHOP_ID || provider?.test !== false)',
    'if (!yookassaShopFor(order.provider_mode) || provider?.recipient?.account_id !== yookassaShopFor(order.provider_mode) || provider?.test !== (order.provider_mode === "test"))'],
  ["payment_schema_mode_and_jobs",
    '"CREATE INDEX IF NOT EXISTS liz_refund_order_idx ON liz_refund_events(order_id,recorded_at)"\n    ])',
    '"CREATE INDEX IF NOT EXISTS liz_refund_order_idx ON liz_refund_events(order_id,recorded_at)",\n      "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS provider_mode TEXT NOT NULL DEFAULT \'live\'",\n      "CREATE TABLE IF NOT EXISTS astroday_fulfillment_jobs(order_id UUID PRIMARY KEY REFERENCES liz_orders(id),telegram_id TEXT NOT NULL REFERENCES liz_clients(telegram_id),kind TEXT NOT NULL CHECK(kind IN (\'first_purchase\',\'renewal\')),state TEXT NOT NULL DEFAULT \'paid\',valid_until TIMESTAMPTZ,attempts INT NOT NULL DEFAULT 0,notify_message_id TEXT,forecast_day DATE,last_error TEXT,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),lease_until TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"\n    ])'],
  ["activation_creates_fulfillment_job",
    `await tx.unsafe("INSERT INTO liz_subscriptions(telegram_id,valid_until,last_order_id,source) VALUES($1,$2::timestamptz,$3::uuid,'yookassa') ON CONFLICT(telegram_id) DO UPDATE SET valid_until=EXCLUDED.valid_until,last_order_id=EXCLUDED.last_order_id,source='yookassa',updated_at=NOW()", [order.telegram_id, until.toISOString(), order.id]);`,
    `const grantSource = order.provider_mode === "test" ? "yookassa_test" : "yookassa";
      await tx.unsafe("INSERT INTO liz_subscriptions(telegram_id,valid_until,last_order_id,source) VALUES($1,$2::timestamptz,$3::uuid,$4) ON CONFLICT(telegram_id) DO UPDATE SET valid_until=EXCLUDED.valid_until,last_order_id=EXCLUDED.last_order_id,source=EXCLUDED.source,updated_at=NOW()", [order.telegram_id, until.toISOString(), order.id, grantSource]);
      await tx.unsafe("INSERT INTO astroday_fulfillment_jobs(order_id,telegram_id,kind,valid_until) VALUES($1::uuid,$2,$3,$4::timestamptz) ON CONFLICT(order_id) DO NOTHING", [order.id, order.telegram_id, Number.isFinite(old) && old > Date.now() ? "renewal" : "first_purchase", until.toISOString()]);
      console.log("PAYMENT_ACTIVATED " + JSON.stringify({ order: order.id, mode: order.provider_mode || "live", months, renewal: Number.isFinite(old) && old > Date.now() }));`],
  ["forecast_schema_columns",
    '"CREATE INDEX IF NOT EXISTS liz_daily_due_idx ON liz_daily_messages(status,due_at)",',
    '"CREATE INDEX IF NOT EXISTS liz_daily_due_idx ON liz_daily_messages(status,due_at)",\n      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS text_source TEXT",\n      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS editorial_prompt_version TEXT",\n      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS editorial_model TEXT",\n      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS editorial_attempts INT NOT NULL DEFAULT 0",\n      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS next_editorial_at TIMESTAMPTZ",\n      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS editorial_error TEXT",\n      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS editorial_meta JSONB",\n      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS delivery_purpose TEXT",\n      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS editorial_first_attempt_at TIMESTAMPTZ",\n      "CREATE TABLE IF NOT EXISTS astroday_openai_usage(usage_day DATE PRIMARY KEY,requests INT NOT NULL DEFAULT 0,input_tokens BIGINT NOT NULL DEFAULT 0,output_tokens BIGINT NOT NULL DEFAULT 0,failures INT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",'],
  ["editorial_module", "\n// forecast-runtime.ts\nvar FORECAST_ENGINE_VERSION", (f) => "\n" + editorial + "\n" + adminMod + "\n" + fulfillment + f],
  ["forecast_runtime_v2", oldRuntimeBlock, runtimeV2.trimEnd()]
];

// --- API -----------------------------------------------------------------------
const apiPatches = [
  ["release_marker", "\nconst adJoinButton=", (f) => "\n// ASTRODAY " + RELEASE.api + " (base astroday-api-20261116-join-test-fix)" + f],
  ["callback_today_for_buyers",
    'text:tester?"🖤":"Профиль пока не найден"})}catch(ackErr){console.warn("ASTRO_CALLBACK_ACK_WARN "+String(ackErr))} if(tester){',
    'text:(tester||q.data==="astroday_today")?"🖤":"Профиль пока не найден"})}catch(ackErr){console.warn("ASTRO_CALLBACK_ACK_WARN "+String(ackErr))} if(!tester&&q.data==="astroday_today"){await adToday(id);return resp({ok:true});} if(tester){'],
  ["update_retry_wrapper",
    "      return resp({ ok: true, duplicate: true });\n  }\n  if (up?.callback_query) {",
    `      return resp({ ok: true, duplicate: true });
  }
  try {
    return await telegramUpdate(up);
  } catch (e) {
    console.error("TG_UPDATE_FAILED " + JSON.stringify({ code: String(e?.code || e?.message || "unknown").slice(0, 80) }));
    if (Number.isSafeInteger(up?.update_id)) {
      const failures = await adFailureBudget(up.update_id).catch(() => 99);
      if (failures <= 2) {
        await db.unsafe("DELETE FROM liz_tg_processed_updates WHERE update_id=$1::bigint", [up.update_id]).catch(() => {});
        return resp({ error: "temporary_failure_retry" }, 500);
      }
    }
    return resp({ ok: false, gaveUp: true });
  }
}
async function telegramUpdate(up) {
  if (up?.my_chat_member?.chat?.type === "private") {
    const who = tgId(up.my_chat_member.from?.id), st = up.my_chat_member.new_chat_member?.status;
    if (who && ["kicked", "member"].includes(st))
      await db.unsafe("UPDATE liz_clients SET bot_blocked_at=" + (st === "kicked" ? "NOW()" : "NULL") + ",updated_at=NOW() WHERE telegram_id=$1", [who]);
    return resp({ ok: true });
  }
  if (up?.callback_query) {`],
  ["callback_answer_all",
    "      await finishTesterActivation(id, q.from?.username || null);\n    }\n    return resp({ ok: true });\n  }\n  if (up?.pre_checkout_query) {",
    `      await finishTesterActivation(id, q.from?.username || null);
      return resp({ ok: true });
    }
    const known = ["ad_today", "ad_plans", "ad_status"].includes(q.data);
    try {
      await botApi("answerCallbackQuery", { callback_query_id: q.id, ...known ? {} : { text: "Эта кнопка устарела — вот актуальное меню 🖤" } });
    } catch (ackErr) {
      console.warn("CALLBACK_ACK_WARN " + String(ackErr?.message || ackErr).slice(0, 60));
    }
    if (id && q.message?.chat?.type === "private" && tgId(q.message.chat.id) === id) {
      await db.unsafe("INSERT INTO liz_clients(telegram_id,telegram_username) VALUES($1,$2) ON CONFLICT(telegram_id) DO NOTHING", [id, typeof q.from?.username === "string" ? q.from.username : null]);
      if (q.data === "ad_today") await adToday(id);
      else if (q.data === "ad_plans") await sendYooKassaPlans(id);
      else if (q.data === "ad_status") await adSendStatus(id);
      else await adSendStart(id, true);
    }
    return resp({ ok: true });
  }
  if (up?.pre_checkout_query) {`],
  ["start_repeat_detection",
    '  if (command === "/start") {\n    await db.unsafe("UPDATE liz_clients SET chat_started_at=COALESCE(chat_started_at,NOW()),updated_at=NOW() WHERE telegram_id=$1", [id]);',
    '  if (command === "/start") {\n    const startedBefore = !!(await db.unsafe("SELECT chat_started_at FROM liz_clients WHERE telegram_id=$1", [id]))[0]?.chat_started_at;\n    await db.unsafe("UPDATE liz_clients SET chat_started_at=COALESCE(chat_started_at,NOW()),bot_blocked_at=NULL,updated_at=NOW() WHERE telegram_id=$1", [id]);'],
  ["start_buyer_screen",
    /\n    await sendBotMessage\(id, "\\u041F\\u0440\\u0438\\u0432\\u0435\\u0442! [^\n]*\n  \} else if \(command === "\/status"\) \{\n    const rows = await db\.unsafe\("SELECT valid_until FROM liz_subscriptions WHERE telegram_id=\$1", \[id\]\);\n    await sendBotMessage\([^\n]*\n  \} else if \(command === "\/today"\) \{\n    try \{\n[\s\S]*?\n    \} catch \(e\) \{\n      await sendBotMessage\(id, forecastErrorText\(e\)\);\n    \}\n  \} else if \(command === "\/day"\) \{/,
    '\n    await adSendStart(id, startedBefore);\n  } else if (command === "/status") {\n    await adSendStatus(id);\n  } else if (command === "/today") {\n    await adToday(id);\n  } else if (command === "/day") {'],
  ["help_and_fallback",
    /  \} else if \(\["\/plans", "\/buy_month", "\/buy_halfyear", "\/buy_year"\]\.includes\(command\)\)\n    await sendYooKassaPlans\(id\);\n  else\n    await sendBotMessage\(id, command === "\/help" \? `[\s\S]*?\n  return resp\(\{ ok: true \}\);\n\}\nvar WEB_ASTRO_VERSION/,
    '  } else if (["/plans", "/buy_month", "/buy_halfyear", "/buy_year"].includes(command))\n    await sendYooKassaPlans(id);\n  else if (command === "/help")\n    await sendBotMessage(id, "Что я умею:\\n/today — прогноз на сегодня\\n/status — анкета, доступ и рассылка\\n/stop — поставить рассылку на паузу\\n/resume — вернуть рассылку\\n/plans — тарифы и оплата\\n\\nАнкета и личный кабинет — по кнопке ниже.", adKeyboard("today", "cabinet", "plans"));\n  else\n    await adSendStart(id, true);\n  return resp({ ok: true });\n}\n' + bot + '\nvar WEB_ASTRO_VERSION'],
  ["plans_message",
    /async function sendYooKassaPlans\(id\) \{[\s\S]*?\n\}\nasync function telegramTesterOptIn/,
    'async function sendYooKassaPlans(id) {\n  const gate = await paymentGate(yookassaTestAllowed(id) ? "test" : "live");\n  const catalog = Object.values(PLANS).map((p) => p.months + " " + (p.months === 1 ? "месяц" : "месяцев") + " — " + new Intl.NumberFormat("ru-RU").format(p.rub) + " ₽").join("\\n");\n  await sendBotMessage(id, "Доступ к ASTRODAY:\\n" + catalog + "\\n\\nЭто разовая оплата за выбранный срок — без автопродления и автосписаний. Оплата картой через ЮKassa на сайте, чек придёт на почту.\\n" + (gate.ready ? "Перед оплатой понадобится анкета рождения." : "Приём платежей сейчас временно закрыт — загляни чуть позже 🖤"), gate.ready ? { reply_markup: { inline_keyboard: [[{ text: "💳 Выбрать тариф и оплатить", url: "https://lizty666-stage.up.railway.app/checkout" }], [{ text: "🌙 Анкета и кабинет", web_app: { url: "https://lizty666-stage.up.railway.app/login" } }]] } } : {});\n}\nasync function telegramTesterOptIn'],
  ["clients_blocked_column",
    '"ALTER TABLE liz_clients ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT FALSE",',
    '"ALTER TABLE liz_clients ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT FALSE",\n  "ALTER TABLE liz_clients ADD COLUMN IF NOT EXISTS bot_blocked_at TIMESTAMPTZ",\n  "CREATE TABLE IF NOT EXISTS liz_tg_update_failures(update_id BIGINT PRIMARY KEY,failures INT NOT NULL DEFAULT 0,last_error TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",'],
  ["payment_gate_modes",
    'async function paymentGate() {\n  const reasons = [];\n  if (!planPriceParity())\n    reasons.push("catalog_price_mismatch");\n  if (Bun.env.LIVE_RUB_PAYMENTS_ENABLED !== "true")\n    reasons.push("payments_disabled");\n  if (!Bun.env.YOOKASSA_SHOP_ID || !Bun.env.YOOKASSA_SECRET_KEY)\n    reasons.push("yookassa_credentials_missing");\n  if (Bun.env.YOOKASSA_PRODUCTION_CONFIRMED !== "true")\n    reasons.push("live_merchant_not_verified");\n  if (!fiscalReady() || ![1, 2, 3, 4, 5, 6].includes(Number(Bun.env.YOOKASSA_TAX_SYSTEM_CODE)))\n    reasons.push("receipt_configuration_incomplete");',
    'async function paymentGate(mode = "live") {\n  const reasons = [];\n  if (!planPriceParity())\n    reasons.push("catalog_price_mismatch");\n  if (mode === "test") {\n    if (Bun.env.YOOKASSA_TEST_MODE !== "true" || !Bun.env.YOOKASSA_TEST_SHOP_ID || !Bun.env.YOOKASSA_TEST_SECRET_KEY)\n      reasons.push("test_shop_not_configured");\n  } else {\n  if (Bun.env.LIVE_RUB_PAYMENTS_ENABLED !== "true")\n    reasons.push("payments_disabled");\n  if (!Bun.env.YOOKASSA_SHOP_ID || !Bun.env.YOOKASSA_SECRET_KEY)\n    reasons.push("yookassa_credentials_missing");\n  if (Bun.env.YOOKASSA_PRODUCTION_CONFIRMED !== "true")\n    reasons.push("live_merchant_not_verified");\n  if (!fiscalReady() || ![1, 2, 3, 4, 5, 6].includes(Number(Bun.env.YOOKASSA_TAX_SYSTEM_CODE)))\n    reasons.push("receipt_configuration_incomplete");\n  }'],
  ["provider_payment_builder_mode",
    'function buildProviderPayment(orderId, planCode, receiptEmail) {\n  const p = PLANS[planCode];\n  if (!p)\n    throw Error("Unknown plan");\n  return buildPaymentRequest({ id: orderId, plan_code: planCode, plan_months: p.months, amount_kopeks: p.rub * 100, receipt_email: receiptEmail });',
    'function buildProviderPayment(orderId, planCode, receiptEmail, mode = "live") {\n  const p = PLANS[planCode];\n  if (!p)\n    throw Error("Unknown plan");\n  return buildPaymentRequest({ id: orderId, plan_code: planCode, plan_months: p.months, amount_kopeks: p.rub * 100, receipt_email: receiptEmail, provider_mode: mode });'],
  ["checkout_gate_by_client",
    '      if (req.method === "POST" && path === "/v1/checkout") {\n        const gate = await paymentGate();\n        if (!gate.ready)\n          return guarded({ error: "Checkout temporarily unavailable", blockedBy: gate.reasons }, 503);\n        const data = await parseBody(req);\n        const client = await paymentClient(req, data);\n        if (!client)\n          return guarded({ error: "\\u0412\\u043E\\u0439\\u0434\\u0438 \\u0447\\u0435\\u0440\\u0435\\u0437 Telegram \\u043D\\u0430 \\u0441\\u0430\\u0439\\u0442\\u0435, \\u0447\\u0442\\u043E\\u0431\\u044B \\u043E\\u0444\\u043E\\u0440\\u043C\\u0438\\u0442\\u044C \\u043F\\u043E\\u0434\\u043F\\u0438\\u0441\\u043A\\u0443." }, 401);',
    '      if (req.method === "POST" && path === "/v1/checkout") {\n        const data = await parseBody(req);\n        const client = await paymentClient(req, data);\n        if (!client)\n          return guarded({ error: "Войди через Telegram на сайте, чтобы оформить доступ." }, 401);\n        const payMode = yookassaTestAllowed(client.id) ? "test" : "live";\n        const gate = await paymentGate(payMode);\n        if (!gate.ready)\n          return guarded({ error: "Checkout temporarily unavailable", blockedBy: gate.reasons }, 503);'],
  ["checkout_recovery_mode",
    'const recovered = await yk("payments", "POST", order.provider_request || buildProviderPayment(String(order.id), order.plan_code, order.receipt_email), String(order.id));\n            if (typeof recovered.id !== "string" || recovered.metadata?.order_id !== String(order.id) || recovered.metadata?.plan !== order.plan_code || recovered.recipient?.account_id !== Bun.env.YOOKASSA_SHOP_ID || recovered.test !== false ||',
    'const recovered = await yk("payments", "POST", order.provider_request || buildProviderPayment(String(order.id), order.plan_code, order.receipt_email, order.provider_mode), String(order.id), order.provider_mode);\n            if (typeof recovered.id !== "string" || recovered.metadata?.order_id !== String(order.id) || recovered.metadata?.plan !== order.plan_code || recovered.recipient?.account_id !== yookassaShopFor(order.provider_mode) || recovered.test !== (order.provider_mode === "test") ||'],
  ["checkout_old_select_mode",
    'SELECT id,telegram_id,plan_code,amount_kopeks,receipt_email,confirmation_url,provider_payment_id,status,needs_review,provider_request,created_at,activated_at FROM liz_orders WHERE idempotency_key=$1',
    'SELECT id,telegram_id,plan_code,plan_months,amount_kopeks,currency,receipt_email,confirmation_url,provider_payment_id,status,needs_review,provider_request,created_at,activated_at,provider_mode FROM liz_orders WHERE idempotency_key=$1'],
  ["checkout_insert_mode",
    'const inserted = await db.unsafe("INSERT INTO liz_orders(id,idempotency_key,telegram_id,plan_code,plan_months,amount_kopeks,receipt_email,legal_version,terms_accepted_at) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id", [orderId, idkey, client.id, data.plan, plan.months, plan.rub * 100, data.receiptEmail, data.legalVersion]);',
    'const inserted = await db.unsafe("INSERT INTO liz_orders(id,idempotency_key,telegram_id,plan_code,plan_months,amount_kopeks,receipt_email,legal_version,terms_accepted_at,provider_mode) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,NOW(),$9) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id", [orderId, idkey, client.id, data.plan, plan.months, plan.rub * 100, data.receiptEmail, data.legalVersion, payMode]);'],
  ["checkout_create_mode",
    'const payload = buildProviderPayment(orderId, data.plan, data.receiptEmail);\n        await db.unsafe("UPDATE liz_orders SET provider_request=($2::text)::jsonb WHERE id=$1::uuid", [orderId, JSON.stringify(payload)]);\n        const response = await yk("payments", "POST", payload, orderId);\n        if (typeof response.id !== "string" || typeof response.confirmation?.confirmation_url !== "string" || response.metadata?.order_id !== orderId || response.metadata?.plan !== data.plan || response.recipient?.account_id !== Bun.env.YOOKASSA_SHOP_ID || response.test !== false ||',
    'const payload = buildProviderPayment(orderId, data.plan, data.receiptEmail, payMode);\n        await db.unsafe("UPDATE liz_orders SET provider_request=($2::text)::jsonb WHERE id=$1::uuid", [orderId, JSON.stringify(payload)]);\n        const response = await yk("payments", "POST", payload, orderId, payMode);\n        if (typeof response.id !== "string" || typeof response.confirmation?.confirmation_url !== "string" || response.metadata?.order_id !== orderId || response.metadata?.plan !== data.plan || response.recipient?.account_id !== yookassaShopFor(payMode) || response.test !== (payMode === "test") ||'],
  ["webhook_credentials_any_mode",
    'if (!Bun.env.YOOKASSA_SHOP_ID || !Bun.env.YOOKASSA_SECRET_KEY)\n          return guarded({ error: "Provider credentials not configured" }, 503);',
    'if ((!Bun.env.YOOKASSA_SHOP_ID || !Bun.env.YOOKASSA_SECRET_KEY) && !Bun.env.YOOKASSA_TEST_SHOP_ID)\n          return guarded({ error: "Provider credentials not configured" }, 503);'],
  ["webhook_refund_mode",
    'const known = await db.unsafe("SELECT id FROM liz_orders WHERE provider_payment_id=$1 LIMIT 1", [paymentReference]);\n          if (!known.length)\n            return guarded({ ok: true, ignored: "unknown_order" });\n          const ref = await yk("refunds/" + encodeURIComponent(payId), "GET");',
    'const known = await db.unsafe("SELECT id,provider_mode FROM liz_orders WHERE provider_payment_id=$1 LIMIT 1", [paymentReference]);\n          if (!known.length)\n            return guarded({ ok: true, ignored: "unknown_order" });\n          const ref = await yk("refunds/" + encodeURIComponent(payId), "GET", undefined, undefined, known[0].provider_mode);'],
  ["webhook_payment_mode",
    'const known = await db.unsafe("SELECT id FROM liz_orders WHERE provider_payment_id=$1 LIMIT 1", [payId]);\n        if (!known.length) {',
    'const known = await db.unsafe("SELECT id,provider_mode FROM liz_orders WHERE provider_payment_id=$1 LIMIT 1", [payId]);\n        if (!known.length) {'],
  ["webhook_fetch_and_kick",
    'const provider = await yk("payments/" + encodeURIComponent(payId), "GET");\n        const result = await handleProviderPayment(provider);',
    'const provider = await yk("payments/" + encodeURIComponent(payId), "GET", undefined, undefined, known[0].provider_mode);\n        const result = await handleProviderPayment(provider);\n        if (result === "activated" || result === "already_activated")\n          kickFulfillment(known[0].id);'],
  ["order_status_mode",
    'const existing = await db.unsafe("SELECT id,status,provider_payment_id,activated_at,needs_review FROM liz_orders WHERE id=$1::uuid AND telegram_id=$2", [data.orderId, identity.id]);\n        if (!existing.length)\n          return guarded({ error: "Order not found" }, 404);\n        const order = existing[0];\n        if (order.status === "pending" && order.provider_payment_id && Bun.env.YOOKASSA_SHOP_ID && Bun.env.YOOKASSA_SECRET_KEY) {\n          const current = await yk("payments/" + encodeURIComponent(order.provider_payment_id), "GET");\n          await handleProviderPayment(current);\n        }',
    'const existing = await db.unsafe("SELECT id,status,provider_payment_id,activated_at,needs_review,provider_mode FROM liz_orders WHERE id=$1::uuid AND telegram_id=$2", [data.orderId, identity.id]);\n        if (!existing.length)\n          return guarded({ error: "Order not found" }, 404);\n        const order = existing[0];\n        if (order.status === "pending" && order.provider_payment_id && yookassaShopFor(order.provider_mode)) {\n          const current = await yk("payments/" + encodeURIComponent(order.provider_payment_id), "GET", undefined, undefined, order.provider_mode);\n          const applied = await handleProviderPayment(current);\n          if (applied === "activated") kickFulfillment(order.id);\n        }'],
  ["order_status_fulfillment_view",
    'const rows = await db.unsafe("SELECT status,activated_at,needs_review FROM liz_orders WHERE id=$1::uuid", [data.orderId]);\n        const sub = (await db.unsafe("SELECT valid_until FROM liz_subscriptions WHERE telegram_id=$1", [identity.id]))[0];\n        return guarded({ status: rows[0]?.status, activated: !!rows[0]?.activated_at, needsReview: !!rows[0]?.needs_review, validUntil: sub?.valid_until || null });',
    'const rows = await db.unsafe("SELECT o.status,o.activated_at,o.needs_review,j.state AS fulfillment FROM liz_orders o LEFT JOIN astroday_fulfillment_jobs j ON j.order_id=o.id WHERE o.id=$1::uuid", [data.orderId]);\n        const sub = (await db.unsafe("SELECT valid_until FROM liz_subscriptions WHERE telegram_id=$1", [identity.id]))[0];\n        const f = rows[0]?.fulfillment || null;\n        return guarded({ status: rows[0]?.status, activated: !!rows[0]?.activated_at, needsReview: !!rows[0]?.needs_review, validUntil: sub?.valid_until || null, fulfillment: f, firstResult: f === "done" ? "delivered_or_closed" : f === "first_queued" ? "sending" : f === "waiting_profile" ? "profile_required" : f ? "preparing" : null });'],
  ["checkout_notify",
    'return guarded({ orderId, confirmationUrl: response.confirmation.confirmation_url, status: "pending" });',
    (f) => 'await adminNotify(db, "order", "🛒 <b>Создан заказ</b> " + data.plan + " · " + plan.rub + " ₽" + (payMode === "test" ? " (тестовый магазин)" : "") + "\\n" + adminEsc(await adminWho(db, client.id)), "order:" + orderId);\n        ' + f],
  ["webhook_notify_result",
    '        if (result === "activated" || result === "already_activated")\n          kickFulfillment(known[0].id);',
    (f) => f + '\n        if (result === "canceled") await adminNotify(db, "order", "❌ <b>Платёж отменён/не прошёл</b>\\nЗаказ " + known[0].id, "cancel:" + known[0].id);\n        if (["metadata_mismatch", "amount_mismatch", "merchant_or_live_mode_mismatch"].includes(result)) await adminNotify(db, "alert", "🚨 <b>Платёж не совпал с заказом</b> (" + result + ") — заказ " + known[0].id + " отложен на ручную проверку", "mismatch:" + known[0].id);'],
  ["register_notify",
    '      await tx.unsafe("UPDATE liz_clients SET notify_enabled=$2,updated_at=NOW() WHERE telegram_id=$1", [id, input.deliveryConsent === true]);\n    });',
    (f) => f + '\n    await adminNotify(db, "profile", "📝 <b>Анкета сохранена</b>\\n" + adminEsc(await adminWho(db, id)) + "\\nВремя рождения: " + (bt ? "точное" : "неизвестно") + " · прогноз в " + input.deliveryHour + ":00 (" + adminEsc(input.deliveryTimezone) + ")" + (input.deliveryConsent === true ? "" : " · рассылка выключена"), "profile:" + id + ":" + Date.now().toString().slice(0, -5));'],
  ["kick_fulfillment_helper",
    "var yk = paymentProviderRequest;",
    'var yk = paymentProviderRequest;\nfunction kickFulfillment(orderId) {\n  if (!db) return;\n  processFulfillment(db, { orderId: String(orderId) }).then((s) => { console.log("FULFILLMENT_KICK " + JSON.stringify(s)); kickAdminDrain(); }).catch((e) => console.error("FULFILLMENT_KICK_FAIL " + String(e?.message || e).slice(0, 80)));\n}'],
  ["health_dependencies",
    'return guarded({ ok: database, role: "astroday_api", databaseReady: database, externalPaymentsEnabled: (await paymentGate()).ready, sourceMigrated: Bun.env.SOURCE_MIGRATION_VERIFIED === "true", telegramDispatchOperational: Bun.env.TELEGRAM_DISPATCH_VERIFIED === "true" }, database ? 200 : 503);',
    'return guarded({ ok: database, role: "astroday_api", release: ' + JSON.stringify(RELEASE.api) + ', databaseReady: database, externalPaymentsEnabled: (await paymentGate()).ready, editorial: { openaiConfigured: lizaEditorialConfig().enabled, model: lizaEditorialConfig().model, promptVersion: LIZA_PROMPT_VERSION } }, database ? 200 : 503);'],
  ["release_readiness_honest",
    'return guarded({ readyForPublicSales: gate.ready, blockedBy: gate.reasons, sourceMigrated: Bun.env.SOURCE_MIGRATION_VERIFIED === "true", realTelegramDeliveryVerified: Bun.env.TELEGRAM_DISPATCH_VERIFIED === "true" });',
    'const health = db ? (await db.unsafe("SELECT last_scheduler_tick,last_verified_real_delivery FROM liz_delivery_health WHERE id=1").catch(() => []))[0] : null;\n        return guarded({ release: ' + JSON.stringify(RELEASE.api) + ', readyForPublicSales: gate.ready, blockedBy: gate.reasons, editorialOpenAI: lizaEditorialConfig().enabled, lastSchedulerTick: health?.last_scheduler_tick || null, lastConfirmedTelegramDelivery: health?.last_verified_real_delivery || null, note: "Флаги *_VERIFIED больше не используются как доказательство: смотрите фактические отметки времени." });']
];

// --- scheduler -------------------------------------------------------------------
const schedPatches = [
  ["release_marker", "// liz-ty666-scheduler.ts\nvar {SQL } = globalThis.Bun;", "// liz-ty666-scheduler.ts — " + RELEASE.scheduler + "\nvar {SQL } = globalThis.Bun;"],
  ["reconcile_create_mode", 'const provider = await paymentProviderRequest("payments", "POST", payload, String(order.id));', 'const provider = await paymentProviderRequest("payments", "POST", payload, String(order.id), order.provider_mode);'],
  ["reconcile_get_mode", 'const provider = await paymentProviderRequest("payments/" + encodeURIComponent(order.provider_payment_id));', 'const provider = await paymentProviderRequest("payments/" + encodeURIComponent(order.provider_payment_id), "GET", undefined, undefined, order.provider_mode);'],
  ["reconcile_refund_mode", 'const data = await paymentProviderRequest("refunds?payment_id=" + encodeURIComponent(order.provider_payment_id) + "&limit=100");', 'const data = await paymentProviderRequest("refunds?payment_id=" + encodeURIComponent(order.provider_payment_id) + "&limit=100", "GET", undefined, undefined, order.provider_mode);'],
  ["reconcile_paid_select_mode", "SELECT id,provider_payment_id FROM liz_orders WHERE activated_at IS NOT NULL", "SELECT id,provider_payment_id,provider_mode FROM liz_orders WHERE activated_at IS NOT NULL"],
  ["reconcile_creds_any_mode", 'if (!Bun.env.YOOKASSA_SHOP_ID || !Bun.env.YOOKASSA_SECRET_KEY)\n    return { ...result, skipped: "credentials_missing" };', 'if ((!Bun.env.YOOKASSA_SHOP_ID || !Bun.env.YOOKASSA_SECRET_KEY) && !Bun.env.YOOKASSA_TEST_SHOP_ID)\n    return { ...result, skipped: "credentials_missing" };'],
  ["prepare_counts_waiting",
    '      } catch (e) {\n        failed++;\n        console.error("FORECAST_PREPARE_ERROR", String(e?.code || e?.message || "unknown").slice(0, 100));\n      }',
    '      } catch (e) {\n        if (e?.code === "forecast_preparing_retry") waiting++;\n        else {\n          failed++;\n          console.error("FORECAST_PREPARE_ERROR", String(e?.code || e?.message || "unknown").slice(0, 100));\n        }\n      }'],
  ["deliver_notify_sent",
    '        await db.begin(async (tx) => {\n          await tx.unsafe("UPDATE liz_daily_messages SET status=\'sent\',sent_at=NOW(),error_code=NULL WHERE id=$1::uuid AND status=\'sending\' AND telegram_next_part_index=$2", [claim.id, parts.length]);',
    (f) => '        await adminNotify(db, "forecast_sent", "✅ <b>Прогноз отправлен" + (row.delivery_purpose === "first_result" ? " (первый после оплаты)" : "") + "</b>\\n" + adminEsc(await adminWho(db, row.telegram_id)) + "\\n" + row.forecast_day + " · " + adminEsc(row.text_source || row.text_mode || "") + (row.editorial_model ? " · " + adminEsc(row.editorial_model) : "") + "\\n\\n" + adminEsc(row.body), "sent:" + claim.id);\n' + f],
  ["deliver_notify_failed",
    '          await db.unsafe("UPDATE liz_daily_messages SET status=\'failed_permanent\',error_code=$2 WHERE id=$1::uuid", [claim.id, "telegram_" + r.status]);',
    (f) => f + '\n          await adminNotify(db, "alert", "⚠️ <b>Прогноз не доставлен</b> (Telegram " + r.status + (r.status === 403 ? ", бот заблокирован" : "") + ")\\n" + adminEsc(await adminWho(db, row.telegram_id)) + "\\n" + row.forecast_day + "\\nДоступ не тронут.", "fail:" + claim.id);'],
  ["deliver_notify_review",
    '      await db.unsafe("UPDATE liz_daily_messages SET status=\'needs_review\',error_code=\'network_or_delivery_ambiguous\' WHERE id=$1::uuid", [claim.id]);',
    (f) => f + '\n      await adminNotify(db, "alert", "⚠️ <b>Неясно, дошёл ли прогноз</b> (сеть). Повторно не отправляем.\\nЗапись " + claim.id, "review:" + claim.id);'],
  ["prepare_waiting_var", "let cursor = 0, ready = 0, failed = 0;", "let cursor = 0, ready = 0, failed = 0, waiting = 0;"],
  ["prepare_return", "return { profiles: rows.length, ready, failed, remaining: rows.length - cursor };", "return { profiles: rows.length, ready, failed, waiting, remaining: rows.length - cursor };"],
  ["main_runs_fulfillment",
    'const tasks = await Promise.allSettled([reconcilePayments(db), prepare(db)]);',
    'const reconciled = await Promise.allSettled([reconcilePayments(db)]);\n    // Оплаченные заказы обрабатываются раньше общей подготовки: первый результат не ждёт утра.\n    const fulfilled = await Promise.allSettled([processFulfillment(db)]);\n    if (Bun.env.OPENAI_MODEL_TRIAL) console.log("EDITORIAL_MODEL_TRIAL_RUN " + JSON.stringify(await editorialModelTrial(db).catch((e) => ({ error: String(e?.message || e).slice(0, 80) }))));\n    const tasks = [...reconciled, ...fulfilled, ...await Promise.allSettled([prepare(db)])];'],
  ["main_second_fulfillment_pass",
    'console.log("ASTRODAY_WORKER_DELIVERY " + JSON.stringify(await deliver(db)));',
    'console.log("ASTRODAY_WORKER_DELIVERY " + JSON.stringify(await deliver(db)));\n    console.log("ASTRODAY_WORKER_FULFILLMENT_CLOSE " + JSON.stringify(await processFulfillment(db).catch((e) => ({ error: String(e?.message || e).slice(0, 80) }))));'],
  ["main_drains_admin",
    'console.log("ASTRODAY_WORKER_FULFILLMENT_CLOSE "',
    (f) => 'console.log("ASTRODAY_ADMIN_NOTIFY " + JSON.stringify(await drainAdminOutbox(db).catch((e) => ({ error: String(e?.message || e).slice(0, 80) }))));\n    ' + f]
];

// Bun treats a file whose FIRST line is "// @bun" as pre-bundled output and does not decode it as UTF-8.
// The release keeps readable UTF-8 text (smaller after compression), so that pragma line is removed.
const RU = /\\u(04[0-9a-fA-F]{2}|2014|2013|2026|00ab|00bb|00a0|2019|201c|201d)/g;
const readable = (s) => s.replace(RU, (m, h) => String.fromCharCode(parseInt(h, 16)));
const dropPragma = (s) => s.startsWith("// @bun\n") ? s.slice("// @bun\n".length) : s;
const apiOut = dropPragma(readable(apply(apply(apiOrig, shared, "api/shared"), apiPatches, "api")));
const schedOut = dropPragma(readable(apply(apply(schedOrig, shared, "scheduler/shared"), schedPatches, "scheduler")));
if (apiOut.startsWith("// @bun") || schedOut.startsWith("// @bun")) throw Error("pragma left");
mkdirSync(root + "release", { recursive: true });
writeFileSync(root + "release/api.mjs", apiOut);
writeFileSync(root + "release/scheduler.mjs", schedOut);
console.log(JSON.stringify({ api: { bytes: apiOut.length, sha256: sha(apiOut) }, scheduler: { bytes: schedOut.length, sha256: sha(schedOut) } }));
