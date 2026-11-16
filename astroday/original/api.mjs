
const adJoinButton={reply_markup:{inline_keyboard:[[{text:"🖤 Я в деле",callback_data:"astroday_join"}]]}};
const adTodayButton={reply_markup:{inline_keyboard:[[{text:"🔮 Мой прогноз на сегодня",callback_data:"astroday_today"}],[{text:"🌙 Личный кабинет",web_app:{url:"https://lizty666-stage.up.railway.app/login"}}]]}};
async function adJoined(id){return (await db.unsafe("SELECT notifications_enabled FROM astroday_tester_joins WHERE telegram_id=$1",[id]))[0]}
async function adCompact(id){return sendBotMessage(id,"Ты уже в ASTRODAY, котик 🖤\nПрогнозы приходят в 07:00 по Кемерово. Можешь посмотреть сегодняшний прямо сейчас 🔮",adTodayButton)}
async function astrodayStartOnce(id,t){if(await adJoined(id))return adCompact(id);return sendBotMessage(id,"ну чтооо, первооткрыватель 🖤\nЖми «Я в деле» — и погнали смотреть твои прогнозы 🤎",adJoinButton)}
async function astrodayJoinOnce(id,t){
 let joined;
 try{joined=await db.begin(async tx=>{
 const bound=await tx.unsafe("UPDATE liz_astro_testers SET verified_telegram_id=$1,consent_status='confirmed_by_account_holder',identity_status='verified_via_bot',claim_at=COALESCE(claim_at,now()),updated_at=now() WHERE handle_key=$2 AND (trial_end_exclusive::timestamp AT TIME ZONE COALESCE(forecast_zone_assumed,'Asia/Novokuznetsk'))>NOW() AND (verified_telegram_id=$1 OR (verified_telegram_id IS NULL AND (expected_telegram_id IS NULL OR expected_telegram_id=$1))) RETURNING handle_key,birth_utc,birth_local_date::text AS birth_day,birth_lat,birth_lon,birth_zone,birth_time_precision,birth_city,display_name,COALESCE(forecast_zone_assumed,'Asia/Novokuznetsk') AS zone,COALESCE(delivery_hour_assumed,7)::int AS hour,trial_end_exclusive::text AS trial_end",[id,t.handle_key]);
 if(!bound.length)return null;
 const r=bound[0];
 if(!r.birth_utc||!r.birth_day||r.birth_lat==null||r.birth_lon==null||!Number.isFinite(Number(r.birth_lat))||!Number.isFinite(Number(r.birth_lon))||!r.birth_zone||!r.trial_end)throw Error('tester_profile_incomplete');
 const previousJoin=await tx.unsafe("SELECT handle_key FROM astroday_tester_joins WHERE telegram_id=$1",[id]);
 const inserted=await tx.unsafe("INSERT INTO astroday_tester_joins(telegram_id,handle_key,notifications_enabled) VALUES($1,$2,TRUE) ON CONFLICT(telegram_id) DO UPDATE SET notifications_enabled=TRUE WHERE astroday_tester_joins.handle_key=EXCLUDED.handle_key RETURNING telegram_id",[id,t.handle_key]);
 if(inserted.length!==1)throw Error("tester_join_identity_conflict");
 await tx.unsafe("INSERT INTO liz_clients(telegram_id,chat_started_at,notify_enabled) VALUES($1,NOW(),TRUE) ON CONFLICT(telegram_id) DO UPDATE SET chat_started_at=COALESCE(liz_clients.chat_started_at,NOW()),notify_enabled=TRUE,updated_at=NOW()",[id]);
 if(r.birth_utc&&r.birth_day&&Number.isFinite(Number(r.birth_lat))&&Number.isFinite(Number(r.birth_lon))&&r.birth_zone)await tx.unsafe("INSERT INTO liz_birth_profiles(telegram_id,birth_at_iso,birth_local_date,birth_lat,birth_lon,birth_time_verified,birth_timezone,time_zone,delivery_hour_local,consented_to_daily,preferred_name,birth_city_name) VALUES($1,$2,$3::date,$4,$5,$6,$7,$8,$9,TRUE,$10,$11) ON CONFLICT(telegram_id) DO UPDATE SET consented_to_daily=TRUE,updated_at=NOW()",[id,new Date(r.birth_utc).toISOString(),r.birth_day,Number(r.birth_lat),Number(r.birth_lon),r.birth_time_precision==="exact_reported",r.birth_zone,r.zone,Math.min(23,Math.max(0,r.hour)),r.display_name||null,r.birth_city||null]);
 if(r.trial_end)await tx.unsafe("INSERT INTO liz_subscriptions(telegram_id,valid_until,source) VALUES($1,($2::date::timestamp AT TIME ZONE $3),'astroday_tester_trial') ON CONFLICT(telegram_id) DO UPDATE SET valid_until=GREATEST(liz_subscriptions.valid_until,EXCLUDED.valid_until),updated_at=NOW()",[id,r.trial_end,r.zone]);
 await tx.unsafe("INSERT INTO liz_tg_consents(telegram_id,terms_version,daily_delivery) VALUES($1,'astroday-tester-join-20261116',TRUE) ON CONFLICT(telegram_id) DO UPDATE SET daily_delivery=TRUE,accepted_at=NOW()",[id]);
 await tx.unsafe("UPDATE liz_astro_testers SET subscription_status='trial_granted',updated_at=NOW() WHERE handle_key=$1 AND subscription_status IN ('not_granted')",[t.handle_key]);
 return previousJoin.length===0;
 });}catch(e){console.error("ASTRO_JOIN_ERROR "+String(e?.code||e?.message||e).slice(0,80));joined=null}
 if(joined===null)return sendBotMessage(id,"Котик, не получилось подключить твой профиль 🖤 Напиши Лизе — она проверит.");
 if(!joined)return adCompact(id);
 console.log("ASTRO_JOIN_OK");return astrodaySecondMessage(id);
}
async function astrodayToday(id,handle){if(!await adJoined(id))return sendBotMessage(id,"Сначала нажми «🖤 Я в деле», котик 🤎",adJoinButton);return astrodayTodayCore(id,handle)}
async function adToggle(id,on){
 if(!await adJoined(id))return sendBotMessage(id,"Сначала нажми «Я в деле» 🤎",adJoinButton);
 await db.begin(async tx=>{
 await tx.unsafe("UPDATE astroday_tester_joins SET notifications_enabled=$2 WHERE telegram_id=$1",[id,on]);
 await tx.unsafe("UPDATE liz_clients SET notify_enabled=$2,updated_at=now() WHERE telegram_id=$1",[id,on]);
 await tx.unsafe("UPDATE liz_birth_profiles SET consented_to_daily=$2,updated_at=now() WHERE telegram_id=$1",[id,on]);
 await tx.unsafe("UPDATE liz_tg_consents SET daily_delivery=$2 WHERE telegram_id=$1",[id,on]);
 });
 return sendBotMessage(id,on?"Снова на связи 🖤 Прогнозы — в 07:00 по Кемерово.":"На паузе 🖤 Вернуть рассылку — /resume.");
}
async function adCommand(id,username,c){
 if(!["/today","/day","/test","/status","/help","/stop","/resume","/settings","/plans","/trial","/promo","/paysupport","/terms","/join_test","/confirm_test","/activate_test"].includes(c))return false;
 const t=await astrodayTesterById(id,username);if(!t)return false;
 if(["/join_test","/confirm_test","/activate_test"].includes(c))await astrodayJoinOnce(id,t);
 else if(["/today","/day","/test"].includes(c))await astrodayToday(id,t.handle_key);
 else if(c==="/stop"||c==="/resume")await adToggle(id,c==="/resume");
 else if(c==="/status"){const j=await adJoined(id);await sendBotMessage(id,!j?"Твой профиль ASTRODAY найден 🖤 Нажми «Я в деле».":j.notifications_enabled?"Твой доступ активен 🖤 Прогноз в 07:00 по Кемерово.":"Прогнозы на паузе 🖤 Вернуть — /resume.",j?adTodayButton:adJoinButton)}
 else if(c==="/help")await sendBotMessage(id,"/today — прогноз 🔮\n/status — доступ\n/stop — пауза\n/resume — вернуть\n\nКаждое утро в 07:00 по Кемерово 🖤",adTodayButton);
 else if(c==="/settings")await sendBotMessage(id,"Твоё время прогноза — 07:00 по Кемерово 🖤 Отключить — /stop.");
 else if(["/plans","/trial","/promo","/paysupport","/terms"].includes(c))await sendBotMessage(id,"Твой доступ согласован с Лизой напрямую 🤎 Повторно платить в боте не нужно.",adTodayButton);
 else if(await adJoined(id))await adCompact(id);else await sendBotMessage(id,"Жми «Я в деле» 🖤",adJoinButton);
 return true;
}
async function astrodayTesterById(id,username){const bound=await db.unsafe("SELECT handle_key FROM liz_astro_testers WHERE verified_telegram_id=$1 LIMIT 1",[id]);if(bound[0])return bound[0];const u=String(username||"").replace(/^@/,"").toLowerCase();const open=await db.unsafe("SELECT handle_key FROM liz_astro_testers WHERE verified_telegram_id IS NULL AND (expected_telegram_id=$1 OR (expected_telegram_id IS NULL AND $2<>'' AND lower(telegram_username)=$2)) AND (trial_end_exclusive::timestamp AT TIME ZONE COALESCE(forecast_zone_assumed,'Asia/Novokuznetsk'))>NOW() LIMIT 2",[id,u]);return open.length===1?open[0]:undefined}
async function astrodaySecondMessage(id){await sendBotMessage(id,"ну всёёё, ты в ASTRODAY 🖤\n\nТеперь тут будут твои личные прогнозы по натальной карте.\n\nКаждое утро будем смотреть, что там планеты нам устроили ахаха 🔮\n\nПрогнозы будут прилетать сами, а если захочешь заглянуть — жми «🔮 Мой прогноз».\n\nИ обязательно замечай, что совпало, а что вообще мимо. Потом будем обсуждать в нашем чате первооткрывателей))\n\nВсё, обнимаю.\nПОГНАЛИ 🤎",{...adTodayButton,disable_notification:false})}
async function astrodayTodayCore(id,handle){const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Novokuznetsk",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));const day=parts.year+"-"+parts.month+"-"+parts.day;const rows=await db.unsafe("SELECT body FROM liz_tester_forecasts WHERE handle_key=$1 AND forecast_day=$2::date ORDER BY created_at DESC LIMIT 1",[handle,day]);if(rows[0]?.body)await sendTesterForecast(id,rows[0].body);else await sendBotMessage(id,"Прогноз на сегодня ещё готовится, котик 🖤 Загляни чуть позже.",{disable_notification:false})}

// @bun
// payment-runtime.ts
var schemaCache = new WeakMap;
var validId = (v) => typeof v === "string" && /^[A-Za-z0-9-]{8,90}$/.test(v);
function exactPaymentKopeks(v) {
  if (typeof v !== "string" || !/^\d{1,9}\.\d{2}$/.test(v))
    return null;
  const n = Number(v.replace(".", ""));
  return Number.isSafeInteger(n) ? n : null;
}
async function ensurePaymentSchema(db) {
  let task = schemaCache.get(db);
  if (task)
    return task;
  task = (async () => {
    for (const q of [
      "CREATE TABLE IF NOT EXISTS liz_clients(telegram_id TEXT PRIMARY KEY,telegram_username TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
      "CREATE TABLE IF NOT EXISTS liz_subscriptions(telegram_id TEXT PRIMARY KEY REFERENCES liz_clients(telegram_id),valid_until TIMESTAMPTZ NOT NULL,last_order_id UUID,source TEXT NOT NULL DEFAULT 'migrated',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
      "CREATE TABLE IF NOT EXISTS liz_orders(id UUID PRIMARY KEY,idempotency_key TEXT UNIQUE NOT NULL,telegram_id TEXT NOT NULL REFERENCES liz_clients(telegram_id),plan_code TEXT NOT NULL,plan_months INTEGER NOT NULL,amount_kopeks INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'RUB',provider_payment_id TEXT UNIQUE,confirmation_url TEXT,status TEXT NOT NULL DEFAULT 'creating',receipt_email TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),paid_at TIMESTAMPTZ,activated_at TIMESTAMPTZ,needs_review BOOLEAN NOT NULL DEFAULT FALSE)",
      "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS granted_from TIMESTAMPTZ",
      "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS granted_until TIMESTAMPTZ",
      "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS provider_request JSONB",
      "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ",
      "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS receipt_registration TEXT",
      "CREATE INDEX IF NOT EXISTS liz_orders_pending_idx ON liz_orders(status,updated_at)",
      "CREATE TABLE IF NOT EXISTS liz_refund_events(provider_refund_id TEXT PRIMARY KEY,order_id UUID NOT NULL REFERENCES liz_orders(id),provider_payment_id TEXT NOT NULL,amount_kopeks INTEGER NOT NULL CHECK(amount_kopeks>0),currency TEXT NOT NULL CHECK(currency='RUB'),recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
      "CREATE INDEX IF NOT EXISTS liz_refund_order_idx ON liz_refund_events(order_id,recorded_at)"
    ])
      await db.unsafe(q);
  })();
  schemaCache.set(db, task);
  try {
    await task;
  } catch (e) {
    schemaCache.delete(db);
    throw e;
  }
}
async function paymentProviderRequest(path, method = "GET", body, idempotency) {
  const shop = Bun.env.YOOKASSA_SHOP_ID, key = Bun.env.YOOKASSA_SECRET_KEY;
  if (!shop || !key)
    throw Error("yookassa_credentials_missing");
  if (!/^[a-z0-9/?&=_.%:-]+$/i.test(path) || path.startsWith("/"))
    throw Error("yookassa_path_invalid");
  const headers = { Authorization: "Basic " + Buffer.from(shop + ":" + key).toString("base64"), Accept: "application/json", "Content-Type": "application/json" };
  if (idempotency)
    headers["Idempotence-Key"] = idempotency;
  const r = await fetch("https://api.yookassa.ru/v3/" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("yookassa_invalid_json_" + r.status);
  }
  if (!r.ok) {
    const code = typeof data?.code === "string" && /^[a-z_]{1,80}$/.test(data.code) ? data.code : "unknown";
    const parameter = typeof data?.parameter === "string" && /^[a-z0-9_.]{1,80}$/i.test(data.parameter) ? data.parameter : "";
    throw Error("yookassa_http_" + r.status + "_" + code + (parameter ? "_" + parameter : ""));
  }
  return data;
}
function buildPaymentRequest(order) {
  const cents = Number(order.amount_kopeks), months = Number(order.plan_months), vat = Number(Bun.env.YOOKASSA_VAT_CODE), tax = Number(Bun.env.YOOKASSA_TAX_SYSTEM_CODE);
  const returnUrl = Bun.env.PAYMENT_RETURN_URL || "";
  if (!Number.isSafeInteger(cents) || cents <= 0 || ![1, 6, 12].includes(months) || !Number.isInteger(vat) || vat < 1 || vat > 12 || !Number.isInteger(tax) || tax < 1 || tax > 6 || !returnUrl.startsWith("https://"))
    throw Error("yookassa_receipt_configuration_invalid");
  const amount = { value: (cents / 100).toFixed(2), currency: "RUB" };
  const description = "ASTRODAY \u2014 " + months + " \u043C\u0435\u0441.";
  return { amount, capture: true, description, confirmation: { type: "redirect", return_url: returnUrl }, metadata: { order_id: String(order.id), plan: String(order.plan_code) }, receipt: { customer: { email: order.receipt_email }, tax_system_code: tax, items: [{ description, quantity: "1.00", amount, vat_code: vat, payment_mode: "full_prepayment", payment_subject: "service" }] } };
}
function providerMatchesOrder(provider, order) {
  if (provider?.metadata?.order_id !== String(order.id) || provider?.metadata?.plan !== order.plan_code)
    return "metadata_mismatch";
  if (provider?.recipient?.account_id !== Bun.env.YOOKASSA_SHOP_ID || provider?.test !== false)
    return "merchant_or_live_mode_mismatch";
  if (provider?.amount?.currency !== "RUB" || exactPaymentKopeks(provider?.amount?.value) !== Number(order.amount_kopeks) || order.currency !== "RUB")
    return "amount_mismatch";
  return null;
}
async function applyProviderPayment(db, provider) {
  await ensurePaymentSchema(db);
  if (!validId(provider?.id))
    throw Error("invalid_provider_payment_id");
  return db.begin(async (tx) => {
    const rows = await tx.unsafe("SELECT * FROM liz_orders WHERE provider_payment_id=$1 FOR UPDATE", [provider.id]);
    const order = rows[0];
    if (!order)
      return "unknown_order";
    const mismatch = providerMatchesOrder(provider, order);
    if (mismatch) {
      await tx.unsafe("UPDATE liz_orders SET needs_review=TRUE,updated_at=NOW(),reconciled_at=NOW() WHERE id=$1::uuid", [order.id]);
      return mismatch;
    }
    const receipt = typeof provider.receipt_registration === "string" ? provider.receipt_registration : null;
    await tx.unsafe("UPDATE liz_orders SET reconciled_at=NOW(),receipt_registration=COALESCE($2,receipt_registration) WHERE id=$1::uuid", [order.id, receipt]);
    if (provider.status === "succeeded" && provider.paid === true) {
      if (order.activated_at)
        return "already_activated";
      if (order.needs_review || !["creating", "pending"].includes(order.status))
        return "held_for_review";
      const months = Number(order.plan_months);
      if (![1, 6, 12].includes(months))
        throw Error("invalid_subscription_months");
      await tx.unsafe("SELECT telegram_id FROM liz_clients WHERE telegram_id=$1 FOR UPDATE", [order.telegram_id]);
      const subscriptions = await tx.unsafe("SELECT valid_until FROM liz_subscriptions WHERE telegram_id=$1", [order.telegram_id]);
      const old = Date.parse(subscriptions[0]?.valid_until || "");
      const start = Number.isFinite(old) && old > Date.now() ? new Date(old) : new Date;
      const dates = await tx.unsafe("SELECT ($1::timestamptz + make_interval(months=>$2::integer)) AS until", [start.toISOString(), months]);
      const until = new Date(dates[0]?.until);
      if (!Number.isFinite(until.getTime()) || until.getTime() <= start.getTime())
        throw Error("subscription_interval_invalid");
      await tx.unsafe("INSERT INTO liz_subscriptions(telegram_id,valid_until,last_order_id,source) VALUES($1,$2::timestamptz,$3::uuid,'yookassa') ON CONFLICT(telegram_id) DO UPDATE SET valid_until=EXCLUDED.valid_until,last_order_id=EXCLUDED.last_order_id,source='yookassa',updated_at=NOW()", [order.telegram_id, until.toISOString(), order.id]);
      await tx.unsafe("UPDATE liz_orders SET status='paid',paid_at=COALESCE(paid_at,NOW()),activated_at=NOW(),granted_from=$2::timestamptz,granted_until=$3::timestamptz,updated_at=NOW() WHERE id=$1::uuid", [order.id, start.toISOString(), until.toISOString()]);
      return "activated";
    }
    if (provider.status === "canceled" && !order.activated_at) {
      await tx.unsafe("UPDATE liz_orders SET status='canceled',updated_at=NOW() WHERE id=$1::uuid", [order.id]);
      return "canceled";
    }
    return "pending";
  });
}
async function applyProviderRefund(db, refund) {
  await ensurePaymentSchema(db);
  const cents = exactPaymentKopeks(refund?.amount?.value);
  if (!validId(refund?.id) || !validId(refund?.payment_id) || refund?.status !== "succeeded" || refund?.amount?.currency !== "RUB" || !cents)
    return "invalid_refund";
  return db.begin(async (tx) => {
    const rows = await tx.unsafe("SELECT * FROM liz_orders WHERE provider_payment_id=$1 FOR UPDATE", [refund.payment_id]);
    const order = rows[0];
    if (!order?.activated_at)
      return "unknown_or_inactive_order";
    await tx.unsafe("SELECT telegram_id FROM liz_clients WHERE telegram_id=$1 FOR UPDATE", [order.telegram_id]);
    const inserted = await tx.unsafe("INSERT INTO liz_refund_events(provider_refund_id,order_id,provider_payment_id,amount_kopeks,currency) VALUES($1,$2::uuid,$3,$4,'RUB') ON CONFLICT(provider_refund_id) DO NOTHING RETURNING provider_refund_id", [refund.id, order.id, refund.payment_id, cents]);
    if (!inserted.length)
      return "duplicate";
    const totals = await tx.unsafe("SELECT SUM(amount_kopeks)::bigint AS total FROM liz_refund_events WHERE order_id=$1::uuid", [order.id]);
    const total = Number(totals[0]?.total || 0), amount = Number(order.amount_kopeks);
    if (total !== amount) {
      await tx.unsafe("UPDATE liz_orders SET needs_review=TRUE,updated_at=NOW() WHERE id=$1::uuid", [order.id]);
      return total > amount ? "over_refunded_manual_review" : "partial_refund_manual_review";
    }
    const subscriptions = await tx.unsafe("SELECT valid_until,last_order_id,source FROM liz_subscriptions WHERE telegram_id=$1 FOR UPDATE", [order.telegram_id]);
    const subscription = subscriptions[0];
    const from = Date.parse(order.granted_from || ""), until = Date.parse(order.granted_until || ""), current = Date.parse(subscription?.valid_until || ""), now = Date.now();
    let decision = "full_refund_manual_review";
    if (Number.isFinite(until) && until <= now)
      decision = "refunded_expired_grant";
    else if (!subscription || !Number.isFinite(current) || current <= now || Number.isFinite(from) && current <= from)
      decision = "refunded_no_current_grant";
    else if (Number.isFinite(from) && Number.isFinite(until) && String(subscription.last_order_id) === String(order.id) && Math.abs(current - until) < 1000) {
      const revised = new Date(Math.min(current, Math.max(now, from))).toISOString();
      await tx.unsafe("UPDATE liz_subscriptions SET valid_until=$2::timestamptz,last_order_id=NULL,updated_at=NOW() WHERE telegram_id=$1", [order.telegram_id, revised]);
      decision = "refunded_remaining_last_grant";
    }
    const manual = decision === "full_refund_manual_review";
    await tx.unsafe("UPDATE liz_orders SET status='refunded',needs_review=$2,updated_at=NOW() WHERE id=$1::uuid", [order.id, manual]);
    return decision;
  });
}

// forecast-runtime.ts
import { createHash, randomUUID } from "crypto";

// forecast-editorial.ts
var FORECAST_EDITORIAL_VERSION = "astroday-editorial-v6-20261115";
var EDITORIAL_VOICE_GUIDE = [
  "\u0416\u0438\u0432\u043E\u0439 \u0440\u0443\u0441\u0441\u043A\u0438\u0439 \u0433\u043E\u043B\u043E\u0441 \u041B\u0438\u0437\u044B: \u043F\u043E\u043D\u044F\u0442\u043D\u043E, \u0442\u043E\u0447\u043D\u043E, \u0431\u0435\u0437 \u0438\u0433\u0440\u044B \u0432 \u0432\u0441\u0435\u0437\u043D\u0430\u044E\u0449\u0435\u0433\u043E \u043E\u0440\u0430\u043A\u0443\u043B\u0430. \u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u043D\u0430 \u0442\u044B. \u0418\u043D\u043E\u0433\u0434\u0430 \u043A\u043E\u0440\u043E\u0442\u043A\u0430\u044F \u043E\u0442\u0440\u044B\u0432\u0438\u0441\u0442\u0430\u044F \u0444\u0440\u0430\u0437\u0430, \u0438\u043D\u043E\u0433\u0434\u0430 \u0440\u0430\u0437\u0432\u0451\u0440\u043D\u0443\u0442\u043E\u0435 \u043E\u0431\u044A\u044F\u0441\u043D\u0435\u043D\u0438\u0435. \u0420\u0438\u0442\u043C \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u043F\u043E \u0441\u043C\u044B\u0441\u043B\u0443.",
  "\u041C\u043E\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043F\u0440\u044F\u043C\u043E\u0439: \u043D\u0430\u0437\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0442\u0438\u0432\u043E\u0440\u0435\u0447\u0438\u0435 \u0438 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0441\u043F\u043E\u0441\u043E\u0431 \u0441 \u043D\u0438\u043C \u043E\u0431\u043E\u0439\u0442\u0438\u0441\u044C. \u041D\u0435 \u0432\u0441\u0442\u0430\u0432\u043B\u044F\u0439 \u043D\u0435\u0436\u043D\u043E\u0441\u0442\u044C, \u0433\u0440\u0443\u0431\u043E\u0441\u0442\u044C, \u0448\u0443\u0442\u043A\u0443 \u0438\u043B\u0438 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u043F\u043E \u0438\u043C\u0435\u043D\u0438 \u0440\u0430\u0434\u0438 \u0441\u0430\u043C\u043E\u0433\u043E \u044D\u0444\u0444\u0435\u043A\u0442\u0430. \u041D\u0435 \u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u0439 \u043A\u0430\u0436\u0434\u044B\u0439 \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u043E; \u0441\u043B\u043E\u0432\u043E \xAB\u0421\u0451\xBB \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u044C\u044E.",
  "\u041D\u0435 \u0432\u044B\u0434\u0443\u043C\u044B\u0432\u0430\u0439 \u043B\u0438\u0447\u043D\u044B\u0439 \u043E\u043F\u044B\u0442 \u0430\u0432\u0442\u043E\u0440\u0430, \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u043A\u043B\u0438\u0435\u043D\u0442\u043A\u0438, \u0435\u0451 \u0447\u0443\u0432\u0441\u0442\u0432\u0430, \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B \u0438\u043B\u0438 \u0441\u043E\u0431\u044B\u0442\u0438\u044F. \u041D\u0435 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0439, \u0447\u0442\u043E \u0437\u043D\u0430\u0435\u0448\u044C, \u0447\u0442\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u043E\u0449\u0443\u0449\u0430\u0435\u0442. \u0423\u0441\u043B\u043E\u0432\u043D\u0430\u044F \u0444\u043E\u0440\u043C\u0443\u043B\u0438\u0440\u043E\u0432\u043A\u0430 \xAB\u0435\u0441\u043B\u0438\u2026\xBB \u0443\u043C\u0435\u0441\u0442\u043D\u0435\u0435 \u043F\u0440\u0438\u0441\u0432\u043E\u0435\u043D\u043D\u043E\u0433\u043E \u043F\u0435\u0440\u0435\u0436\u0438\u0432\u0430\u043D\u0438\u044F.",
  "\u041D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0443\u044E \u0441\u0445\u0435\u043C\u0443 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u2014 \u043C\u043E\u0440\u0430\u043B\u044C \u2014 \u043F\u0440\u0438\u0437\u044B\u0432. \u0411\u0435\u0437 \u043F\u0440\u043E\u0434\u0430\u0436, \u0445\u0435\u0448\u0442\u0435\u0433\u043E\u0432, \u0438\u0441\u043A\u0443\u0441\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0445 \u0441\u0432\u044F\u0437\u043E\u043A \xAB\u0442\u0435\u043F\u0435\u0440\u044C \u0441\u0430\u043C\u043E\u0435 \u0432\u043A\u0443\u0441\u043D\u043E\u0435\xBB, \xAB\u0434\u0435\u0440\u0436\u0438\u0441\u044C \u043A\u0440\u0435\u043F\u0447\u0435\xBB, \xAB\u0412\u0441\u0435\u043B\u0435\u043D\u043D\u0430\u044F \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0430\u0435\u0442\xBB. \u041D\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0439 \u043E\u0434\u0438\u043D \u0441\u043E\u0432\u0435\u0442 \u0438\u043B\u0438 \u043E\u0431\u0440\u0430\u0437 \u0432 \u0441\u043E\u0441\u0435\u0434\u043D\u0438\u0445 \u0434\u043D\u044F\u0445.",
  "\u0410\u0441\u0442\u0440\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0444\u0430\u043A\u0442\u044B \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u0438 \u0432\u0441\u0442\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0438\u0437 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0433\u043E \u0440\u0430\u0441\u0447\u0451\u0442\u0430. \u0412 \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440\u0441\u043A\u043E\u0439 \u0447\u0430\u0441\u0442\u0438 \u043D\u0443\u0436\u043D\u044B \u0442\u0440\u0430\u043A\u0442\u043E\u0432\u043A\u0430 \u0438 \u043E\u0440\u0438\u0435\u043D\u0442\u0438\u0440, \u0430 \u043D\u0435 \u043D\u043E\u0432\u044B\u0435 \u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043F\u043B\u0430\u043D\u0435\u0442, \u0437\u043D\u0430\u043A\u0438, \u0430\u0441\u043F\u0435\u043A\u0442\u044B, \u0434\u043E\u043C\u0430, \u0434\u0430\u0442\u044B, \u0447\u0430\u0441\u044B \u0438\u043B\u0438 \u043E\u0440\u0431\u0438\u0441\u044B. \u041D\u0435 \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u044B\u0432\u0430\u0439 \u0442\u0440\u0430\u043D\u0437\u0438\u0442\u043D\u0443\u044E \u043F\u043B\u0430\u043D\u0435\u0442\u0443 \u0432 \u043D\u0430\u0442\u0430\u043B\u044C\u043D\u0443\u044E.",
  "\u0421\u043E\u0431\u044B\u0442\u0438\u044F, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043D\u0435 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D\u044B, \u043D\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0442 \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0430. \u0422\u043E\u0447\u043D\u044B\u0439 \u0430\u0441\u043F\u0435\u043A\u0442 \u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u0445 \u043E\u0440\u0431\u0438\u0441\u0430 \u0440\u0430\u0437\u043B\u0438\u0447\u0430\u044E\u0442\u0441\u044F. \u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0434\u043E\u043C\u0430 \u0438 \u043D\u0430\u0442\u0430\u043B\u044C\u043D\u0443\u044E \u041B\u0443\u043D\u0443; \u0447\u0438\u0442\u0430\u0442\u0435\u043B\u044E \u043D\u0435 \u043D\u0443\u0436\u043D\u043E \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043E\u0431\u044A\u044F\u0441\u043D\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0433\u043E \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F.",
  "\u041D\u0438\u043A\u0430\u043A\u0438\u0445 \u0433\u0430\u0440\u0430\u043D\u0442\u0438\u0439 \u0441\u043E\u0431\u044B\u0442\u0438\u0439, \u0443\u0441\u0442\u0440\u0430\u0448\u0430\u044E\u0449\u0438\u0445 \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u0438\u0439, \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u043E\u0432 \u0438\u043B\u0438 \u0443\u043A\u0430\u0437\u0430\u043D\u0438\u0439 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0442\u044C \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u044B\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u044F. \u041A\u043E\u043D\u043A\u0440\u0435\u0442\u0438\u043A\u0430 \u2014 \u0432 \u0443\u0441\u043B\u043E\u0432\u0438\u0438 \u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u043C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0438: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0441\u0440\u043E\u043A, \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0443\u043C\u043C\u0443, \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A, \u043D\u0430\u0437\u0432\u0430\u0442\u044C \u0441\u0432\u043E\u044E \u0447\u0430\u0441\u0442\u044C \u0440\u0430\u0431\u043E\u0442\u044B.",
  "\u0412\u0435\u0440\u043D\u0438 \u043E\u0431\u044A\u0435\u043A\u0442 {text, factIds}: text \u2014 \u0434\u0432\u0430\u2013\u0447\u0435\u0442\u044B\u0440\u0435 \u0441\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u0430\u0431\u0437\u0430\u0446\u0430 \u0442\u0440\u0430\u043A\u0442\u043E\u0432\u043A\u0438 \u0431\u0435\u0437 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u044F \u0444\u0430\u043A\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0432\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F; factIds \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440\u044B \u0438\u0437 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043D\u043E\u0433\u043E brief. \u041D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A, \u0434\u0430\u0442\u0443, \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u0438\u043B\u0438 \u0438\u043C\u044F."
].join(`
`);
var FE_ENGINE = "astro-v2-placidus-swe-2.10";
var FE_NAMES = { Sun: "\u0421\u043E\u043B\u043D\u0446\u0435", Moon: "\u041B\u0443\u043D\u0430", Mercury: "\u041C\u0435\u0440\u043A\u0443\u0440\u0438\u0439", Venus: "\u0412\u0435\u043D\u0435\u0440\u0430", Mars: "\u041C\u0430\u0440\u0441", Jupiter: "\u042E\u043F\u0438\u0442\u0435\u0440", Saturn: "\u0421\u0430\u0442\u0443\u0440\u043D", Uranus: "\u0423\u0440\u0430\u043D", Neptune: "\u041D\u0435\u043F\u0442\u0443\u043D", Pluto: "\u041F\u043B\u0443\u0442\u043E\u043D" };
var FE_NATAL = { Sun: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u0421\u043E\u043B\u043D\u0446\u0443", Moon: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u0439 \u041B\u0443\u043D\u0435", Mercury: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u041C\u0435\u0440\u043A\u0443\u0440\u0438\u044E", Venus: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u0439 \u0412\u0435\u043D\u0435\u0440\u0435", Mars: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u041C\u0430\u0440\u0441\u0443", Jupiter: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u042E\u043F\u0438\u0442\u0435\u0440\u0443", Saturn: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u0421\u0430\u0442\u0443\u0440\u043D\u0443", Uranus: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u0423\u0440\u0430\u043D\u0443", Neptune: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u041D\u0435\u043F\u0442\u0443\u043D\u0443", Pluto: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u041F\u043B\u0443\u0442\u043E\u043D\u0443" };
var FE_NATAL_INSTR = { Sun: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u044B\u043C \u0421\u043E\u043B\u043D\u0446\u0435\u043C", Moon: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u0439 \u041B\u0443\u043D\u043E\u0439", Mercury: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u044B\u043C \u041C\u0435\u0440\u043A\u0443\u0440\u0438\u0435\u043C", Venus: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u0439 \u0412\u0435\u043D\u0435\u0440\u043E\u0439", Mars: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u044B\u043C \u041C\u0430\u0440\u0441\u043E\u043C", Jupiter: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u044B\u043C \u042E\u043F\u0438\u0442\u0435\u0440\u043E\u043C", Saturn: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u044B\u043C \u0421\u0430\u0442\u0443\u0440\u043D\u043E\u043C", Uranus: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u044B\u043C \u0423\u0440\u0430\u043D\u043E\u043C", Neptune: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u044B\u043C \u041D\u0435\u043F\u0442\u0443\u043D\u043E\u043C", Pluto: "\u043D\u0430\u0442\u0430\u043B\u044C\u043D\u044B\u043C \u041F\u043B\u0443\u0442\u043E\u043D\u043E\u043C" };
var FE_SIGNS = { Aries: "\u041E\u0432\u043D\u0435", Taurus: "\u0422\u0435\u043B\u044C\u0446\u0435", Gemini: "\u0411\u043B\u0438\u0437\u043D\u0435\u0446\u0430\u0445", Cancer: "\u0420\u0430\u043A\u0435", Leo: "\u041B\u044C\u0432\u0435", Virgo: "\u0414\u0435\u0432\u0435", Libra: "\u0412\u0435\u0441\u0430\u0445", Scorpio: "\u0421\u043A\u043E\u0440\u043F\u0438\u043E\u043D\u0435", Sagittarius: "\u0421\u0442\u0440\u0435\u043B\u044C\u0446\u0435", Capricorn: "\u041A\u043E\u0437\u0435\u0440\u043E\u0433\u0435", Aquarius: "\u0412\u043E\u0434\u043E\u043B\u0435\u0435", Pisces: "\u0420\u044B\u0431\u0430\u0445" };
var FE_ASPECTS = { conjunction: "\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435", opposition: "\u043E\u043F\u043F\u043E\u0437\u0438\u0446\u0438\u044E", square: "\u043A\u0432\u0430\u0434\u0440\u0430\u0442", trine: "\u0442\u0440\u0438\u043D", sextile: "\u0441\u0435\u043A\u0441\u0442\u0438\u043B\u044C" };
var FE_SPEED = { Moon: 65, Sun: 50, Mercury: 48, Venus: 45, Mars: 40, Jupiter: 20, Saturn: 15, Uranus: 10, Neptune: 8, Pluto: 6 };
function feDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function feLocal(iso, zone) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime()))
    return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
  return { day: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
}
function feHash(value) {
  let h = 2166136261;
  for (let i = 0;i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
var FE_HOUSE_FOCUS = { 1: "\u0441\u0432\u043E\u0439 \u0442\u0435\u043C\u043F \u0438 \u043B\u0438\u0447\u043D\u0430\u044F \u0438\u043D\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0430", 2: "\u0434\u0435\u043D\u044C\u0433\u0438, \u0440\u0435\u0441\u0443\u0440\u0441\u044B \u0438 \u043B\u0438\u0447\u043D\u044B\u0435 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442\u044B", 3: "\u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B, \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u0432\u0441\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u0438", 4: "\u0434\u043E\u043C, \u0431\u043B\u0438\u0437\u043A\u0438\u0435 \u0438 \u043B\u0438\u0447\u043D\u043E\u0435 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u043E", 5: "\u0442\u0432\u043E\u0440\u0447\u0435\u0441\u0442\u0432\u043E, \u0443\u0434\u043E\u0432\u043E\u043B\u044C\u0441\u0442\u0432\u0438\u0435 \u0438 \u0441\u0430\u043C\u043E\u0432\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u0435", 6: "\u043F\u043E\u0432\u0441\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0434\u0435\u043B\u0430 \u0438 \u0440\u0430\u0431\u043E\u0447\u0438\u0439 \u0440\u0438\u0442\u043C", 7: "\u043F\u0430\u0440\u0442\u043D\u0451\u0440\u0441\u0442\u0432\u043E \u0438 \u0432\u0437\u0430\u0438\u043C\u043D\u044B\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F", 8: "\u043E\u0431\u0449\u0438\u0435 \u0440\u0435\u0441\u0443\u0440\u0441\u044B \u0438 \u0433\u0440\u0430\u043D\u0438\u0446\u044B \u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0441\u0442\u0438", 9: "\u043D\u043E\u0432\u044B\u0435 \u0437\u043D\u0430\u043D\u0438\u044F \u0438 \u0434\u0430\u043B\u044C\u043D\u0438\u0435 \u043F\u043B\u0430\u043D\u044B", 10: "\u0440\u0430\u0431\u043E\u0442\u0430, \u0440\u0435\u043F\u0443\u0442\u0430\u0446\u0438\u044F \u0438 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430", 11: "\u0434\u0440\u0443\u0437\u044C\u044F, \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u0438 \u043E\u0431\u0449\u0438\u0435 \u043F\u043B\u0430\u043D\u044B", 12: "\u0443\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435, \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435" };
var FE_HOUSE_WORD = { 1: "\u043F\u0435\u0440\u0432\u043E\u043C", 2: "\u0432\u0442\u043E\u0440\u043E\u043C", 3: "\u0442\u0440\u0435\u0442\u044C\u0435\u043C", 4: "\u0447\u0435\u0442\u0432\u0451\u0440\u0442\u043E\u043C", 5: "\u043F\u044F\u0442\u043E\u043C", 6: "\u0448\u0435\u0441\u0442\u043E\u043C", 7: "\u0441\u0435\u0434\u044C\u043C\u043E\u043C", 8: "\u0432\u043E\u0441\u044C\u043C\u043E\u043C", 9: "\u0434\u0435\u0432\u044F\u0442\u043E\u043C", 10: "\u0434\u0435\u0441\u044F\u0442\u043E\u043C", 11: "\u043E\u0434\u0438\u043D\u043D\u0430\u0434\u0446\u0430\u0442\u043E\u043C", 12: "\u0434\u0432\u0435\u043D\u0430\u0434\u0446\u0430\u0442\u043E\u043C" };
function feAspectTopic(a) {
  if (!a)
    return "lunar";
  const pair = [a.transit, a.natal];
  if (pair.includes("Venus") && pair.includes("Saturn"))
    return "value_boundaries";
  if (pair.includes("Mercury") && pair.includes("Mars"))
    return "words_action";
  if (pair.includes("Neptune"))
    return "clarity";
  if (pair.includes("Pluto"))
    return "control";
  if (pair.includes("Uranus"))
    return "change";
  return { Sun: "direction", Moon: "feelings", Mercury: "words", Venus: "relationships", Mars: "action", Jupiter: "scale", Saturn: "responsibility" }[a.natal] || "lunar";
}
function feFactSentence(a) {
  const target = a.aspect === "conjunction" ? "\u0441 " + FE_NATAL_INSTR[a.natal] : "\u043A " + FE_NATAL[a.natal];
  if (a.exact)
    return "\u0412 " + a.localTime + " \u043F\u043E \u0442\u0432\u043E\u0435\u043C\u0443 \u0447\u0430\u0441\u043E\u0432\u043E\u043C\u0443 \u043F\u043E\u044F\u0441\u0443 " + FE_NAMES[a.transit] + " \u043E\u0431\u0440\u0430\u0437\u0443\u0435\u0442 " + FE_ASPECTS[a.aspect] + " " + target + ".";
  const where = { conjunction: "\u0432 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0438", opposition: "\u0432 \u043E\u043F\u043F\u043E\u0437\u0438\u0446\u0438\u0438", square: "\u0432 \u043A\u0432\u0430\u0434\u0440\u0430\u0442\u0435", trine: "\u0432 \u0442\u0440\u0438\u043D\u0435", sextile: "\u0432 \u0441\u0435\u043A\u0441\u0442\u0438\u043B\u0435" }[a.aspect];
  const background = ["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"].includes(a.transit);
  return (background ? "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0444\u043E\u043D \u2014 " : "") + FE_NAMES[a.transit] + " " + where + " " + target + ".";
}
var FE_SIGN_GEN = { Aries: "\u041E\u0432\u043D\u0430", Taurus: "\u0422\u0435\u043B\u044C\u0446\u0430", Gemini: "\u0411\u043B\u0438\u0437\u043D\u0435\u0446\u043E\u0432", Cancer: "\u0420\u0430\u043A\u0430", Leo: "\u041B\u044C\u0432\u0430", Virgo: "\u0414\u0435\u0432\u044B", Libra: "\u0412\u0435\u0441\u043E\u0432", Scorpio: "\u0421\u043A\u043E\u0440\u043F\u0438\u043E\u043D\u0430", Sagittarius: "\u0421\u0442\u0440\u0435\u043B\u044C\u0446\u0430", Capricorn: "\u041A\u043E\u0437\u0435\u0440\u043E\u0433\u0430", Aquarius: "\u0412\u043E\u0434\u043E\u043B\u0435\u044F", Pisces: "\u0420\u044B\u0431" };
function feEventTime(row, day, zone) {
  if (typeof row?.at?.utc !== "string" || typeof row?.at?.local !== "string")
    return null;
  const local = feLocal(row.at.utc, zone);
  if (!local || local.day !== day || !Number.isFinite(Date.parse(row.at.local)) || Math.abs(Date.parse(row.at.utc) - Date.parse(row.at.local)) > 1000 || row.at.local.slice(0, 10) !== day)
    return null;
  return { localTime: local.time, atUtc: new Date(row.at.utc).toISOString() };
}
function feGlobalFacts(calc) {
  const output = [], seen = new Set;
  if (!Array.isArray(calc.dayEvents))
    return output;
  calc.dayEvents.forEach((row, i) => {
    const when = feEventTime(row, calc.day, calc.timeZone);
    if (!when)
      return;
    const entry = { id: calc.day + ":event:" + i, type: row.type, body: null, motion: null, sign: null, house: null, transit: null, otherTransit: null, aspect: null, ...when, rank: 0 };
    if (row.type === "planet_station") {
      if (!FE_NAMES[row.body] || !["direct", "retrograde"].includes(row.motion))
        return;
      entry.body = row.body;
      entry.motion = row.motion;
      entry.rank = ["Mercury", "Venus", "Mars"].includes(row.body) ? 220 : 170;
    } else if (row.type === "full_moon" || row.type === "new_moon") {
      if (row.body !== "Moon" || !FE_SIGNS[row.sign])
        return;
      entry.body = "Moon";
      entry.sign = row.sign;
      entry.house = calc.houseKnown && row.houseSystem === "placidus" && Number.isInteger(row.natalHouse) && row.natalHouse >= 1 && row.natalHouse <= 12 ? row.natalHouse : null;
      entry.rank = 210;
    } else if (row.type === "exact_sky_aspect") {
      if (row.scope !== "transit_transit" || !FE_NAMES[row.transit] || !FE_NAMES[row.otherTransit] || row.transit === row.otherTransit || !FE_ASPECTS[row.aspect])
        return;
      entry.transit = row.transit;
      entry.otherTransit = row.otherTransit;
      entry.aspect = row.aspect;
      entry.rank = row.transit === "Moon" || row.otherTransit === "Moon" ? 20 : 120;
      if (row.aspect === "conjunction")
        entry.rank += 10;
    } else if (row.type === "moon_sign_ingress") {
      if (row.body !== "Moon" || !FE_SIGNS[row.toSign] || !FE_SIGNS[row.fromSign] || row.toSign === row.fromSign)
        return;
      entry.body = "Moon";
      entry.sign = row.toSign;
      entry.rank = 10;
    } else
      return;
    const key = [entry.type, entry.body, entry.motion, entry.sign, entry.transit, entry.otherTransit, entry.aspect, entry.atUtc].join(":");
    if (seen.has(key))
      return;
    seen.add(key);
    output.push(entry);
  });
  return output.sort((a, b) => b.rank - a.rank || a.atUtc.localeCompare(b.atUtc) || a.id.localeCompare(b.id));
}
function feGlobalSentence(event) {
  const time = "\u0412 " + event.localTime + " \u043F\u043E \u0442\u0432\u043E\u0435\u043C\u0443 \u0447\u0430\u0441\u043E\u0432\u043E\u043C\u0443 \u043F\u043E\u044F\u0441\u0443 ";
  if (event.type === "planet_station")
    return time + FE_NAMES[event.body] + " \u0440\u0430\u0437\u0432\u043E\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u043A " + (event.motion === "direct" ? "\u043F\u0440\u044F\u043C\u043E\u043C\u0443" : "\u0440\u0435\u0442\u0440\u043E\u0433\u0440\u0430\u0434\u043D\u043E\u043C\u0443") + " \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u044E.";
  if (event.type === "full_moon" || event.type === "new_moon")
    return time + "\u043D\u0430\u0441\u0442\u0443\u043F\u0430\u0435\u0442 " + (event.type === "full_moon" ? "\u043F\u043E\u043B\u043D\u043E\u043B\u0443\u043D\u0438\u0435" : "\u043D\u043E\u0432\u043E\u043B\u0443\u043D\u0438\u0435") + " \u0432 " + FE_SIGNS[event.sign] + (event.house !== null ? (event.house === 2 ? ", \u0432\u043E " : ", \u0432 ") + FE_HOUSE_WORD[event.house] + " \u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C \u0434\u043E\u043C\u0435" : "") + ".";
  if (event.type === "moon_sign_ingress")
    return time + "\u041B\u0443\u043D\u0430 \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0438\u0442 \u0432 \u0437\u043D\u0430\u043A " + FE_SIGN_GEN[event.sign] + ".";
  return time + "\u043D\u0430 \u043D\u0435\u0431\u0435 " + FE_NAMES[event.transit] + " \u0438 " + FE_NAMES[event.otherTransit] + " \u043E\u0431\u0440\u0430\u0437\u0443\u044E\u0442 " + FE_ASPECTS[event.aspect] + " \u0434\u0440\u0443\u0433 \u0441 \u0434\u0440\u0443\u0433\u043E\u043C.";
}
function normalizeEditorialEvidence(calc, options = {}) {
  if (calc?.version !== FE_ENGINE || calc?.houseSystem !== "placidus" || !feDay(calc?.day) || typeof calc?.timeZone !== "string")
    throw Error("editorial_invalid_calculation");
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: calc.timeZone }).format(new Date);
  } catch {
    throw Error("editorial_invalid_timezone");
  }
  if (typeof calc.houseKnown !== "boolean" || typeof calc.natalMoonReliable !== "boolean" || !FE_SIGNS[calc.transitingMoon?.sign])
    throw Error("editorial_missing_precision");
  const reliable = calc.natalMoonReliable === true, houseKnown = calc.houseKnown === true;
  const house = houseKnown && Number.isInteger(calc.transitingMoon.natalHouse) && calc.transitingMoon.natalHouse >= 1 && calc.transitingMoon.natalHouse <= 12 ? calc.transitingMoon.natalHouse : null;
  const aspects = [], seen = new Set;
  const add = (row, index, exact) => {
    if (!row || !FE_NAMES[row.transit] || !FE_NAMES[row.natal] || !FE_ASPECTS[row.aspect] || row.scope && row.scope !== "transit_natal" || !reliable && row.natal === "Moon")
      return;
    let localTime = null, atUtc = null;
    if (exact) {
      if (row.type !== "exact_personal_aspect" || typeof row.at?.utc !== "string" || typeof row.at?.local !== "string")
        return;
      const local = feLocal(row.at.utc, calc.timeZone);
      if (!local || local.day !== calc.day || !Number.isFinite(Date.parse(row.at.local)) || Math.abs(Date.parse(row.at.utc) - Date.parse(row.at.local)) > 1000 || row.at.local.slice(0, 10) !== calc.day)
        return;
      localTime = local.time;
      atUtc = new Date(row.at.utc).toISOString();
    }
    const orb = exact ? 0 : Number(row.orbDeg), limit = Number.isFinite(row.orbLimitDeg) ? Number(row.orbLimitDeg) : 8;
    if (!Number.isFinite(orb) || orb < 0 || orb > Math.min(10, limit))
      return;
    const key = [row.transit, row.natal, row.aspect, exact ? atUtc : "snapshot"].join(":");
    if (seen.has(key))
      return;
    seen.add(key);
    aspects.push({ id: calc.day + (exact ? ":event:" : ":aspect:") + index, transit: row.transit, natal: row.natal, aspect: row.aspect, orb, exact, localTime, atUtc, rank: (exact ? 100 : 0) + (FE_SPEED[row.transit] || 0) + ({ Saturn: 8, Sun: 7, Moon: 7, Mars: 6, Venus: 5, Mercury: 4, Jupiter: 4, Uranus: 3, Neptune: 3, Pluto: 3 }[row.natal] || 0) + ({ conjunction: 4, opposition: 3, square: 3, trine: 2, sextile: 1 }[row.aspect] || 0) - Math.min(orb, 8) * 2 });
  };
  if (Array.isArray(calc.dayEvents))
    calc.dayEvents.forEach((x, i) => add(x, i, true));
  if (Array.isArray(calc.activeAspects))
    calc.activeAspects.forEach((x, i) => add(x, i, false));
  aspects.sort((a, b) => b.rank - a.rank || a.orb - b.orb || a.id.localeCompare(b.id));
  const selected = [];
  const pairs = new Set;
  for (const a of aspects) {
    const pair = [a.transit, a.natal, a.aspect].join(":");
    if (pairs.has(pair))
      continue;
    pairs.add(pair);
    selected.push(a);
    if (selected.length === 2)
      break;
  }
  const globalEvents = feGlobalFacts(calc);
  const significantGlobal = globalEvents.find((x) => x.rank >= 100) || (!selected.length ? globalEvents[0] : null);
  const selectedGlobalEvents = significantGlobal ? [significantGlobal] : [];
  const primary = selected[0], tone = primary && ["square", "opposition"].includes(primary.aspect) ? "tense" : primary && ["trine", "sextile"].includes(primary.aspect) ? "supportive" : "focused";
  const name = typeof options.preferredName === "string" ? options.preferredName.replace(/[<>\x00-\x1f]/g, "").trim().slice(0, 60) : "";
  const moonId = calc.day + ":moon:snapshot";
  const moonPosition = "\u041B\u0443\u043D\u0430 \u0432 " + FE_SIGNS[calc.transitingMoon.sign] + (house !== null ? (house === 2 ? ", \u0432\u043E " : ", \u0432 ") + FE_HOUSE_WORD[house] + " \u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u043C \u0434\u043E\u043C\u0435" : "");
  const noon = calc.representativeLocalHour === 12;
  const moonVariants = noon ? ["\u041D\u0430 \u043F\u043E\u043B\u0434\u0435\u043D\u044C " + moonPosition + ".", moonPosition + ". \u042D\u0442\u043E \u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043D\u0430 \u043F\u043E\u043B\u0434\u0435\u043D\u044C.", "\u0412 \u043A\u0430\u0440\u0442\u0435 \u043D\u0430 \u043F\u043E\u043B\u0434\u0435\u043D\u044C " + moonPosition + "."] : ["\u0412 \u0434\u043D\u0435\u0432\u043D\u043E\u043C \u0441\u0440\u0435\u0437\u0435 " + moonPosition + ".", moonPosition + " \u2014 \u0432 \u0434\u043D\u0435\u0432\u043D\u043E\u043C \u0441\u0440\u0435\u0437\u0435 \u0440\u0430\u0441\u0447\u0451\u0442\u0430.", "\u041F\u043E \u0434\u043D\u0435\u0432\u043D\u043E\u0439 \u043A\u0430\u0440\u0442\u0435: " + moonPosition + "."];
  const moonFact = moonVariants[feHash(calc.day + calc.transitingMoon.sign) % moonVariants.length];
  return { version: FORECAST_EDITORIAL_VERSION, engineVersion: FE_ENGINE, day: calc.day, timeZone: calc.timeZone, houseKnown, natalMoonReliable: reliable, preferredName: name || null, moon: { id: moonId, sign: calc.transitingMoon.sign, house }, aspects, selectedAspects: selected, globalEvents, selectedGlobalEvents, factIds: [moonId, ...selectedGlobalEvents.map((x) => x.id), ...selected.map((x) => x.id)], factualSentences: [moonFact, ...selectedGlobalEvents.map(feGlobalSentence), ...primary ? [feFactSentence(primary)] : []], topic: feAspectTopic(primary), tone, houseFocus: house !== null ? FE_HOUSE_FOCUS[house] : null, exactTimes: [...selectedGlobalEvents.map((x) => x.localTime), ...selected.filter((x) => x.exact && x.localTime).map((x) => x.localTime)], recentTextExcerpts: (options.recentTexts || []).filter((x) => typeof x === "string").slice(0, 4).map((x) => x.slice(0, 1800)) };
}
function getEditorialBrief(calc, options = {}) {
  return normalizeEditorialEvidence(calc, options);
}
var FE_HOUSE_PARAGRAPHS = { "1": ["\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0437\u0431\u0435\u0440\u0438\u0441\u044C, \u0430 \u0442\u0435\u0431\u0435 \u0441\u0430\u043C\u043E\u0439 \u044D\u0442\u043E \u043D\u0430\u0434\u043E? \u041D\u0435 \u0442\u043E, \u0447\u0442\u043E \u0443\u0434\u043E\u0431\u043D\u043E \u0432\u0441\u0435\u043C \u0432\u043E\u043A\u0440\u0443\u0433, \u0430 \u0442\u043E, \u0440\u0430\u0434\u0438 \u0447\u0435\u0433\u043E \u0442\u044B \u0432\u043E\u043E\u0431\u0449\u0435 \u0432\u0437\u044F\u043B\u0430\u0441\u044C \u0437\u0430 \u0434\u0435\u043B\u043E. \u0427\u0443\u0436\u0443\u044E \u043F\u0440\u043E\u0441\u044C\u0431\u0443 \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u0441\u043B\u0443\u0448\u0430\u0442\u044C \u0438 \u043E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043D\u0430 \u043D\u0435\u0451 \u043F\u043E\u0437\u0436\u0435. \u041D\u0435 \u0432\u0441\u0451, \u0447\u0442\u043E \u043F\u0440\u0438\u043B\u0435\u0442\u0435\u043B\u043E \u0441\u0435\u0433\u043E\u0434\u043D\u044F, \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u0442\u0432\u043E\u0435\u0439 \u0437\u0430\u0434\u0430\u0447\u0435\u0439.", "\u041C\u043E\u0436\u043D\u043E \u043D\u0430\u0447\u0430\u0442\u044C \u0431\u0435\u0437 \u043E\u0431\u0449\u0435\u0433\u043E \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0438\u044F. \u041D\u0435\u0431\u043E\u043B\u044C\u0448\u0443\u044E \u0432\u0435\u0449\u044C: \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0432\u0440\u0435\u043C\u044F, \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C \u0441\u0432\u043E\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442, \u0437\u0430\u043D\u044F\u0442\u044C\u0441\u044F \u0442\u0435\u043C, \u0434\u043E \u0447\u0435\u0433\u043E \u0434\u0430\u0432\u043D\u043E \u043D\u0435 \u0434\u043E\u0445\u043E\u0434\u0438\u043B\u0438 \u0440\u0443\u043A\u0438. \u0410 \u0435\u0441\u043B\u0438 \u043D\u0443\u0436\u0435\u043D \u043E\u0442\u0432\u0435\u0442 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430, \u043E\u0441\u0442\u0430\u0432\u044C \u0435\u043C\u0443 \u043F\u0440\u0430\u0432\u043E \u043E\u0442\u0432\u0435\u0442\u0438\u0442\u044C. \u0422\u0432\u043E\u044F \u0438\u043D\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0430 \u0438 \u0435\u0433\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u2014 \u0440\u0430\u0437\u043D\u044B\u0435 \u0432\u0435\u0449\u0438.", "\u0421\u0432\u043E\u0439 \u0442\u0435\u043C\u043F \u2014 \u044D\u0442\u043E \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E. \u0418\u043D\u043E\u0433\u0434\u0430 \u043D\u0443\u0436\u043D\u043E \u0431\u044B\u0441\u0442\u0440\u043E \u0440\u0435\u0448\u0438\u0442\u044C \u0438 \u043F\u043E\u0439\u0442\u0438 \u0434\u0435\u043B\u0430\u0442\u044C. \u0410 \u0438\u043D\u043E\u0433\u0434\u0430 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0435\u0441\u0442\u044C \u0438 \u0432\u044B\u0434\u043E\u0445\u043D\u0443\u0442\u044C, \u0447\u0442\u043E\u0431\u044B \u043D\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0432\u0441\u0451 \u043F\u043E\u0434\u0440\u044F\u0434. \u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438, \u0447\u0442\u043E \u0441\u0435\u0439\u0447\u0430\u0441 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u043E\u043C\u043E\u0436\u0435\u0442 \u0442\u0435\u0431\u0435 \u0437\u0430\u043D\u044F\u0442\u044C\u0441\u044F \u0441\u0432\u043E\u0438\u043C \u0434\u0435\u043B\u043E\u043C."], "2": ["\u0421 \u0434\u0435\u043D\u044C\u0433\u0430\u043C\u0438 \u043B\u0443\u0447\u0448\u0435 \u0431\u0435\u0437 \u043A\u0440\u0430\u0439\u043D\u043E\u0441\u0442\u0435\u0439. \u0415\u0441\u043B\u0438 \u0437\u0430\u0445\u043E\u0442\u0435\u043B\u043E\u0441\u044C \u043A\u0443\u043F\u0438\u0442\u044C \u0447\u0442\u043E-\u0442\u043E \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u0441\u0443\u043C\u043C\u0443 \u0438 \u043D\u0430 \u0442\u043E, \u0434\u043B\u044F \u0447\u0435\u0433\u043E \u0442\u0435\u0431\u0435 \u044D\u0442\u0430 \u0432\u0435\u0449\u044C. \u0415\u0441\u043B\u0438 \u0437\u0430\u0445\u043E\u0442\u0435\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0440\u0435\u0442\u0438\u0442\u044C \u0441\u0435\u0431\u0435 \u0432\u043E\u043E\u0431\u0449\u0435 \u0432\u0441\u0451 \u2014 \u0442\u043E\u0436\u0435 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438. \u0418\u043D\u043E\u0433\u0434\u0430 \u0432\u043E\u043F\u0440\u043E\u0441 \u0440\u0435\u0448\u0430\u0435\u0442\u0441\u044F \u043E\u0431\u044B\u0447\u043D\u044B\u043C \u0431\u044E\u0434\u0436\u0435\u0442\u043E\u043C, \u0431\u0435\u0437 \u0441\u0443\u0434\u0430 \u043D\u0430\u0434 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u043C \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u043C.", "\u0425\u043E\u0447\u0435\u0442\u0441\u044F \u043F\u0440\u0438\u044F\u0442\u043D\u043E\u0433\u043E? \u041D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u043E. \u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043D\u044F\u0442\u044C, \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u043F\u043E\u0440\u0430\u0434\u0443\u0435\u0442: \u0441\u0430\u043C\u0430 \u043F\u043E\u043A\u0443\u043F\u043A\u0430 \u0438\u043B\u0438 \u043E\u0449\u0443\u0449\u0435\u043D\u0438\u0435, \u0447\u0442\u043E \u0434\u0435\u043D\u044C \u043D\u0430\u043A\u043E\u043D\u0435\u0446 \u0441\u0442\u0430\u043B \u0442\u0432\u043E\u0438\u043C. \u042D\u0442\u043E \u0440\u0430\u0437\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438. \u0412\u0442\u043E\u0440\u0443\u044E \u043D\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u043D\u0443\u0436\u043D\u043E \u0440\u0435\u0448\u0430\u0442\u044C \u043A\u043E\u0448\u0435\u043B\u044C\u043A\u043E\u043C, \u0430 \u043F\u0435\u0440\u0432\u0443\u044E \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043E\u0431\u044A\u044F\u0432\u043B\u044F\u0442\u044C \u043B\u0438\u0448\u043D\u0435\u0439 \u0442\u0440\u0430\u0442\u043E\u0439.", "\u0412 \u0434\u0435\u043D\u044C\u0433\u0430\u0445 \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C\u0441\u044F \u0441\u043B\u043E\u0432\u0430\u043C\u0438. \u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 \u0440\u0430\u0431\u043E\u0442\u0430, \u0447\u0442\u043E \u0432\u0445\u043E\u0434\u0438\u0442 \u0432 \u0446\u0435\u043D\u0443 \u0438 \u043A\u043E\u0433\u0434\u0430 \u0431\u0443\u0434\u0435\u0442 \u043E\u043F\u043B\u0430\u0442\u0430. \u041D\u0435 \xAB\u043D\u0443 \u043F\u043E\u0442\u043E\u043C \u0440\u0430\u0437\u0431\u0435\u0440\u0451\u043C\u0441\u044F\xBB. \u041F\u043E\u0442\u043E\u043C \u0432\u044B\u044F\u0441\u043D\u044F\u0435\u0442\u0441\u044F, \u0447\u0442\u043E \u043A\u0430\u0436\u0434\u044B\u0439 \u043F\u043E\u043D\u044F\u043B \u043F\u043E-\u0441\u0432\u043E\u0435\u043C\u0443, \u0430 \u043D\u0435\u0443\u0434\u043E\u0431\u043D\u043E \u0443\u0436\u0435 \u043E\u0431\u043E\u0438\u043C."], "3": ["\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043D\u0430 \u043F\u044F\u0442\u044C \u044D\u043A\u0440\u0430\u043D\u043E\u0432 \u043D\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u043E\u0431\u044A\u044F\u0441\u043D\u044F\u0435\u0442 \u043B\u0443\u0447\u0448\u0435, \u0447\u0435\u043C \u0434\u0432\u0435 \u044F\u0441\u043D\u044B\u0435 \u0444\u0440\u0430\u0437\u044B. \u0415\u0441\u043B\u0438 \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0430 \u0445\u043E\u0434\u0438\u0442 \u043F\u043E \u043A\u0440\u0443\u0433\u0443, \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0430\u043C \u0432\u043E\u043F\u0440\u043E\u0441. \u0427\u0442\u043E \u0442\u044B \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u0435\u0448\u044C? \u041A\u0430\u043A\u043E\u0439 \u043E\u0442\u0432\u0435\u0442 \u043D\u0443\u0436\u0435\u043D? \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435 \u043C\u043E\u0436\u043D\u043E \u043E\u0431\u0441\u0443\u0434\u0438\u0442\u044C, \u043A\u043E\u0433\u0434\u0430 \u0441\u0442\u0430\u043D\u0435\u0442 \u043F\u043E\u043D\u044F\u0442\u043D\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u0435.", "\u0414\u043B\u044F \u0443\u0447\u0451\u0431\u044B \u0438 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432 \u043F\u0440\u0438\u0433\u043E\u0434\u0438\u0442\u0441\u044F \u043B\u044E\u0431\u043E\u043F\u044B\u0442\u0441\u0442\u0432\u043E, \u043D\u043E \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u0435\u0449\u0451 \u0434\u0435\u0441\u044F\u0442\u044C \u0432\u043A\u043B\u0430\u0434\u043E\u043A. \u0412\u044B\u0431\u0435\u0440\u0438 \u0432\u043E\u043F\u0440\u043E\u0441, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u043E\u043C \u0441\u0435\u0439\u0447\u0430\u0441 \u0437\u0430\u0441\u0442\u0440\u044F\u043B\u043E \u0434\u0435\u043B\u043E. \u041E\u0442\u0432\u0435\u0442 \u043D\u0430 \u043D\u0435\u0433\u043E \u0434\u0430\u0441\u0442 \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u043A\u0440\u0430\u0441\u0438\u0432\u043E\u0435 \u0447\u0443\u0432\u0441\u0442\u0432\u043E \xAB\u044F \u043C\u043D\u043E\u0433\u043E \u0432\u0441\u0435\u0433\u043E \u0438\u0437\u0443\u0447\u0430\u044E\xBB.", "\u0415\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u043E \u043E \u0447\u0451\u043C-\u0442\u043E \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C\u0441\u044F, \u043D\u0430\u0437\u043E\u0432\u0438 \u0434\u0435\u043D\u044C \u0438 \u0432\u0440\u0435\u043C\u044F. \xAB\u041A\u0430\u043A-\u043D\u0438\u0431\u0443\u0434\u044C \u043D\u0430 \u043D\u0435\u0434\u0435\u043B\u0435\xBB \u0437\u0432\u0443\u0447\u0438\u0442 \u043F\u0440\u0438\u044F\u0442\u043D\u043E, \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u0435 \u0442\u0430\u043A\u043E\u0433\u043E \u0434\u043D\u044F \u043D\u0435\u0442. \u041C\u0430\u043B\u0435\u043D\u044C\u043A\u0430\u044F \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u0438\u043A\u0430 \u0438\u043D\u043E\u0433\u0434\u0430 \u0441\u043F\u0430\u0441\u0430\u0435\u0442 \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440."], "4": ["\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043D\u0438\u043C\u0430\u0442\u044C\u0441\u044F \u0434\u043E\u043C\u043E\u043C \u0438 \u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0442\u044C \u0432\u0440\u0435\u043C\u044F \u043D\u0430 \u043E\u0442\u0434\u044B\u0445. \u041E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0434\u043E\u0432\u0435\u0441\u0442\u0438 \u0432\u0441\u0451 \u0434\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \xAB\u0442\u0435\u043F\u0435\u0440\u044C \u0442\u043E\u0447\u043D\u043E \u043D\u0435\u0447\u0435\u0433\u043E \u0434\u0435\u043B\u0430\u0442\u044C\xBB \u2014 \u0443 \u0434\u043E\u043C\u0430\u0448\u043D\u0438\u0445 \u0434\u0435\u043B \u0442\u0430\u043A\u043E\u0433\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u043F\u043E\u0447\u0442\u0438 \u043D\u0435 \u0431\u044B\u0432\u0430\u0435\u0442. \u0412\u044B\u0431\u0435\u0440\u0438 \u0442\u043E, \u0447\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043C\u0435\u0448\u0430\u0435\u0442, \u0438 \u043D\u0430\u0447\u043D\u0438 \u0441 \u043D\u0435\u0433\u043E.", "\u0412 \u0434\u043E\u043C\u0430\u0448\u043D\u0438\u0445 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044F\u0445 \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u0441\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u043F\u0440\u044F\u043C\u043E: \u0442\u0435\u0431\u0435 \u043F\u043E\u043C\u043E\u0447\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u043E\u0441\u043B\u0443\u0448\u0430\u0442\u044C? \u0418\u043D\u043E\u0433\u0434\u0430 \u043D\u0443\u0436\u0435\u043D \u0432\u0442\u043E\u0440\u043E\u0439 \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u0441 \u043E\u0442\u0432\u0451\u0440\u0442\u043A\u043E\u0439, \u0430 \u0438\u043D\u043E\u0433\u0434\u0430 \u2014 \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u0440\u044F\u0434\u043E\u043C. \u041D\u0435 \u0441\u0442\u043E\u0438\u0442 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C\u0441\u044F \u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u043C \u0437\u0430 \u0432\u0441\u0451, \u0447\u0442\u043E \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u0438\u0442 \u0443 \u0431\u043B\u0438\u0437\u043A\u0438\u0445.", "\u0421\u0432\u043E\u044F \u0442\u0435\u0440\u0440\u0438\u0442\u043E\u0440\u0438\u044F \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u043D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0441 \u043F\u043E\u0440\u044F\u0434\u043A\u0430 \u043D\u0430 \u043F\u043E\u043B\u043A\u0430\u0445. \u0418\u043D\u043E\u0433\u0434\u0430 \u0441 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438 \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u0437\u0430\u043A\u0440\u044B\u0442\u044C \u0434\u0432\u0435\u0440\u044C, \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u043F\u043E\u0437\u0436\u0435 \u0438\u043B\u0438 \u043D\u0435 \u043E\u0431\u044A\u044F\u0441\u043D\u044F\u0442\u044C, \u043F\u043E\u0447\u0435\u043C\u0443 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0442\u0438\u0448\u0438\u043D\u044B. \u0415\u0441\u043B\u0438 \u0442\u0435\u0431\u0435 \u044D\u0442\u043E\u0433\u043E \u043D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442, \u043C\u043E\u0436\u043D\u043E \u043E\u0431\u0441\u0443\u0434\u0438\u0442\u044C \u0441\u0430\u043C\u0443 \u043F\u0440\u0438\u0432\u044B\u0447\u043A\u0443, \u0431\u0435\u0437 \u0441\u043F\u0438\u0441\u043A\u0430 \u0432\u0441\u0435\u0445 \u043F\u0440\u043E\u0448\u043B\u044B\u0445 \u043E\u0431\u0438\u0434."], "5": ["\u0418\u0434\u0435\u044E \u043C\u043E\u0436\u043D\u043E \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u0434\u0435\u043B\u0430\u0442\u044C, \u0430 \u0443\u0436\u0435 \u043F\u043E\u0442\u043E\u043C \u043E\u0431\u044A\u044F\u0441\u043D\u044F\u0442\u044C. \u0420\u0438\u0441\u0443\u043D\u043E\u043A, \u0442\u0435\u043A\u0441\u0442, \u0443\u0436\u0438\u043D, \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u0443\u044E \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443 \u2014 \u0447\u0442\u043E \u0443\u0433\u043E\u0434\u043D\u043E, \u0433\u0434\u0435 \u0442\u0435\u0431\u0435 \u0438\u043D\u0442\u0435\u0440\u0435\u0441\u043D\u043E \u043F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C. \u041D\u0435 \u043A\u0430\u0436\u0434\u043E\u043C\u0443 \u0443\u0432\u043B\u0435\u0447\u0435\u043D\u0438\u044E \u0441\u0440\u043E\u0447\u043D\u043E \u043D\u0443\u0436\u043D\u044B \u043F\u043E\u043B\u044C\u0437\u0430, \u043C\u043E\u043D\u0435\u0442\u0438\u0437\u0430\u0446\u0438\u044F \u0438 \u043E\u0442\u0447\u0451\u0442 \u043E \u043F\u0440\u043E\u0434\u0435\u043B\u0430\u043D\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u0435.", "\u0425\u043E\u0447\u0435\u0442\u0441\u044F \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442? \u041F\u043E\u043A\u0430\u0436\u0438 \u0442\u043E\u0442 \u043A\u0443\u0441\u043E\u043A, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0443\u0436\u0435 \u0433\u043E\u0442\u043E\u0432. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u043E\u043F\u0440\u0430\u0432\u0434\u044B\u0432\u0430\u0442\u044C\u0441\u044F \u0437\u0430 \u0432\u0441\u0451, \u0447\u0442\u043E \u0435\u0449\u0451 \u043D\u0435 \u0441\u0434\u0435\u043B\u0430\u043D\u043E. \u0410 \u0435\u0441\u043B\u0438 \u043F\u043E\u043A\u0430 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0442\u0443 \u043F\u0440\u0438 \u0441\u0435\u0431\u0435, \u044D\u0442\u043E \u0442\u043E\u0436\u0435 \u0432\u0430\u0440\u0438\u0430\u043D\u0442. \u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0438\u043C\u0435\u0435\u0442 \u043F\u0440\u0430\u0432\u043E \u043D\u0435 \u0443\u0447\u0430\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u0432 \u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u043C \u043E\u0431\u0441\u0443\u0436\u0434\u0435\u043D\u0438\u0438.", "\u041D\u0435 \u0432\u0441\u0451 \u043F\u0440\u0438\u044F\u0442\u043D\u043E\u0435 \u043D\u0443\u0436\u043D\u043E \u0437\u0430\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u0442\u044C \u0434\u043B\u0438\u043D\u043D\u044B\u043C \u0441\u043F\u0438\u0441\u043A\u043E\u043C \u0434\u0435\u043B. \u041C\u043E\u0436\u043D\u043E \u0432\u044B\u0434\u0435\u043B\u0438\u0442\u044C \u0432\u0440\u0435\u043C\u044F \u043D\u0430 \u0442\u043E, \u0447\u0442\u043E \u0442\u0435\u0431\u0435 \u043D\u0440\u0430\u0432\u0438\u0442\u0441\u044F, \u0438 \u043D\u0435 \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u0442\u044C \u0435\u0433\u043E \u0432 \u0435\u0449\u0451 \u043E\u0434\u0438\u043D \u043F\u0440\u043E\u0435\u043A\u0442 \u0441 \u0436\u0451\u0441\u0442\u043A\u0438\u043C \u043F\u043B\u0430\u043D\u043E\u043C. \u0418\u043D\u043E\u0433\u0434\u0430 \u0445\u043E\u0440\u043E\u0448\u0438\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043A\u0430\u043A \u0440\u0430\u0437 \u043F\u043E\u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0442\u0430\u043C, \u0433\u0434\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u043F\u043E\u0432\u043E\u0437\u0438\u0442\u044C\u0441\u044F."], "6": ["\u0421\u043F\u0438\u0441\u043E\u043A \u0434\u0435\u043B \u043C\u043E\u0436\u043D\u043E \u0441\u043E\u043A\u0440\u0430\u0442\u0438\u0442\u044C. \u041E\u043D \u043E\u0442 \u044D\u0442\u043E\u0433\u043E \u043D\u0435 \u043E\u0431\u0438\u0434\u0438\u0442\u0441\u044F. \u041E\u0442\u0434\u0435\u043B\u0438 \u0442\u043E, \u0447\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043D\u0443\u0436\u043D\u043E \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C \u0441\u0435\u0433\u043E\u0434\u043D\u044F, \u043E\u0442 \u043F\u0440\u0438\u0432\u044B\u0447\u043D\u043E\u0433\u043E \xAB\u0440\u0430\u0437 \u0443\u0436 \u043D\u0430\u0447\u0430\u043B\u0430, \u0437\u0430\u043E\u0434\u043D\u043E \u0435\u0449\u0451 \u0432\u043E\u0442 \u044D\u0442\u043E\xBB. \u0423 \xAB\u0437\u0430\u043E\u0434\u043D\u043E\xBB \u0438\u043D\u043E\u0433\u0434\u0430 \u043E\u0447\u0435\u043D\u044C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0430\u043F\u043F\u0435\u0442\u0438\u0442.", "\u0415\u0441\u043B\u0438 \u0440\u0430\u0431\u043E\u0442\u0430 \u0431\u0443\u043A\u0441\u0443\u0435\u0442 \u043D\u0430 \u043E\u0434\u043D\u043E\u0439 \u0438 \u0442\u043E\u0439 \u0436\u0435 \u043C\u0435\u043B\u043E\u0447\u0438, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u0441\u0430\u043C \u043F\u043E\u0440\u044F\u0434\u043E\u043A \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u043D\u0435 \u043D\u0443\u0436\u0435\u043D \u043D\u043E\u0432\u044B\u0439 \u0440\u044B\u0432\u043E\u043A \u2014 \u043D\u0443\u0436\u0435\u043D \u0443\u0434\u043E\u0431\u043D\u044B\u0439 \u0448\u0430\u0431\u043B\u043E\u043D, \u043D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u0430\u044F \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u0438\u043B\u0438 \u043E\u0434\u0438\u043D \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0441 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C, \u043E\u0442 \u043A\u043E\u0442\u043E\u0440\u043E\u0433\u043E \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433.", "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0440\u0430\u0441\u0438\u0432\u043E \u0432\u044B\u0433\u043B\u044F\u0434\u0438\u0442, \u043F\u043E\u043A\u0430 \u0432 \u043D\u0435\u0433\u043E \u043D\u0435 \u043F\u043E\u043F\u0430\u0434\u0430\u0435\u0442 \u043E\u0431\u044B\u0447\u043D\u0430\u044F \u0436\u0438\u0437\u043D\u044C. \u0415\u0434\u0430, \u0434\u043E\u0440\u043E\u0433\u0430, \u0443\u0441\u0442\u0430\u043B\u043E\u0441\u0442\u044C, \u0447\u0443\u0436\u043E\u0439 \u0437\u0432\u043E\u043D\u043E\u043A. \u041E\u0441\u0442\u0430\u0432\u044C \u043C\u0435\u0436\u0434\u0443 \u0434\u0435\u043B\u0430\u043C\u0438 \u043D\u0435\u043C\u043D\u043E\u0433\u043E \u0432\u043E\u0437\u0434\u0443\u0445\u0430. \u042D\u0442\u043E \u043D\u0435 \u043F\u0440\u043E\u0432\u0430\u043B \u0434\u0438\u0441\u0446\u0438\u043F\u043B\u0438\u043D\u044B, \u0430 \u0441\u043F\u043E\u0441\u043E\u0431 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0447\u0442\u043E-\u0442\u043E \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C."], "7": ["\xAB\u041D\u0443 \u0442\u044B \u0436\u0435 \u043F\u043E\u043D\u0438\u043C\u0430\u0435\u0448\u044C\xBB \u2014 \u0441\u043B\u0430\u0431\u0430\u044F \u0437\u0430\u043C\u0435\u043D\u0430 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u0438. \u0415\u0441\u043B\u0438 \u0432\u044B \u0434\u0435\u043B\u0430\u0435\u0442\u0435 \u0447\u0442\u043E-\u0442\u043E \u0432\u043C\u0435\u0441\u0442\u0435, \u043B\u0443\u0447\u0448\u0435 \u043F\u0440\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C, \u043A\u0442\u043E \u0447\u0442\u043E \u0431\u0435\u0440\u0451\u0442 \u043D\u0430 \u0441\u0435\u0431\u044F. \u041C\u043E\u0436\u043D\u043E \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0445\u043E\u0440\u043E\u0448\u0438\u0435 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u044F \u0438 \u043F\u0440\u0438 \u044D\u0442\u043E\u043C \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u043D\u0435\u0443\u0434\u043E\u0431\u043D\u044B\u0439 \u043F\u0443\u043D\u043A\u0442. \u041E\u0434\u043D\u043E \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u043D\u0435 \u043C\u0435\u0448\u0430\u0435\u0442.", "\u0412 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0435 \u0441 \u0434\u0440\u0443\u0433\u0438\u043C \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0441\u0440\u0430\u0437\u0443 \u0440\u0435\u0448\u0430\u0442\u044C \u0441\u0443\u0434\u044C\u0431\u0443 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0439. \u0418\u043D\u043E\u0433\u0434\u0430 \u0432\u044B \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u043E-\u0440\u0430\u0437\u043D\u043E\u043C\u0443 \u043F\u043E\u043D\u044F\u043B\u0438 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0443\u044E \u043F\u0440\u043E\u0441\u044C\u0431\u0443. \u041D\u0430\u0447\u043D\u0438 \u0441 \u043D\u0435\u0451: \u0447\u0442\u043E \u0438\u043C\u0435\u043B\u043E\u0441\u044C \u0432 \u0432\u0438\u0434\u0443 \u0438 \u043D\u0430 \u0447\u0442\u043E \u043A\u0430\u0436\u0434\u044B\u0439 \u0441\u043E\u0433\u043B\u0430\u0441\u0435\u043D \u0441\u0435\u0439\u0447\u0430\u0441.", "\u041A\u043E\u043C\u043F\u0440\u043E\u043C\u0438\u0441\u0441 \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u043D \u043E\u0437\u043D\u0430\u0447\u0430\u0442\u044C, \u0447\u0442\u043E \u043D\u0435\u0443\u0434\u043E\u0431\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u0435\u0431\u0435. \u0415\u0441\u043B\u0438 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0442, \u043D\u0430\u0437\u043E\u0432\u0438, \u043A\u0430\u043A\u0430\u044F \u0438\u043C\u0435\u043D\u043D\u043E \u0447\u0430\u0441\u0442\u044C. \u0414\u0440\u0443\u0433\u043E\u043C\u0443 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 \u043F\u0440\u043E\u0449\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043D\u0430 \u043F\u043E\u043D\u044F\u0442\u043D\u043E\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435, \u0447\u0435\u043C \u0443\u0433\u0430\u0434\u044B\u0432\u0430\u0442\u044C, \u043F\u043E\u0447\u0435\u043C\u0443 \u0432\u043D\u0435\u0448\u043D\u0435 \u0432\u0441\u0451 \u0445\u043E\u0440\u043E\u0448\u043E, \u0430 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0443\u0436\u0435 \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u043B\u0441\u044F."], "8": ["\u041E\u0431\u0449\u0438\u0435 \u0434\u0435\u043D\u044C\u0433\u0438 \u043B\u0443\u0447\u0448\u0435 \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u0432\u043C\u0435\u0441\u0442\u0435. \u041D\u0435 \u043F\u043E\u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u043A\u0442\u043E-\u0442\u043E \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043E\u0431\u043C\u0430\u043D\u0435\u0442, \u0430 \u043F\u043E\u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u043F\u0430\u043C\u044F\u0442\u044C \u0443 \u043B\u044E\u0434\u0435\u0439 \u0440\u0430\u0437\u043D\u0430\u044F. \u0421\u0443\u043C\u043C\u044B, \u0441\u0440\u043E\u043A\u0438, \u043A\u0442\u043E \u0437\u0430 \u0447\u0442\u043E \u043F\u043B\u0430\u0442\u0438\u0442 \u2014 \u0432\u0441\u0451 \u044D\u0442\u043E \u043C\u043E\u0436\u043D\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0431\u0435\u0437 \u0434\u0440\u0430\u043C\u044B \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0439 \u043D\u0430 \u043F\u0440\u043E\u0447\u043D\u043E\u0441\u0442\u044C.", "\u0415\u0441\u043B\u0438 \u043A\u0442\u043E-\u0442\u043E \u043F\u0440\u043E\u0441\u0438\u0442 \u0432\u0437\u044F\u0442\u044C \u043D\u0430 \u0441\u0435\u0431\u044F \u0435\u0449\u0451 \u0447\u0430\u0441\u0442\u044C \u043E\u0431\u0449\u0435\u0433\u043E \u0434\u0435\u043B\u0430, \u0443\u0442\u043E\u0447\u043D\u0438, \u043A\u0430\u043A\u0443\u044E \u0438\u043C\u0435\u043D\u043D\u043E. \u041F\u043E\u043C\u043E\u0447\u044C \u043E\u0434\u0438\u043D \u0440\u0430\u0437 \u0438 \u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u043E \u043E\u0442\u0432\u0435\u0447\u0430\u0442\u044C \u0437\u0430 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u2014 \u0440\u0430\u0437\u043D\u044B\u0435 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u0438. \u041B\u0443\u0447\u0448\u0435 \u0432\u044B\u044F\u0441\u043D\u0438\u0442\u044C \u044D\u0442\u043E \u0434\u043E \u0442\u043E\u0433\u043E, \u043A\u0430\u043A \u043F\u043E\u043C\u043E\u0449\u044C \u043D\u0435\u0437\u0430\u043C\u0435\u0442\u043D\u043E \u0441\u0442\u0430\u043D\u0435\u0442 \u0442\u0432\u043E\u0435\u0439 \u043E\u0431\u044F\u0437\u0430\u043D\u043D\u043E\u0441\u0442\u044C\u044E.", "\u041D\u0435 \u0432\u0441\u0451, \u0447\u0442\u043E \u043A\u0430\u0441\u0430\u0435\u0442\u0441\u044F \u0431\u043B\u0438\u0437\u043A\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430, \u043D\u0430\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u043F\u043E\u0434 \u0442\u0432\u043E\u0438\u043C \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u0435\u043C. \u041C\u043E\u0436\u043D\u043E \u0443\u0447\u0430\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C, \u0441\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0442\u044C, \u0434\u043E\u0433\u043E\u0432\u0430\u0440\u0438\u0432\u0430\u0442\u044C\u0441\u044F. \u041D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0437\u0430 \u0434\u0440\u0443\u0433\u043E\u0433\u043E, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0431\u044B \u0441\u0438\u043B \u044D\u0442\u043E \u043D\u0438 \u043E\u0442\u043D\u044F\u043B\u043E, \u0432\u0441\u0451 \u0440\u0430\u0432\u043D\u043E \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0441\u044F. \u0421\u0432\u043E\u044E \u0447\u0430\u0441\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0431\u0435\u0437 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u0443\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0432\u0441\u044E \u0438\u0441\u0442\u043E\u0440\u0438\u044E."], "9": ["\u0411\u043E\u043B\u044C\u0448\u0443\u044E \u0438\u0434\u0435\u044E \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u0438\u043C \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u043C. \u0421\u043A\u043E\u043B\u044C\u043A\u043E \u044D\u0442\u043E \u0441\u0442\u043E\u0438\u0442, \u043A\u0442\u043E \u0443\u0436\u0435 \u043F\u0440\u043E\u0431\u043E\u0432\u0430\u043B, \u0447\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0432\u0445\u043E\u0434\u0438\u0442 \u0432 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0443. \u0418\u043D\u0442\u0435\u0440\u0435\u0441 \u043D\u0435 \u043F\u0440\u043E\u043F\u0430\u0434\u0430\u0435\u0442 \u043E\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438. \u0418\u043D\u043E\u0433\u0434\u0430 \u043F\u043E\u0441\u043B\u0435 \u043D\u0435\u0451 \u043E\u043D \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u0433\u043E\u0440\u0430\u0437\u0434\u043E \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u043D\u0435\u0435.", "\u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0443\u0447\u0438\u0442\u044C\u0441\u044F, \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0441\u0440\u0430\u0437\u0443 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0432\u0441\u0451. \u041D\u0430\u0439\u0434\u0438 \u0442\u0435\u043C\u0443, \u043A\u043E\u0442\u043E\u0440\u0443\u044E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u043F\u043E\u043D\u044F\u0442\u044C, \u0438 \u043E\u0434\u0438\u043D \u0445\u043E\u0440\u043E\u0448\u0438\u0439 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A. \u041F\u043E\u0442\u043E\u043C \u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u043D\u043E, \u043D\u0443\u0436\u043D\u043E \u043B\u0438 \u0438\u0434\u0442\u0438 \u0433\u043B\u0443\u0431\u0436\u0435. \u041B\u044E\u0431\u043E\u043F\u044B\u0442\u0441\u0442\u0432\u043E \u043D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043F\u043E\u0436\u0438\u0437\u043D\u0435\u043D\u043D\u043E\u0433\u043E \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430.", "\u0414\u0430\u043B\u044C\u043D\u0438\u0435 \u043F\u043B\u0430\u043D\u044B \u0438\u043D\u043E\u0433\u0434\u0430 \u043F\u0440\u043E\u0449\u0435 \u043E\u0431\u0441\u0443\u0436\u0434\u0430\u0442\u044C \u0447\u0435\u0440\u0435\u0437 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435. \u041D\u0435 \xAB\u043A\u043E\u0433\u0434\u0430-\u043D\u0438\u0431\u0443\u0434\u044C \u0432\u0441\u0451 \u043F\u043E\u043C\u0435\u043D\u044F\u044E\xBB, \u0430 \u0443\u0437\u043D\u0430\u0442\u044C \u0443\u0441\u043B\u043E\u0432\u0438\u044F, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0434\u0430\u0442\u044B, \u043F\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C \u0441 \u043D\u0443\u0436\u043D\u044B\u043C \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C. \u041F\u043E\u043A\u0430 \u044D\u0442\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438. \u0418 \u044D\u0442\u043E\u0433\u043E \u0443\u0436\u0435 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0434\u043B\u044F \u043D\u0430\u0447\u0430\u043B\u0430."], "10": ["\u0412 \u0440\u0430\u0431\u043E\u0442\u0435 \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u0432\u044B\u044F\u0441\u043D\u0438\u0442\u044C, \u0447\u0442\u043E \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u0433\u043E\u0442\u043E\u0432\u044B\u043C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u043C. \u0418\u043D\u0430\u0447\u0435 \u043C\u043E\u0436\u043D\u043E \u0431\u0435\u0441\u043A\u043E\u043D\u0435\u0447\u043D\u043E \u0443\u043B\u0443\u0447\u0448\u0430\u0442\u044C \u043E\u0434\u043D\u043E, \u043F\u043E\u043A\u0430 \u043E\u0442 \u0442\u0435\u0431\u044F \u0436\u0434\u0443\u0442 \u0441\u043E\u0432\u0441\u0435\u043C \u0434\u0440\u0443\u0433\u043E\u0435. \u0412\u043E\u043F\u0440\u043E\u0441 \xAB\u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u043D\u0443\u0436\u043D\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C?\xBB \u043D\u0435 \u0434\u0435\u043B\u0430\u0435\u0442 \u0442\u0435\u0431\u044F \u043C\u0435\u043D\u0435\u0435 \u043F\u0440\u043E\u0444\u0435\u0441\u0441\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0439.", "\u0415\u0441\u043B\u0438 \u043E\u0431\u0435\u0449\u0430\u043D\u043D\u044B\u0439 \u0441\u0440\u043E\u043A \u0443\u0436\u0435 \u043D\u0435 \u043F\u043E\u043C\u0435\u0449\u0430\u0435\u0442\u0441\u044F \u0432 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C, \u043B\u0443\u0447\u0448\u0435 \u0441\u043A\u0430\u0437\u0430\u0442\u044C \u043E\u0431 \u044D\u0442\u043E\u043C \u0434\u043E \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0433\u043E \u0432\u0435\u0447\u0435\u0440\u0430. \u041D\u0430\u0437\u0432\u0430\u0442\u044C, \u0447\u0442\u043E \u0433\u043E\u0442\u043E\u0432\u043E \u0438 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u043D\u0443\u0436\u043D\u043E \u043D\u0430 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435. \u042D\u0442\u043E \u043E\u0431\u044B\u0447\u043D\u044B\u0439 \u0440\u0430\u0431\u043E\u0447\u0438\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440, \u0430 \u043D\u0435 \u043F\u0440\u0438\u0437\u043D\u0430\u043D\u0438\u0435 \u043F\u043E\u043B\u043D\u043E\u0439 \u043D\u0435\u0441\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438.", "\u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0442\u044C \u0441\u0432\u043E\u044E \u0446\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0435\u0449\u0451 \u043E\u0434\u043D\u043E\u0439 \u0432\u0437\u044F\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0435\u0439. \u0418\u043D\u043E\u0433\u0434\u0430 \u043B\u0443\u0447\u0448\u0435 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0442\u043E, \u0437\u0430 \u0447\u0442\u043E \u0443\u0436\u0435 \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u0448\u044C, \u0438 \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0442\u044C \u0441\u0432\u0435\u0440\u0445\u0443 \u0440\u0430\u0431\u043E\u0442\u0443, \u043E \u043A\u043E\u0442\u043E\u0440\u043E\u0439 \u043D\u0438\u043A\u0442\u043E \u0434\u0430\u0436\u0435 \u043D\u0435 \u0434\u043E\u0433\u043E\u0432\u0430\u0440\u0438\u0432\u0430\u043B\u0441\u044F. \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0432\u0441\u0451-\u0442\u0430\u043A\u0438 \u043D\u0435 \u043E\u0434\u043D\u043E \u0438 \u0442\u043E \u0436\u0435."], "11": ["\u0412 \u043E\u0431\u0449\u0435\u0439 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438 \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C: \u043C\u044B \u0432\u043E\u043E\u0431\u0449\u0435 \u043E\u0431 \u043E\u0434\u043D\u043E\u043C \u0438 \u0442\u043E\u043C \u0436\u0435 \u0434\u043E\u0433\u043E\u0432\u0430\u0440\u0438\u0432\u0430\u0435\u043C\u0441\u044F? \u041E\u0434\u043D\u0438 \u0445\u043E\u0442\u044F\u0442 \u043F\u043E\u0443\u0447\u0430\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C, \u0434\u0440\u0443\u0433\u0438\u0435 \u0443\u0436\u0435 \u0440\u0430\u0437\u0434\u0430\u044E\u0442 \u043E\u0431\u044F\u0437\u0430\u043D\u043D\u043E\u0441\u0442\u0438. \u042D\u0442\u043E \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u044F\u0441\u043D\u0438\u0442\u044C \u0434\u043E \u0442\u043E\u0433\u043E, \u043A\u0430\u043A \u0445\u043E\u0440\u043E\u0448\u0430\u044F \u0438\u0434\u0435\u044F \u043F\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u0441\u044F \u0432 \u043D\u0435\u0443\u0434\u043E\u0431\u043D\u044B\u0439 \u043A\u043E\u043B\u043B\u0435\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0434\u043E\u043B\u0433.", "\u0422\u044B \u043C\u043E\u0436\u0435\u0448\u044C \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u0438 \u043D\u0435 \u0432\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u0432 \u043A\u0430\u0436\u0434\u044B\u0439 \u0435\u0433\u043E \u043F\u043B\u0430\u043D. \u0421\u043A\u0430\u0437\u0430\u0442\u044C \xAB\u0440\u0430\u0434\u0430 \u0437\u0430 \u0442\u0435\u0431\u044F\xBB \u0438 \u043D\u0435 \u043F\u043E\u0435\u0445\u0430\u0442\u044C. \u041F\u043E\u043C\u043E\u0447\u044C \u0441 \u043E\u0434\u043D\u0438\u043C \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u043C \u0438 \u043D\u0435 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u043E\u0432\u0430\u0442\u044C \u0432\u0441\u0451 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0435. \u0423\u0447\u0430\u0441\u0442\u0438\u0435 \u0431\u044B\u0432\u0430\u0435\u0442 \u0440\u0430\u0437\u043D\u044B\u043C, \u043D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043B\u043D\u044B\u043C \u0438\u043B\u0438 \u043D\u0443\u043B\u0435\u0432\u044B\u043C.", "\u0415\u0441\u043B\u0438 \u0432 \u0433\u0440\u0443\u043F\u043F\u0435 \u043C\u043D\u043E\u0433\u043E \u043C\u043D\u0435\u043D\u0438\u0439, \u0432\u0435\u0440\u043D\u0438 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u043A \u043E\u0434\u043D\u043E\u043C\u0443 \u0432\u043E\u043F\u0440\u043E\u0441\u0443. \u0427\u0442\u043E \u0440\u0435\u0448\u0430\u0435\u043C \u0441\u0435\u0439\u0447\u0430\u0441? \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435 \u043C\u043E\u0436\u043D\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043D\u0430 \u043F\u043E\u0442\u043E\u043C. \u041D\u0435 \u043A\u0430\u0436\u0434\u043E\u0439 \u0445\u043E\u0440\u043E\u0448\u0435\u0439 \u043C\u044B\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u043E \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C\u0441\u044F \u0435\u0449\u0451 \u043E\u0434\u043D\u0438\u043C \u043F\u0443\u043D\u043A\u0442\u043E\u043C \u0432\u0430\u0448\u0435\u0433\u043E \u043E\u0431\u0449\u0435\u0433\u043E \u043F\u043B\u0430\u043D\u0430."], "12": ["\u041D\u0435 \u0432\u0441\u044F\u043A\u0430\u044F \u043F\u0430\u0443\u0437\u0430 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442, \u0447\u0442\u043E \u0442\u044B \u0447\u0442\u043E-\u0442\u043E \u0443\u043F\u0443\u0441\u043A\u0430\u0435\u0448\u044C. \u0418\u043D\u043E\u0433\u0434\u0430 \u043D\u0443\u0436\u043D\u043E \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u043E\u0431\u044B\u0442\u044C \u0431\u0435\u0437 \u043D\u043E\u0432\u044B\u0445 \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432 \u0438 \u043E\u0431\u0435\u0449\u0430\u043D\u0438\u0439. \u041D\u0435\u0437\u0430\u043A\u043E\u043D\u0447\u0435\u043D\u043D\u043E\u0435 \u0434\u0435\u043B\u043E \u043C\u043E\u0436\u043D\u043E \u0440\u0430\u0437\u0431\u0438\u0442\u044C \u043D\u0430 \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u0443\u044E \u0447\u0430\u0441\u0442\u044C, \u0430 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442\u0441\u044F, \u2014 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043F\u043E\u0437\u0436\u0435.", "\u041C\u043E\u0436\u043D\u043E \u043D\u0435 \u043E\u0442\u0434\u0430\u0432\u0430\u0442\u044C \u043D\u0430 \u043E\u0431\u0441\u0443\u0436\u0434\u0435\u043D\u0438\u0435 \u043C\u044B\u0441\u043B\u044C, \u043A\u043E\u0442\u043E\u0440\u0430\u044F \u0435\u0449\u0451 \u043D\u0435 \u0441\u043B\u043E\u0436\u0438\u043B\u0430\u0441\u044C. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u0430\u043C\u043E\u0439 \u043F\u043E\u043D\u044F\u0442\u044C, \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0441\u043A\u0430\u0437\u0430\u0442\u044C. \u042D\u0442\u043E \u043D\u0435 \u0441\u043A\u0440\u044B\u0442\u043D\u043E\u0441\u0442\u044C \u0438 \u043D\u0435 \u043E\u0442\u043A\u0430\u0437 \u043E\u0442 \u043B\u044E\u0434\u0435\u0439. \u0418\u043D\u043E\u0433\u0434\u0430 \u0442\u0438\u0448\u0438\u043D\u0430 \u2014 \u0432\u043F\u043E\u043B\u043D\u0435 \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u0447\u0430\u0441\u0442\u044C \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0430.", "\u0415\u0441\u043B\u0438 \u0434\u0435\u043D\u044C \u0443\u0436\u0435 \u043F\u0435\u0440\u0435\u043F\u043E\u043B\u043D\u0435\u043D, \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0439 \u0435\u0449\u0451 \u043E\u0434\u043D\u043E \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0434\u0438 \u043A\u0440\u0430\u0441\u0438\u0432\u043E\u0433\u043E \u043E\u0449\u0443\u0449\u0435\u043D\u0438\u044F \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438. \u0417\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C \u043E\u0434\u0438\u043D \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442 \u0438 \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435 \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430 \u2014 \u0442\u043E\u0436\u0435 \u043F\u043B\u0430\u043D. \u041F\u0440\u043E\u0441\u0442\u043E \u0431\u0435\u0437 \u0433\u0435\u0440\u043E\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F."] };
var FE_SIGN_PARAGRAPHS = { Aries: ["\u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E \u043D\u0430\u0447\u0430\u0442\u044C, \u043D\u0430\u0447\u043D\u0438 \u0441 \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0432\u0435\u0449\u0438. \u041D\u0430\u043F\u0438\u0448\u0438, \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438, \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439. \u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0435 \u043D\u0443\u0436\u043D\u043E \u0437\u0430\u043E\u0434\u043D\u043E \u043E\u0431\u0435\u0449\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0437\u0430 \u0432\u0441\u0435\u0445 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432: \u0442\u0432\u043E\u044F \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u043D\u0430 \u043C\u0433\u043D\u043E\u0432\u0435\u043D\u043D\u043E \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C\u0441\u044F \u043E\u0431\u0449\u0435\u0439.", "\u0420\u0435\u0448\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0445\u043E\u0440\u043E\u0448\u0430 \u0442\u0430\u043C, \u0433\u0434\u0435 \u043F\u043E\u043D\u044F\u0442\u043D\u043E, \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0442\u044B \u0440\u0435\u0448\u0430\u0435\u0448\u044C. \u0415\u0441\u043B\u0438 \u0432\u043E\u043F\u0440\u043E\u0441 \u043F\u043E\u043A\u0430 \u0442\u0443\u043C\u0430\u043D\u043D\u044B\u0439, \u043E\u0434\u0438\u043D \u043F\u0440\u044F\u043C\u043E\u0439 \u0432\u043E\u043F\u0440\u043E\u0441 \u0434\u0430\u0441\u0442 \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u043F\u043E\u043F\u044B\u0442\u043A\u0430 \u043F\u0440\u043E\u0434\u0430\u0432\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430, \u043F\u043E\u0442\u043E\u043C \u043D\u0430\u043F\u043E\u0440.", "\u041C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u044F\u0432\u0438\u0442\u044C \u0438\u043D\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0443 \u0431\u0435\u0437 \u0434\u043B\u0438\u043D\u043D\u043E\u0433\u043E \u0432\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F. \u041E\u0434\u0438\u043D \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442 \u0432\u043C\u0435\u0441\u0442\u043E \u043F\u044F\u0442\u0438 \u043E\u0431\u044A\u044F\u0441\u043D\u0435\u043D\u0438\u0439, \u043F\u043E\u0447\u0435\u043C\u0443 \u0442\u044B \u0432\u043E\u043E\u0431\u0449\u0435 \u0438\u043C\u0435\u0435\u0448\u044C \u043F\u0440\u0430\u0432\u043E \u0435\u0433\u043E \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C. \u0410 \u0434\u0430\u043B\u044C\u0448\u0435 \u0443\u0436\u0435 \u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043D\u0430 \u043E\u0442\u0432\u0435\u0442, \u043D\u0435 \u0443\u0433\u0430\u0434\u044B\u0432\u0430\u0442\u044C \u0437\u0430\u0440\u0430\u043D\u0435\u0435."], Taurus: ["\u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043C\u0435\u043D\u044F\u0442\u044C \u0442\u043E, \u0447\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442. \u0418\u043D\u043E\u0433\u0434\u0430 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043E\u0434\u043D\u0443 \u043D\u0435\u0443\u0434\u043E\u0431\u043D\u0443\u044E \u0434\u0435\u0442\u0430\u043B\u044C: \u0432\u0440\u0435\u043C\u044F, \u043F\u043E\u0440\u044F\u0434\u043E\u043A, \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442. \u041D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u043E \u0445\u043E\u0442\u0435\u0442\u044C, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u0432\u044B\u0447\u043D\u0430\u044F \u0432\u0435\u0449\u044C \u043F\u0440\u043E\u0441\u0442\u043E \u0441\u0442\u0430\u043B\u0430 \u0443\u0434\u043E\u0431\u043D\u0435\u0435, \u0431\u0435\u0437 \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0440\u0435\u0432\u043E\u043B\u044E\u0446\u0438\u0438.", "\u0415\u0441\u043B\u0438 \u0435\u0441\u0442\u044C \u0432\u044B\u0431\u043E\u0440 \u043C\u0435\u0436\u0434\u0443 \u043A\u0440\u0430\u0441\u0438\u0432\u044B\u043C \u043E\u0431\u0435\u0449\u0430\u043D\u0438\u0435\u043C \u0438 \u043F\u043E\u043D\u044F\u0442\u043D\u044B\u043C\u0438 \u0443\u0441\u043B\u043E\u0432\u0438\u044F\u043C\u0438, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u0443\u0441\u043B\u043E\u0432\u0438\u044F. \u0421\u043A\u043E\u043B\u044C\u043A\u043E, \u043A\u043E\u0433\u0434\u0430 \u0438 \u0437\u0430 \u0447\u0442\u043E. \u042D\u0442\u043E \u043D\u0435 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0432\u0434\u043E\u0445\u043D\u043E\u0432\u0435\u043D\u0438\u044F, \u0430 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u043F\u043E\u043D\u044F\u0442\u044C, \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u043B\u0438 \u0442\u0435\u0431\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435.", "\u041E\u0434\u043D\u043E \u0437\u0430\u043A\u043E\u043D\u0447\u0435\u043D\u043D\u043E\u0435 \u0434\u0435\u043B\u043E \u043C\u043E\u0436\u0435\u0442 \u043F\u043E\u0440\u0430\u0434\u043E\u0432\u0430\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043D\u043E\u0432\u044B\u0445 \u043F\u043B\u0430\u043D\u043E\u0432. \u0412\u044B\u0431\u0435\u0440\u0438 \u0442\u043E, \u0443 \u0447\u0435\u0433\u043E \u0432\u0438\u0434\u0435\u043D \u043A\u0440\u0430\u0439. \u041C\u043E\u0436\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u0438 \u043D\u0435 \u043E\u0431\u044A\u044F\u0441\u043D\u044F\u0442\u044C \u043D\u0438\u043A\u043E\u043C\u0443, \u043F\u043E\u0447\u0435\u043C\u0443 \u0442\u044B \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u043D\u0435 \u0440\u0435\u0448\u0438\u043B\u0430 \u0432\u0441\u0451 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435."], Gemini: ["\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u0438\u043D\u0442\u0435\u0440\u0435\u0441\u043E\u0432\u0430\u0442\u044C\u0441\u044F \u043D\u043E\u0432\u043E\u0439 \u043C\u044B\u0441\u043B\u044C\u044E \u0438 \u043D\u0435 \u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0440\u0430\u0434\u0438 \u043D\u0435\u0451 \u0432\u0441\u0451 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0435. \u0417\u0430\u043F\u0438\u0448\u0438, \u0447\u0442\u043E \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C, \u0438 \u0432\u0435\u0440\u043D\u0438\u0441\u044C \u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u0434\u0435\u043B\u0443. \u0418\u043D\u0430\u0447\u0435 \u0434\u0435\u043D\u044C \u043B\u0435\u0433\u043A\u043E \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0441\u044F \u0432 \u043E\u0447\u0435\u043D\u044C \u0443\u0432\u043B\u0435\u043A\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u0431\u0435\u0437 \u0442\u043E\u0447\u043A\u0438 \u043F\u0440\u0438\u0431\u044B\u0442\u0438\u044F.", "\u0415\u0441\u043B\u0438 \u0432\u043E\u043F\u0440\u043E\u0441 \u0441\u043B\u043E\u0436\u043D\u044B\u0439, \u043D\u0430\u0447\u043D\u0438 \u0441 \u0441\u0430\u043C\u043E\u0433\u043E \u043F\u0440\u043E\u0441\u0442\u043E\u0433\u043E: \u0430 \u0447\u0435\u0433\u043E \u043C\u044B \u043F\u043E\u043A\u0430 \u043D\u0435 \u0437\u043D\u0430\u0435\u043C? \u041E\u0434\u0438\u043D \u043E\u0442\u0432\u0435\u0442 \u0438\u043D\u043E\u0433\u0434\u0430 \u0441\u043D\u0438\u043C\u0430\u0435\u0442 \u043F\u043E\u043B\u043E\u0432\u0438\u043D\u0443 \u0441\u043F\u043E\u0440\u0430. \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435 \u0443\u0436\u0435 \u043C\u043E\u0436\u043D\u043E \u043E\u0431\u0441\u0443\u0436\u0434\u0430\u0442\u044C \u0431\u0435\u0437 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0432 \u0433\u043E\u043B\u043E\u0432\u0435 \u0432\u0441\u0435 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u044B.", "\u0421\u043B\u043E\u0432\u0430 \u043C\u043E\u0433\u0443\u0442 \u043F\u0440\u043E\u044F\u0441\u043D\u0438\u0442\u044C \u0434\u0435\u043B\u043E, \u0430 \u043C\u043E\u0433\u0443\u0442 \u0435\u0433\u043E \u0435\u0449\u0451 \u043D\u0435\u043C\u043D\u043E\u0433\u043E \u0443\u043A\u0440\u0430\u0441\u0438\u0442\u044C. \u0415\u0441\u043B\u0438 \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0430 \u0440\u0430\u0437\u0440\u0430\u0441\u0442\u0430\u0435\u0442\u0441\u044F, \u043F\u0440\u043E\u0432\u0435\u0440\u044C, \u043F\u043E\u044F\u0432\u0438\u043B\u0441\u044F \u043B\u0438 \u0432 \u043D\u0435\u0439 \u043E\u0442\u0432\u0435\u0442. \u0412\u0435\u0436\u043B\u0438\u0432\u044B\u0435 \u0434\u043B\u0438\u043D\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043D\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442 \u044F\u0441\u043D\u043E\u0435 \xAB\u0434\u0430\xBB, \xAB\u043D\u0435\u0442\xBB \u0438\u043B\u0438 \xAB\u043C\u043D\u0435 \u043D\u0443\u0436\u043D\u043E \u0432\u0440\u0435\u043C\u044F\xBB."], Cancer: ["\u0411\u043B\u0438\u0437\u043A\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u043C\u043E\u0436\u043D\u043E \u0441\u043F\u0440\u043E\u0441\u0438\u0442\u044C, \u0447\u0442\u043E \u0435\u043C\u0443 \u043D\u0443\u0436\u043D\u043E, \u0430 \u043D\u0435 \u0441\u0440\u0430\u0437\u0443 \u043D\u0430\u0447\u0438\u043D\u0430\u0442\u044C \u0432\u0441\u0451 \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u043E\u0441\u043B\u0443\u0448\u0430\u0442\u044C. \u0410 \u0435\u0441\u043B\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043D\u0443\u0436\u043D\u0430 \u043F\u043E\u043C\u043E\u0449\u044C, \u043B\u0443\u0447\u0448\u0435 \u043F\u043E\u043D\u044F\u0442\u044C \u0435\u0451 \u043E\u0431\u044A\u0451\u043C \u0434\u043E \u0442\u043E\u0433\u043E, \u043A\u0430\u043A \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0434\u0435\u043D\u044C \u0443\u0436\u0435 \u0438\u0441\u0447\u0435\u0437.", "\u041B\u0438\u0447\u043D\u044B\u043C \u0434\u0435\u043B\u0430\u043C \u0442\u043E\u0436\u0435 \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u0434\u0435\u043B\u0438\u0442\u044C \u0432\u0440\u0435\u043C\u044F. \u041D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043C\u0435\u0436\u0434\u0443 \u0432\u0441\u0435\u043C \u0432\u0430\u0436\u043D\u044B\u043C. \u0421\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u043F\u043E\u0435\u0441\u0442\u044C, \u0437\u0430\u043D\u044F\u0442\u044C\u0441\u044F \u0434\u043E\u043C\u043E\u043C, \u043F\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C \u0431\u0435\u0437 \u0441\u043F\u0435\u0448\u043A\u0438 \u2014 \u044D\u0442\u043E \u043E\u0431\u044B\u0447\u043D\u0430\u044F \u0436\u0438\u0437\u043D\u044C, \u0430 \u043D\u0435 \u043D\u0430\u0433\u0440\u0430\u0434\u0430 \u043F\u043E\u0441\u043B\u0435 \u0431\u0435\u0437\u0443\u043F\u0440\u0435\u0447\u043D\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430.", "\u0415\u0441\u043B\u0438 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0441 \u0431\u043B\u0438\u0437\u043A\u0438\u043C \u0437\u0430\u0434\u0435\u043B, \u0432\u0435\u0440\u043D\u0438\u0441\u044C \u043A \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0439 \u0444\u0440\u0430\u0437\u0435. \u0427\u0442\u043E \u0431\u044B\u043B\u043E \u0441\u043A\u0430\u0437\u0430\u043D\u043E \u0438 \u0447\u0442\u043E \u0442\u044B \u0443\u0441\u043B\u044B\u0448\u0430\u043B\u0430? \u0418\u043D\u043E\u0433\u0434\u0430 \u043C\u0435\u0436\u0434\u0443 \u043D\u0438\u043C\u0438 \u0431\u043E\u043B\u044C\u0448\u0430\u044F \u0440\u0430\u0437\u043D\u0438\u0446\u0430. \u0415\u0451 \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u044F\u0441\u043D\u0438\u0442\u044C, \u043D\u0435 \u043F\u043E\u0434\u043D\u0438\u043C\u0430\u044F \u0437\u0430\u043E\u0434\u043D\u043E \u0432\u0435\u0441\u044C \u0441\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u0430\u0440\u0445\u0438\u0432."], Leo: ["\u0418\u0434\u0435\u044E \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0431\u0435\u0437 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u043F\u0440\u0438\u043F\u0438\u0441\u043A\u0438 \xAB\u043D\u0443 \u044D\u0442\u043E \u043F\u043E\u043A\u0430 \u0442\u0430\u043A, \u043D\u0438\u0447\u0435\u0433\u043E \u043E\u0441\u043E\u0431\u0435\u043D\u043D\u043E\u0433\u043E\xBB. \u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0435\u044E \u043F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F, \u043F\u043E\u0434\u0435\u043B\u0438\u0441\u044C. \u0410 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0443\u0436\u0435 \u043C\u043E\u0436\u043D\u043E \u0440\u0430\u0437\u0434\u0435\u043B\u0438\u0442\u044C: \u0447\u0442\u043E \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442 \u0440\u0430\u0431\u043E\u0442\u0435, \u0430 \u0447\u0442\u043E \u043F\u0440\u043E\u0441\u0442\u043E \u0447\u0443\u0436\u043E\u0439 \u0432\u043A\u0443\u0441.", "\u041D\u0435 \u043A\u0430\u0436\u0434\u043E\u0435 \u0438\u043D\u0442\u0435\u0440\u0435\u0441\u043D\u043E\u0435 \u0434\u0435\u043B\u043E \u0434\u043E\u043B\u0436\u043D\u043E \u0441\u0440\u0430\u0437\u0443 \u0432\u044B\u0433\u043B\u044F\u0434\u0435\u0442\u044C \u0432\u043D\u0443\u0448\u0438\u0442\u0435\u043B\u044C\u043D\u043E. \u041C\u0430\u043B\u0435\u043D\u044C\u043A\u0438\u0439 \u0433\u043E\u0442\u043E\u0432\u044B\u0439 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442 \u0442\u043E\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442. \u0418\u043D\u043E\u0433\u0434\u0430 \u0441 \u043D\u0435\u0433\u043E \u0438 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u0442\u043E, \u0447\u0442\u043E \u043F\u043E\u0442\u043E\u043C \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0442\u044C.", "\u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u043E-\u0441\u0432\u043E\u0435\u043C\u0443, \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0430 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0435. \u0411\u0435\u0437 \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u0438 \u043F\u043E \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0438\u044E \u0437\u0430\u043C\u044B\u0441\u043B\u0430. \u0427\u0443\u0436\u0438\u0435 \u043C\u043D\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u0433\u043E\u0434\u044F\u0442\u0441\u044F \u043F\u043E\u0437\u0436\u0435, \u043A\u043E\u0433\u0434\u0430 \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u043D\u044F\u0442\u043D\u043E, \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0442\u044B \u0445\u043E\u0447\u0435\u0448\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0442\u0435."], Virgo: ["\u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u0432\u0441\u044E \u0441\u0438\u0441\u0442\u0435\u043C\u0443, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C \u043E\u0434\u043D\u0443 \u0437\u0430\u0434\u0430\u0447\u0443. \u041D\u0430\u0439\u0434\u0438 \u0434\u0435\u0442\u0430\u043B\u044C, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u043E\u0439 \u0441\u0435\u0439\u0447\u0430\u0441 \u0432\u0441\u0451 \u0437\u0430\u0441\u0442\u0440\u044F\u043B\u043E. \u0411\u044B\u0432\u0430\u0435\u0442, \u0447\u0442\u043E \u0435\u0439 \u043D\u0443\u0436\u0435\u043D \u043E\u0434\u0438\u043D \u0432\u043E\u043F\u0440\u043E\u0441 \u0438\u043B\u0438 \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430, \u0430 \u043D\u0435 \u043D\u043E\u0432\u044B\u0439 \u0438\u0434\u0435\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u043E\u0440\u044F\u0434\u043E\u043A \u0436\u0438\u0437\u043D\u0438.", "\u041F\u0435\u0440\u0435\u0434 \u043E\u0447\u0435\u0440\u0435\u0434\u043D\u043E\u0439 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u043E\u0439 \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u0441\u043F\u0440\u043E\u0441\u0438\u0442\u044C: \u044D\u0442\u043E \u043C\u0435\u043D\u044F\u0435\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442? \u0415\u0441\u043B\u0438 \u043D\u0435\u0442, \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0440\u0430\u0431\u043E\u0442\u0430 \u0443\u0436\u0435 \u0433\u043E\u0442\u043E\u0432\u0430. \u041D\u0435 \u043A\u0430\u0436\u0434\u0443\u044E \u043D\u0430\u0439\u0434\u0435\u043D\u043D\u0443\u044E \u043C\u0435\u043B\u043E\u0447\u044C \u043D\u0443\u0436\u043D\u043E \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u0442\u044C \u0432 \u043F\u0440\u0438\u0447\u0438\u043D\u0443 \u0435\u0449\u0451 \u0440\u0430\u0437 \u043E\u0442\u043B\u043E\u0436\u0438\u0442\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435.", "\u041F\u043E\u043D\u044F\u0442\u043D\u0430\u044F \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u0438\u043D\u043E\u0433\u0434\u0430 \u043F\u043E\u043B\u0435\u0437\u043D\u0435\u0435 \u043D\u043E\u0432\u043E\u0439 \u043F\u043E\u0440\u0446\u0438\u0438 \u0441\u0442\u0430\u0440\u0430\u043D\u0438\u044F. \u0415\u0441\u043B\u0438 \u043E\u0434\u043D\u043E \u0438 \u0442\u043E \u0436\u0435 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u043F\u0435\u0440\u0435\u0434\u0435\u043B\u044B\u0432\u0430\u0442\u044C, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438, \u0433\u0434\u0435 \u0438\u043C\u0435\u043D\u043D\u043E \u0442\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u044F\u0441\u043D\u043E\u0441\u0442\u044C. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0434\u0435\u043B\u043E \u0441\u043E\u0432\u0441\u0435\u043C \u043D\u0435 \u0432 \u0442\u043E\u043C, \u0447\u0442\u043E \u043A\u0442\u043E-\u0442\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0441\u0442\u0430\u0440\u0430\u0435\u0442\u0441\u044F."], Libra: ["\u041C\u043E\u0436\u043D\u043E \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u0438 \u043D\u0435 \u043E\u0442\u043C\u0435\u043D\u044F\u0442\u044C \u0441\u0435\u0431\u044F. \u041D\u0430\u0437\u043E\u0432\u0438 \u0442\u043E, \u0431\u0435\u0437 \u0447\u0435\u0433\u043E \u0432\u0430\u0440\u0438\u0430\u043D\u0442 \u0442\u0435\u0431\u0435 \u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442, \u0430 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435 \u0443\u0436\u0435 \u043E\u0431\u0441\u0443\u0436\u0434\u0430\u0439. \u041D\u0435 \u0432\u0441\u0435 \u043F\u043E\u0436\u0435\u043B\u0430\u043D\u0438\u044F \u0434\u043E\u043B\u0436\u043D\u044B \u0432\u0435\u0441\u0438\u0442\u044C \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u043E.", "\u0415\u0441\u043B\u0438 \u0432\u044B\u0431\u0438\u0440\u0430\u0442\u044C \u0442\u0440\u0443\u0434\u043D\u043E, \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0431\u0435\u0440\u0438 \u0437\u0430\u0432\u0435\u0434\u043E\u043C\u043E \u043D\u0435\u0443\u0434\u043E\u0431\u043D\u043E\u0435. \u041D\u0435 \u043D\u0443\u0436\u043D\u043E \u0434\u043E \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0433\u043E \u0441\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0442\u044C \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u044B, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0442\u044B \u0432\u0441\u0451 \u0440\u0430\u0432\u043D\u043E \u043D\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0448\u044C\u0441\u044F. \u0418\u043D\u043E\u0433\u0434\u0430 \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u043F\u0440\u043E\u0449\u0435 \u043F\u043E\u0441\u043B\u0435 \u043E\u0431\u044B\u0447\u043D\u043E\u0433\u043E \u0447\u0435\u0441\u0442\u043D\u043E\u0433\u043E \xAB\u044D\u0442\u043E \u043D\u0435 \u043C\u043E\u0451\xBB.", "\u0412\u0435\u0436\u043B\u0438\u0432\u043E\u0441\u0442\u044C \u043D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0434\u0435\u043B\u0430\u0442\u044C \u0432\u0438\u0434, \u0447\u0442\u043E \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043F\u0440\u0435\u043A\u0440\u0430\u0441\u043D\u044B. \u041C\u043E\u0436\u043D\u043E \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u0441\u043A\u0430\u0437\u0430\u0442\u044C, \u043A\u0430\u043A\u043E\u0439 \u043F\u0443\u043D\u043A\u0442 \u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442, \u0438 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u0439. \u042D\u0442\u043E \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440, \u0430 \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0441\u0441\u043E\u0440\u0430."], Scorpio: ["\u0415\u0441\u043B\u0438 \u0442\u0435\u043C\u0430 \u0446\u0435\u043F\u043B\u044F\u0435\u0442, \u043D\u0435 \u0441\u043F\u0435\u0448\u0438 \u043E\u0431\u044A\u044F\u0441\u043D\u044F\u0442\u044C \u0441\u0435\u0431\u0435 \u0447\u0443\u0436\u0438\u0435 \u0441\u043A\u0440\u044B\u0442\u044B\u0435 \u043C\u043E\u0442\u0438\u0432\u044B. \u0427\u0442\u043E \u043F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u043E \u043D\u0430 \u0441\u0430\u043C\u043E\u043C \u0434\u0435\u043B\u0435? \u0427\u0442\u043E \u0442\u044B \u0443\u0436\u0435 \u0434\u043E\u0434\u0443\u043C\u0430\u043B\u0430? \u042D\u0442\u0438 \u0434\u0432\u0435 \u0447\u0430\u0441\u0442\u0438 \u043B\u0443\u0447\u0448\u0435 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0437\u0434\u0435\u043B\u0438\u0442\u044C, \u0430 \u043F\u043E\u0442\u043E\u043C \u0440\u0435\u0448\u0430\u0442\u044C, \u043D\u0443\u0436\u0435\u043D \u043B\u0438 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440.", "\u041D\u0435 \u043A\u0430\u0436\u0434\u044B\u0439 \u0441\u043B\u043E\u0436\u043D\u044B\u0439 \u0432\u043E\u043F\u0440\u043E\u0441 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0432\u0441\u043A\u0440\u044B\u0442\u044C \u0432\u0441\u0435 \u043F\u0440\u0438\u0447\u0438\u043D\u044B \u0434\u043E \u0441\u0430\u043C\u043E\u0433\u043E \u0434\u043D\u0430. \u0418\u043D\u043E\u0433\u0434\u0430 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u044F\u043C\u043E\u0433\u043E \u043E\u0442\u0432\u0435\u0442\u0430: \u043C\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0435\u043C, \u043C\u0435\u043D\u044F\u0435\u043C \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0438\u043B\u0438 \u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u0435\u043C? \u041A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0430\u044F \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044C \u043C\u043E\u0436\u0435\u0442 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u0435\u0449\u0451 \u043E\u0434\u0438\u043D \u043A\u0440\u0443\u0433 \u0434\u043E\u0433\u0430\u0434\u043E\u043A.", "\u041A\u043E\u0433\u0434\u0430 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0432\u0441\u0451 \u0432\u044B\u044F\u0441\u043D\u0438\u0442\u044C \u0441\u0440\u0430\u0437\u0443, \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043E\u0434\u0438\u043D \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430. \u0422\u043E\u0442, \u043E\u0442 \u043A\u043E\u0442\u043E\u0440\u043E\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433. \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C\u0441\u044F \u0447\u0430\u0441\u0442\u044C\u044E \u0441\u0435\u0433\u043E\u0434\u043D\u044F\u0448\u043D\u0435\u0433\u043E \u0432\u044B\u044F\u0441\u043D\u0435\u043D\u0438\u044F \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0439."], Sagittarius: ["\u0418\u043D\u0442\u0435\u0440\u0435\u0441\u043D\u043E\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C. \u041E\u0442 \u044D\u0442\u043E\u0433\u043E \u043E\u043D\u043E \u043D\u0435 \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u043D\u0435\u0442 \u0431\u044B\u0442\u044C \u0438\u043D\u0442\u0435\u0440\u0435\u0441\u043D\u044B\u043C. \u0423\u0437\u043D\u0430\u0442\u044C \u0446\u0435\u043D\u0443, \u0441\u0440\u043E\u043A\u0438 \u0438 \u0440\u0435\u0430\u043B\u044C\u043D\u0443\u044E \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0443 \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u0434\u043E \u0442\u043E\u0433\u043E, \u043A\u0430\u043A \u0443\u0436\u0435 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0432\u0441\u0435\u043C \u0440\u0430\u0441\u0441\u043A\u0430\u0437\u0430\u0442\u044C, \u0447\u0442\u043E \u0442\u044B \u0432\u0432\u044F\u0437\u0430\u043B\u0430\u0441\u044C \u0432 \u043D\u043E\u0432\u0443\u044E \u0438\u0441\u0442\u043E\u0440\u0438\u044E.", "\u0415\u0441\u043B\u0438 \u043F\u043B\u0430\u043D \u0431\u043E\u043B\u044C\u0448\u043E\u0439, \u043D\u0430\u0447\u043D\u0438 \u0441 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F. \u0423\u0437\u043D\u0430\u0442\u044C \u0443\u0441\u043B\u043E\u0432\u0438\u044F, \u043D\u0430\u0439\u0442\u0438 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A, \u043F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0441\u0442\u043E\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0441\u0440\u0430\u0437\u0443 \u043E\u0431\u0435\u0449\u0430\u0442\u044C \u0441\u0435\u0431\u0435 \u043D\u043E\u0432\u0443\u044E \u0436\u0438\u0437\u043D\u044C \u0446\u0435\u043B\u0438\u043A\u043E\u043C.", "\u0421\u0440\u0435\u0434\u0438 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u0438\u0445 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0435\u0439 \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043E\u0434\u043D\u0443 \u0438 \u043D\u0435 \u043E\u0431\u044A\u044F\u0432\u043B\u044F\u0442\u044C \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u0443\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u043C\u0438 \u043D\u0430\u0432\u0441\u0435\u0433\u0434\u0430. \u0421\u0435\u0439\u0447\u0430\u0441 \u0442\u044B \u043F\u0440\u043E\u0441\u0442\u043E \u0440\u0435\u0448\u0430\u0435\u0448\u044C, \u043D\u0430 \u0447\u0442\u043E \u0435\u0441\u0442\u044C \u0432\u0440\u0435\u043C\u044F \u0438 \u0436\u0435\u043B\u0430\u043D\u0438\u0435. \u041D\u0435 \u0441\u0434\u0430\u0451\u0448\u044C \u044D\u043A\u0437\u0430\u043C\u0435\u043D \u043D\u0430 \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0432\u0441\u0435\u0439 \u0431\u0443\u0434\u0443\u0449\u0435\u0439 \u0434\u043E\u0440\u043E\u0433\u0438."], Capricorn: ["\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438, \u043D\u0435 \u0432\u044B\u0440\u043E\u0441\u043B\u043E \u043B\u0438 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E \u0431\u043E\u043B\u044C\u0448\u0435 \u0441\u0430\u043C\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438. \u0421\u0434\u0435\u043B\u0430\u0442\u044C \u0441\u0432\u043E\u044E \u0447\u0430\u0441\u0442\u044C \u0438 \u0432\u0437\u044F\u0442\u044C\u0441\u044F \u0437\u0430 \u0432\u0441\u0451 \u0432\u043E\u043A\u0440\u0443\u0433 \u2014 \u0432\u0441\u0451-\u0442\u0430\u043A\u0438 \u0440\u0430\u0437\u043D\u044B\u0435 \u0432\u0435\u0449\u0438. \u0412\u0442\u043E\u0440\u043E\u0435 \u043D\u0435 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u044B\u043C \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u0442\u044B \u0443\u043C\u0435\u0435\u0448\u044C \u0441\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C\u0441\u044F.", "\u041C\u043E\u0436\u043D\u043E \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u044C\u0441\u044F \u043A \u0434\u0435\u043B\u0443 \u0441\u0435\u0440\u044C\u0451\u0437\u043D\u043E \u0438 \u043D\u0435 \u0434\u0435\u043B\u0430\u0442\u044C \u0435\u0433\u043E \u043D\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u043C \u0434\u044B\u0445\u0430\u043D\u0438\u0438. \u0423\u0442\u043E\u0447\u043D\u0438 \u0441\u0440\u043E\u043A, \u043E\u0442\u0434\u0435\u043B\u0438 \u0433\u043B\u0430\u0432\u043D\u043E\u0435 \u043E\u0442 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E. \u041D\u0435 \u043A\u0430\u0436\u0434\u043E\u043C\u0443 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0443 \u043D\u0443\u0436\u043D\u0430 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u043E \u0442\u043E\u043C, \u043A\u0430\u043A \u0442\u044F\u0436\u0435\u043B\u043E \u043E\u043D \u0434\u043E\u0441\u0442\u0430\u043B\u0441\u044F.", "\u041F\u043B\u0430\u043D \u0443\u0434\u043E\u0431\u043D\u0435\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0442\u044C \u043D\u0430 \u043E\u0431\u044B\u0447\u043D\u043E\u043C \u0434\u043D\u0435, \u0430 \u043D\u0435 \u043D\u0430 \u0432\u043E\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u043C\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u0441\u0435\u0431\u044F, \u043A\u043E\u0442\u043E\u0440\u0430\u044F \u043D\u0438\u043A\u043E\u0433\u0434\u0430 \u043D\u0435 \u0443\u0441\u0442\u0430\u0451\u0442. \u0415\u0441\u043B\u0438 \u043E\u043D \u043F\u043E\u043C\u0435\u0449\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u0443\u0434\u0430, \u0433\u0434\u0435 \u043D\u0435\u0442 \u0435\u0434\u044B, \u043E\u0442\u0434\u044B\u0445\u0430 \u0438 \u0434\u0440\u0443\u0433\u0438\u0445 \u043B\u044E\u0434\u0435\u0439, \u0435\u0433\u043E \u0441\u0442\u043E\u0438\u0442 \u043D\u0435\u043C\u043D\u043E\u0433\u043E \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C."], Aquarius: ["\u041D\u043E\u0432\u0443\u044E \u043C\u044B\u0441\u043B\u044C \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0431\u0435\u0437 \u0431\u043E\u043B\u044C\u0448\u043E\u0433\u043E \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F. \u0421\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u0440\u043E\u0431\u043D\u044B\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442 \u0438 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C, \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u043B\u0438 \u043E\u043D. \u041D\u0435 \u0432\u0441\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u044B \u043D\u0430\u0447\u0438\u043D\u0430\u044E\u0442\u0441\u044F \u0441 \u0440\u0435\u0448\u0435\u043D\u0438\u044F \u043D\u0430\u0432\u0441\u0435\u0433\u0434\u0430 \u043E\u0442\u043A\u0430\u0437\u0430\u0442\u044C\u0441\u044F \u043E\u0442 \u043F\u0440\u0435\u0436\u043D\u0435\u0433\u043E \u043F\u043E\u0440\u044F\u0434\u043A\u0430.", "\u0412 \u043E\u0431\u0449\u0435\u0439 \u0431\u0435\u0441\u0435\u0434\u0435 \u043C\u043E\u0436\u043D\u043E \u0438\u043C\u0435\u0442\u044C \u0441\u0432\u043E\u044E \u043F\u043E\u0437\u0438\u0446\u0438\u044E. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0442\u0443\u0442 \u0436\u0435 \u0443\u0431\u0435\u0434\u0438\u0442\u044C \u0432\u0441\u0435\u0445 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0445. \u0418\u043D\u043E\u0433\u0434\u0430 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u044F\u0441\u043D\u043E \u0435\u0451 \u043D\u0430\u0437\u0432\u0430\u0442\u044C \u0438 \u043F\u043E\u043D\u044F\u0442\u044C, \u0441 \u043A\u0435\u043C \u0432\u044B \u0434\u0430\u043B\u044C\u0448\u0435 \u0434\u0435\u043B\u0430\u0435\u0442\u0435 \u043E\u0434\u043D\u043E \u0434\u0435\u043B\u043E, \u0430 \u0433\u0434\u0435 \u043F\u0440\u043E\u0441\u0442\u043E \u0434\u0443\u043C\u0430\u0435\u0442\u0435 \u043F\u043E-\u0440\u0430\u0437\u043D\u043E\u043C\u0443.", "\u0415\u0441\u043B\u0438 \u043F\u0440\u0438\u0432\u044B\u0447\u043D\u044B\u0439 \u0441\u043F\u043E\u0441\u043E\u0431 \u043D\u0430\u0434\u043E\u0435\u043B, \u043F\u0440\u043E\u0432\u0435\u0440\u044C, \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0432 \u043D\u0451\u043C \u043D\u0435 \u0443\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u043F\u043E\u043C\u0435\u043D\u044F\u0442\u044C \u043D\u0443\u0436\u043D\u043E \u043E\u0434\u043D\u0443 \u0432\u0435\u0449\u044C, \u0430 \u043D\u0435 \u0432\u0441\u044E \u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044E. \u0417\u0430\u043E\u0434\u043D\u043E \u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u043D\u043E, \u0433\u0434\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442."], Pisces: ["\u0415\u0441\u043B\u0438 \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0438 \u043C\u0430\u043B\u043E, \u043D\u0435 \u0434\u043E\u043F\u0438\u0441\u044B\u0432\u0430\u0439 \u0437\u0430 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0435\u0433\u043E \u043D\u0430\u043C\u0435\u0440\u0435\u043D\u0438\u044F. \u041F\u0435\u0440\u0435\u0447\u0438\u0442\u0430\u0439 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0441\u043F\u0440\u043E\u0441\u0438, \u0447\u0442\u043E \u0438\u043C\u0435\u043B\u043E\u0441\u044C \u0432 \u0432\u0438\u0434\u0443. \u041F\u043E\u0447\u0443\u0432\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u0447\u0442\u043E-\u0442\u043E \u043C\u043E\u0436\u043D\u043E \u0431\u044B\u0441\u0442\u0440\u043E. \u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0432\u044B\u0432\u043E\u0434 \u2014 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0435 \u0434\u0435\u043B\u043E.", "\u0414\u043B\u044F \u0442\u0432\u043E\u0440\u0447\u0435\u0441\u043A\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B \u043C\u043E\u0436\u043D\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0432\u0440\u0435\u043C\u044F \u0431\u0435\u0437 \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E\u0439 \u043E\u0446\u0435\u043D\u043A\u0438. \u041F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C, \u043F\u043E\u0432\u043E\u0437\u0438\u0442\u044C\u0441\u044F, \u0432\u044B\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043D\u0435\u0443\u0434\u0430\u0447\u043D\u044B\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442. \u041D\u0435 \u0432\u0441\u0451 \u0438\u043D\u0442\u0435\u0440\u0435\u0441\u043D\u043E\u0435 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442\u0441\u044F \u0432 \u0442\u043E\u0442 \u043C\u043E\u043C\u0435\u043D\u0442, \u043A\u043E\u0433\u0434\u0430 \u043E\u0442 \u043D\u0435\u0433\u043E \u0443\u0436\u0435 \u0442\u0440\u0435\u0431\u0443\u044E\u0442 \u0433\u043E\u0442\u043E\u0432\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442.", "\u0421\u0434\u0435\u043B\u0430\u0442\u044C \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u043A\u0443\u0441\u043E\u043A \u2014 \u0438\u043D\u043E\u0433\u0434\u0430 \u0438\u043C\u0435\u043D\u043D\u043E \u0442\u043E, \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u043E. \u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u044E \u0436\u0438\u0437\u043D\u044C, \u0430 \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C \u043F\u0438\u0441\u044C\u043C\u043E. \u041D\u0435 \u043F\u0440\u0438\u0434\u0443\u043C\u0430\u0442\u044C \u043E\u043A\u043E\u043D\u0447\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442, \u0430 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0432\u043E\u043F\u0440\u043E\u0441. \u041C\u0430\u0441\u0448\u0442\u0430\u0431 \u043C\u043E\u0436\u043D\u043E \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u0442\u043E\u043C, \u0435\u0441\u043B\u0438 \u043E\u043D \u0432\u043E\u043E\u0431\u0449\u0435 \u043F\u043E\u043D\u0430\u0434\u043E\u0431\u0438\u0442\u0441\u044F."] };
var FE_TOPIC_PARAGRAPHS = { value_boundaries: { tense: ["\u0415\u0441\u043B\u0438 \u043F\u043E\u043A\u0443\u043F\u043A\u0430 \u0438\u043B\u0438 \u0447\u0443\u0436\u0430\u044F \u043F\u0440\u043E\u0441\u044C\u0431\u0430 \u0432\u044B\u0437\u044B\u0432\u0430\u0435\u0442 \u0441\u043F\u043E\u0440 \u0441 \u0441\u043E\u0431\u043E\u0439, \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u0443\u0441\u043B\u043E\u0432\u0438\u044F. \u041D\u0435 \xAB\u044F \u043E\u043F\u044F\u0442\u044C \u0432\u0441\u0451 \u0434\u0435\u043B\u0430\u044E \u043D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\xBB, \u0430 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u044D\u0442\u043E \u0441\u0442\u043E\u0438\u0442, \u0437\u0430\u0447\u0435\u043C \u043D\u0443\u0436\u043D\u043E \u0438 \u043D\u0430 \u0447\u0442\u043E \u0442\u044B \u0441\u043E\u0433\u043B\u0430\u0441\u043D\u0430. \u0426\u0435\u043D\u0430 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0439 \u0432\u0435\u0449\u0438 \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u043D\u0430 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C\u0441\u044F \u043E\u0446\u0435\u043D\u043A\u043E\u0439 \u0442\u0435\u0431\u044F \u0446\u0435\u043B\u0438\u043A\u043E\u043C.", "\u0421\u043E\u0433\u043B\u0430\u0448\u0430\u0442\u044C\u0441\u044F \u0440\u0430\u0434\u0438 \u0445\u043E\u0440\u043E\u0448\u0438\u0445 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0439 \u2014 \u043F\u043E\u043D\u044F\u0442\u043D\u043E\u0435 \u0436\u0435\u043B\u0430\u043D\u0438\u0435. \u0422\u043E\u043B\u044C\u043A\u043E \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043E\u0442 \u044D\u0442\u043E\u0433\u043E \u0441\u0430\u043C\u0438 \u043D\u0435 \u0441\u0442\u0430\u043D\u0443\u0442 \u0443\u0434\u043E\u0431\u043D\u044B\u043C\u0438. \u041C\u043E\u0436\u043D\u043E \u0441\u043A\u0430\u0437\u0430\u0442\u044C, \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0442\u0435\u0431\u0435 \u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442, \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044F \u0437\u0430\u043E\u0434\u043D\u043E, \u043A\u0442\u043E \u0438\u0437 \u0432\u0430\u0441 \u043B\u0443\u0447\u0448\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0434\u0440\u0443\u0433\u043E\u043C\u0443."], supportive: ["\u0425\u043E\u0440\u043E\u0448\u0443\u044E \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0441\u043E\u0431\u0440\u0430\u0442\u044C \u0431\u0435\u0437 \u043B\u0438\u0448\u043D\u0435\u0433\u043E \u043D\u0430\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F: \u0432\u043E\u0442 \u0446\u0435\u043D\u0430, \u0432\u043E\u0442 \u0441\u0440\u043E\u043A, \u0432\u043E\u0442 \u0447\u0442\u043E \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043B\u0430\u0435\u0442. \u0418\u043D\u043E\u0433\u0434\u0430 \u0438\u043C\u0435\u043D\u043D\u043E \u0442\u0430\u043A\u0430\u044F \u043F\u0440\u043E\u0437\u0430 \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0440\u0438\u044F\u0442\u043D\u043E\u0435 \u043E\u0431\u0449\u0435\u043D\u0438\u0435. \u041D\u0438\u043A\u043E\u043C\u0443 \u043D\u0435 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u0443\u0433\u0430\u0434\u044B\u0432\u0430\u0442\u044C, \u0433\u0434\u0435 \u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u043F\u0440\u043E\u0441\u044C\u0431\u0430 \u0438 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u043E\u0431\u044F\u0437\u0430\u043D\u043D\u043E\u0441\u0442\u044C.", "\u0416\u0435\u043B\u0430\u043D\u0438\u0435 \u0438 \u0440\u0430\u0437\u0443\u043C\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442 \u0432\u043F\u043E\u043B\u043D\u0435 \u043C\u043E\u0433\u0443\u0442 \u0441\u043E\u0432\u043F\u0430\u0441\u0442\u044C. \u0415\u0441\u043B\u0438 \u0432\u0430\u0440\u0438\u0430\u043D\u0442 \u043D\u0440\u0430\u0432\u0438\u0442\u0441\u044F, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u0435\u0433\u043E \u043E\u0431\u044B\u0447\u043D\u044B\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F: \u0441\u0443\u043C\u043C\u0443, \u0432\u0440\u0435\u043C\u044F, \u043E\u0431\u044A\u0451\u043C \u0440\u0430\u0431\u043E\u0442\u044B. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0438\u0441\u043A\u0430\u0442\u044C \u043F\u043E\u0434\u0432\u043E\u0445 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u0432\u0441\u0451 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C \u0431\u0435\u0437 \u0431\u043E\u0440\u044C\u0431\u044B."], focused: ["\u0425\u043E\u0447\u0435\u0442\u0441\u044F \u043E\u0434\u043D\u043E\u0433\u043E, \u043E\u0431\u0435\u0449\u0430\u043D\u043E \u0434\u0440\u0443\u0433\u043E\u0435. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0430\u0437\u043E\u0432\u0438 \u043E\u0431\u0435 \u0447\u0430\u0441\u0442\u0438. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u043F\u0440\u0438\u0434\u0451\u0442\u0441\u044F \u043F\u0435\u0440\u0435\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0441\u0440\u043E\u043A \u0438\u043B\u0438 \u043E\u0431\u044A\u0451\u043C \u0443\u0447\u0430\u0441\u0442\u0438\u044F, \u043D\u043E \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0437\u0430\u043F\u0440\u0435\u0449\u0430\u0442\u044C \u0441\u0435\u0431\u0435 \u0441\u0430\u043C\u0443 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C \u0445\u043E\u0442\u0435\u0442\u044C \u0438\u043D\u0430\u0447\u0435.", "\u0412 \u0434\u0435\u043D\u044C\u0433\u0430\u0445 \u0438 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u044F\u0445 \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u0437\u043D\u0430\u0442\u044C \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435 \xAB\u043C\u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442\xBB. \u0411\u0435\u0437 \u0434\u043B\u0438\u043D\u043D\u043E\u0439 \u0437\u0430\u0449\u0438\u0442\u044B \u043F\u0435\u0440\u0435\u0434 \u0432\u043E\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u043C\u043E\u0439 \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u0435\u0439. \u0423\u0441\u043B\u043E\u0432\u0438\u044F \u043C\u043E\u0436\u043D\u043E \u043E\u0431\u0441\u0443\u0436\u0434\u0430\u0442\u044C, \u0430 \u043D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0442\u044C \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0438\u043B\u0438 \u043E\u0442\u0432\u0435\u0440\u0433\u0430\u0442\u044C \u0432\u043C\u0435\u0441\u0442\u0435 \u0441 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C."] }, words_action: { tense: ["\u0415\u0441\u043B\u0438 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0441\u0442\u0430\u043B \u0440\u0435\u0437\u043A\u0438\u043C, \u043F\u0440\u043E\u0432\u0435\u0440\u044C, \u043E\u0441\u0442\u0430\u043B\u0441\u044F \u043B\u0438 \u0432 \u043D\u0451\u043C \u0441\u0430\u043C \u0432\u043E\u043F\u0440\u043E\u0441. \u0427\u0442\u043E \u043D\u0430\u0434\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C? \u041A\u0442\u043E \u0437\u0430 \u044D\u0442\u043E \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u0442? \u0424\u0440\u0430\u0437\u0430 \u043F\u043E\u0433\u0440\u043E\u043C\u0447\u0435 \u043D\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u043E\u0431\u044A\u044F\u0441\u043D\u044F\u0435\u0442 \u043F\u043E\u043D\u044F\u0442\u043D\u0435\u0435. \u0418\u043D\u043E\u0433\u0434\u0430 \u043B\u0443\u0447\u0448\u0435 \u0432\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F \u0441 \u043E\u0434\u043D\u0438\u043C \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u043C \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u043C.", "\u0411\u044B\u0441\u0442\u0440\u044B\u0439 \u043E\u0442\u0432\u0435\u0442 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043E\u0447\u0435\u043D\u044C \u0443\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u043C \u0438 \u043F\u0440\u0438 \u044D\u0442\u043E\u043C \u043D\u0435\u0442\u043E\u0447\u043D\u044B\u043C. \u041F\u0435\u0440\u0435\u0434 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u043E\u0439 \u0432\u0430\u0436\u043D\u043E\u0433\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043F\u0435\u0440\u0435\u0447\u0438\u0442\u0430\u0439 \u0438\u043C\u0435\u043D\u043D\u043E \u043F\u0440\u043E\u0441\u044C\u0431\u0443: \u043F\u043E\u043D\u044F\u0442\u043D\u043E \u043B\u0438, \u0447\u0442\u043E \u0442\u044B \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u0435\u0448\u044C? \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u044D\u043C\u043E\u0446\u0438\u0438 \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u043D\u044B \u0435\u0445\u0430\u0442\u044C \u0441\u043B\u0435\u0434\u043E\u043C \u0442\u0435\u043C \u0436\u0435 \u043F\u0438\u0441\u044C\u043C\u043E\u043C."], supportive: ["\u0422\u0443\u0442 \u043C\u043E\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u0442\u044C \u043E\u0431\u044A\u044F\u0441\u043D\u044F\u0442\u044C \u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C. \u0421\u0434\u0435\u043B\u0430\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A, \u0437\u0430\u0434\u0430\u0442\u044C \u043F\u0440\u044F\u043C\u043E\u0439 \u0432\u043E\u043F\u0440\u043E\u0441, \u043D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440. \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u043E\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441\u043A\u0430\u0436\u0435\u0442 \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u0435\u0449\u0451 \u0447\u0430\u0441 \u043E\u0431\u0441\u0443\u0436\u0434\u0435\u043D\u0438\u044F, \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0441\u044F \u043B\u0438 \u0432\u0441\u0451 \u0432 \u043F\u0440\u0438\u043D\u0446\u0438\u043F\u0435.", "\u0414\u043B\u044F \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430 \u0445\u043E\u0440\u043E\u0448\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u043F\u0440\u043E\u0441\u0442\u0430\u044F \u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F: \u0432\u043E\u0442 \u0437\u0430\u0434\u0430\u0447\u0430, \u0432\u043E\u0442 \u043F\u0435\u0440\u0432\u044B\u0439 \u0448\u0430\u0433, \u0432\u043E\u0442 \u0441\u0440\u043E\u043A. \u0411\u0435\u0437 \u043F\u044F\u0442\u0438 \u0432\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0439 \u0438 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043D\u0430 \u0432\u0441\u0435 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u044B\u0435 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F. \u0427\u0435\u043B\u043E\u0432\u0435\u043A \u043D\u0430\u043F\u0440\u043E\u0442\u0438\u0432 \u0442\u043E\u0436\u0435 \u043C\u043E\u0436\u0435\u0442 \u0447\u0442\u043E-\u0442\u043E \u0441\u043A\u0430\u0437\u0430\u0442\u044C."], focused: ["\u0415\u0441\u043B\u0438 \u043C\u044B\u0441\u043B\u044C \u0443\u0436\u0435 \u043F\u043E\u043D\u044F\u0442\u043D\u0430, \u0435\u0439 \u043C\u043E\u0436\u043D\u043E \u0434\u0430\u0442\u044C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435. \u041D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0435. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u0442\u044C \u0445\u043E\u0440\u043E\u0448\u0443\u044E \u0444\u043E\u0440\u043C\u0443\u043B\u0438\u0440\u043E\u0432\u043A\u0443 \u0432 \u043E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0432\u0441\u0451 \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E \u0438 \u0438\u0434\u0435\u0430\u043B\u044C\u043D\u043E.", "\u042F\u0441\u043D\u043E \u0441\u043A\u0430\u0437\u0430\u0442\u044C \u2014 \u0435\u0449\u0451 \u043D\u0435 \u0437\u043D\u0430\u0447\u0438\u0442 \u043F\u0440\u043E\u0434\u0430\u0432\u0438\u0442\u044C. \u041C\u043E\u0436\u043D\u043E \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C \u0432\u0430\u0440\u0438\u0430\u043D\u0442 \u0438 \u0434\u043E\u0436\u0434\u0430\u0442\u044C\u0441\u044F \u043E\u0442\u0432\u0435\u0442\u0430. \u0422\u0432\u043E\u044F \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C \u0434\u0435\u0439\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u043D\u0435 \u043E\u0442\u043C\u0435\u043D\u044F\u0435\u0442 \u0447\u0443\u0436\u043E\u0435 \u043F\u0440\u0430\u0432\u043E \u043F\u043E\u0434\u0443\u043C\u0430\u0442\u044C."] }, clarity: { tense: ["\u041A\u0440\u0430\u0441\u0438\u0432\u043E \u0437\u0432\u0443\u0447\u0438\u0442 \u2014 \u0435\u0449\u0451 \u043D\u0435 \u0437\u043D\u0430\u0447\u0438\u0442 \u043F\u043E\u043D\u044F\u0442\u043D\u043E. \u0415\u0441\u043B\u0438 \u0432 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0438 \u043D\u0435\u0442 \u0441\u0443\u043C\u043C\u044B, \u0441\u0440\u043E\u043A\u0430 \u0438\u043B\u0438 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B, \u0441\u043F\u0440\u043E\u0441\u0438 \u043F\u0440\u043E \u043D\u0438\u0445. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0441\u0440\u0430\u0437\u0443 \u043E\u0442\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C\u0441\u044F. \u041D\u043E \u0441\u043E\u0433\u043B\u0430\u0448\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0443\u044E \u043A\u0440\u0430\u0441\u0438\u0432\u0443\u044E \u0434\u043E\u0433\u0430\u0434\u043A\u0443 \u0442\u043E\u0436\u0435 \u043D\u0435 \u0441\u0442\u043E\u0438\u0442.", "\u0415\u0441\u043B\u0438 \u0432 \u0433\u043E\u043B\u043E\u0432\u0435 \u0443\u0436\u0435 \u0441\u043B\u043E\u0436\u0438\u043B\u0430\u0441\u044C \u0446\u0435\u043B\u0430\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F, \u0432\u0435\u0440\u043D\u0438\u0441\u044C \u043A \u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E \u0442\u043E\u0447\u043D\u043E. \u0427\u0442\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u0441\u043A\u0430\u0437\u0430\u043B? \u0427\u0442\u043E \u043E\u0431\u0435\u0449\u0430\u043B? \u0427\u0442\u043E \u0442\u044B \u0434\u043E\u0431\u0430\u0432\u0438\u043B\u0430 \u0441\u0430\u043C\u0430? \u0418\u043D\u043E\u0433\u0434\u0430 \u043F\u043E\u0441\u043B\u0435 \u0442\u0430\u043A\u043E\u0433\u043E \u0440\u0430\u0437\u0431\u043E\u0440\u0430 \u043D\u0443\u0436\u0435\u043D \u043E\u0434\u0438\u043D \u0432\u043E\u043F\u0440\u043E\u0441, \u0430 \u043D\u0435 \u0431\u043E\u043B\u044C\u0448\u043E\u0435 \u0440\u0430\u0437\u043E\u0447\u0430\u0440\u043E\u0432\u0430\u043D\u0438\u0435."], supportive: ["\u0418\u0434\u0435\u044E \u043C\u043E\u0436\u043D\u043E \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0432 \u0442\u043E\u043C \u0432\u0438\u0434\u0435, \u0432 \u043A\u0430\u043A\u043E\u043C \u043E\u043D\u0430 \u043F\u0440\u0438\u0448\u043B\u0430. \u0410 \u043F\u043E\u0442\u043E\u043C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C, \u043A\u0430\u043A \u044D\u0442\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C. \u0412\u0434\u043E\u0445\u043D\u043E\u0432\u0435\u043D\u0438\u0435 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0434\u0435\u0442\u0430\u043B\u0435\u0439 \u043D\u0435 \u043C\u0435\u0448\u0430\u044E\u0442 \u0434\u0440\u0443\u0433 \u0434\u0440\u0443\u0433\u0443; \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u0442\u044C \u0438\u0445 \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E.", "\u0423 \u0445\u043E\u0440\u043E\u0448\u0435\u0433\u043E \u0437\u0430\u043C\u044B\u0441\u043B\u0430 \u043C\u043E\u0436\u0435\u0442 \u043F\u043E\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u043F\u0440\u043E\u0441\u0442\u0430\u044F \u0444\u043E\u0440\u043C\u0430: \u043D\u0430\u0431\u0440\u043E\u0441\u043E\u043A, \u0442\u0435\u043A\u0441\u0442, \u043F\u0440\u043E\u0431\u043D\u044B\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440. \u041D\u0435 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u0439 \u043F\u043E \u043D\u0435\u043C\u0443 \u0441\u0440\u0430\u0437\u0443 \u0432\u0441\u0451 \u0431\u0443\u0434\u0443\u0449\u0435\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u041F\u043E\u043A\u0430 \u0432\u0430\u0436\u043D\u043E \u0443\u0432\u0438\u0434\u0435\u0442\u044C, \u0447\u0442\u043E \u0432\u043E\u043E\u0431\u0449\u0435 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442\u0441\u044F."], focused: ["\u0412\u043F\u0435\u0447\u0430\u0442\u043B\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C, \u043D\u0435 \u043E\u0431\u044A\u044F\u0432\u043B\u044F\u044F \u0435\u0433\u043E \u043E\u043A\u043E\u043D\u0447\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u043C \u0432\u044B\u0432\u043E\u0434\u043E\u043C. \u0415\u0441\u043B\u0438 \u0440\u0435\u0447\u044C \u043E \u0432\u0430\u0436\u043D\u043E\u0439 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u0438, \u0443\u0442\u043E\u0447\u043D\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0443\u044E \u0447\u0430\u0441\u0442\u044C. \u0427\u0443\u0432\u0441\u0442\u0432\u043E \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F \u2014 \u0440\u0430\u0437\u043D\u044B\u0435 \u0432\u0435\u0449\u0438.", "\u041D\u0435\u044F\u0441\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u043D\u0443\u0436\u043D\u043E \u0441\u0440\u043E\u0447\u043D\u043E \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C. \u0418\u043D\u043E\u0433\u0434\u0430 \u0447\u0435\u0441\u0442\u043D\u043E\u0435 \xAB\u043F\u043E\u043A\u0430 \u043D\u0435 \u0437\u043D\u0430\u044E\xBB \u043F\u043E\u043B\u0435\u0437\u043D\u0435\u0435 \u0432\u0435\u0440\u0441\u0438\u0438, \u043A\u043E\u0442\u043E\u0440\u0443\u044E \u043F\u0440\u0438\u0448\u043B\u043E\u0441\u044C \u043F\u0440\u0438\u0434\u0443\u043C\u0430\u0442\u044C, \u0447\u0442\u043E\u0431\u044B \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u0442\u044C \u043D\u0435\u0440\u0432\u043D\u0438\u0447\u0430\u0442\u044C. \u041A \u0432\u043E\u043F\u0440\u043E\u0441\u0443 \u043C\u043E\u0436\u043D\u043E \u0432\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F \u0441 \u043D\u043E\u0432\u044B\u043C\u0438 \u0434\u0430\u043D\u043D\u044B\u043C\u0438."] }, control: { tense: ["\u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0434\u043E\u0431\u0438\u0442\u044C\u0441\u044F \u043E\u0442\u0432\u0435\u0442\u0430 \u043B\u044E\u0431\u043E\u0439 \u0446\u0435\u043D\u043E\u0439, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438: \u0430 \u043A\u0430\u043A\u043E\u0439 \u043E\u0442\u0432\u0435\u0442 \u0442\u044B \u0432\u043E\u043E\u0431\u0449\u0435 \u0433\u043E\u0442\u043E\u0432\u0430 \u0443\u0441\u043B\u044B\u0448\u0430\u0442\u044C? \u041C\u043E\u0436\u043D\u043E \u043D\u0430\u0437\u0432\u0430\u0442\u044C \u0441\u0432\u043E\u0438 \u0443\u0441\u043B\u043E\u0432\u0438\u044F. \u041D\u043E \u0440\u0435\u0448\u0438\u0442\u044C \u0437\u0430 \u0434\u0440\u0443\u0433\u043E\u0433\u043E, \u0447\u0442\u043E \u043E\u043D \u0434\u043E\u043B\u0436\u0435\u043D \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0438 \u043F\u043E\u0447\u0443\u0432\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C, \u0432\u0441\u0451 \u0440\u0430\u0432\u043D\u043E \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0441\u044F.", "\u041D\u0435 \u0432\u0441\u0451, \u0447\u0442\u043E \u0432\u0430\u0436\u043D\u043E, \u043C\u043E\u0436\u043D\u043E \u0443\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0443\u0441\u0438\u043B\u0438\u0435\u043C. \u0415\u0441\u043B\u0438 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0441\u044F \u0432 \u043F\u043E\u043F\u044B\u0442\u043A\u0443 \u043F\u0440\u043E\u043A\u043E\u043D\u0442\u0440\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430, \u0432\u0435\u0440\u043D\u0438\u0441\u044C \u043A \u0441\u0432\u043E\u0435\u0439 \u0447\u0430\u0441\u0442\u0438: \u0447\u0442\u043E \u0442\u044B \u0432\u044B\u0431\u0438\u0440\u0430\u0435\u0448\u044C, \u043D\u0430 \u0447\u0442\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u043D\u0430 \u0438 \u0447\u0442\u043E \u0431\u0443\u0434\u0435\u0448\u044C \u0434\u0435\u043B\u0430\u0442\u044C \u0434\u0430\u043B\u044C\u0448\u0435."], supportive: ["\u0412 \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u043C\u043E\u0436\u043D\u043E \u043D\u0430\u0439\u0442\u0438 \u043E\u0434\u0438\u043D \u043A\u0443\u0441\u043E\u043A, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u043E\u0442 \u0442\u0432\u043E\u0435\u0433\u043E \u0443\u0447\u0430\u0441\u0442\u0438\u044F. \u0417\u0430\u0439\u043C\u0438\u0441\u044C \u0438\u043C. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0432\u043B\u0430\u0441\u0442\u044C \u043D\u0430\u0434 \u0432\u0441\u0435\u0439 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u0435\u0439, \u0447\u0442\u043E\u0431\u044B \u0447\u0442\u043E-\u0442\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u043E \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443.", "\u0415\u0441\u043B\u0438 \u043F\u043E\u044F\u0432\u0438\u043B\u0430\u0441\u044C \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u043E\u0431\u0441\u0443\u0434\u0438\u0442\u044C \u0441\u043B\u043E\u0436\u043D\u044B\u0439 \u0432\u043E\u043F\u0440\u043E\u0441, \u0432\u044B\u0431\u0435\u0440\u0438 \u0441\u0430\u043C \u0432\u043E\u043F\u0440\u043E\u0441. \u0411\u0435\u0437 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438, \u043A\u0442\u043E \u0441\u0438\u043B\u044C\u043D\u0435\u0435 \u0438 \u043A\u0442\u043E \u043F\u0435\u0440\u0432\u044B\u0439 \u0443\u0441\u0442\u0443\u043F\u0438\u043B. \u0414\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u0445\u0443\u0436\u0435 \u043E\u0442 \u0442\u043E\u0433\u043E, \u0447\u0442\u043E \u0435\u0451 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0431\u0435\u0437 \u0431\u043E\u0440\u044C\u0431\u044B."], focused: ["\u0421\u0438\u043B\u044C\u043D\u0430\u044F \u0432\u043E\u0432\u043B\u0435\u0447\u0451\u043D\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u0434\u0435\u043B\u0430\u0435\u0442 \u0432\u0441\u0451 \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u044F\u0449\u0435\u0435 \u0442\u0432\u043E\u0435\u0439 \u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0441\u0442\u044C\u044E. \u0421\u0432\u043E\u0439 \u0448\u0430\u0433 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0434\u0443\u043C\u0430\u0442\u044C. \u0427\u0443\u0436\u043E\u0439 \u2014 \u043F\u0440\u0438\u0434\u0451\u0442\u0441\u044F \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443, \u0434\u0430\u0436\u0435 \u0435\u0441\u043B\u0438 \u0443 \u0442\u0435\u0431\u044F \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0434\u043B\u044F \u043D\u0435\u0433\u043E \u043E\u0442\u043B\u0438\u0447\u043D\u044B\u0439 \u043F\u043B\u0430\u043D.", "\u041A\u043E\u0433\u0434\u0430 \u0442\u0435\u043C\u0430 \u043A\u0430\u0436\u0435\u0442\u0441\u044F \u043E\u0433\u0440\u043E\u043C\u043D\u043E\u0439, \u0441\u0443\u0437\u044C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440. \u041D\u0435 \xAB\u0447\u0442\u043E \u0432\u043E\u043E\u0431\u0449\u0435 \u043C\u0435\u0436\u0434\u0443 \u043D\u0430\u043C\u0438 \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u0438\u0442\xBB, \u0430 \u043A\u0430\u043A\u0430\u044F \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044C \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442. \u0421 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u043C \u043F\u0443\u043D\u043A\u0442\u043E\u043C \u043E\u0431\u044B\u0447\u043D\u043E \u0435\u0441\u0442\u044C \u0447\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C."] }, change: { tense: ["\u0415\u0441\u043B\u0438 \u043F\u0440\u0438\u0432\u044B\u0447\u043D\u044B\u0439 \u043F\u043E\u0440\u044F\u0434\u043E\u043A \u0440\u0430\u0437\u0434\u0440\u0430\u0436\u0430\u0435\u0442, \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0441\u043D\u043E\u0441\u0438\u0442\u044C \u0435\u0433\u043E \u0446\u0435\u043B\u0438\u043A\u043E\u043C. \u0412\u044B\u0431\u0435\u0440\u0438 \u0442\u043E, \u0447\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043C\u0435\u0448\u0430\u0435\u0442, \u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u044C \u043E\u0434\u043D\u0443 \u0447\u0430\u0441\u0442\u044C. \u041C\u043E\u0436\u0435\u0442 \u043E\u043A\u0430\u0437\u0430\u0442\u044C\u0441\u044F, \u0447\u0442\u043E \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435 \u0435\u0449\u0451 \u0432\u043F\u043E\u043B\u043D\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442.", "\u041F\u043E\u043C\u0435\u043D\u044F\u0442\u044C \u043F\u043B\u0430\u043D \u043C\u043E\u0436\u043D\u043E. \u041D\u043E \u043F\u0435\u0440\u0435\u0434 \u0440\u0435\u0437\u043A\u0438\u043C \u043F\u043E\u0432\u043E\u0440\u043E\u0442\u043E\u043C \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C, \u043A\u0430\u043A\u0438\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430 \u0443\u0436\u0435 \u0435\u0441\u0442\u044C. \u0421\u0432\u043E\u0431\u043E\u0434\u044B \u043E\u0431\u044B\u0447\u043D\u043E \u0431\u043E\u043B\u044C\u0448\u0435 \u0442\u0430\u043C, \u0433\u0434\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043F\u0435\u0440\u0435\u0441\u043C\u043E\u0442\u0440\u0435\u043B\u0438, \u0430 \u043D\u0435 \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u043B\u0438 \u0437\u0430\u043C\u0435\u0447\u0430\u0442\u044C."], supportive: ["\u0414\u0440\u0443\u0433\u043E\u0439 \u0441\u043F\u043E\u0441\u043E\u0431 \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u0431\u0435\u0437 \u043A\u043B\u044F\u0442\u0432\u044B \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C\u0441\u044F \u0438\u043C \u0432\u0441\u044E \u0436\u0438\u0437\u043D\u044C. \u041D\u043E\u0432\u044B\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442, \u0432\u0440\u0435\u043C\u044F, \u0444\u043E\u0440\u043C\u0430\u0442 \u0432\u0441\u0442\u0440\u0435\u0447\u0438. \u0415\u0441\u043B\u0438 \u0441\u0442\u0430\u043B\u043E \u0443\u0434\u043E\u0431\u043D\u0435\u0435 \u2014 \u043E\u0441\u0442\u0430\u0432\u0438\u0448\u044C. \u0415\u0441\u043B\u0438 \u043D\u0435\u0442, \u0443 \u044D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u0430 \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0432\u043F\u043E\u043B\u043D\u0435 \u043F\u043E\u043D\u044F\u0442\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442.", "\u041D\u0435\u043E\u0431\u044B\u0447\u043D\u043E\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u043D\u043E \u0431\u044B\u0442\u044C \u0441\u043B\u043E\u0436\u043D\u044B\u043C. \u0418\u043D\u043E\u0433\u0434\u0430 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u043E\u043C\u0435\u043D\u044F\u0442\u044C \u043F\u043E\u0440\u044F\u0434\u043E\u043A \u0434\u0432\u0443\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0438 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C, \u0447\u0442\u043E \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0441\u044F. \u041D\u0435 \u0432\u0441\u044F\u043A\u043E\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0440\u0435\u0432\u043E\u043B\u044E\u0446\u0438\u0438."], focused: ["\u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0438\u043D\u0430\u0447\u0435, \u043D\u0430\u0437\u043E\u0432\u0438 \u044D\u0442\u043E \xAB\u0438\u043D\u0430\u0447\u0435\xBB \u0441\u043B\u043E\u0432\u0430\u043C\u0438. \u0427\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F? \u0412\u0440\u0435\u043C\u044F, \u043E\u0431\u044A\u0451\u043C, \u0441\u0442\u0435\u043F\u0435\u043D\u044C \u0443\u0447\u0430\u0441\u0442\u0438\u044F? \u041A\u043E\u0433\u0434\u0430 \u043F\u043E\u043D\u044F\u0442\u043D\u043E, \u0447\u0435\u0433\u043E \u0442\u044B \u0445\u043E\u0447\u0435\u0448\u044C, \u043F\u0440\u043E\u0449\u0435 \u043E\u0431\u0441\u0443\u0434\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u0443 \u0431\u0435\u0437 \u043E\u0431\u0449\u0435\u0433\u043E \u043E\u0442\u043A\u0430\u0437\u0430 \u043E\u0442 \u0432\u0441\u0435\u0433\u043E \u043F\u0440\u043E\u0448\u043B\u043E\u0433\u043E.", "\u041C\u043E\u0436\u043D\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0435\u0431\u0435 \u043F\u0440\u0430\u0432\u043E \u043D\u0430 \u043F\u0440\u043E\u0431\u0443. \u0421\u0434\u0435\u043B\u0430\u0442\u044C \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u043D\u043E\u0432\u044B\u0439 \u0448\u0430\u0433, \u043D\u0435 \u043E\u0442\u043C\u0435\u043D\u044F\u044F \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u0438, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0432\u0441\u0451 \u0435\u0449\u0451 \u043D\u0443\u0436\u043D\u044B. \u0418\u043B\u0438 \u0447\u0435\u0441\u0442\u043D\u043E \u0438\u0445 \u043F\u0435\u0440\u0435\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u2014 \u0442\u043E\u0436\u0435 \u0440\u0430\u0431\u043E\u0447\u0438\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442."] }, direction: { tense: ["\u0415\u0441\u043B\u0438 \u0442\u0432\u043E\u0451 \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 \u0447\u0443\u0436\u0438\u043C\u0438 \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u044F\u043C\u0438, \u044D\u0442\u043E \u0435\u0449\u0451 \u043D\u0435 \u0434\u0435\u043B\u0430\u0435\u0442 \u0435\u0433\u043E \u043D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u044B\u043C. \u0412\u0430\u0436\u043D\u043E \u0441\u0430\u043C\u043E\u0439 \u043F\u043E\u043D\u0438\u043C\u0430\u0442\u044C, \u0437\u0430\u0447\u0435\u043C \u0442\u044B \u0432\u044B\u0431\u0438\u0440\u0430\u0435\u0448\u044C \u0438\u043C\u0435\u043D\u043D\u043E \u0442\u0430\u043A. \u0422\u043E\u0433\u0434\u0430 \u043C\u043E\u0436\u043D\u043E \u043E\u0431\u044A\u044F\u0441\u043D\u0438\u0442\u044C \u043F\u043E\u0437\u0438\u0446\u0438\u044E \u0431\u0435\u0437 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u0432\u044B\u0438\u0433\u0440\u0430\u0442\u044C \u0432\u0435\u0441\u044C \u0441\u043F\u043E\u0440.", "\u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0434\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043F\u0440\u0430\u0432\u043E \u043D\u0430 \u0441\u0432\u043E\u0439 \u0432\u044B\u0431\u043E\u0440 \u0435\u0449\u0451 \u043E\u0434\u043D\u043E\u0439 \u043D\u0430\u0433\u0440\u0443\u0437\u043A\u043E\u0439. \u0415\u0441\u043B\u0438 \u0432\u0430\u0440\u0438\u0430\u043D\u0442 \u0442\u0435\u0431\u0435 \u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442, \u0440\u0430\u0437\u0431\u0435\u0440\u0438 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0443\u044E \u043F\u0440\u0438\u0447\u0438\u043D\u0443. \u0418\u043D\u043E\u0433\u0434\u0430 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0443\u0441\u043B\u043E\u0432\u0438\u044F, \u0430 \u043D\u0435 \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u043B\u044F\u0442\u044C \u0441\u0435\u0431\u0435 \u043D\u043E\u0432\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0439."], supportive: ["\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043D\u044F\u0442\u044C\u0441\u044F \u0434\u0435\u043B\u043E\u043C, \u0432 \u043A\u043E\u0442\u043E\u0440\u043E\u043C \u0442\u0435\u0431\u0435 \u0435\u0441\u0442\u044C \u0447\u0442\u043E \u0441\u043A\u0430\u0437\u0430\u0442\u044C. \u041D\u0435 \u0436\u0434\u0430\u0442\u044C \u0438\u0434\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043C\u043E\u043C\u0435\u043D\u0442\u0430, \u0430 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u043E\u043D\u044F\u0442\u043D\u0443\u044E \u0447\u0430\u0441\u0442\u044C \u0438 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C. \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0443 \u0442\u043E\u0436\u0435 \u043F\u0440\u043E\u0449\u0435 \u043F\u043E\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u043F\u043E\u0434 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0443\u044E \u0437\u0430\u0434\u0430\u0447\u0443, \u0447\u0435\u043C \u043F\u043E\u0434 \u0432\u0441\u0451 \u043D\u0430\u0447\u0438\u043D\u0430\u043D\u0438\u0435 \u0446\u0435\u043B\u0438\u043A\u043E\u043C.", "\u0415\u0441\u043B\u0438 \u0435\u0441\u0442\u044C \u044F\u0441\u043D\u043E\u0435 \u0436\u0435\u043B\u0430\u043D\u0438\u0435 \u0447\u0442\u043E-\u0442\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C, \u0432\u044B\u0431\u0435\u0440\u0438 \u0434\u043B\u044F \u043D\u0435\u0433\u043E \u043C\u0435\u0441\u0442\u043E \u0432 \u043E\u0431\u044B\u0447\u043D\u043E\u043C \u0434\u043D\u0435. \u041D\u0435 \u043C\u0435\u0436\u0434\u0443 \u0432\u0441\u0435\u043C \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u043C, \u0435\u0441\u043B\u0438 \u043E\u0441\u0442\u0430\u043D\u0443\u0442\u0441\u044F \u0441\u0438\u043B\u044B. \u0418\u043D\u043E\u0433\u0434\u0430 \u0438\u043C\u0435\u043D\u043D\u043E \u044D\u0442\u043E \u0438 \u043E\u0442\u0434\u0435\u043B\u044F\u0435\u0442 \u0441\u0432\u043E\u0439 \u043F\u043B\u0430\u043D \u043E\u0442 \u043A\u0440\u0430\u0441\u0438\u0432\u043E\u0439 \u043C\u044B\u0441\u043B\u0438 \u043E \u043D\u0451\u043C."], focused: ["\u0418\u0437 \u0432\u0441\u0435\u0445 \u0437\u0430\u043D\u044F\u0442\u044B\u0445 \u0447\u0430\u0441\u043E\u0432 \u043D\u0435 \u043A\u0430\u0436\u0434\u044B\u0439 \u043F\u0440\u0438\u0431\u043B\u0438\u0436\u0430\u0435\u0442 \u043A \u0442\u043E\u043C\u0443, \u0447\u0435\u0433\u043E \u0442\u044B \u0445\u043E\u0447\u0435\u0448\u044C. \u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u043E\u0434\u043D\u043E \u0434\u0435\u043B\u043E: \u0437\u0430\u0447\u0435\u043C \u043E\u043D\u043E \u0442\u0435\u0431\u0435? \u0415\u0441\u043B\u0438 \u043E\u0442\u0432\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \xAB\u043D\u0443 \u043D\u0430\u0434\u043E \u0436\u0435 \u0447\u0435\u043C-\u0442\u043E \u0437\u0430\u043D\u0438\u043C\u0430\u0442\u044C\u0441\u044F\xBB, \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0435\u0433\u043E \u043C\u043E\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0438\u043B\u0438 \u0443\u0431\u0440\u0430\u0442\u044C.", "\u0421\u0432\u043E\u044E \u043F\u043E\u0437\u0438\u0446\u0438\u044E \u043C\u043E\u0436\u043D\u043E \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u043D\u044F\u0442\u044C \u0441\u0430\u043C\u043E\u0439. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0441\u0440\u0430\u0437\u0443 \u0435\u0451 \u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C, \u0437\u0430\u0449\u0438\u0449\u0430\u0442\u044C \u0438 \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u0442\u044C \u0432 \u043F\u0440\u0438\u043D\u0446\u0438\u043F \u043D\u0430 \u0432\u0441\u044E \u0436\u0438\u0437\u043D\u044C. \u0421\u0435\u0439\u0447\u0430\u0441 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u0442\u044C\u0441\u044F, \u0447\u0442\u043E \u0442\u044B \u0432\u044B\u0431\u0438\u0440\u0430\u0435\u0448\u044C \u0432 \u044D\u0442\u043E\u0439 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u0438."] }, feelings: { tense: ["\u0415\u0441\u043B\u0438 \u0440\u0435\u0430\u043A\u0446\u0438\u044F \u043E\u043A\u0430\u0437\u0430\u043B\u0430\u0441\u044C \u0441\u0438\u043B\u044C\u043D\u043E\u0439, \u0434\u0430\u0439 \u0441\u0435\u0431\u0435 \u043D\u0435\u043C\u043D\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0434\u043E \u0431\u043E\u043B\u044C\u0448\u043E\u0433\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u044F. \u0427\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0437\u0430\u0434\u0435\u043B\u043E? \u0427\u0435\u0433\u043E \u0441\u0435\u0439\u0447\u0430\u0441 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u043E\u0442 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430? \u042D\u0442\u043E \u043C\u043E\u0436\u043D\u043E \u043D\u0430\u0437\u0432\u0430\u0442\u044C \u043F\u0440\u044F\u043C\u043E, \u0431\u0435\u0437 \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u044F, \u0447\u0442\u043E \u043E\u043D \u0441\u0430\u043C \u0432\u0441\u0451 \u043F\u043E\u0439\u043C\u0451\u0442 \u043F\u043E \u0442\u0432\u043E\u0435\u043C\u0443 \u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E.", "\u0420\u0430\u0437\u0434\u0440\u0430\u0436\u0435\u043D\u0438\u0435, \u0435\u0441\u043B\u0438 \u043E\u043D\u043E \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F, \u043D\u0435 \u043E\u0431\u044F\u0437\u044B\u0432\u0430\u0435\u0442 \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E \u0440\u0430\u0437\u0431\u0438\u0440\u0430\u0442\u044C \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u044F. \u0418\u043D\u043E\u0433\u0434\u0430 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0443\u0436\u0435\u043D \u043F\u0435\u0440\u0435\u0440\u044B\u0432, \u0435\u0434\u0430 \u0438\u043B\u0438 \u0442\u0438\u0448\u0438\u043D\u0430. \u0410 \u043F\u043E\u0442\u043E\u043C \u0443\u0436\u0435 \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C, \u043A\u0430\u043A\u043E\u0439 \u0432\u043E\u043F\u0440\u043E\u0441 \u0432\u0441\u0451-\u0442\u0430\u043A\u0438 \u0441\u0442\u043E\u0438\u0442 \u043E\u0431\u0441\u0443\u0434\u0438\u0442\u044C."], supportive: ["\u0415\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u0430 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430, \u0435\u0451 \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0434\u043E\u0432\u043E\u043B\u044C\u043D\u043E \u0431\u0443\u043A\u0432\u0430\u043B\u044C\u043D\u043E. \u041F\u043E\u0441\u043B\u0443\u0448\u0430\u0442\u044C, \u043F\u043E\u043C\u043E\u0447\u044C \u0441 \u0434\u0435\u043B\u043E\u043C, \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043D\u0435\u043C\u043D\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0432 \u043F\u043E\u043A\u043E\u0435. \u0423 \u0431\u043B\u0438\u0437\u043A\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u0431\u043E\u043B\u044C\u0448\u0435 \u0448\u0430\u043D\u0441\u043E\u0432 \u043F\u043E\u043F\u0430\u0441\u0442\u044C \u0432 \u043D\u0443\u0436\u043D\u043E\u0435, \u043A\u043E\u0433\u0434\u0430 \u0435\u043C\u0443 \u043D\u0435 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u043F\u0440\u043E\u0445\u043E\u0434\u0438\u0442\u044C \u044D\u043A\u0437\u0430\u043C\u0435\u043D \u043D\u0430 \u0447\u0442\u0435\u043D\u0438\u0435 \u043C\u044B\u0441\u043B\u0435\u0439.", "\u0414\u043B\u044F \u0442\u0451\u043F\u043B\u043E\u0433\u043E \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430 \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u0440\u0438\u0434\u0443\u043C\u044B\u0432\u0430\u0442\u044C \u043E\u0441\u043E\u0431\u044B\u0439 \u043F\u043E\u0432\u043E\u0434. \u041D\u043E \u0438 \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u0442\u044C \u0435\u0433\u043E \u0432 \u0440\u0430\u0437\u0431\u043E\u0440 \u0432\u0441\u0435\u0445 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043D\u044B\u0445 \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432 \u0442\u043E\u0436\u0435 \u043D\u0435 \u043D\u0443\u0436\u043D\u043E. \u0418\u043D\u043E\u0433\u0434\u0430 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u043E \u043F\u043E\u0431\u044B\u0442\u044C \u0440\u044F\u0434\u043E\u043C, \u0435\u0441\u043B\u0438 \u0432\u0430\u043C \u043E\u0431\u043E\u0438\u043C \u044D\u0442\u043E\u0433\u043E \u0445\u043E\u0447\u0435\u0442\u0441\u044F."], focused: ["\u041F\u0435\u0440\u0435\u0434 \u0431\u044B\u0441\u0442\u0440\u044B\u043C \xAB\u0434\u0430\xBB \u043D\u0430 \u0447\u0443\u0436\u0443\u044E \u043F\u0440\u043E\u0441\u044C\u0431\u0443 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435. \u0422\u044B \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0433\u043E\u0442\u043E\u0432\u0430 \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F \u0438\u043B\u0438 \u0441\u0435\u0439\u0447\u0430\u0441 \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0435\u0443\u0434\u043E\u0431\u043D\u043E \u043E\u0442\u043A\u0430\u0437\u0430\u0442\u044C? \u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u0447\u0443\u0442\u044C \u043F\u043E\u0437\u0436\u0435 \u2014 \u0432\u043F\u043E\u043B\u043D\u0435 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442, \u0430 \u043D\u0435 \u0438\u0441\u043F\u043E\u0440\u0447\u0435\u043D\u043D\u044B\u0435 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u044F.", "\u0415\u0441\u043B\u0438 \u043D\u0443\u0436\u0435\u043D \u043F\u0435\u0440\u0435\u0440\u044B\u0432, \u043B\u0443\u0447\u0448\u0435 \u043D\u0430\u0437\u0432\u0430\u0442\u044C \u0432\u0440\u0435\u043C\u044F \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0435\u043D\u0438\u044F \u043A \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0443. \xAB\u042F \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435 \u043C\u043E\u0433\u0443, \u0434\u0430\u0432\u0430\u0439 \u0432\u0435\u0447\u0435\u0440\u043E\u043C\xBB \u043F\u043E\u043D\u044F\u0442\u043D\u043E \u0433\u043E\u0440\u0430\u0437\u0434\u043E \u043B\u0443\u0447\u0448\u0435, \u0447\u0435\u043C \u0438\u0441\u0447\u0435\u0437\u043D\u043E\u0432\u0435\u043D\u0438\u0435 \u0441 \u043D\u0430\u0434\u0435\u0436\u0434\u043E\u0439, \u0447\u0442\u043E \u0432\u0441\u0451 \u043E\u0431\u044A\u044F\u0441\u043D\u0438\u0442\u0441\u044F \u0441\u0430\u043C\u043E."] }, words: { tense: ["\u0415\u0441\u043B\u0438 \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043D\u0435 \u0441\u0445\u043E\u0434\u044F\u0442\u0441\u044F, \u043D\u0435 \u0432\u044B\u0431\u0438\u0440\u0430\u0439 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0442\u0443 \u0432\u0435\u0440\u0441\u0438\u044E, \u043A\u043E\u0442\u043E\u0440\u0430\u044F \u043F\u0440\u0438\u044F\u0442\u043D\u0435\u0435. \u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A. \u0412\u0430\u0436\u043D\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u0447\u0438\u0442\u0430\u0442\u044C \u043F\u0435\u0440\u0435\u0434 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u043E\u0439 \u2014 \u043E\u0441\u043E\u0431\u0435\u043D\u043D\u043E \u0441\u0430\u043C \u0432\u043E\u043F\u0440\u043E\u0441 \u0438 \u0442\u043E, \u043D\u0430 \u0447\u0442\u043E \u0442\u044B \u0441\u043E\u0433\u043B\u0430\u0448\u0430\u0435\u0448\u044C\u0441\u044F.", "\u041D\u0435\u0434\u043E\u043F\u043E\u043D\u0438\u043C\u0430\u043D\u0438\u0435 \u043D\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0435\u0449\u0451 \u043E\u0434\u043D\u043E\u0433\u043E \u0434\u043B\u0438\u043D\u043D\u043E\u0433\u043E \u043E\u0431\u044A\u044F\u0441\u043D\u0435\u043D\u0438\u044F. \u0418\u043D\u043E\u0433\u0434\u0430 \u043D\u0443\u0436\u043D\u043E \u0432\u044B\u044F\u0441\u043D\u0438\u0442\u044C, \u043A\u0430\u043A\u043E\u0435 \u0438\u043C\u0435\u043D\u043D\u043E \u0441\u043B\u043E\u0432\u043E \u0432\u044B \u043F\u043E\u043D\u044F\u043B\u0438 \u043F\u043E-\u0440\u0430\u0437\u043D\u043E\u043C\u0443. \u0418 \u0443\u0436\u0435 \u043F\u043E\u0442\u043E\u043C \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0442\u044C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440, \u0430 \u043D\u0435 \u043D\u0430\u0440\u0430\u0449\u0438\u0432\u0430\u0442\u044C \u0435\u0433\u043E \u043E\u0431\u044A\u0451\u043C."], supportive: ["\u0425\u043E\u0440\u043E\u0448\u0430\u044F \u0444\u043E\u0440\u043C\u0443\u043B\u0438\u0440\u043E\u0432\u043A\u0430 \u2014 \u0442\u0430, \u043F\u043E\u0441\u043B\u0435 \u043A\u043E\u0442\u043E\u0440\u043E\u0439 \u043F\u043E\u043D\u044F\u0442\u043D\u043E, \u0447\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C. \u041C\u043E\u0436\u043D\u043E \u0441\u043E\u0431\u0440\u0430\u0442\u044C \u043F\u0438\u0441\u044C\u043C\u043E, \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 \u043F\u043B\u0430\u043D \u0438\u043B\u0438 \u043E\u0431\u044A\u044F\u0441\u043D\u0435\u043D\u0438\u0435 \u0431\u0435\u0437 \u043B\u0438\u0448\u043D\u0438\u0445 \u0432\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0439. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0434\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043C\u044B\u0441\u043B\u044C \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E\u043C \u0441\u043B\u043E\u0432.", "\u0421\u043B\u043E\u0436\u043D\u044B\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u043C\u043E\u0436\u043D\u043E \u043D\u0430\u0447\u0430\u0442\u044C \u0441 \u043F\u0440\u043E\u0441\u0442\u043E\u0433\u043E \u0432\u043E\u043F\u0440\u043E\u0441\u0430. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u043F\u0440\u043E\u0434\u0443\u043C\u044B\u0432\u0430\u0442\u044C \u0432\u0441\u0435 \u043E\u0442\u0432\u0435\u0442\u044B \u0437\u0430 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u043D\u0443\u0436\u043D\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0433\u043E\u0440\u0430\u0437\u0434\u043E \u0440\u0430\u043D\u044C\u0448\u0435, \u0447\u0435\u043C \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u0441\u044F \u0442\u0432\u043E\u044F \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u044F\u044F \u0440\u0435\u043F\u0435\u0442\u0438\u0446\u0438\u044F."], focused: ["\u0415\u0441\u043B\u0438 \u0432 \u0442\u0435\u043C\u0435 \u043C\u043D\u043E\u0433\u043E \u0432\u0441\u0435\u0433\u043E, \u0432\u044B\u043F\u0438\u0448\u0438 \u0442\u0440\u0438 \u0432\u0435\u0449\u0438: \u0447\u0442\u043E \u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E, \u0447\u0435\u0433\u043E \u043D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0438 \u043A\u0442\u043E \u043C\u043E\u0436\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0438\u0442\u044C. \u042D\u0442\u043E \u043E\u0431\u044B\u0447\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A, \u0437\u0430\u0442\u043E \u0443\u0436\u0435 \u0432\u0438\u0434\u043D\u043E, \u0433\u0434\u0435 \u0441\u0430\u043C \u0432\u043E\u043F\u0440\u043E\u0441, \u0430 \u0433\u0434\u0435 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0432\u043E\u043A\u0440\u0443\u0433 \u043D\u0435\u0433\u043E.", "\u041D\u0435 \u043A\u0430\u0436\u0434\u0443\u044E \u043C\u044B\u0441\u043B\u044C \u043D\u0443\u0436\u043D\u043E \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u0442\u044C \u0432 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044C, \u043A\u043E\u043C\u0443 \u043E\u043D\u0430 \u0430\u0434\u0440\u0435\u0441\u043E\u0432\u0430\u043D\u0430 \u0438 \u043A\u0430\u043A\u043E\u0433\u043E \u043E\u0442\u0432\u0435\u0442\u0430 \u0442\u044B \u0436\u0434\u0451\u0448\u044C. \u0418\u043D\u043E\u0433\u0434\u0430 \u043F\u043E\u0441\u043B\u0435 \u044D\u0442\u043E\u0433\u043E \u0442\u0435\u043A\u0441\u0442 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u043A\u043E\u0440\u043E\u0447\u0435, \u0430 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u2014 \u043F\u0440\u043E\u0449\u0435."] }, relationships: { tense: ["\u0420\u0430\u0437\u043D\u044B\u0435 \u0436\u0435\u043B\u0430\u043D\u0438\u044F \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043E\u0437\u043D\u0430\u0447\u0430\u044E\u0442 \u043F\u043B\u043E\u0445\u0438\u0435 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u044F. \u041C\u043E\u0436\u043D\u043E \u043E\u0431\u0441\u0443\u0434\u0438\u0442\u044C \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0432\u044B\u0431\u043E\u0440: \u0447\u0442\u043E \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u0442\u0435\u0431\u0435, \u0447\u0442\u043E \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 \u0438 \u0433\u0434\u0435 \u0435\u0441\u0442\u044C \u043C\u0435\u0441\u0442\u043E \u0434\u043B\u044F \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u0430. \u0411\u0435\u0437 \u043E\u0446\u0435\u043D\u043A\u0438 \u0432\u0441\u0435\u0439 \u0432\u0430\u0448\u0435\u0439 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0437\u0430 \u043E\u0434\u0438\u043D \u0432\u0435\u0447\u0435\u0440.", "\u0415\u0441\u043B\u0438 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437 \u043D\u0435\u043B\u043E\u0432\u043A\u043E\u0441\u0442\u0438, \u043B\u0443\u0447\u0448\u0435 \u0432\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F \u043A \u0443\u0441\u043B\u043E\u0432\u0438\u044F\u043C. \u041D\u0430 \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0442\u044B \u0441\u043A\u0430\u0437\u0430\u043B\u0430 \xAB\u0434\u0430\xBB? \u0425\u043E\u0440\u043E\u0448\u0435\u0435 \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u043D\u0435 \u0434\u0435\u043B\u0430\u0435\u0442 \u043B\u044E\u0431\u0443\u044E \u043F\u0440\u043E\u0441\u044C\u0431\u0443 \u0443\u0434\u043E\u0431\u043D\u043E\u0439 \u0438 \u043D\u0435 \u043E\u0442\u043C\u0435\u043D\u044F\u0435\u0442 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438 \u043E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u0438\u043D\u0430\u0447\u0435."], supportive: ["\u041F\u0440\u0438\u044F\u0442\u043D\u043E\u0435 \u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0432\u043F\u043E\u043B\u043D\u0435 \u043E\u0431\u044B\u0447\u043D\u043E\u0439 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044C\u044E: \u043A\u043E\u0433\u0434\u0430 \u0432\u0441\u0442\u0440\u0435\u0447\u0430\u0435\u043C\u0441\u044F, \u0447\u0442\u043E \u0434\u0435\u043B\u0430\u0435\u043C, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0435\u0441\u0442\u044C. \u0421\u043F\u043E\u043D\u0442\u0430\u043D\u043D\u043E\u0441\u0442\u044C \u043E\u0442 \u044D\u0442\u043E\u0433\u043E \u043D\u0435 \u043F\u043E\u0433\u0438\u0431\u043D\u0435\u0442. \u0417\u0430\u0442\u043E \u043C\u0435\u043D\u044C\u0448\u0435 \u0448\u0430\u043D\u0441\u043E\u0432, \u0447\u0442\u043E \u043A\u0430\u0436\u0434\u044B\u0439 \u043C\u043E\u043B\u0447\u0430 \u0436\u0434\u0430\u043B \u0441\u043E\u0432\u0441\u0435\u043C \u0434\u0440\u0443\u0433\u043E\u0433\u043E.", "\u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0447\u0442\u043E-\u0442\u043E \u0432\u043C\u0435\u0441\u0442\u0435, \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u0440\u0438\u0434\u0443\u043C\u044B\u0432\u0430\u0442\u044C \u0431\u0435\u0437\u0443\u043F\u0440\u0435\u0447\u043D\u044B\u0439 \u0436\u0435\u0441\u0442. \u0412\u043D\u0438\u043C\u0430\u043D\u0438\u0435 \u0438\u043D\u043E\u0433\u0434\u0430 \u0445\u043E\u0440\u043E\u0448\u043E \u0432\u044B\u0433\u043B\u044F\u0434\u0438\u0442 \u0432 \u043F\u0440\u043E\u0441\u0442\u043E\u0439 \u0444\u043E\u0440\u043C\u0435, \u043A\u043E\u0442\u043E\u0440\u0443\u044E \u043E\u0431\u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0432\u044B\u0431\u0438\u0440\u0430\u044E\u0442."], focused: ["\u0422\u0432\u043E\u0451 \xAB\u043C\u043D\u0435 \u043D\u0440\u0430\u0432\u0438\u0442\u0441\u044F\xBB \u0442\u043E\u0436\u0435 \u0447\u0442\u043E-\u0442\u043E \u0437\u043D\u0430\u0447\u0438\u0442. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043E\u0431\u044A\u044F\u0441\u043D\u044F\u0442\u044C \u043A\u0430\u0436\u0434\u044B\u0439 \u0432\u043A\u0443\u0441 \u043A\u0430\u043A \u0441\u0435\u0440\u044C\u0451\u0437\u043D\u044B\u0439 \u0436\u0438\u0437\u043D\u0435\u043D\u043D\u044B\u0439 \u043F\u0440\u0438\u043D\u0446\u0438\u043F. \u041C\u043E\u0436\u043D\u043E \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0441\u0432\u043E\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442 \u0438 \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 \u0435\u0433\u043E \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439.", "\u0412 \u0431\u043B\u0438\u0437\u043A\u043E\u043C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0435 \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u043E\u0442\u0434\u0435\u043B\u0438\u0442\u044C \u0436\u0435\u043B\u0430\u043D\u0438\u0435 \u043E\u0442 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F. \xAB\u042F \u0431\u044B \u0445\u043E\u0442\u0435\u043B\u0430 \u0442\u0430\u043A\xBB \u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u043C\u0435\u0441\u0442\u043E \u0434\u043B\u044F \u043E\u0442\u0432\u0435\u0442\u0430. \u0410 \u043E\u0442\u0432\u0435\u0442 \u0443\u0436\u0435 \u043C\u043E\u0436\u043D\u043E \u043E\u0431\u0441\u0443\u0436\u0434\u0430\u0442\u044C, \u043D\u0435 \u0443\u0433\u0430\u0434\u044B\u0432\u0430\u0442\u044C \u0437\u0430\u0440\u0430\u043D\u0435\u0435."] }, action: { tense: ["\u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0443\u0441\u043A\u043E\u0440\u0438\u0442\u044C \u0434\u0435\u043B\u043E, \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438, \u0433\u0434\u0435 \u043E\u043D\u043E \u0437\u0430\u0441\u0442\u0440\u044F\u043B\u043E. \u041D\u0435\u044F\u0441\u043D\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430 \u043D\u0435 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u043F\u043E\u043D\u044F\u0442\u043D\u0435\u0435 \u043E\u0442 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u043D\u0430\u0436\u0438\u043C\u0430. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u043D\u0443\u0436\u0435\u043D \u043E\u0434\u0438\u043D \u043E\u0442\u0432\u0435\u0442, \u0430 \u043D\u0435 \u0435\u0449\u0451 \u043E\u0434\u0438\u043D \u0440\u044B\u0432\u043E\u043A.", "\u0421\u0438\u043B\u0443 \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u0442\u0440\u0430\u0442\u0438\u0442\u044C \u043D\u0430 \u0440\u0430\u0431\u043E\u0442\u0443, \u0430 \u043C\u043E\u0436\u043D\u043E \u043D\u0430 \u0441\u043F\u043E\u0440 \u043E \u0442\u043E\u043C, \u043A\u0442\u043E \u0434\u043E\u043B\u0436\u0435\u043D \u0435\u0451 \u043D\u0430\u0447\u0430\u0442\u044C. \u0415\u0441\u043B\u0438 \u0432\u0438\u0434\u0438\u0448\u044C \u0442\u0430\u043A\u043E\u0439 \u0440\u0430\u0437\u0432\u043E\u0440\u043E\u0442 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430, \u0432\u0435\u0440\u043D\u0438\u0441\u044C \u043A \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0435. \u041A\u0430\u043A\u043E\u0439 \u0448\u0430\u0433 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043D\u0443\u0436\u0435\u043D \u0441\u0435\u0439\u0447\u0430\u0441?"], supportive: ["\u041C\u043E\u0436\u043D\u043E \u0432\u0437\u044F\u0442\u044C \u0438 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u043A\u0443\u0441\u043E\u043A. \u0411\u0435\u0437 \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F \u0431\u043E\u043B\u044C\u0448\u043E\u0433\u043E \u043D\u0430\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u043D\u0430 \u0432\u0441\u0435 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043D\u044B\u0435 \u0434\u0435\u043B\u0430. \u041F\u043E\u043D\u044F\u0442\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0437\u0430 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0438\u043D\u043E\u0433\u0434\u0430 \u0434\u0430\u0451\u0442 \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u043E\u0447\u0435\u043D\u044C \u0431\u043E\u0434\u0440\u043E\u0435 \u043D\u0430\u0447\u0430\u043B\u043E \u0441\u0440\u0430\u0437\u0443 \u043F\u044F\u0442\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0439.", "\u0415\u0441\u043B\u0438 \u0435\u0441\u0442\u044C \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C \u043F\u0440\u043E\u0434\u0432\u0438\u043D\u0443\u0442\u044C \u0434\u0435\u043B\u043E, \u0432\u044B\u0431\u0435\u0440\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0441 \u0432\u0438\u0434\u0438\u043C\u044B\u043C \u043A\u043E\u043D\u0446\u043E\u043C. \u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0433\u043E\u0442\u043E\u0432\u043E\u0435, \u043D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0432\u0440\u0435\u043C\u044F, \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442. \u0410 \u0434\u0430\u043B\u044C\u0448\u0435 \u0443\u0436\u0435 \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u043D\u044F\u0442\u043D\u043E, \u043D\u0443\u0436\u0435\u043D \u043B\u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433 \u0441\u0435\u0433\u043E\u0434\u043D\u044F."], focused: ["\u041A\u043E\u0433\u0434\u0430 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0434\u0435\u0439\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C, \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u0437\u043D\u0430\u0442\u044C, \u0433\u0434\u0435 \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0448\u044C. \u0427\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0431\u0443\u0434\u0435\u0442 \u0433\u043E\u0442\u043E\u0432\u043E? \u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0442\u044B \u044D\u0442\u043E\u043C\u0443 \u043E\u0442\u0434\u0430\u0451\u0448\u044C? \u0411\u0435\u0437 \u043A\u0440\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430 \u0443\u043C\u0435\u0435\u0442 \u0440\u0430\u0441\u0442\u0438 \u0433\u043E\u0440\u0430\u0437\u0434\u043E \u0431\u044B\u0441\u0442\u0440\u0435\u0435, \u0447\u0435\u043C \u043A\u0430\u0436\u0435\u0442\u0441\u044F \u0432 \u043D\u0430\u0447\u0430\u043B\u0435.", "\u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0442\u044C \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u043A \u0442\u043E\u043C\u0443, \u0433\u0434\u0435 \u0435\u0449\u0451 \u043D\u0435\u044F\u0441\u043D\u044B \u0443\u0441\u043B\u043E\u0432\u0438\u044F. \u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442, \u0441\u0440\u043E\u043A \u0438 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044C \u0438\u043D\u043E\u0433\u0434\u0430 \u0432\u0430\u0436\u043D\u0435\u0435 \u0441\u0430\u043C\u043E\u0433\u043E \u0436\u0435\u043B\u0430\u043D\u0438\u044F \u043D\u0430\u0447\u0430\u0442\u044C. \u0418\u0445 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C, \u043D\u0435 \u0442\u0435\u0440\u044F\u044F \u0438\u043D\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0443."] }, scale: { tense: ["\u0415\u0441\u043B\u0438 \u0438\u0434\u0435\u044F \u0431\u044B\u0441\u0442\u0440\u043E \u0432\u044B\u0440\u043E\u0441\u043B\u0430 \u0434\u043E \u0431\u043E\u043B\u044C\u0448\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438, \u043A\u0442\u043E \u0431\u0443\u0434\u0435\u0442 \u0435\u0433\u043E \u0434\u0435\u043B\u0430\u0442\u044C. \u0422\u0435\u043C\u0438 \u0436\u0435 \u0440\u0443\u043A\u0430\u043C\u0438 \u0438 \u0432 \u0442\u0435 \u0436\u0435 \u0447\u0430\u0441\u044B. \u0418\u043D\u0442\u0435\u0440\u0435\u0441\u043D\u0430\u044F \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u043E\u0431\u044F\u0437\u044B\u0432\u0430\u0435\u0442 \u0441\u0440\u0430\u0437\u0443 \u0431\u0440\u0430\u0442\u044C \u0432\u0435\u0441\u044C \u043E\u0431\u044A\u0451\u043C, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0442\u043E\u043B\u044C\u043A\u043E \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u0438\u0434\u0443\u043C\u0430\u0442\u044C.", "\u0411\u043E\u043B\u044C\u0448\u0435 \u2014 \u043D\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u043B\u0443\u0447\u0448\u0435 \u0438\u043C\u0435\u043D\u043D\u043E \u0441\u0435\u0439\u0447\u0430\u0441. \u0415\u0441\u043B\u0438 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0437\u0430\u043C\u0430\u043D\u0447\u0438\u0432\u043E\u0435, \u043C\u043E\u0436\u043D\u043E \u043D\u0430\u0447\u0430\u0442\u044C \u0441 \u0447\u0430\u0441\u0442\u0438 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C, \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u043B\u0438 \u0442\u0435\u0431\u0435 \u0441\u0430\u043C\u0430 \u0438\u0441\u0442\u043E\u0440\u0438\u044F. \u042D\u0442\u043E \u043D\u0435 \u043E\u0442\u043A\u0430\u0437 \u043E\u0442 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0435\u0439, \u0430 \u0437\u043D\u0430\u043A\u043E\u043C\u0441\u0442\u0432\u043E \u0441 \u043D\u0438\u043C\u0438 \u043F\u043E\u0431\u043B\u0438\u0436\u0435."], supportive: ["\u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u043D\u043E\u0439. \u0423\u0437\u043D\u0430\u0442\u044C \u0443\u0441\u043B\u043E\u0432\u0438\u044F, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0443, \u043F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0444\u043E\u0440\u043C\u0430\u0442. \u041F\u043E\u043A\u0430 \u044D\u0442\u043E \u043D\u0435 \u043E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u0441\u044E \u0436\u0438\u0437\u043D\u044C, \u0430 \u043D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0442\u043E\u0433\u043E, \u0447\u0442\u043E \u0442\u0435\u0431\u044F \u0437\u0430\u0438\u043D\u0442\u0435\u0440\u0435\u0441\u043E\u0432\u0430\u043B\u043E.", "\u0425\u043E\u0440\u043E\u0448\u0435\u0439 \u0438\u0434\u0435\u0435 \u043F\u043E\u043B\u0435\u0437\u0435\u043D \u043F\u0435\u0440\u0432\u044B\u0439 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0439 \u0448\u0430\u0433. \u041D\u0435 \u0441\u0430\u043C\u044B\u0439 \u0432\u043F\u0435\u0447\u0430\u0442\u043B\u044F\u044E\u0449\u0438\u0439, \u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0439: \u043D\u0430\u043F\u0438\u0441\u0430\u0442\u044C, \u0443\u0437\u043D\u0430\u0442\u044C, \u0441\u0440\u0430\u0432\u043D\u0438\u0442\u044C. \u0414\u0430\u043B\u044C\u0448\u0435 \u0441\u0442\u0430\u043D\u0435\u0442 \u043F\u043E\u043D\u044F\u0442\u043D\u0435\u0435, \u043A\u0443\u0434\u0430 \u0432\u043E\u043E\u0431\u0449\u0435 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0438\u0434\u0442\u0438 \u0441 \u044D\u0442\u0438\u043C \u0438\u043D\u0442\u0435\u0440\u0435\u0441\u043E\u043C."], focused: ["\u041F\u043B\u0430\u043D\u044B \u043C\u043E\u0436\u043D\u043E \u0440\u0430\u0441\u0448\u0438\u0440\u044F\u0442\u044C, \u043D\u0435 \u0437\u0430\u0431\u044B\u0432\u0430\u044F \u043F\u0440\u043E \u0443\u0436\u0435 \u043E\u0431\u0435\u0449\u0430\u043D\u043D\u043E\u0435. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u0441\u0440\u043E\u043A\u0438 \u0438 \u043E\u0431\u044B\u0447\u043D\u0443\u044E \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0445\u043E\u0440\u043E\u0448\u0435\u043C\u0443 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044E \u043D\u0443\u0436\u0435\u043D \u0434\u0440\u0443\u0433\u043E\u0439 \u043C\u0435\u0441\u044F\u0446, \u0430 \u043D\u0435 \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E\u0435 \xAB\u0434\u0430\xBB \u0438\u0437 \u0441\u0442\u0440\u0430\u0445\u0430 \u0443\u043F\u0443\u0441\u0442\u0438\u0442\u044C.", "\u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0431\u043E\u043B\u044C\u0448\u0435\u0433\u043E, \u043D\u0430\u0437\u043E\u0432\u0438, \u0447\u0435\u0433\u043E \u0438\u043C\u0435\u043D\u043D\u043E. \u0414\u0435\u043D\u0435\u0433, \u0441\u0432\u043E\u0431\u043E\u0434\u044B, \u0437\u043D\u0430\u043D\u0438\u0439, \u043D\u043E\u0432\u044B\u0445 \u043B\u044E\u0434\u0435\u0439? \u0420\u0430\u0437\u043D\u044B\u0435 \u0436\u0435\u043B\u0430\u043D\u0438\u044F \u0438\u043D\u043E\u0433\u0434\u0430 \u043C\u0430\u0441\u043A\u0438\u0440\u0443\u044E\u0442\u0441\u044F \u043F\u043E\u0434 \u043E\u0434\u0438\u043D \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u043F\u0440\u043E\u0435\u043A\u0442, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0434\u043E\u043B\u0436\u0435\u043D \u0440\u0435\u0448\u0438\u0442\u044C \u0441\u0440\u0430\u0437\u0443 \u0432\u0441\u0451."] }, responsibility: { tense: ["\u0415\u0441\u043B\u0438 \u0437\u0430\u0434\u0430\u0447\u0430 \u0442\u044F\u0436\u0451\u043B\u0430\u044F, \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0439 \u043A \u043D\u0435\u0439 \u0437\u0430\u043E\u0434\u043D\u043E \u043E\u0446\u0435\u043D\u043A\u0443 \u0441\u0435\u0431\u044F. \u0420\u0430\u0437\u0434\u0435\u043B\u0438: \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0438 \u043A\u0430\u043A\u0438\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0442. \u0421\u043E \u0441\u0440\u043E\u043A\u043E\u043C \u0438 \u043E\u0431\u044A\u0451\u043C\u043E\u043C \u043C\u043E\u0436\u043D\u043E \u0434\u043E\u0433\u043E\u0432\u0430\u0440\u0438\u0432\u0430\u0442\u044C\u0441\u044F. \u042D\u0442\u043E \u043D\u0435 \u0442\u043E \u0436\u0435 \u0441\u0430\u043C\u043E\u0435, \u0447\u0442\u043E \u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0434\u0435\u043B\u043E.", "\u0422\u044B \u043C\u043E\u0436\u0435\u0448\u044C \u043E\u0442\u0432\u0435\u0447\u0430\u0442\u044C \u0437\u0430 \u0441\u0432\u043E\u044E \u0447\u0430\u0441\u0442\u044C \u0438 \u043D\u0435 \u0442\u0430\u0449\u0438\u0442\u044C \u0441\u043E\u0441\u0435\u0434\u043D\u0438\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u0443\u043C\u0435\u0435\u0448\u044C. \u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438, \u0433\u0434\u0435 \u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044C \u0438 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u043F\u0440\u0438\u0432\u044B\u0447\u043D\u043E\u0435 \xAB\u043D\u0443 \u043A\u0442\u043E, \u0435\u0441\u043B\u0438 \u043D\u0435 \u044F\xBB. \u0418\u043D\u043E\u0433\u0434\u0430 \u0438\u043C\u0435\u043D\u043D\u043E \u0442\u0430\u043C \u0438 \u043D\u0443\u0436\u0435\u043D \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440."], supportive: ["\u041C\u043E\u0436\u043D\u043E \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043E\u0434\u0438\u043D \u044D\u0442\u0430\u043F \u0438 \u043D\u0430 \u044D\u0442\u043E\u043C \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C\u0441\u044F. \u041D\u0435 \u043F\u043E\u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u0431\u043E\u043B\u044C\u0448\u0435\u0433\u043E \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0441\u044F, \u0430 \u043F\u043E\u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430 \u0441\u043E\u0441\u0442\u043E\u0438\u0442 \u0438\u0437 \u0447\u0430\u0441\u0442\u0435\u0439. \u0417\u0430\u043A\u043E\u043D\u0447\u0435\u043D\u043D\u043E\u0435, \u043F\u043E\u043D\u044F\u0442\u043D\u043E\u0435 \u0434\u0435\u043B\u043E \u2014 \u0443\u0436\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442, \u0431\u0435\u0437 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u0440\u0435\u043E\u0434\u043E\u043B\u0435\u043D\u0438\u044F \u0441\u0435\u0431\u044F.", "\u0415\u0441\u043B\u0438 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u044F\u0441\u043D\u044B, \u0440\u0430\u0431\u043E\u0442\u0430 \u0438\u043D\u043E\u0433\u0434\u0430 \u0438\u0434\u0451\u0442 \u0431\u0435\u0437 \u043E\u0441\u043E\u0431\u043E\u0439 \u0434\u0440\u0430\u043C\u044B. \u0421\u0434\u0435\u043B\u0430\u0442\u044C, \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C, \u043F\u0435\u0440\u0435\u0434\u0430\u0442\u044C \u0434\u0430\u043B\u044C\u0448\u0435. \u041D\u0435 \u043D\u0443\u0436\u043D\u043E \u043F\u043E\u0434\u043E\u0437\u0440\u0435\u0432\u0430\u0442\u044C, \u0447\u0442\u043E \u0432\u0441\u0451 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043F\u0440\u043E\u0441\u0442\u043E, \u0438 \u0441\u0440\u043E\u0447\u043D\u043E \u043F\u0440\u0438\u0434\u0443\u043C\u044B\u0432\u0430\u0442\u044C \u0441\u0435\u0431\u0435 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0443\u044E \u043D\u0430\u0433\u0440\u0443\u0437\u043A\u0443."], focused: ["\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430 \u043F\u043E\u043B\u0435\u0437\u043D\u043E \u0432\u0440\u0435\u043C\u044F \u043E\u0442 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u043F\u0435\u0440\u0435\u0447\u0438\u0442\u044B\u0432\u0430\u0442\u044C \u0431\u0443\u043A\u0432\u0430\u043B\u044C\u043D\u043E. \u0427\u0442\u043E \u043E\u0431\u0435\u0449\u0430\u043D\u043E? \u041A \u043A\u0430\u043A\u043E\u043C\u0443 \u0441\u0440\u043E\u043A\u0443? \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0442\u0432\u043E\u044F \u0447\u0430\u0441\u0442\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0441\u0442\u043E \u043E\u043A\u0430\u0437\u0430\u043B\u043E\u0441\u044C \u0440\u044F\u0434\u043E\u043C? \u041C\u043E\u0436\u043D\u043E \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C, \u043D\u0435 \u043D\u0430\u0447\u0438\u043D\u0430\u044F \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0441\u043F\u043E\u0440 \u043E \u0434\u043E\u043B\u0433\u0435.", "\u0421\u0435\u0440\u044C\u0451\u0437\u043D\u043E \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u044C\u0441\u044F \u043A \u0434\u0435\u043B\u0443 \u0438 \u0436\u0438\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u044D\u0442\u0438\u043C \u0434\u0435\u043B\u043E\u043C \u2014 \u0440\u0430\u0437\u043D\u044B\u0435 \u0432\u0435\u0449\u0438. \u0415\u0441\u043B\u0438 \u0432 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438 \u043D\u0435 \u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u043D\u0438\u0447\u0435\u0433\u043E \u0434\u0440\u0443\u0433\u043E\u0433\u043E, \u0441\u0442\u043E\u0438\u0442 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043D\u0430 \u0441\u0430\u043C\u0443 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u044C. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u043E\u043D\u0430 \u0434\u0430\u0432\u043D\u043E \u043F\u0440\u043E\u0441\u0438\u0442 \u043F\u0435\u0440\u0435\u0441\u043C\u043E\u0442\u0440\u0430."] }, lunar: { tense: [], supportive: [], focused: ["\u0415\u0441\u043B\u0438 \u043D\u0435\u0442 \u0441\u0440\u043E\u0447\u043D\u043E\u0433\u043E \u043F\u043E\u0432\u043E\u0434\u0430 \u0432\u0441\u0451 \u043C\u0435\u043D\u044F\u0442\u044C, \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043D\u0430\u0447\u0430\u0442\u043E\u0435. \u041E\u0431\u044B\u0447\u043D\u044B\u0439 \u0434\u0435\u043D\u044C \u043D\u0435 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u043F\u0443\u0441\u0442\u044B\u043C \u043E\u0442 \u0442\u043E\u0433\u043E, \u0447\u0442\u043E \u0432 \u043D\u0451\u043C \u043D\u0435 \u043F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u043E \u0431\u043E\u043B\u044C\u0448\u043E\u0433\u043E \u043F\u043E\u0432\u043E\u0440\u043E\u0442\u0430. \u0418\u043D\u043E\u0433\u0434\u0430 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C \u0434\u0435\u043B\u043E \u0438 \u043D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u043E \u043F\u0440\u043E\u0436\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u0432\u0448\u0443\u044E\u0441\u044F \u0447\u0430\u0441\u0442\u044C \u0434\u043D\u044F.", "\u041D\u0435 \u043A\u0430\u0436\u0434\u043E\u043C\u0443 \u0432\u043F\u0435\u0447\u0430\u0442\u043B\u0435\u043D\u0438\u044E \u043D\u0443\u0436\u0435\u043D \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u044B\u0439 \u0432\u044B\u0432\u043E\u0434. \u0427\u0442\u043E-\u0442\u043E \u043C\u043E\u0436\u043D\u043E \u0437\u0430\u043C\u0435\u0442\u0438\u0442\u044C \u0438 \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0434\u043E \u0437\u0430\u0432\u0442\u0440\u0430. \u0410 \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u0437\u0430\u043D\u044F\u0442\u044C\u0441\u044F \u0442\u0435\u043C, \u0443 \u0447\u0435\u0433\u043E \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u043F\u043E\u043D\u044F\u0442\u043D\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430, \u0432\u043C\u0435\u0441\u0442\u043E \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u043E\u0431\u044A\u044F\u0441\u043D\u0438\u0442\u044C \u0441\u0435\u0431\u0435 \u0441\u0440\u0430\u0437\u0443 \u0432\u0441\u0451 \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u044F\u0449\u0435\u0435.", "\u041C\u043E\u0436\u043D\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0434\u0435\u043D\u044C \u0431\u0435\u0437 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0432\u044B\u0434\u0430\u0442\u044C \u043E\u0441\u043E\u0431\u0435\u043D\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442. \u0421\u0434\u0435\u043B\u0430\u0442\u044C \u043D\u0443\u0436\u043D\u043E\u0435, \u0432\u0441\u0442\u0440\u0435\u0442\u0438\u0442\u044C\u0441\u044F, \u0435\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F, \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043B\u0438\u0448\u043D\u0435\u0435. \u041D\u0435 \u0432\u0441\u0451 \u0432 \u0436\u0438\u0437\u043D\u0438 \u043E\u0431\u044F\u0437\u0430\u043D\u043E \u043A\u0430\u0436\u0434\u044B\u0439 \u0440\u0430\u0437 \u0441\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u0442\u044C\u0441\u044F \u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u043E \u0431\u043E\u043B\u044C\u0448\u043E\u043C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0438."] } };
function feGlobalParagraphs(event) {
  if (event.type === "planet_station" && event.motion === "direct")
    return ["\u041D\u043E \u044D\u0442\u043E \u043D\u0435 \u0437\u043D\u0430\u0447\u0438\u0442, \u0447\u0442\u043E \u0432\u0441\u0451 \u043C\u0433\u043D\u043E\u0432\u0435\u043D\u043D\u043E \u043F\u043E\u0447\u0438\u043D\u0438\u0442\u0441\u044F. \u0415\u0441\u043B\u0438 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0448\u044C\u0441\u044F \u043A \u0437\u0430\u0432\u0438\u0441\u0448\u0435\u043C\u0443 \u0432\u043E\u043F\u0440\u043E\u0441\u0443, \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044C, \u0447\u0442\u043E \u0437\u0430 \u044D\u0442\u043E \u0432\u0440\u0435\u043C\u044F \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E\u0441\u044C. \u0421\u0442\u0430\u0440\u043E\u0435 \u043F\u0438\u0441\u044C\u043C\u043E \u043C\u043E\u0436\u043D\u043E \u043D\u0430\u043A\u043E\u043D\u0435\u0446 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C. \u0421\u0442\u0430\u0440\u044B\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u2014 \u043B\u0443\u0447\u0448\u0435 \u043F\u0435\u0440\u0435\u0447\u0438\u0442\u0430\u0442\u044C.", "\u0420\u0430\u0437\u0432\u043E\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u2014 \u0434\u0430. \u0420\u0435\u0448\u0430\u0435\u0442 \u0432\u0441\u0451 \u0437\u0430 \u043D\u0430\u0441 \u2014 \u043D\u0435\u0442. \u0415\u0441\u043B\u0438 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0432\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F \u043A \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0443 \u0438\u043B\u0438 \u043F\u043B\u0430\u043D\u0443, \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0439\u0441\u044F \u0441 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u043C \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u043C. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C \u0432\u0441\u044E \u043F\u0440\u0435\u0436\u043D\u044E\u044E \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0438 \u0436\u0434\u0430\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0444\u0438\u043D\u0430\u043B\u0430.", "\u041C\u043E\u0436\u043D\u043E \u0441\u043D\u043E\u0432\u0430 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043D\u0430 \u0442\u043E, \u0447\u0442\u043E \u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u0431\u0435\u0437 \u043E\u0442\u0432\u0435\u0442\u0430. \u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u0442\u044C, \u0447\u0442\u043E \u0442\u0435\u043F\u0435\u0440\u044C \u0432\u0441\u0451 \u043E\u0431\u044F\u0437\u0430\u043D\u043E \u0441\u043B\u043E\u0436\u0438\u0442\u044C\u0441\u044F \u0441\u0430\u043C\u043E. \u0413\u0434\u0435 \u043D\u0435 \u0445\u0432\u0430\u0442\u0430\u043B\u043E \u0441\u0440\u043E\u043A\u0430, \u0441\u0443\u043C\u043C\u044B \u0438\u043B\u0438 \u044F\u0441\u043D\u043E\u0433\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u044F, \u043E\u043D\u0438 \u0432\u0441\u0451 \u0435\u0449\u0451 \u043F\u0440\u0438\u0433\u043E\u0434\u044F\u0442\u0441\u044F."];
  if (event.type === "planet_station")
    return ["\u0415\u0441\u043B\u0438 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u043F\u0435\u0440\u0435\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0443\u0436\u0435 \u043E\u0431\u0441\u0443\u0436\u0434\u0451\u043D\u043D\u043E\u0435, \u044D\u0442\u043E \u043D\u0435 \u0437\u043D\u0430\u0447\u0438\u0442, \u0447\u0442\u043E \u0432\u0435\u0441\u044C \u043F\u043B\u0430\u043D \u0431\u044B\u043B \u043F\u043B\u043E\u0445\u043E\u0439. \u041C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C, \u0432 \u043D\u0451\u043C \u043F\u0440\u043E\u0441\u0442\u043E \u043E\u0441\u0442\u0430\u043B\u0441\u044F \u0432\u043E\u043F\u0440\u043E\u0441, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043D\u0438\u043A\u0442\u043E \u0442\u043E\u043B\u043A\u043E\u043C \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B. \u0412\u043E\u0442 \u0441 \u043D\u0435\u0433\u043E \u0438 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C.", "\u0423\u0441\u043A\u043E\u0440\u044F\u0442\u044C\u0441\u044F \u0442\u0430\u043C, \u0433\u0434\u0435 \u0435\u0449\u0451 \u043D\u0435\u043F\u043E\u043D\u044F\u0442\u043D\u044B \u0443\u0441\u043B\u043E\u0432\u0438\u044F, \u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E. \u041C\u043E\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u0447\u0438\u0442\u0430\u0442\u044C, \u043F\u0435\u0440\u0435\u0441\u043F\u0440\u043E\u0441\u0438\u0442\u044C, \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0438\u043C\u0435\u0435\u0442 \u0441\u043C\u044B\u0441\u043B, \u0435\u0441\u043B\u0438 \u0432 \u043D\u0451\u043C \u043F\u043E\u044F\u0432\u0438\u043B\u0441\u044F \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0432\u043E\u043F\u0440\u043E\u0441, \u0430 \u043D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0436\u0435\u043B\u0430\u043D\u0438\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0431\u043E\u043B\u0435\u0435 \u043F\u0440\u0438\u044F\u0442\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442.", "\u041A \u0441\u0442\u0430\u0440\u043E\u0439 \u0442\u0435\u043C\u0435 \u043C\u043E\u0436\u043D\u043E \u0432\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F \u0431\u0435\u0437 \u0431\u043E\u043B\u044C\u0448\u043E\u0433\u043E \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F \u043E \u043D\u043E\u0432\u043E\u043C \u043D\u0430\u0447\u0430\u043B\u0435. \u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C, \u0447\u0442\u043E \u0442\u0435\u043F\u0435\u0440\u044C \u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E, \u0438 \u0447\u0442\u043E \u043F\u043E-\u043F\u0440\u0435\u0436\u043D\u0435\u043C\u0443 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u0434\u043E\u0434\u0443\u043C\u044B\u0432\u0430\u0442\u044C. \u0421 \u043F\u0435\u0440\u0432\u044B\u043C \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0447\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C. \u0421\u043E \u0432\u0442\u043E\u0440\u044B\u043C \u043F\u043E\u043A\u0430 \u043B\u0443\u0447\u0448\u0435 \u043D\u0435 \u0442\u043E\u0440\u043E\u043F\u0438\u0442\u044C\u0441\u044F."];
  if (event.type === "full_moon")
    return ["\u0418\u0442\u043E\u0433\u0438 \u2014 \u044D\u0442\u043E \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u0440\u0438\u0433\u043E\u0432\u043E\u0440. \u0415\u0441\u043B\u0438 \u0447\u0442\u043E-\u0442\u043E \u0441\u0442\u0430\u043B\u043E \u043E\u0441\u043E\u0431\u0435\u043D\u043D\u043E \u0437\u0430\u043C\u0435\u0442\u043D\u044B\u043C, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u0441\u0430\u043C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442: \u0447\u0442\u043E \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C, \u0447\u0442\u043E \u043D\u0435 \u043F\u043E\u0434\u043E\u0448\u043B\u043E \u0438 \u043A\u0430\u043A\u0443\u044E \u0447\u0430\u0441\u0442\u044C \u043F\u043E\u0440\u0430 \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C. \u041D\u0435 \u043D\u0443\u0436\u043D\u043E \u0437\u0430\u043E\u0434\u043D\u043E \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u0442\u044C \u0432\u0441\u044E \u0436\u0438\u0437\u043D\u044C \u0446\u0435\u043B\u0438\u043A\u043E\u043C.", "\u0415\u0441\u043B\u0438 \u044D\u043C\u043E\u0446\u0438\u0439 \u0441\u0442\u0430\u043B\u043E \u043C\u043D\u043E\u0433\u043E, \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0432 \u0442\u043E\u0442 \u0436\u0435 \u0432\u0435\u0447\u0435\u0440 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0442\u044C \u043E\u043A\u043E\u043D\u0447\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435. \u041C\u043E\u0436\u043D\u043E \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0430\u0437\u0432\u0430\u0442\u044C, \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u043D\u0435 \u0443\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442. \u041E\u0434\u0438\u043D \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0438\u043D\u043E\u0433\u0434\u0430 \u043F\u043E\u043B\u0435\u0437\u043D\u0435\u0435 \u043E\u0447\u0435\u043D\u044C \u0443\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0435\u0433\u043E \u043C\u043E\u043D\u043E\u043B\u043E\u0433\u0430.", "\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0440\u0430\u0437\u0431\u0438\u0440\u0430\u0442\u044C \u0432\u0441\u0451 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043D\u043E\u0435 \u0441\u0440\u0430\u0437\u0443. \u0413\u0434\u0435-\u0442\u043E \u043F\u043E\u0440\u0430 \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C \u0434\u0435\u043B\u043E, \u0433\u0434\u0435-\u0442\u043E \u2014 \u043F\u043E\u043C\u0435\u043D\u044F\u0442\u044C \u0443\u0441\u043B\u043E\u0432\u0438\u044F, \u0430 \u0433\u0434\u0435-\u0442\u043E \u2014 \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u043E \u0432\u044B\u0441\u043F\u0430\u0442\u044C\u0441\u044F \u043F\u0435\u0440\u0435\u0434 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u043C. \u042D\u0442\u043E \u0440\u0430\u0437\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u0434\u0430\u0436\u0435 \u0435\u0441\u043B\u0438 \u0441\u0435\u0439\u0447\u0430\u0441 \u043E\u043D\u0438 \u043A\u0430\u0436\u0443\u0442\u0441\u044F \u043E\u0434\u043D\u0438\u043C \u0431\u043E\u043B\u044C\u0448\u0438\u043C \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u043C."];
  if (event.type === "new_moon")
    return ["\u041D\u0430\u0447\u0430\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0431\u0435\u0437 \u043E\u0431\u0435\u0449\u0430\u043D\u0438\u044F \u0441\u0442\u0430\u0442\u044C \u0434\u0440\u0443\u0433\u0438\u043C \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C \u0441 \u043F\u043E\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0438\u043A\u0430. \u0412\u044B\u0431\u0435\u0440\u0438 \u043E\u0434\u043D\u0443 \u0432\u0435\u0449\u044C, \u043A\u043E\u0442\u043E\u0440\u0443\u044E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u043F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C. \u041D\u0435\u0431\u043E\u043B\u044C\u0448\u0443\u044E, \u043F\u043E\u043D\u044F\u0442\u043D\u0443\u044E, \u043F\u043E\u043C\u0435\u0449\u0430\u044E\u0449\u0443\u044E\u0441\u044F \u0432 \u043E\u0431\u044B\u0447\u043D\u044B\u0439 \u0434\u0435\u043D\u044C. \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435 \u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u043D\u043E \u043F\u043E \u0445\u043E\u0434\u0443.", "\u041D\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u043D \u0441\u0440\u0430\u0437\u0443 \u0431\u044B\u0442\u044C \u043E\u0433\u0440\u043E\u043C\u043D\u044B\u043C. \u0418\u043D\u043E\u0433\u0434\u0430 \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0443\u0437\u043D\u0430\u0442\u044C \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0438\u043B\u0438 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A. \u041D\u0435 \u043D\u0443\u0436\u043D\u043E \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u043E\u0431\u0435\u0441\u0446\u0435\u043D\u0438\u0432\u0430\u0442\u044C \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u043E\u0435 \u043D\u0430\u0447\u0430\u043B\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u043F\u043E\u043A\u0430 \u043D\u0435\u0447\u0435\u0433\u043E \u0442\u043E\u0440\u0436\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C.", "\u0425\u043E\u0447\u0435\u0442\u0441\u044F \u043D\u0430\u0447\u0430\u0442\u044C \u0438\u043D\u0430\u0447\u0435? \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0430\u0437\u043E\u0432\u0438, \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u0431\u0443\u0434\u0435\u0442 \u0438\u043D\u0430\u0447\u0435. \u041D\u0435 \u0432\u0441\u044F \u0436\u0438\u0437\u043D\u044C, \u0430 \u043E\u0434\u043D\u0430 \u043F\u0440\u0438\u0432\u044B\u0447\u043A\u0430, \u043E\u0434\u0438\u043D \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440, \u043E\u0434\u0438\u043D \u0441\u043F\u043E\u0441\u043E\u0431 \u0434\u0435\u043B\u0430\u0442\u044C \u0434\u0435\u043B\u043E. \u0421 \u0442\u0430\u043A\u0438\u043C \u043D\u0430\u0447\u0430\u043B\u043E\u043C \u0443\u0436\u0435 \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u0437\u043D\u0430\u043A\u043E\u043C\u0438\u0442\u044C\u0441\u044F \u043D\u0430 \u043F\u0440\u0430\u043A\u0442\u0438\u043A\u0435."];
  if (event.type === "moon_sign_ingress")
    return ["\u041C\u043E\u0436\u043D\u043E \u043F\u043E\u043C\u0435\u043D\u044F\u0442\u044C \u0442\u0435\u043C\u043F \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 \u0434\u043D\u044F. \u041D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0434\u0435\u0440\u0436\u0430\u0442\u044C\u0441\u044F \u0437\u0430 \u0443\u0442\u0440\u0435\u043D\u043D\u0438\u0439 \u043F\u043B\u0430\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0442\u043E\u043C\u0443, \u0447\u0442\u043E \u043E\u043D \u0443\u0436\u0435 \u0437\u0430\u043F\u0438\u0441\u0430\u043D. \u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438, \u0447\u0442\u043E \u0435\u0449\u0451 \u043F\u043E\u0441\u0438\u043B\u044C\u043D\u043E, \u0438 \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u0432\u044C \u0434\u0435\u043B\u0430 \u0431\u0435\u0437 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u043E\u0431\u044A\u044F\u0432\u0438\u0442\u044C \u0432\u0435\u0441\u044C \u0434\u0435\u043D\u044C \u043D\u0435\u0443\u0434\u0430\u0447\u043D\u044B\u043C.", "\u0415\u0441\u043B\u0438 \u043A \u0432\u0435\u0447\u0435\u0440\u0443 \u0445\u043E\u0447\u0435\u0442\u0441\u044F \u0437\u0430\u043D\u0438\u043C\u0430\u0442\u044C\u0441\u044F \u0434\u0440\u0443\u0433\u0438\u043C, \u044D\u0442\u043E \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u043E\u0432\u043E\u0434 \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u0441\u0451 \u043D\u0430\u0447\u0430\u0442\u043E\u0435. \u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u043A\u0443\u0441\u043E\u043A \u0438 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F. \u0423 \u0434\u0435\u043B\u0430 \u0438\u043D\u043E\u0433\u0434\u0430 \u0435\u0441\u0442\u044C \u043D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u043C\u0435\u0436\u0443\u0442\u043E\u0447\u043D\u0430\u044F \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430."];
  if (event.transit === "Mars" && event.otherTransit === "Jupiter" || event.transit === "Jupiter" && event.otherTransit === "Mars")
    return ["\u0420\u0430\u0437\u043C\u0430\u0445 \u0437\u0434\u0435\u0441\u044C \u0435\u0441\u0442\u044C. \u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u043D\u0435 \u043F\u0435\u0440\u0435\u043F\u0443\u0442\u0430\u0442\u044C \xAB\u0445\u043E\u0447\u0443 \u043C\u043D\u043E\u0433\u043E\xBB \u0441 \xAB\u0443\u0441\u043F\u0435\u044E \u0432\u0441\u0451\xBB. \u0415\u0441\u043B\u0438 \u0438\u0434\u0435\u044F \u0440\u0430\u0441\u0442\u0451\u0442 \u043F\u0440\u044F\u043C\u043E \u043D\u0430 \u0433\u043B\u0430\u0437\u0430\u0445, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u043E\u0431\u044B\u0447\u043D\u044B\u0435 \u0432\u0435\u0449\u0438: \u0432\u0440\u0435\u043C\u044F, \u0434\u0435\u043D\u044C\u0433\u0438 \u0438 \u0442\u0435\u0445, \u043A\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0431\u0443\u0434\u0435\u0442 \u0432\u0441\u0451 \u044D\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C.", "\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043C\u0430\u0445\u043D\u0443\u0442\u044C\u0441\u044F \u043D\u0430 \u0431\u043E\u043B\u044C\u0448\u043E\u0435 \u0438 \u043D\u0430\u0447\u0430\u0442\u044C \u0441 \u043C\u0430\u043B\u043E\u0433\u043E. \u041F\u0440\u043E\u0442\u0438\u0432\u043E\u0440\u0435\u0447\u0438\u044F \u043D\u0435\u0442. \u041E\u0434\u0438\u043D \u043F\u0440\u043E\u0431\u043D\u044B\u0439 \u0448\u0430\u0433 \u043D\u0435 \u043F\u043E\u0440\u0442\u0438\u0442 \u043A\u0440\u0430\u0441\u0438\u0432\u0443\u044E \u0438\u0434\u0435\u044E, \u0437\u0430\u0442\u043E \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043E\u043D\u0430 \u043F\u0440\u043E\u0441\u0438\u0442 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0438 \u043D\u0430 \u0447\u0442\u043E \u0432\u043E\u043E\u0431\u0449\u0435 \u043F\u043E\u0445\u043E\u0436\u0430 \u0432 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u0438.", "\u0415\u0441\u043B\u0438 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0437\u0432\u0443\u0447\u0438\u0442 \u0449\u0435\u0434\u0440\u043E, \u043F\u0440\u043E\u0432\u0435\u0440\u044C \u0435\u0433\u043E \u043E\u0431\u044B\u0447\u043D\u0443\u044E \u0446\u0435\u043D\u0443. \u041D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0434\u0435\u043D\u044C\u0433\u0430\u0445: \u043A\u0442\u043E \u0443\u0447\u0430\u0441\u0442\u0432\u0443\u0435\u0442, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0431\u043E\u0442\u044B \u0438 \u0433\u0434\u0435 \u0443 \u0432\u0441\u0435\u0433\u043E \u044D\u0442\u043E\u0433\u043E \u043A\u043E\u043D\u0435\u0446. \u0425\u043E\u0440\u043E\u0448\u0430\u044F \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044C \u043E\u0442 \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u0439 \u043D\u0435 \u0438\u0441\u043F\u043E\u0440\u0442\u0438\u0442\u0441\u044F."];
  return ["\u041E\u0431\u0449\u0438\u0439 \u0444\u043E\u043D \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u043D \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u043E \u043F\u0440\u043E\u0438\u0433\u0440\u044B\u0432\u0430\u0442\u044C\u0441\u044F \u0443 \u0432\u0441\u0435\u0445. \u0415\u0441\u043B\u0438 \u0442\u0435\u043C\u0430 \u043E\u0442\u0437\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0432 \u0442\u0432\u043E\u0438\u0445 \u0434\u0435\u043B\u0430\u0445, \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438 \u043D\u0430 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0443\u044E \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044E. \u0410 \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u044C\u043D\u043E \u0438\u0441\u043A\u0430\u0442\u044C \u043F\u043E\u0434 \u043D\u0435\u0451 \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u043D\u0435 \u043D\u0443\u0436\u043D\u043E. \u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u043D\u0435 \u0432\u044B\u0434\u0430\u0451\u0442 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u043D\u0430 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u0440\u043E\u0436\u0438\u0432\u0430\u043D\u0438\u0435.", "\u0415\u0441\u043B\u0438 \u0432\u043E\u043A\u0440\u0443\u0433 \u043C\u043D\u043E\u0433\u043E \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0439 \u0438 \u043C\u043D\u0435\u043D\u0438\u0439, \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0443\u0447\u0430\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u0432 \u043A\u0430\u0436\u0434\u043E\u043C. \u0427\u0442\u043E \u0438\u0437 \u044D\u0442\u043E\u0433\u043E \u0432\u043E\u043E\u0431\u0449\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0442\u0432\u043E\u0438\u043C \u0434\u0435\u043B\u0430\u043C? \u041C\u043E\u0436\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043E\u0434\u043D\u0443 \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0438 \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u0443\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u043C\u0438 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u044F\u043C\u0438."];
}
function feParagraphs(brief, variant) {
  const seed = feHash(brief.day + brief.moon.sign + brief.topic + (brief.preferredName || "")) + variant;
  const choose = (a, shift = 0) => a[(seed + shift) % a.length];
  let scene = brief.moon.house !== null ? FE_HOUSE_PARAGRAPHS[brief.moon.house] : FE_SIGN_PARAGRAPHS[brief.moon.sign];
  const topic = FE_TOPIC_PARAGRAPHS[brief.topic] || FE_TOPIC_PARAGRAPHS.lunar;
  const main = topic[brief.tone].length ? topic[brief.tone] : topic.focused;
  const global = brief.selectedGlobalEvents[0];
  if (global) {
    if (global.house !== null)
      scene = FE_HOUSE_PARAGRAPHS[global.house];
    const paragraphs = [choose(feGlobalParagraphs(global)), choose(scene, 1)];
    if (brief.selectedAspects.length)
      paragraphs.push(global.type === "exact_sky_aspect" && brief.topic === "scale" ? FE_TOPIC_PARAGRAPHS.scale.focused[1] : choose(main, 2));
    return paragraphs;
  }
  return [choose(scene), choose(main, 1)];
}
function feWords(text) {
  return text.toLocaleLowerCase("ru-RU").replace(/\u0451/g, "\u0435").match(/[\u0430-\u044Fa-z]+/g) || [];
}
function feSimilarity(a, b) {
  const shingles = (s) => {
    const w = feWords(s), out = new Set;
    for (let i = 0;i + 3 < w.length; i++)
      out.add(w.slice(i, i + 4).join(" "));
    return out;
  };
  const x = shingles(a), y = shingles(b);
  if (!x.size || !y.size)
    return 0;
  let overlap = 0;
  for (const t of x)
    if (y.has(t))
      overlap++;
  return overlap / Math.min(x.size, y.size);
}
function validateEditorialDraft(draft, brief, recentTexts = []) {
  const reasons = [];
  let value = draft;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, text: "", reasons: ["structured_draft_required"] };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.text !== "string" || !Array.isArray(value.factIds))
    return { ok: false, text: "", reasons: ["invalid_editorial_shape"] };
  const text = value.text.trim();
  if (text.length < 360 || text.length > 1450)
    reasons.push("editorial_length");
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  if (paragraphs.length < 2 || paragraphs.length > 4)
    reasons.push("editorial_paragraphs");
  if (!value.factIds.length || value.factIds.length > brief.factIds.length || new Set(value.factIds).size !== value.factIds.length || value.factIds.some((id) => typeof id !== "string" || !brief.factIds.includes(id)))
    reasons.push("unknown_fact_id");
  if (/\u0441\u043E\u043B\u043D\u0446|\u043B\u0443\u043D(?:\u0430|\u044B|\u0435|\u0443|\u043E\u0439|\u043D\u044B\u0439)|\u043C\u0435\u0440\u043A\u0443\u0440|\u0432\u0435\u043D\u0435\u0440|\b\u043C\u0430\u0440\u0441|\u044E\u043F\u0438\u0442\u0435\u0440|\u0441\u0430\u0442\u0443\u0440\u043D|\b\u0443\u0440\u0430\u043D|\u043D\u0435\u043F\u0442\u0443\u043D|\u043F\u043B\u0443\u0442\u043E\u043D|\u043D\u0430\u0442\u0430\u043B\u044C\u043D|\u0442\u0440\u0430\u043D\u0437\u0438\u0442|\u0440\u0435\u0442\u0440\u043E\u0433\u0440\u0430\u0434|\u0437\u0430\u0442\u043C\u0435\u043D|\u043F\u043E\u043B\u043D\u043E\u043B\u0443\u043D|\u043D\u043E\u0432\u043E\u043B\u0443\u043D|\u043E\u0440\u0431\u0438\u0441|\u0441\u0435\u043A\u0441\u0442\u0438\u043B|\u043E\u043F\u043F\u043E\u0437\u0438\u0446|\b\u0442\u0440\u0438\u043D|\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438|\u043A\u0432\u0430\u0434\u0440\u0430\u0442|\u043F\u043B\u0430\u0446\u0438\u0434\u0443\u0441/i.test(text))
    reasons.push("editorial_introduces_astronomy");
  if (/\b(?:\u043E\u0432\u043D|\u0442\u0435\u043B\u044C\u0446|\u0431\u043B\u0438\u0437\u043D\u0435\u0446|\u0440\u0430\u043A\u0435|\u043B\u044C\u0432\u0435|\u0434\u0435\u0432\u0435|\u0432\u0435\u0441\u0430\u0445|\u0441\u043A\u043E\u0440\u043F\u0438\u043E\u043D|\u0441\u0442\u0440\u0435\u043B\u044C\u0446|\u043A\u043E\u0437\u0435\u0440\u043E\u0433|\u0432\u043E\u0434\u043E\u043B\u0435|\u0440\u044B\u0431\u0430\u0445)/i.test(text))
    reasons.push("editorial_introduces_zodiac");
  if (/\d|(?:\u043F\u0435\u0440\u0432|\u0432\u0442\u043E\u0440|\u0442\u0440\u0435\u0442\u044C|\u0447\u0435\u0442\u0432[\u0435\u0451]\u0440\u0442|\u043F\u044F\u0442|\u0448\u0435\u0441\u0442|\u0441\u0435\u0434\u044C\u043C|\u0432\u043E\u0441\u044C\u043C|\u0434\u0435\u0432\u044F\u0442|\u0434\u0435\u0441\u044F\u0442|\u043E\u0434\u0438\u043D\u043D\u0430\u0434\u0446\u0430\u0442|\u0434\u0432\u0435\u043D\u0430\u0434\u0446\u0430\u0442)\w*\s+\u0434\u043E\u043C/i.test(text))
    reasons.push("editorial_introduces_time_or_house");
  if (/<[^>]+>|https?:\/\/|\[[^\]]+\]\(|```|\*\*|\uFFFD/.test(text))
    reasons.push("editorial_markup_or_corruption");
  if (/\u0433\u0430\u0440\u0430\u043D\u0442\u0438\u0440\u043E\u0432\u0430\u043D|\u043D\u0435\u0438\u0437\u0431\u0435\u0436\u043D|\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E (?:\u0441\u043B\u0443\u0447\u0438\u0442\u0441\u044F|\u043F\u0440\u043E\u0438\u0437\u043E\u0439\u0434[\u0435\u0451]\u0442|\u043F\u043E\u043B\u0443\u0447\u0438\u0448\u044C)|\u0442\u0435\u0431\u044F \u0436\u0434[\u0435\u0451]\u0442|\u0442\u044B (?:\u0442\u043E\u0447\u043D\u043E|\u043D\u0435\u043F\u0440\u0435\u043C\u0435\u043D\u043D\u043E)|\u0432\u044B\u043B\u0435\u0447|\u0434\u0438\u0430\u0433\u043D\u043E\u0437|\u0438\u043D\u0432\u0435\u0441\u0442\u0438\u0440\u0443\u0439|\u043F\u043E\u043A\u0443\u043F\u0430\u0439 \u0430\u043A\u0446\u0438\u0438|\u0431\u0435\u0440\u0438 \u043A\u0440\u0435\u0434\u0438\u0442|\u0432\u0441\u0435\u043B\u0435\u043D\u043D\u0430\u044F (?:\u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0430\u0435\u0442|\u0433\u043E\u0432\u043E\u0440\u0438\u0442)|\u0442\u0435\u043F\u0435\u0440\u044C \u0441\u0430\u043C\u043E\u0435 \u0432\u043A\u0443\u0441\u043D\u043E\u0435|\u0434\u0435\u0440\u0436\u0438\u0441\u044C \u043A\u0440\u0435\u043F\u0447\u0435|\u044D\u043D\u0435\u0440\u0433\u0438\u0438 \u0442\u0440\u0430\u043D\u0441\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0438|\u044F (?:\u0437\u0430\u043C\u0435\u0442\u0438\u043B\u0430|\u0447\u0443\u0432\u0441\u0442\u0432\u0443\u044E|\u043F\u043E\u043C\u043D\u044E)|\u0432 \u043C\u043E\u0435\u0439 \u043F\u0440\u0430\u043A\u0442\u0438\u043A\u0435/i.test(text))
    reasons.push("editorial_unsupported_certainty_or_voice");
  if ([...brief.recentTextExcerpts, ...recentTexts].some((x) => typeof x === "string" && feSimilarity(text, x) > 0.62))
    reasons.push("editorial_repeats_recent_text");
  return { ok: reasons.length === 0, text, reasons };
}
function renderDailyForecast(calc, options = {}) {
  const brief = getEditorialBrief(calc, options);
  const check = options.editorialDraft === undefined ? null : validateEditorialDraft(options.editorialDraft, brief, options.recentTexts || []);
  let prose;
  if (check?.ok)
    prose = check.text;
  else {
    let best = null, bestScore = Infinity;
    for (let variant = 0;variant < 8; variant++) {
      const paragraphs = feParagraphs(brief, variant);
      const text = paragraphs.join(`

`);
      const history = options.recentTexts || [];
      const score = history.reduce((max, old) => Math.max(max, feSimilarity(text, old)), 0);
      if (score < bestScore) {
        best = paragraphs;
        bestScore = score;
      }
      if (score < 0.12)
        break;
    }
    prose = (best || feParagraphs(brief, 0)).join(`

`);
  }
  const moon = brief.factualSentences[0], global = brief.selectedGlobalEvents.length ? brief.factualSentences[1] : null, personal = brief.selectedAspects.length ? brief.factualSentences[brief.factualSentences.length - 1] : null;
  let paragraphs;
  if (check?.ok) {
    const facts = [global, personal, moon].filter(Boolean).join(" ");
    paragraphs = [facts, prose];
  } else {
    const parts = prose.split(/\n\s*\n/);
    const order = feHash(brief.day + brief.topic + (brief.preferredName || "")) % 4;
    if (global) {
      const globalProse = parts[0], scene = parts[1], topic = parts[2];
      if (order === 0)
        paragraphs = [global + " " + globalProse, moon + " " + scene, ...personal && topic ? [personal + " " + topic] : []];
      else if (order === 1)
        paragraphs = [global + " " + moon, globalProse, ...personal && topic ? [personal + " " + topic, scene] : [scene]];
      else if (order === 2)
        paragraphs = [global + " " + globalProse, ...personal && topic ? [personal + " " + topic] : [], moon + " " + scene];
      else
        paragraphs = [global + " " + globalProse, moon + " " + scene, ...personal && topic ? [personal + " " + topic] : []];
    } else if (personal) {
      const scene = parts[0], topic = parts[1];
      if (order === 0)
        paragraphs = [personal + " " + topic, moon + " " + scene];
      else if (order === 1)
        paragraphs = [scene, personal + " " + moon, topic];
      else if (order === 2)
        paragraphs = [moon + " " + scene, personal + " " + topic];
      else
        paragraphs = [topic, personal + " " + moon, scene];
    } else {
      const scene = parts[0], topic = parts[1];
      paragraphs = order === 0 ? [scene, moon + " " + topic] : order === 1 ? [moon + " " + scene, topic] : order === 2 ? [topic, moon + " " + scene] : [scene, topic, moon];
    }
  }
  let text = paragraphs.filter(Boolean).join(`

`);
  if (brief.preferredName && feHash(brief.day + brief.preferredName) % 11 === 0)
    text = brief.preferredName + ", \u0441\u043C\u043E\u0442\u0440\u0438. " + text;
  return { text, mode: check?.ok ? "validated_editorial" : "calculated_editorial", version: FORECAST_EDITORIAL_VERSION, day: brief.day, factIds: check?.ok ? brief.factIds : [brief.moon.id, ...brief.selectedGlobalEvents.map((x) => x.id), ...brief.selectedAspects[0] ? [brief.selectedAspects[0].id] : []], validationReasons: check && !check.ok ? check.reasons : [] };
}

// forecast-runtime.ts
var FORECAST_ENGINE_VERSION = "astro-v2-placidus-swe-2.10";
class ForecastError extends Error {
  code;
  httpStatus;
  constructor(code, httpStatus = 503) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
var schemas = new WeakMap;
function localForecastDay(zone, at = new Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
function forecastDueAt(day, zone, hour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(hour) || hour < 0 || hour > 23)
    throw new ForecastError("invalid_delivery_time", 400);
  const target = Date.parse(day + "T" + String(hour).padStart(2, "0") + ":00:00Z");
  let guess = target;
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let i = 0;i < 8; i++) {
    const p = Object.fromEntries(f.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const wall = Date.parse(p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute + ":00Z");
    if (wall === target)
      return new Date(guess).toISOString();
    guess += target - wall;
  }
  for (let m = -180;m <= 180; m++) {
    const at = new Date(guess + m * 60000);
    const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
    if (p.year + "-" + p.month + "-" + p.day === day && Number(p.hour) >= hour)
      return at.toISOString();
  }
  throw new ForecastError("delivery_time_unresolved", 422);
}
function profileFingerprint(p) {
  return createHash("sha256").update(JSON.stringify([String(p.birth_at_iso), String(p.birth_day || p.birth_local_date).slice(0, 10), Number(p.birth_lat), Number(p.birth_lon), p.birth_time_verified === true, p.birth_timezone, p.time_zone, Number(p.delivery_hour_local)])).digest("hex");
}
async function ensureForecastSchema(db) {
  let ready = schemas.get(db);
  if (ready)
    return ready;
  ready = (async () => {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS liz_daily_messages(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),telegram_id TEXT NOT NULL REFERENCES liz_clients(telegram_id),forecast_date DATE NOT NULL,body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 20000),due_at TIMESTAMPTZ NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempt_count INT NOT NULL DEFAULT 0,telegram_message_id TEXT,sent_at TIMESTAMPTZ,claim_at TIMESTAMPTZ,error_code TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(telegram_id,forecast_date))",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS engine_version TEXT",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS editorial_version TEXT",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS profile_fingerprint TEXT",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS generation_state TEXT NOT NULL DEFAULT 'legacy'",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS generation_token UUID",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS calculation JSONB",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS fact_ids JSONB",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS text_mode TEXT",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS telegram_html_parts JSONB",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS telegram_next_part_index INT NOT NULL DEFAULT 0",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS telegram_message_ids JSONB NOT NULL DEFAULT '[]'::jsonb",
      "ALTER TABLE liz_daily_messages ADD COLUMN IF NOT EXISTS telegram_format_version TEXT",
      "CREATE INDEX IF NOT EXISTS liz_daily_due_idx ON liz_daily_messages(status,due_at)",
      "CREATE TABLE IF NOT EXISTS liz_tester_forecasts(handle_key TEXT NOT NULL REFERENCES liz_astro_testers(handle_key),forecast_day DATE NOT NULL,body TEXT NOT NULL,calculation JSONB NOT NULL,fact_ids JSONB NOT NULL,profile_fingerprint TEXT NOT NULL,engine_version TEXT NOT NULL,editorial_version TEXT NOT NULL,text_mode TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(handle_key,forecast_day))"
    ])
      await db.unsafe(sql);
  })();
  schemas.set(db, ready);
  try {
    await ready;
  } catch (e) {
    schemas.delete(db);
    throw e;
  }
}
async function calculateProfileForecast(p, day, recentTexts = [], options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new ForecastError("invalid_forecast_day", 400);
  const token = Bun.env.ASTRO_INTERNAL_TOKEN || "";
  if (token.length < 32)
    throw new ForecastError("forecast_engine_not_configured");
  const r = await fetch("http://liz-astro-v2.railway.internal:8080/v2/forecast", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ day, timeZone: p.time_zone, birth: { at: new Date(p.birth_at_iso).toISOString(), latitude: Number(p.birth_lat), longitude: Number(p.birth_lon), accurateBirthTime: p.birth_time_verified === true } }), signal: AbortSignal.timeout(45000) });
  if (!r.ok)
    throw new ForecastError("forecast_engine_http_" + r.status);
  const calc = await r.json();
  if (calc.version !== FORECAST_ENGINE_VERSION || calc.houseSystem !== "placidus" || calc.day !== day || calc.timeZone !== p.time_zone || calc.houseKnown !== p.birth_time_verified || calc.natalMoonReliable !== p.birth_time_verified)
    throw new ForecastError("forecast_calculation_contract_mismatch");
  let editorialDraft;
  const opts = { preferredName: p.preferred_name || "", recentTexts };
  if (options.rewrite) {
    try {
      editorialDraft = await options.rewrite(getEditorialBrief(calc, opts), { day, telegramId: p.telegram_id });
    } catch (e) {
      console.error("FORECAST_EDITORIAL_FALLBACK", String(e?.message || e).slice(0, 120));
    }
  }
  const rendered = renderDailyForecast(calc, { ...opts, editorialDraft });
  return { calculation: calc, ...rendered, profile_fingerprint: profileFingerprint(p) };
}
async function ensureDailyForecast(db, id, day, options = {}) {
  await ensureForecastSchema(db);
  const profiles = await db.unsafe("SELECT p.*,p.birth_local_date::text AS birth_day,s.valid_until FROM liz_birth_profiles p LEFT JOIN liz_subscriptions s ON s.telegram_id=p.telegram_id WHERE p.telegram_id=$1 LIMIT 1", [id]);
  const p = profiles[0];
  if (!p)
    throw new ForecastError("birth_profile_required", 404);
  if (options.requireSubscription !== false && (!p.valid_until || Date.parse(p.valid_until) <= Date.now()))
    throw new ForecastError("active_subscription_required", 403);
  if (day !== localForecastDay(p.time_zone))
    throw new ForecastError("only_current_local_day_available", 400);
  const fp = profileFingerprint(p), due = forecastDueAt(day, p.time_zone, Number(p.delivery_hour_local));
  let cached = (await db.unsafe("SELECT *,forecast_date::text AS day FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date=$2::date", [id, day]))[0];
  const good = (x) => x?.generation_state === "ready" && x.engine_version === FORECAST_ENGINE_VERSION && x.editorial_version === FORECAST_EDITORIAL_VERSION && x.profile_fingerprint === fp && typeof x.body === "string" && x.body.length >= 150;
  if (good(cached))
    return cached;
  const token = randomUUID();
  const lease = await db.unsafe("INSERT INTO liz_daily_messages(telegram_id,forecast_date,body,due_at,generation_state,generation_token,generation_started_at) VALUES($1,$2::date,'\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u0433\u043E\u0442\u043E\u0432\u0438\u0442\u0441\u044F.',$3::timestamptz,'generating',$4::uuid,NOW()) ON CONFLICT(telegram_id,forecast_date) DO UPDATE SET generation_state='generating',generation_token=$4::uuid,generation_started_at=NOW(),due_at=$3::timestamptz WHERE liz_daily_messages.generation_state<>'generating' OR liz_daily_messages.generation_started_at<NOW()-INTERVAL '3 minutes' RETURNING id", [id, day, due, token]);
  if (!lease.length) {
    for (let i = 0;i < 5; i++) {
      await new Promise((r) => setTimeout(r, 800));
      cached = (await db.unsafe("SELECT *,forecast_date::text AS day FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date=$2::date", [id, day]))[0];
      if (good(cached))
        return cached;
    }
    throw new ForecastError("forecast_preparing_retry", 202);
  }
  try {
    const tester = await db.unsafe("SELECT f.body,f.calculation,f.fact_ids,f.text_mode FROM liz_tester_forecasts f JOIN liz_astro_testers t ON t.handle_key=f.handle_key WHERE t.verified_telegram_id=$1 AND f.forecast_day=$2::date AND f.profile_fingerprint=$3 AND f.engine_version=$4 AND f.editorial_version=$5 LIMIT 1", [id, day, fp, FORECAST_ENGINE_VERSION, FORECAST_EDITORIAL_VERSION]);
    let generated;
    if (tester[0])
      generated = { text: tester[0].body, calculation: tester[0].calculation, factIds: tester[0].fact_ids, mode: tester[0].text_mode };
    else {
      const recent = await db.unsafe("SELECT body FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date<$2::date AND generation_state='ready' ORDER BY forecast_date DESC LIMIT 3", [id, day]);
      generated = await calculateProfileForecast(p, day, recent.map((x) => x.body), options);
    }
    const now = (await db.unsafe("SELECT p.*,p.birth_local_date::text AS birth_day,s.valid_until FROM liz_birth_profiles p LEFT JOIN liz_subscriptions s ON s.telegram_id=p.telegram_id WHERE p.telegram_id=$1 LIMIT 1", [id]))[0];
    if (!now || profileFingerprint(now) !== fp || options.requireSubscription !== false && (!now.valid_until || !Number.isFinite(Date.parse(now.valid_until)) || Date.parse(now.valid_until) <= Date.now()))
      throw new ForecastError("profile_changed_during_calculation", 409);
    const saved = await db.unsafe("UPDATE liz_daily_messages SET body=$2,calculation=($3::text)::jsonb,fact_ids=($4::text)::jsonb,engine_version=$5,editorial_version=$6,profile_fingerprint=$7,text_mode=$8,generation_state='ready',generation_token=NULL,prepared_at=NOW(),error_code=NULL,status=CASE WHEN status='cancelled' AND sent_at IS NULL AND telegram_next_part_index=0 THEN 'pending' ELSE status END,telegram_html_parts=CASE WHEN sent_at IS NULL AND telegram_next_part_index=0 THEN NULL ELSE telegram_html_parts END WHERE id=$1::uuid AND generation_token=$9::uuid RETURNING *,forecast_date::text AS day", [lease[0].id, generated.text, JSON.stringify(generated.calculation), JSON.stringify(generated.factIds), FORECAST_ENGINE_VERSION, FORECAST_EDITORIAL_VERSION, fp, generated.mode, token]);
    if (!saved.length)
      throw new ForecastError("forecast_generation_claim_lost");
    return saved[0];
  } catch (e) {
    await db.unsafe("UPDATE liz_daily_messages SET generation_state='failed',generation_token=NULL,error_code=$2 WHERE id=$1::uuid AND generation_token=$3::uuid", [lease[0].id, String(e?.code || e?.message || "generation_failed").slice(0, 160), token]);
    throw e;
  }
}

// tester-runtime.ts
import { createHmac } from "crypto";
function normalizeTesterPhone(value) {
  const s = value.replace(/\D/g, "");
  return s.length === 11 && s[0] === "8" ? "7" + s.slice(1) : s;
}
function testerPhoneDigest(value) {
  if ((Bun.env.ASTRO_INTERNAL_TOKEN || "").length < 32)
    throw Error("tester_identity_not_configured");
  return createHmac("sha256", Bun.env.ASTRO_INTERNAL_TOKEN || "").update(normalizeTesterPhone(value)).digest("hex");
}
async function ensureTesterRuntimeSchema(db) {
  for (const q of [
    "ALTER TABLE liz_astro_testers ADD COLUMN IF NOT EXISTS verified_telegram_id TEXT",
    "ALTER TABLE liz_astro_testers ADD COLUMN IF NOT EXISTS expected_telegram_id TEXT",
    "ALTER TABLE liz_astro_testers ADD COLUMN IF NOT EXISTS phone_hash TEXT",
    "ALTER TABLE liz_astro_testers ADD COLUMN IF NOT EXISTS claim_at TIMESTAMPTZ",
    "CREATE UNIQUE INDEX IF NOT EXISTS liz_astro_testers_verified_id_idx ON liz_astro_testers(verified_telegram_id) WHERE verified_telegram_id IS NOT NULL",
    "CREATE TABLE IF NOT EXISTS liz_tg_processed_updates(update_id BIGINT PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
  ])
    await db.unsafe(q);
}
async function activateTester(db, id, username, phoneContact) {
  await ensureTesterRuntimeSchema(db);
  if (!/^[1-9][0-9]{0,15}$/.test(id))
    return { ok: false, reason: "invalid_identity" };
  const ownContact = phoneContact && String(phoneContact.user_id) === id && typeof phoneContact.phone_number === "string";
  const hash = ownContact ? testerPhoneDigest(phoneContact.phone_number) : "";
  const candidates = await db.unsafe("SELECT *,birth_local_date::text AS birth_day,trial_end_exclusive::text AS trial_end FROM liz_astro_testers WHERE (lower(telegram_username)=$1 OR expected_telegram_id=$2 OR verified_telegram_id=$2 OR (phone_hash=$3 AND $3<>'')) AND (verified_telegram_id IS NULL OR verified_telegram_id=$2) AND (expected_telegram_id IS NULL OR expected_telegram_id=$2) AND (trial_end_exclusive::timestamp AT TIME ZONE forecast_zone_assumed)>NOW()", [(username || "").replace(/^@/, "").toLowerCase(), id, hash]);
  if (candidates.length !== 1)
    return { ok: false, reason: candidates.length ? "ambiguous_profile" : "not_on_list_or_bound", needsContact: !ownContact };
  const t = candidates[0];
  if(!t.birth_utc||!t.birth_day||t.birth_lat==null||t.birth_lon==null||!Number.isFinite(Number(t.birth_lat))||!Number.isFinite(Number(t.birth_lon))||!t.birth_zone||!t.trial_end)return {ok:false,reason:"tester_profile_incomplete"};
  await db.begin(async (tx) => {
    const rows = await tx.unsafe("UPDATE liz_astro_testers SET verified_telegram_id=$2,identity_status='verified_via_bot',consent_status='confirmed_by_account_holder',subscription_status='trial_granted',claim_at=COALESCE(claim_at,NOW()),updated_at=NOW() WHERE handle_key=$1 AND (verified_telegram_id IS NULL OR verified_telegram_id=$2) RETURNING handle_key", [t.handle_key, id]);
    if (rows.length !== 1)
      throw Error("tester_identity_already_bound");
    const joined=await tx.unsafe("INSERT INTO astroday_tester_joins(telegram_id,handle_key,notifications_enabled) VALUES($1,$2,TRUE) ON CONFLICT(telegram_id) DO UPDATE SET notifications_enabled=TRUE WHERE astroday_tester_joins.handle_key=EXCLUDED.handle_key RETURNING telegram_id",[id,t.handle_key]);
    if(joined.length!==1)throw Error("tester_join_identity_conflict");
    await tx.unsafe("INSERT INTO liz_clients(telegram_id,telegram_username,chat_started_at,notify_enabled) VALUES($1,$2,NOW(),TRUE) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username=COALESCE(EXCLUDED.telegram_username,liz_clients.telegram_username),chat_started_at=COALESCE(liz_clients.chat_started_at,NOW()),notify_enabled=TRUE,updated_at=NOW()", [id, username]);
    await tx.unsafe("INSERT INTO liz_birth_profiles(telegram_id,birth_at_iso,birth_local_date,birth_lat,birth_lon,birth_time_verified,birth_timezone,time_zone,delivery_hour_local,consented_to_daily,preferred_name,birth_city_name) VALUES($1,$2,$3::date,$4,$5,$6,$7,$8,7,TRUE,$9,$10) ON CONFLICT(telegram_id) DO UPDATE SET consented_to_daily=TRUE,updated_at=NOW()", [id, new Date(t.birth_utc).toISOString(), t.birth_day, Number(t.birth_lat), Number(t.birth_lon), t.birth_time_precision === "exact_reported", t.birth_zone, t.forecast_zone_assumed, t.display_name || null, t.birth_city]);
    await tx.unsafe("INSERT INTO liz_subscriptions(telegram_id,valid_until,source) VALUES($1,($2::date::timestamp AT TIME ZONE $3),'tester_trial') ON CONFLICT(telegram_id) DO UPDATE SET valid_until=GREATEST(liz_subscriptions.valid_until,EXCLUDED.valid_until),updated_at=NOW()", [id, t.trial_end, t.forecast_zone_assumed]);
    await tx.unsafe("INSERT INTO liz_tg_consents(telegram_id,terms_version,daily_delivery) VALUES($1,'tester-activation-20261115',TRUE) ON CONFLICT(telegram_id) DO UPDATE SET daily_delivery=TRUE,accepted_at=NOW()", [id]);
  });
  const p = (await db.unsafe("SELECT time_zone,delivery_hour_local FROM liz_birth_profiles WHERE telegram_id=$1", [id]))[0];
  return { ok: true, ends: t.trial_end, zone: p?.time_zone || t.forecast_zone_assumed, hour: Number(p?.delivery_hour_local ?? 7), name: t.display_name || "", handle: t.handle_key };
}

// liz-ty666-payment-api.ts
var {SQL } = globalThis.Bun;
import { createHmac as createHmac2, createHash as createHash2, timingSafeEqual, randomUUID as randomUUID2, randomBytes } from "crypto";
var PLANS = Object.freeze({
  month: { months: 1, rub: 1666, title: "ASTRODAY \u2014 1 \u043C\u0435\u0441\u044F\u0446" },
  halfyear: { months: 6, rub: 3666, title: "ASTRODAY \u2014 6 \u043C\u0435\u0441\u044F\u0446\u0435\u0432" },
  year: { months: 12, rub: 6666, title: "ASTRODAY \u2014 12 \u043C\u0435\u0441\u044F\u0446\u0435\u0432" }
});
var FLOOT_ACADEMY_RUB_PRICES = Object.freeze({ month: 1666, halfyear: 3666, year: 6666 });
function planPriceParity() {
  return Object.entries(FLOOT_ACADEMY_RUB_PRICES).every(([key, rub]) => PLANS[key]?.rub === rub);
}
var db = Bun.env.DATABASE_URL ? new SQL(Bun.env.DATABASE_URL) : null;
var ddl = [
  "CREATE TABLE IF NOT EXISTS liz_clients (telegram_id TEXT PRIMARY KEY, telegram_username TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (telegram_id ~ '^[0-9]{1,16}$'))",
  "CREATE TABLE IF NOT EXISTS liz_subscriptions (telegram_id TEXT PRIMARY KEY REFERENCES liz_clients(telegram_id), valid_until TIMESTAMPTZ NOT NULL, last_order_id UUID, source TEXT NOT NULL DEFAULT 'migrated', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "CREATE TABLE IF NOT EXISTS liz_orders (id UUID PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL, telegram_id TEXT NOT NULL REFERENCES liz_clients(telegram_id), plan_code TEXT NOT NULL, plan_months INT NOT NULL CHECK (plan_months IN (1,6,12)), amount_kopeks INT NOT NULL, currency TEXT NOT NULL DEFAULT 'RUB' CHECK (currency='RUB'), provider_payment_id TEXT UNIQUE, confirmation_url TEXT, status TEXT NOT NULL DEFAULT 'creating', receipt_email TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), paid_at TIMESTAMPTZ, activated_at TIMESTAMPTZ, needs_review BOOLEAN NOT NULL DEFAULT FALSE)",
  "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS legal_version TEXT",
  "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ",
  "CREATE INDEX IF NOT EXISTS liz_orders_client_idx ON liz_orders(telegram_id,created_at DESC)",
  "ALTER TABLE liz_clients ADD COLUMN IF NOT EXISTS chat_started_at TIMESTAMPTZ",
  "ALTER TABLE liz_clients ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT FALSE",
  "CREATE INDEX IF NOT EXISTS liz_orders_pending_idx ON liz_orders(status,updated_at)",
  "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS granted_from TIMESTAMPTZ",
  "ALTER TABLE liz_orders ADD COLUMN IF NOT EXISTS granted_until TIMESTAMPTZ",
  "CREATE TABLE IF NOT EXISTS liz_refund_events (provider_refund_id TEXT PRIMARY KEY, order_id UUID NOT NULL REFERENCES liz_orders(id), provider_payment_id TEXT NOT NULL, amount_kopeks INTEGER NOT NULL CHECK(amount_kopeks > 0), currency TEXT NOT NULL CHECK(currency='RUB'), recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "CREATE INDEX IF NOT EXISTS liz_refund_order_idx ON liz_refund_events(order_id,recorded_at)",
  "CREATE TABLE IF NOT EXISTS liz_delivery_health (id SMALLINT PRIMARY KEY CHECK(id=1), last_scheduler_tick TIMESTAMPTZ, last_verified_real_delivery TIMESTAMPTZ, verified_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "INSERT INTO liz_delivery_health (id) VALUES (1) ON CONFLICT DO NOTHING"
];
var schema = (async () => {
  if (!db)
    return false;
  for (const stmt of ddl)
    await db.unsafe(stmt);
  await ensurePaymentSchema(db);
  return true;
})().catch((err) => {
  console.error("Schema initialization failed:", err?.message);
  return false;
});
var resp = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff", ...headers } });
var origin = Bun.env.EXTERNAL_SITE_ORIGIN || "";
function cors(req) {
  const host = req.headers.get("origin") || "";
  return origin && host === origin ? { "Access-Control-Allow-Origin": host, Vary: "Origin", "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } : {};
}
function safeEq(a, b) {
  try {
    const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
    return x.length === 32 && y.length === 32 && timingSafeEqual(x, y);
  } catch {
    return false;
  }
}
function verifyTelegramBrowserLogin(data) {
  if (!Bun.env.TELEGRAM_BOT_TOKEN || !data || typeof data !== "object" || Array.isArray(data))
    return null;
  const o = data;
  if (typeof o.hash !== "string" || !/^[a-f0-9]{64}$/i.test(o.hash))
    return null;
  if (typeof o.id !== "string" && typeof o.id !== "number")
    return null;
  const id = String(o.id);
  if (!/^[1-9][0-9]{0,15}$/.test(id))
    return null;
  if (!/^[0-9]{10}$/.test(String(o.auth_date || "")))
    return null;
  const age = Math.floor(Date.now() / 1000) - Number(o.auth_date);
  if (age < -60 || age > 600)
    return null;
  const allowed = ["auth_date", "first_name", "id", "last_name", "photo_url", "username"];
  const lines = Object.entries(o).filter(([k, v]) => allowed.includes(k) && v !== null && v !== undefined && ["string", "number"].includes(typeof v)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + "=" + String(v));
  if (!lines.some((line) => line === "id=" + id))
    return null;
  const secret = createHash2("sha256").update(Bun.env.TELEGRAM_BOT_TOKEN).digest();
  const expected = createHmac2("sha256", secret).update(lines.join(`
`)).digest("hex");
  if (!safeEq(o.hash, expected))
    return null;
  const username = typeof o.username === "string" && /^[a-z0-9_]{3,32}$/i.test(o.username) ? o.username : null;
  return { id, username };
}
function verifyMiniAppInit(raw) {
  return verifyMiniAppToken(raw, Bun.env.TELEGRAM_BOT_TOKEN || "");
}
function verifyMiniAppToken(raw, token) {
  if (token.length < 30 || typeof raw !== "string" || raw.length < 50 || raw.length > 6000)
    return null;
  const params = new URLSearchParams(raw);
  if ([...params.keys()].length > 50)
    return null;
  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    return null;
  const hash = params.get("hash") || "";
  const authDate = params.get("auth_date") || "";
  if (!/^[0-9a-f]{64}$/i.test(hash) || !/^[0-9]{10}$/.test(authDate))
    return null;
  const age = Math.floor(Date.now() / 1000) - Number(authDate);
  if (age < -60 || age > 86400)
    return null;
  const check = entries.filter(([key]) => key !== "hash" && key !== "signature").sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([key, val]) => key + "=" + val).join(`
`);
  const secret = createHmac2("sha256", "WebAppData").update(token).digest();
  const signature = createHmac2("sha256", secret).update(check).digest("hex");
  if (!safeEq(hash, signature))
    return null;
  let user;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    return null;
  }
  const id = String(user?.id || "");
  if (!/^[1-9][0-9]{0,15}$/.test(id))
    return null;
  const username = typeof user.username === "string" && /^[a-z0-9_]{3,32}$/i.test(user.username) ? user.username : null;
  return { id, username };
}
function localParts(d, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d).map((z) => [z.type, z.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
}
function goodZone(s) {
  if (typeof s !== "string" || s.length < 2 || s.length > 75)
    return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: s });
    return true;
  } catch {
    return false;
  }
}
function validateDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s))
    return null;
  const d = new Date(s + "T00:00:00.000Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s || d.getUTCFullYear() < 1900 || d.getTime() > Date.now())
    return null;
  return d;
}
function localBirthToUtc(day, time, zone) {
  const [y, mo, d] = day.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  const targetMs = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offsets = new Set;
  for (const days of [-3, -2, -1, 0, 1, 2, 3]) {
    const sampled = targetMs + days * 86400000;
    const p = localParts(new Date(sampled), zone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    offsets.add(represented - Math.floor(sampled / 1000) * 1000);
  }
  const matches = [];
  for (const offset of offsets) {
    const utcMs = targetMs - offset, p = localParts(new Date(utcMs), zone);
    if (p.year === y && p.month === mo && p.day === d && p.hour === h && p.minute === mi && p.second === 0)
      matches.push(utcMs);
  }
  const unique = [...new Set(matches)];
  if (unique.length === 0)
    throw Error("\u0412\u0440\u0435\u043C\u044F \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u043D\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C \u0447\u0430\u0441\u043E\u0432\u043E\u043C \u043F\u043E\u044F\u0441\u0435 (\u043F\u0435\u0440\u0435\u0445\u043E\u0434 \u0447\u0430\u0441\u043E\u0432).");
  if (unique.length > 1)
    throw Error("\u041D\u0435\u043E\u0434\u043D\u043E\u0437\u043D\u0430\u0447\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0438\u0437-\u0437\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430 \u0447\u0430\u0441\u043E\u0432. \u0423\u043A\u0430\u0436\u0438 \u0432\u0440\u0435\u043C\u044F \u0441 \u0442\u043E\u0447\u043D\u044B\u043C UTC-\u0441\u043C\u0435\u0449\u0435\u043D\u0438\u0435\u043C \u0447\u0435\u0440\u0435\u0437 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0443.");
  return new Date(unique[0]).toISOString();
}
function testSecurityBasics() {
  const tests = [];
  const add = (name, v) => tests.push({ name, pass: !!v });
  const demoToken = "0123456789:ABCDEF_dummy_token_never_used";
  const base = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 123456789, username: "demo_test" }) });
  const params = [...base.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, v]) => k + "=" + v).join(`
`);
  const secret = createHmac2("sha256", "WebAppData").update(demoToken).digest();
  const hash = createHmac2("sha256", secret).update(params).digest("hex");
  base.set("hash", hash);
  const good = verifyMiniAppToken(base.toString(), demoToken);
  add("telegram_valid_hmac", good?.id === "123456789");
  const tampered = new URLSearchParams(base);
  tampered.set("user", JSON.stringify({ id: 111111111 }));
  add("telegram_tampered_rejected", verifyMiniAppToken(tampered.toString(), demoToken) === null);
  const duplicate = new URLSearchParams(base);
  duplicate.append("user", base.get("user") || "");
  add("telegram_duplicate_keys_rejected", verifyMiniAppToken(duplicate.toString(), demoToken) === null);
  const expired = new URLSearchParams(base);
  expired.set("auth_date", String(Math.floor(Date.now() / 1000) - 90000));
  add("telegram_stale_rejected", verifyMiniAppToken(expired.toString(), demoToken) === null);
  add("valid_timezone", goodZone("Europe/Moscow") && goodZone("Asia/Makassar"));
  add("invalid_timezone_rejected", !goodZone("Bogus/Invalid"));
  add("invalid_date_rejected", !validateDate("2026-02-30"));
  try {
    add("local_utc_conversion", localBirthToUtc("2000-07-15", "11:00", "Europe/Moscow") === "2000-07-15T07:00:00.000Z");
  } catch {
    add("local_utc_conversion", false);
  }
  try {
    localBirthToUtc("2026-03-29", "02:30", "Europe/Berlin");
    add("dst_gap_rejected", false);
  } catch {
    add("dst_gap_rejected", true);
  }
  try {
    localBirthToUtc("2026-10-25", "02:30", "Europe/Berlin");
    add("dst_ambiguous_rejected", false);
  } catch {
    add("dst_ambiguous_rejected", true);
  }
  add("floot_academy_price_parity", planPriceParity());
  add("yookassa_exact_money", exactKopeks("1666.00") === 166600 && exactKopeks("3666.00") === 366600 && exactKopeks("6666.00") === 666600);
  add("yookassa_rejects_fractional_kopeks", exactKopeks("1666.001") === null && exactKopeks("1666.0") === null);
  add("yookassa_rejects_negative_amounts", exactKopeks("-1666.00") === null);
  add("provider_payload_is_idempotently_stable", JSON.stringify(buildProviderPayment("order-demo", "month", "demo@example.test")) === JSON.stringify(buildProviderPayment("order-demo", "month", "demo@example.test")));
  add("provider_payload_contains_order_binding", buildProviderPayment("order-demo", "month", "demo@example.test").metadata.order_id === "order-demo");
  return { pass: tests.every((x) => x.pass), passed: tests.filter((x) => x.pass).length, total: tests.length, tests };
}
var securitySelftest = testSecurityBasics();
console.log("PAYMENT_API_SECURITY_SELFTEST " + JSON.stringify(securitySelftest));
var profileDDL = [
  "CREATE TABLE IF NOT EXISTS liz_birth_profiles (telegram_id TEXT PRIMARY KEY REFERENCES liz_clients(telegram_id),birth_at_iso TEXT NOT NULL,birth_local_date DATE NOT NULL,birth_lat DOUBLE PRECISION,birth_lon DOUBLE PRECISION,birth_time_verified BOOLEAN NOT NULL DEFAULT FALSE,birth_timezone TEXT NOT NULL,time_zone TEXT NOT NULL,delivery_hour_local SMALLINT NOT NULL DEFAULT 8 CHECK(delivery_hour_local BETWEEN 0 AND 23),consented_to_daily BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(birth_lat IS NULL OR birth_lat BETWEEN -85 AND 85),CHECK(birth_lon IS NULL OR birth_lon BETWEEN -180 AND 180))",
  "CREATE TABLE IF NOT EXISTS liz_daily_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),telegram_id TEXT NOT NULL REFERENCES liz_clients(telegram_id),forecast_date DATE NOT NULL,body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 20000),due_at TIMESTAMPTZ NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempt_count INT NOT NULL DEFAULT 0,telegram_message_id TEXT,sent_at TIMESTAMPTZ,claim_at TIMESTAMPTZ,error_code TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(telegram_id,forecast_date))",
  "ALTER TABLE liz_birth_profiles ADD COLUMN IF NOT EXISTS birth_timezone TEXT",
  "ALTER TABLE liz_birth_profiles ADD COLUMN IF NOT EXISTS preferred_name TEXT",
  "ALTER TABLE liz_birth_profiles ADD COLUMN IF NOT EXISTS birth_city_id BIGINT",
  "ALTER TABLE liz_birth_profiles ADD COLUMN IF NOT EXISTS current_city_id BIGINT",
  "ALTER TABLE liz_birth_profiles ADD COLUMN IF NOT EXISTS birth_city_name TEXT",
  "ALTER TABLE liz_birth_profiles ADD COLUMN IF NOT EXISTS current_city_name TEXT",
  "ALTER TABLE liz_birth_profiles ADD COLUMN IF NOT EXISTS current_lat DOUBLE PRECISION",
  "ALTER TABLE liz_birth_profiles ADD COLUMN IF NOT EXISTS current_lon DOUBLE PRECISION",
  "UPDATE liz_birth_profiles SET birth_timezone=time_zone WHERE birth_timezone IS NULL OR birth_timezone=''",
  "ALTER TABLE liz_birth_profiles ALTER COLUMN birth_timezone SET NOT NULL",
  "CREATE INDEX IF NOT EXISTS liz_daily_due_idx ON liz_daily_messages(status,due_at)"
];
var profileSchema = (async () => {
  if (!db || !await schema)
    return false;
  for (const stmt of profileDDL)
    await db.unsafe(stmt);
  const checks = await db.unsafe("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='liz_daily_messages'::regclass AND conname IN ('liz_daily_messages_body_check','liz_daily_messages_body_limit_v2')");
  if (checks.some((x) => x.conname === "liz_daily_messages_body_check" && String(x.definition).includes("4000")))
    await db.unsafe("ALTER TABLE liz_daily_messages DROP CONSTRAINT liz_daily_messages_body_check");
  if (!checks.some((x) => x.conname === "liz_daily_messages_body_limit_v2"))
    await db.unsafe("ALTER TABLE liz_daily_messages ADD CONSTRAINT liz_daily_messages_body_limit_v2 CHECK (char_length(body) BETWEEN 1 AND 20000)");
  return true;
})().catch((e) => {
  console.error("Profile schema failed", String(e.message || e));
  return false;
});
profileSchema.then((ok) => console.log("PROFILE_DB_SCHEMA_READINESS " + JSON.stringify({ ready: ok })));
async function searchGeoCities(req, send) {
  if (!db || !await schema)
    return send({ error: "Directory database unavailable" }, 503);
  const url = new URL(req.url), raw = (url.searchParams.get("q") || "").trim().normalize("NFKC");
  if (raw.length < 2)
    return send({ cities: [], source: "GeoNames", attribution: "https://www.geonames.org/" });
  if (raw.length > 55 || !/^[\p{L}\p{M}\s'-]+$/u.test(raw))
    return send({ error: "City query must contain 2\u201355 letters" }, 400);
  const input = raw.toLocaleLowerCase("ru-RU"), prefix = input + "%";
  const projection = "SELECT city_id::text AS id,name_ru AS name,name AS international_name,country_ru AS country,country_code,region_code,latitude,longitude,time_zone AS timezone,population FROM liz_geo_cities ";
  let found = await db.unsafe(projection + "WHERE lower(name_ru) LIKE $1 OR lower(name_ascii) LIKE $1 ORDER BY CASE WHEN lower(name_ru)=$2 THEN 0 WHEN lower(name_ru) LIKE $1 THEN 1 ELSE 2 END,population DESC LIMIT 12", [prefix, input]);
  if (found.length < 9) {
    const aliases = await db.unsafe(projection + "WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(aliases) a(alias) WHERE lower(a.alias) LIKE $1) ORDER BY population DESC LIMIT 15", [prefix]);
    const seen = new Set(found.map((x) => String(x.id)));
    for (const item of aliases)
      if (!seen.has(String(item.id)) && found.length < 12) {
        found.push(item);
        seen.add(String(item.id));
      }
  }
  return send({ cities: found.map((x) => ({ id: String(x.id), name: x.name, country: x.country, countryCode: x.country_code, regionCode: x.region_code, latitude: x.latitude, longitude: x.longitude, timezone: x.timezone })), source: "GeoNames", attribution: "https://www.geonames.org/" });
}
async function secureTesterClaim(req, send) {
  if (!db || !await tgForecastSchema)
    return send({ error: "\u041F\u0440\u043E\u0444\u0438\u043B\u0438 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B" }, 503);
  const data = await parseBody(req), who = verifyMiniAppInit(data.telegramInitData);
  if (!who)
    return send({ error: "\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0438\u0437 \u0431\u043E\u0442\u0430" }, 401);
  if (data.consent !== true)
    return send({ error: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438 \u0443\u0447\u0430\u0441\u0442\u0438\u0435 \u0438 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043D\u0430 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F" }, 400);
  const result = await activateTester(db, who.id, who.username);
  return send(result, result.ok ? 200 : 403);
}
async function secureMiniProfile(req, send) {
  if (!db || !await profileSchema)
    return send({ error: "Profile database unavailable" }, 503);
  if (!Bun.env.TELEGRAM_BOT_TOKEN)
    return send({ error: "Telegram bot connection is not configured" }, 503);
  const data = await parseBody(req), ident = verifyMiniAppInit(data.telegramInitData);
  if (!ident)
    return send({ error: "Invalid Telegram Mini App signature; reopen Mini App from the bot" }, 401);
  if (data.consent !== true)
    return send({ error: "Privacy consent required" }, 400);
  let birthCity = null, currentCity = null;
  const suppliedCityIds = data.birthCityId !== undefined || data.currentCityId !== undefined;
  if (suppliedCityIds) {
    if (!/^[0-9]{1,12}$/.test(String(data.birthCityId || "")) || !/^[0-9]{1,12}$/.test(String(data.currentCityId || "")))
      return send({ error: "Choose both cities from the autocomplete list" }, 400);
    const rows = await db.unsafe("SELECT city_id::text AS id,name_ru,latitude,longitude,time_zone FROM liz_geo_cities WHERE city_id IN ($1::bigint,$2::bigint)", [String(data.birthCityId), String(data.currentCityId)]);
    birthCity = rows.find((x) => String(x.id) === String(data.birthCityId));
    currentCity = rows.find((x) => String(x.id) === String(data.currentCityId));
    if (!birthCity || !currentCity)
      return send({ error: "Chosen city was not found in the verified directory" }, 422);
  }
  const birthZone = birthCity?.time_zone || data.birthTimezone, forecastZone = currentCity?.time_zone || data.forecastTimezone;
  if (!validateDate(data.birthDate) || !goodZone(birthZone) || !goodZone(forecastZone))
    return send({ error: "Birth date and valid city timezones required" }, 400);
  const time = data.birthTime === null || data.birthTime === "" || data.birthTime === undefined ? null : String(data.birthTime);
  if (time !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    return send({ error: "Invalid birth time HH:MM" }, 400);
  const rawLat = birthCity?.latitude ?? data.birthLatitude, rawLon = birthCity?.longitude ?? data.birthLongitude;
  const lat = rawLat === null || rawLat === undefined ? null : Number(rawLat);
  const lon = rawLon === null || rawLon === undefined ? null : Number(rawLon);
  if (lat === null !== (lon === null) || lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180))
    return send({ error: "Valid birth latitude and longitude required together or omitted together" }, 400);
  const preferredName = typeof data.preferredName === "string" ? data.preferredName.trim() : "";
  if (preferredName.length > 36 || preferredName !== "" && !/^[\p{L}][\p{L}\p{M}\s'-]{0,35}$/u.test(preferredName))
    return send({ error: "Preferred name must be 1\u201336 letters and common name separators" }, 400);
  const hour = data.deliveryHour;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23)
    return send({ error: "Invalid delivery hour" }, 400);
  let utcBirth;
  try {
    utcBirth = localBirthToUtc(data.birthDate, time || "12:00", birthZone);
  } catch (err) {
    return send({ error: String(err.message || "invalid_birth_time") }, 422);
  }
  const verified = !!time && lat !== null && lon !== null;
  await db.unsafe("INSERT INTO liz_clients(telegram_id,telegram_username) VALUES($1,$2) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username=COALESCE(EXCLUDED.telegram_username,liz_clients.telegram_username),updated_at=NOW()", [ident.id, ident.username]);
  await db.unsafe("INSERT INTO liz_birth_profiles(telegram_id,birth_at_iso,birth_local_date,birth_lat,birth_lon,birth_time_verified,birth_timezone,time_zone,delivery_hour_local,consented_to_daily,preferred_name,birth_city_id,current_city_id,birth_city_name,current_city_name,current_lat,current_lon) VALUES($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,NULLIF($11,''),$12::bigint,$13::bigint,$14,$15,$16,$17) ON CONFLICT(telegram_id) DO UPDATE SET birth_at_iso=EXCLUDED.birth_at_iso,birth_local_date=EXCLUDED.birth_local_date,birth_lat=EXCLUDED.birth_lat,birth_lon=EXCLUDED.birth_lon,birth_time_verified=EXCLUDED.birth_time_verified,birth_timezone=EXCLUDED.birth_timezone,time_zone=EXCLUDED.time_zone,delivery_hour_local=EXCLUDED.delivery_hour_local,consented_to_daily=EXCLUDED.consented_to_daily,preferred_name=EXCLUDED.preferred_name,birth_city_id=EXCLUDED.birth_city_id,current_city_id=EXCLUDED.current_city_id,birth_city_name=EXCLUDED.birth_city_name,current_city_name=EXCLUDED.current_city_name,current_lat=EXCLUDED.current_lat,current_lon=EXCLUDED.current_lon,updated_at=NOW()", [ident.id, utcBirth, data.birthDate, lat, lon, verified, birthZone, forecastZone, hour, true, preferredName, birthCity?.id || null, currentCity?.id || null, birthCity?.name_ru || null, currentCity?.name_ru || null, currentCity?.latitude ?? null, currentCity?.longitude ?? null]);
  await db.unsafe("DELETE FROM liz_daily_messages WHERE telegram_id=$1 AND status='pending'", [ident.id]);
  return send({ ok: true, identityVerified: true, housePrecision: verified ? "accurate_time_and_location" : "unavailable_without_verified_time_and_location", dataMigratedFromFloot: false });
}
async function secureMiniForecast(req, send) {
  if (!db || !await profileSchema)
    return send({ error: "Forecast database unavailable" }, 503);
  if (!Bun.env.TELEGRAM_BOT_TOKEN)
    return send({ error: "Telegram bot connection is not configured" }, 503);
  const data = await parseBody(req), ident = verifyMiniAppInit(data.telegramInitData);
  if (!ident)
    return send({ error: "Invalid Telegram Mini App signature" }, 401);
  const rows = await db.unsafe("SELECT p.*,p.birth_local_date::text AS birth_local_day,s.valid_until FROM liz_birth_profiles p JOIN liz_subscriptions s ON p.telegram_id=s.telegram_id WHERE p.telegram_id=$1 AND s.valid_until>NOW() AND p.consented_to_daily=TRUE", [ident.id]);
  if (!rows.length)
    return send({ error: "No confirmed active subscription and birth profile for this Telegram account" }, 402);
  const item = rows[0], now = new Date;
  let parts;
  try {
    parts = localParts(now, item.time_zone);
  } catch {
    return send({ error: "Invalid stored timezone" }, 503);
  }
  const day = [parts.year, String(parts.month).padStart(2, "0"), String(parts.day).padStart(2, "0")].join("-");
  let existing = await db.unsafe("SELECT body,status FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date=$2::date", [ident.id, day]);
  if (existing.length)
    return send({ forecast: { date: day, body: existing[0].body, deliveryStatus: existing[0].status } });
  const token = Bun.env.ASTRO_INTERNAL_TOKEN || "", astroUrl = Bun.env.ASTRO_API_URL || "";
  if (token.length < 32 || !astroUrl.startsWith("http://liz-astro.railway.internal:3000/"))
    return send({ error: "Forecast engine is not connected" }, 503);
  const payload = { forecastAt: now.toISOString(), timeZone: item.time_zone, birth: { at: item.birth_at_iso, localDate: item.birth_local_day, accurateBirthTime: item.birth_time_verified === true, latitude: item.birth_lat, longitude: item.birth_lon } };
  const result = await fetch(astroUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
  if (!result.ok)
    return send({ error: "Forecast calculation unavailable" }, 503);
  const calculated = await result.json();
  if (calculated?.calculation?.day !== day || typeof calculated?.text !== "string" || calculated.text.length < 40 || calculated.text.length > 20000)
    return send({ error: "Forecast failed validation" }, 503);
  await db.unsafe("INSERT INTO liz_daily_messages(telegram_id,forecast_date,body,due_at) VALUES($1,$2::date,$3,NOW()) ON CONFLICT(telegram_id,forecast_date) DO NOTHING", [ident.id, day, calculated.text]);
  existing = await db.unsafe("SELECT body,status FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date=$2::date", [ident.id, day]);
  return send({ forecast: { date: day, body: existing[0]?.body || calculated.text, deliveryStatus: existing[0]?.status || "pending" } });
}
var REVIEW_DEADLINE = "2026-11-20T00:00:00.000Z";
function exportHtmlEscape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function asRussianDate(s) {
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d) : s;
}
async function reviewerMonthExport(req) {
  const unavailable = () => Response.json({ error: "This preview is not available" }, { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  if (!isStaging() || new Date > new Date(REVIEW_DEADLINE) || !db || !await profileSchema)
    return unavailable();
  const address = new URL(req.url), given = address.searchParams.get("token") || "", expected = Bun.env.ASTRODAY_REVIEW_LINK_TOKEN || "";
  if (expected.length !== 64 || !safeEq(given, expected))
    return unavailable();
  const fmt = address.searchParams.get("format") || "html";
  if (!["html", "json", "txt"].includes(fmt))
    return unavailable();
  const profile = await db.unsafe("SELECT telegram_username,display_name,birth_local_date::text AS birth_day,birth_local_time,birth_city,birth_region,birth_zone,birth_time_precision,trial_start::text AS trial_start,trial_end_exclusive::text AS trial_end,identity_status,consent_status FROM liz_astro_testers WHERE handle_key='ministreliya_290' LIMIT 1");
  if (profile.length !== 1)
    return Response.json({ error: "test_profile_missing" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const rows = await db.unsafe("SELECT forecast_day::text AS day,forecast_at::text AS forecast_at,calculation,lunar_day,calculation_version,editorial_text,editorial_source,telegram_html_parts FROM liz_astro_tester_daily_calcs WHERE handle_key='ministreliya_290' AND forecast_day>='2026-11-13'::date AND forecast_day<'2026-12-18'::date ORDER BY forecast_day ASC");
  if (rows.length !== 35 || rows.some((r) => !r.editorial_text || !r.calculation))
    return Response.json({ error: "monthly_data_not_complete", expected: 35, actual: rows.length }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const transitWindows = await db.unsafe("SELECT aspect_key,pass_index,payload FROM liz_astro_tester_transit_windows WHERE handle_key='ministreliya_290' AND window_method='observed-daily-orb-plus-exact-passes-v1' ORDER BY aspect_key,pass_index");
  const person = profile[0], entries = rows.map((r) => ({
    date: r.day,
    forecastAtUtc: new Date(r.forecast_at).toISOString(),
    lunarDay: r.lunar_day,
    calculation: r.calculation,
    calculationVersion: r.calculation_version,
    preparedText: r.editorial_text,
    textSource: r.editorial_source,
    telegramHtmlParts: r.telegram_html_parts
  }));
  const data = { export: "ASTRODAY tester monthly forecast (staging)", generatedFrom: "Existing PostgreSQL saved forecast calculations, not recalculated", profile: {
    telegramUsername: "@" + person.telegram_username,
    preferredName: person.display_name,
    birthLocalDate: person.birth_day,
    birthLocalTime: person.birth_local_time,
    birthCity: person.birth_city,
    birthRegion: person.birth_region,
    birthTimezone: person.birth_zone,
    birthTimePrecision: person.birth_time_precision,
    timezoneForDailyExamples: person.birth_zone,
    timezoneAssumption: "Current city not provided. Birth city timezone used for daily examples.",
    trialStart: person.trial_start,
    trialEndExclusive: person.trial_end
  }, disclaimer: "Calculated_template previews; not Claude-written or manually edited; not sent to Telegram. Symbolic astrological interpretations are not factual predictions.", count: entries.length, monthlyTransitWindows: transitWindows.map((w) => w.payload), days: entries };
  const baseheaders = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
  if (fmt === "json")
    return new Response(JSON.stringify(data, null, 2), { headers: { ...baseheaders, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="ASTRODAY_Ksenechka_2026-11-13_2026-12-12.json"' } });
  if (fmt === "txt") {
    const t = [
      "ASTRODAY | " + data.profile.telegramUsername + " | 13.11.2026\u201317.12.2026",
      "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A: \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0440\u0430\u0441\u0447\u0451\u0442\u044B Railway PostgreSQL; 35 \u0434\u043D\u0435\u0439. \u041D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E.",
      "\u0414\u0430\u0442\u0430 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F: " + person.birth_day + " " + person.birth_local_time + ", " + person.birth_city + ", " + person.birth_region + "; " + person.birth_zone,
      "\u0427\u0430\u0441\u043E\u0432\u043E\u0439 \u043F\u043E\u044F\u0441 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0445 \u043F\u0440\u0438\u043C\u0435\u0440\u043E\u0432 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0439, \u043F\u043E \u043C\u0435\u0441\u0442\u0443 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F.",
      ...entries.map((r, i) => `

` + "\u2550".repeat(54) + `
` + (i + 1) + ". " + asRussianDate(r.date) + `
` + "\u2550".repeat(54) + `

\u0422\u0415\u041A\u0421\u0422 \u041F\u0420\u041E\u0413\u041D\u041E\u0417\u0410
` + r.preparedText + `

\u0420\u0410\u0421\u0427\u0401\u0422 \u0414\u041D\u042F (JSON)
` + JSON.stringify({ forecastAtUtc: r.forecastAtUtc, lunarDay: r.lunarDay, calculationVersion: r.calculationVersion, calculation: r.calculation }, null, 2))
    ].join(`
`);
    return new Response(t, { headers: { ...baseheaders, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="ASTRODAY_Ksenechka_month_full.txt"' } });
  }
  const link = (format) => "/v1/staging/tester-month?token=" + encodeURIComponent(given) + "&format=" + format;
  const formatted = entries.map((r, i) => {
    const calc = r.calculation || {};
    const allAspects = Array.isArray(calc.aspects) ? calc.aspects : [];
    const lunar = r.lunarDay && typeof r.lunarDay === "object" ? r.lunarDay : null;
    const parts = Array.isArray(r.telegramHtmlParts) ? r.telegramHtmlParts : [];
    const safeTg = parts.map((part) => '<div class="telegram">' + exportHtmlEscape(part).replace(/&lt;(\/?)(b|i)&gt;/g, "<$1$2>") + "</div>").join("");
    const localHH = (iso) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: person.birth_zone }).format(new Date(iso));
    const aspects = allAspects.map((a) => "<tr><td>" + exportHtmlEscape(a.transit) + "</td><td>" + exportHtmlEscape(a.aspect) + "</td><td>" + exportHtmlEscape(a.natal) + "</td><td>" + exportHtmlEscape(a.orb) + "\xB0</td><td>" + exportHtmlEscape(a.motion || "\u2014") + "</td><td>" + exportHtmlEscape(a.transitHouse ?? "\u2014") + " / " + exportHtmlEscape(a.natalHouse ?? "\u2014") + "</td></tr>").join("");
    const exacts = calc.dayExactContacts?.personalExact || [];
    const skyExact = calc.dayExactContacts?.skyExact || [];
    const ingresses = calc.dayExactContacts?.ingresses || [];
    const stations = calc.dayExactContacts?.stations || [];
    const exactRows = exacts.map((x) => "<tr><td>" + exportHtmlEscape(localHH(x.exactAtUtc)) + "</td><td>" + exportHtmlEscape(x.transitingBody) + "</td><td>" + exportHtmlEscape(x.aspect) + "</td><td>" + exportHtmlEscape(x.otherBody) + "</td></tr>").join("");
    const skyRows = skyExact.map((x) => "<tr><td>" + exportHtmlEscape(localHH(x.exactAtUtc)) + "</td><td>" + exportHtmlEscape(x.transitingBody) + "</td><td>" + exportHtmlEscape(x.aspect) + "</td><td>" + exportHtmlEscape(x.otherBody) + "</td></tr>").join("");
    const ingressRows = ingresses.map((x) => "<tr><td>" + exportHtmlEscape(localHH(x.exactAtUtc)) + "</td><td>" + exportHtmlEscape(x.body) + "</td><td>" + exportHtmlEscape(x.fromSign) + " \u2192 " + exportHtmlEscape(x.toSign) + "</td></tr>").join("");
    const stationRows = stations.map((x) => "<tr><td>" + exportHtmlEscape(localHH(x.exactAtUtc)) + "</td><td>" + exportHtmlEscape(x.body) + "</td><td>" + exportHtmlEscape(x.fromMotion) + " \u2192 " + exportHtmlEscape(x.toMotion) + "</td></tr>").join("");
    return '<section class="day" id="day-' + (i + 1) + '"><div class="idx">\u0414\u0415\u041D\u042C ' + (i + 1) + " / 35</div><h2>" + exportHtmlEscape(asRussianDate(r.date)) + "</h2>" + '<p class="small">\uD83C\uDF19 \u041B\u0443\u043D\u043D\u044B\u0435 \u0441\u0443\u0442\u043A\u0438: ' + exportHtmlEscape(lunar?.lunarDay ?? "\u043D\u0435 \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u044B") + " \xB7 \u041B\u0443\u043D\u0430: " + exportHtmlEscape(calc.transitingMoon?.sign?.name ?? "\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430") + " \xB7 \u041D\u0430\u0442\u0430\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043C \u041B\u0443\u043D\u044B: " + exportHtmlEscape(calc.transitingMoon?.natalHouse ?? "\u043D\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D") + "</p>" + '<div class="telegram-wrap">' + (safeTg || '<pre class="copy">' + exportHtmlEscape(r.preparedText) + "</pre>") + "</div>" + "<details><summary>\u0412\u0441\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u043B\u0438\u0447\u043D\u044B\u0435 \u0430\u0441\u043F\u0435\u043A\u0442\u044B \u043D\u0430 08:00 (" + allAspects.length + ")</summary><table><thead><tr><th>\u0422\u0440\u0430\u043D\u0437\u0438\u0442</th><th>\u0410\u0441\u043F\u0435\u043A\u0442</th><th>\u041D\u0430\u0442\u0430\u043B\u044C\u043D\u0430\u044F</th><th>\u041E\u0440\u0431</th><th>\u0414\u0432\u0438\u0436\u0435\u043D\u0438\u0435</th><th>\u0414\u043E\u043C\u0430: \u0442\u0440\u0430\u043D\u0437\u0438\u0442/\u043D\u0430\u0442\u0430\u043B</th></tr></thead><tbody>" + aspects + "</tbody></table></details>" + "<details><summary>\u0422\u043E\u0447\u043D\u044B\u0435 \u043B\u0438\u0447\u043D\u044B\u0435 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B \u0437\u0430 \u0441\u0443\u0442\u043A\u0438 (" + exacts.length + ")</summary><table><tbody>" + exactRows + "</tbody></table></details>" + "<details><summary>\u0422\u043E\u0447\u043D\u044B\u0435 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B \u043E\u0431\u0449\u0435\u0433\u043E \u043D\u0435\u0431\u0430 (" + skyExact.length + ")</summary><table><tbody>" + skyRows + "</tbody></table></details>" + "<details><summary>\u041F\u0435\u0440\u0435\u0445\u043E\u0434\u044B \u0437\u043D\u0430\u043A\u043E\u0432 (" + ingresses.length + ") \u0438 \u0440\u0430\u0437\u0432\u043E\u0440\u043E\u0442\u044B (" + stations.length + ")</summary><table><tbody>" + ingressRows + stationRows + "</tbody></table></details>" + '<details><summary>\u041F\u043E\u043B\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442 \u0434\u043D\u044F \xB7 JSON</summary><pre class="json">' + exportHtmlEscape(JSON.stringify({ forecastAtUtc: r.forecastAtUtc, lunarDay: lunar, calculationVersion: r.calculationVersion, calculation: r.calculation }, null, 2)) + "</pre></details>" + '<details><summary>\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0442\u0435\u043A\u0441\u0442 \u0431\u0435\u0437 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u044F Telegram</summary><pre class="copy">' + exportHtmlEscape(r.preparedText) + "</pre></details></section>";
  }).join("");
  const windowTable = transitWindows.map((w) => "<tr><td>" + exportHtmlEscape(w.aspect_key) + "</td><td>" + exportHtmlEscape(w.payload?.firstObservedLocalDay) + " \u2014 " + exportHtmlEscape(w.payload?.lastObservedLocalDay) + "</td><td>" + exportHtmlEscape(w.payload?.minOrbAt08Local ?? "\u2014") + "\xB0</td><td>" + exportHtmlEscape(w.payload?.exactContactsUtc?.length || 0) + "</td></tr>").join("");
  const monthlyWindowsSection = '<details class="intro" style="margin-top:18px"><summary>\u041C\u0435\u0441\u044F\u0447\u043D\u044B\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0442\u0440\u0430\u043D\u0437\u0438\u0442\u043E\u0432 (' + transitWindows.length + ')</summary><p class="small">\u0413\u0440\u0430\u043D\u0438\u0446\u044B \u043E\u043A\u043E\u043D \u0443\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u043E \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u043C \u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u044F\u043C \u0432 08:00, \u0430 \u043D\u0435 \u043A\u0430\u043A \u0442\u043E\u0447\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0432\u0445\u043E\u0434\u0430 \u0438 \u0432\u044B\u0445\u043E\u0434\u0430 \u0438\u0437 \u043E\u0440\u0431\u0430. \u0422\u043E\u0447\u043D\u044B\u0435 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u044B \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E.</p><table><thead><tr><th>\u0422\u0440\u0430\u043D\u0437\u0438\u0442/\u043D\u0430\u0442\u0430\u043B/\u0443\u0433\u043E\u043B</th><th>\u0414\u0430\u0442\u044B \u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u044F</th><th>\u041C\u0438\u043D. \u043E\u0440\u0431</th><th>\u0422\u043E\u0447\u043D\u044B\u0445 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u0432</th></tr></thead><tbody>' + windowTable + "</tbody></table></details>";
  const toc = entries.map((r, i) => '<a href="#day-' + (i + 1) + '">' + exportHtmlEscape(r.date.slice(5)) + "</a>").join("");
  const page = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>ASTRODAY \xB7 \u041A\u0441\u0435\u043D\u0435\u0447\u043A\u0430 \xB7 35 \u0434\u043D\u0435\u0439</title><style>' + 'body{margin:0;background:#180f1e;color:#f3e8ee;font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:880px;margin:auto;padding:30px 18px 95px}h1{font:400 40px/1.1 Georgia,serif;margin:10px 0}h2{font:400 31px Georgia,serif;color:#f1cfe0}.subtitle,.small{color:#c9b0be;font-size:13px}.kicker,.idx{letter-spacing:.16em;color:#dfafc8;font-size:11px;font-weight:700}.intro{padding:25px 24px;border:1px solid #734b63;border-radius:17px;background:#261724}.nav{display:flex;flex-wrap:wrap;gap:6px;margin:22px 0}.nav a,.actions a{border:1px solid #885671;border-radius:9px;padding:7px 10px;color:#f8e3ec;text-decoration:none;background:#342030}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.actions a{padding:10px 14px}.day{margin:26px 0;padding:25px 24px;border:1px solid #6e4b62;border-radius:18px;background:#241728}.telegram-wrap{border-radius:14px;background:#36223a;padding:20px 19px;margin:22px 0}.telegram{white-space:pre-wrap;word-break:break-word;margin:0 0 16px;line-height:1.7}.telegram:last-child{margin:0}details{border-top:1px solid #6a4b5f;padding:12px 0}summary{cursor:pointer;color:#efc4d9}pre.copy,pre.json{white-space:pre-wrap;overflow-wrap:anywhere;background:#1d141f;padding:14px;border-radius:8px;font-size:12px}table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}td,th{border-bottom:1px solid #63455b;padding:6px;text-align:left}small{font-size:11px}@media print{body{color:black;background:white}main{max-width:none;padding:0}.intro,.day,.telegram-wrap{background:white;color:black;border-color:#ddd}.day{break-before:page;break-inside:avoid}h2,.kicker,.idx,summary{color:#333}.nav,.actions{display:none}.small,.subtitle{color:#444}details{display:none}}' + '</style></head><body><main><div class="intro"><div class="kicker">LIZ_TY666 \xB7 \u0427\u0410\u0421\u0422\u041D\u0410\u042F \u041F\u0420\u041E\u0412\u0415\u0420\u041A\u0410 \xB7 STAGING</div><h1>35 \u0434\u043D\u0435\u0439 \u0434\u043B\u044F \u041A\u0441\u0435\u043D\u0435\u0447\u043A\u0438</h1><p class="subtitle">' + "13 \u043D\u043E\u044F\u0431\u0440\u044F \u2014 12 \u0434\u0435\u043A\u0430\u0431\u0440\u044F 2026 \xB7 @ministreliya_290</p><p>\u0420\u043E\u0436\u0434\u0435\u043D\u0438\u0435: 29 \u043E\u043A\u0442\u044F\u0431\u0440\u044F 2001, 17:45, \u041F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u0430\u044F, \u041A\u0435\u043C\u0435\u0440\u043E\u0432\u0441\u043A\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C. \u0415\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0440\u0430\u0441\u0447\u0451\u0442\u044B \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u043D\u0430 08:00 \u043F\u043E \u0447\u0430\u0441\u043E\u0432\u043E\u043C\u0443 \u043F\u043E\u044F\u0441\u0443 \u043C\u0435\u0441\u0442\u0430 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F (\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0435 \u0434\u043E\u043F\u0443\u0449\u0435\u043D\u0438\u0435).</p>" + '<p class="subtitle">\u0417\u0434\u0435\u0441\u044C <strong>\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435</strong> \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u044B\u0435 \u0442\u0435\u043A\u0441\u0442\u044B \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F, \u043D\u0435 \u043D\u043E\u0432\u0430\u044F \u0430\u0432\u0442\u043E\u0440\u0441\u043A\u0430\u044F \u0440\u0435\u0434\u0430\u043A\u0442\u0443\u0440\u0430. \u042D\u0442\u043E \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0430\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430.</p>' + '<div class="actions"><a href="' + link("json") + '">\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0430\u0441\u0447\u0451\u0442\u044B \xB7 JSON</a><a href="' + link("txt") + '">\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442 + \u0440\u0430\u0441\u0447\u0451\u0442\u044B \xB7 TXT</a></div></div>' + '<nav class="nav" aria-label="\u041F\u0435\u0440\u0435\u0445\u043E\u0434 \u043F\u043E \u0434\u043D\u044F\u043C">' + toc + "</nav>" + monthlyWindowsSection + formatted + '<p class="subtitle">\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0430\u0441\u0442\u0440\u043E\u043D\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0440\u0430\u0441\u0447\u0451\u0442\u043E\u0432: ASTRODAY / astronomy-engine@2.1.19, tropical, whole-sign. \u041B\u0443\u043D\u043D\u044B\u0435 \u0441\u0443\u0442\u043A\u0438 \u043F\u043E \u043C\u0435\u0441\u0442\u043D\u044B\u043C \u0432\u043E\u0441\u0445\u043E\u0434\u0430\u043C \u041B\u0443\u043D\u044B. \u0410\u0441\u0442\u0440\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0442\u0440\u0430\u043A\u0442\u043E\u0432\u043A\u0430 \u0441\u0438\u043C\u0432\u043E\u043B\u0438\u0447\u0435\u0441\u043A\u0430\u044F.</p>' + "</main></body></html>";
  return new Response(page, { headers: { ...baseheaders, "Content-Type": "text/html; charset=utf-8" } });
}
async function parseBody(req) {
  if (Number(req.headers.get("content-length") || "0") > 16000)
    throw new Error("payload_too_large");
  const content = await req.text();
  if (content.length > 16000)
    throw new Error("payload_too_large");
  return JSON.parse(content);
}
function fiscalCode() {
  return Number(Bun.env.YOOKASSA_VAT_CODE || "0");
}
function fiscalReady() {
  const v = fiscalCode();
  return Number.isInteger(v) && v >= 1 && v <= 11 && Bun.env.FISCAL_RECEIPTS_VERIFIED === "true";
}
function isStaging() {
  return (Bun.env.RAILWAY_ENVIRONMENT_NAME || "staging").toLowerCase() !== "production";
}
async function paymentClient(req, data) {
  if (data?.telegramLogin)
    return verifyTelegramBrowserLogin(data.telegramLogin);
  if (req.headers.get("origin") !== (Bun.env.EXTERNAL_SITE_ORIGIN || "https://lizty666-stage.up.railway.app") || !req.headers.get("content-type")?.startsWith("application/json"))
    return null;
  const session = await tgSession(req);
  return session ? { id: String(session.telegram_id), username: session.telegram_username || null } : null;
}
async function paymentGate() {
  const reasons = [];
  if (!planPriceParity())
    reasons.push("catalog_price_mismatch");
  if (Bun.env.LIVE_RUB_PAYMENTS_ENABLED !== "true")
    reasons.push("payments_disabled");
  if (!Bun.env.YOOKASSA_SHOP_ID || !Bun.env.YOOKASSA_SECRET_KEY)
    reasons.push("yookassa_credentials_missing");
  if (Bun.env.YOOKASSA_PRODUCTION_CONFIRMED !== "true")
    reasons.push("live_merchant_not_verified");
  if (!fiscalReady() || ![1, 2, 3, 4, 5, 6].includes(Number(Bun.env.YOOKASSA_TAX_SYSTEM_CODE)))
    reasons.push("receipt_configuration_incomplete");
  if (!Bun.env.PAYMENT_RETURN_URL?.startsWith("https://"))
    reasons.push("return_url_missing");
  if (Bun.env.FORECAST_SERVICE_ENABLED !== "true" || (Bun.env.ASTRO_INTERNAL_TOKEN || "").length < 32)
    reasons.push("forecast_service_not_enabled");
  if (Bun.env.LIVE_DELIVERY_ENABLED !== "true" || Bun.env.BOT_WEBHOOK_ENABLED !== "true" || !Bun.env.TELEGRAM_BOT_TOKEN || (Bun.env.TELEGRAM_WEBHOOK_SECRET || "").length < 32)
    reasons.push("delivery_not_configured");
  if (!db || !await profileSchema)
    reasons.push("database_unavailable");
  else {
    try {
      const row = (await db.unsafe("SELECT last_scheduler_tick FROM liz_delivery_health WHERE id=1"))[0];
      if (!row?.last_scheduler_tick || Date.now() - Date.parse(row.last_scheduler_tick) > 20 * 60000)
        reasons.push("scheduler_not_running");
    } catch {
      reasons.push("scheduler_not_running");
    }
  }
  return { ready: !reasons.length, reasons };
}
function exactKopeks(v) {
  if (typeof v !== "string" || !/^[0-9]{1,9}\.[0-9]{2}$/.test(v))
    return null;
  const n = Number(v.replace(".", ""));
  return Number.isSafeInteger(n) ? n : null;
}
function buildProviderPayment(orderId, planCode, receiptEmail) {
  const p = PLANS[planCode];
  if (!p)
    throw Error("Unknown plan");
  return buildPaymentRequest({ id: orderId, plan_code: planCode, plan_months: p.months, amount_kopeks: p.rub * 100, receipt_email: receiptEmail });
}
var yk = paymentProviderRequest;
async function handleProviderPayment(provider) {
  if (!db)
    throw Error("db_unavailable");
  return applyProviderPayment(db, provider);
}
function emailOk(s) {
  return typeof s === "string" && s.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);
}
function orderKey(s) {
  return typeof s === "string" && /^[a-zA-Z0-9_.-]{16,100}$/.test(s) ? s : null;
}
async function botApi(method, payload) {
  const token = Bun.env.TELEGRAM_BOT_TOKEN;
  if (!token)
    throw new Error("telegram_credentials_missing");
  const result = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(9000) });
  const answer = await result.json().catch(() => ({ ok: false }));
  if (!result.ok || answer.ok !== true)
    throw new Error("telegram_api_" + result.status);
  return answer.result;
}
function tgId(v) {
  const id = String(v || "");
  return /^[1-9][0-9]{0,15}$/.test(id) ? id : null;
}
function telegramRichBotV3(text) {
  const esc = v => v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return String(text).split("\n").map(line => {
    const t=line.trim();
    let rich=esc(line).replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>").replace(/\*\*/g,"");
    const isHeader=t.length>0&&t.length<115&&(t.startsWith("🔮")||/^[^\p{Ll}]{0,5}[\p{Lu}\d][^\p{Ll}]*$/u.test(t));
    if(isHeader&&!rich.includes("<b>"))rich="<b>"+rich+"</b>";
    return rich;
  }).join("\n");
}
async function sendBotMessage(id, text, extra = {}) {
  return botApi("sendMessage", { chat_id: id, ...extra, text: telegramRichBotV3(text), parse_mode: "HTML", disable_web_page_preview: true });
}
async function sendYooKassaPlans(id) {
  const gate = await paymentGate();
  const catalog = Object.values(PLANS).map((p) => p.months + " \u043C\u0435\u0441. \u2014 " + new Intl.NumberFormat("ru-RU").format(p.rub) + " \u20BD").join(`
`);
  await sendBotMessage(id, `\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 ASTRODAY:
` + catalog + `

\u041E\u043F\u043B\u0430\u0442\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0435\u0440\u0435\u0437 \u042EKassa \u043D\u0430 \u0441\u0430\u0439\u0442\u0435. ` + (gate.ready ? "\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443 \u043C\u043E\u0436\u043D\u043E \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u043E\u043F\u043B\u0430\u0442\u044B." : "\u041F\u0440\u0438\u0451\u043C \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D."), gate.ready ? { reply_markup: { inline_keyboard: [[{ text: "\u041E\u043F\u043B\u0430\u0442\u0430 \u0447\u0435\u0440\u0435\u0437 \u042EKassa \u043D\u0430 \u0441\u0430\u0439\u0442\u0435", url: "https://lizty666-stage.up.railway.app/checkout" }]] } } : {});
}
async function telegramTesterOptIn(id, username, contact) {
  if (!db || !await tgForecastSchema)
    return { ok: false, reason: "unavailable" };
  return activateTester(db, id, username, contact);
}
async function loadVerifiedTesterText(id, day = null) {
  if (!db || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day))
    return null;
  const rows = await db.unsafe("SELECT f.body FROM liz_tester_forecasts f JOIN liz_astro_testers t ON t.handle_key=f.handle_key WHERE t.verified_telegram_id=$1 AND t.consent_status='confirmed_by_account_holder' AND f.forecast_day=$2::date AND (t.trial_end_exclusive::timestamp AT TIME ZONE t.forecast_zone_assumed)>NOW() AND f.editorial_version=$3", [id, day, FORECAST_EDITORIAL_VERSION]);
  return rows[0]?.body || null;
}
function forecastErrorText(e) {
  return { active_subscription_required: "\u0414\u043B\u044F \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u0430 \u043D\u0443\u0436\u043D\u0430 \u0430\u043A\u0442\u0438\u0432\u043D\u0430\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u0438\u043B\u0438 \u0442\u0435\u0441\u0442\u043E\u0432\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F.", birth_profile_required: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0438 \u0430\u043D\u043A\u0435\u0442\u0443 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F.", forecast_preparing_retry: "\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u0433\u043E\u0442\u043E\u0432\u0438\u0442\u0441\u044F. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0447\u0435\u0440\u0435\u0437 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0435\u043A\u0443\u043D\u0434.", profile_changed_during_calculation: "\u0410\u043D\u043A\u0435\u0442\u0430 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0430\u0441\u044C \u0432\u043E \u0432\u0440\u0435\u043C\u044F \u0440\u0430\u0441\u0447\u0451\u0442\u0430. \u0417\u0430\u043F\u0443\u0441\u0442\u0438 \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u0435\u0449\u0451 \u0440\u0430\u0437." }[e?.code] || "\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u043F\u043E\u043A\u0430 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0447\u0443\u0442\u044C \u043F\u043E\u0437\u0436\u0435.";
}
async function testerConsentMessage(id) {
  await sendBotMessage(id, "\u0422\u0435\u0441\u0442 ASTRODAY: \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u044B \u0434\u043E 17 \u0434\u0435\u043A\u0430\u0431\u0440\u044F \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u043E. \u041F\u043E\u0441\u043B\u0435 \u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u0438 \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u0431\u0443\u0434\u0435\u0442 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u044C \u0432 \u044D\u0442\u043E\u0442 \u0447\u0430\u0442 \u043A\u0430\u0436\u0434\u043E\u0435 \u0443\u0442\u0440\u043E \u0432 07:00 \u043F\u043E \u041A\u0435\u043C\u0435\u0440\u043E\u0432\u043E. \u041D\u0430\u0436\u0438\u043C\u0430\u044F \u043A\u043D\u043E\u043F\u043A\u0443, \u0442\u044B \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0448\u044C \u0443\u0447\u0430\u0441\u0442\u0438\u0435, \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443 \u0434\u0430\u043D\u043D\u044B\u0445 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u0434\u043B\u044F \u0440\u0430\u0441\u0447\u0451\u0442\u043E\u0432 \u0438 \u0442\u0435\u043A\u0441\u0442\u0430 \u0438 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043D\u0430 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F. \u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C: /stop.", { reply_markup: { inline_keyboard: [[{ text: "\u0410\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u0441\u0442 \u0438 \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u044C \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u044B", callback_data: "activate_test" }], [{ text: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0430\u043D\u043A\u0435\u0442\u0443", web_app: { url: "https://lizty666-stage.up.railway.app/login" } }]] } });
}
async function finishTesterActivation(id, username, contact) {
  const result = await telegramTesterOptIn(id, username, contact);
  if (result.ok) {
    await sendBotMessage(id, "\u0422\u0435\u0441\u0442 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D. \u041F\u0440\u043E\u0433\u043D\u043E\u0437\u044B \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u044C \u0441\u044E\u0434\u0430 \u0432 07:00 \u043F\u043E \u041A\u0435\u043C\u0435\u0440\u043E\u0432\u043E. \u0414\u043E\u0441\u0442\u0443\u043F \u0434\u043E 17 \u0434\u0435\u043A\u0430\u0431\u0440\u044F \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u043E. \u041A\u0430\u0440\u0442\u0443 \u0438 \u0447\u0430\u0441\u043E\u0432\u043E\u0439 \u043F\u043E\u044F\u0441 \u043F\u0440\u043E\u0432\u0435\u0440\u044C \u0432 \u043A\u0430\u0431\u0438\u043D\u0435\u0442\u0435. /today \u2014 \u0441\u0435\u0433\u043E\u0434\u043D\u044F\u0448\u043D\u0438\u0439 \u043F\u0440\u043E\u0433\u043D\u043E\u0437, /stop \u2014 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F.", { reply_markup: { remove_keyboard: true } });
  } else if (result.needsContact) {
    await sendBotMessage(id, "\u041D\u0435 \u043D\u0430\u0448\u043B\u0430 \u043E\u0434\u043D\u043E\u0437\u043D\u0430\u0447\u043D\u043E\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u043F\u043E \u0442\u0432\u043E\u0435\u043C\u0443 Telegram. \u0415\u0441\u043B\u0438 \u041B\u0438\u0437\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u043B\u0430 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u043E \u043D\u043E\u043C\u0435\u0440\u0443 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430, \u043F\u043E\u0434\u0435\u043B\u0438\u0441\u044C \u0441\u0432\u043E\u0438\u043C \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u043C \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \u043D\u0438\u0436\u0435: \u044D\u0442\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442 \u0443\u0447\u0430\u0441\u0442\u0438\u0435 \u0438 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043D\u0430 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F. \u041A\u043E\u043D\u0442\u0430\u043A\u0442 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u043E\u0439\u0434\u0451\u0442.", { reply_markup: { keyboard: [[{ text: "\u041F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F \u0441\u0432\u043E\u0438\u043C \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u043C \u0438 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u0441\u0442", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
  } else
    await sendBotMessage(id, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0432\u044F\u0437\u0430\u0442\u044C \u0442\u0435\u0441\u0442\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C. \u041F\u0440\u043E\u0432\u0435\u0440\u044C @username \u0438\u043B\u0438 \u043D\u0430\u043F\u0438\u0448\u0438 \u041B\u0438\u0437\u0435 \u2014 \u0447\u0443\u0436\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043C\u044B \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0436\u0435\u043C.");
  return result;
}
async function sendTesterForecast(id, text) {
  let rest = String(text || "").trim();
  if (!rest || rest.length > 20000)
    return false;
  while (rest) {
    if (rest.length <= 3400) {
      await sendBotMessage(id, rest);
      return true;
    }
    let cut = rest.lastIndexOf(`
`, 3400);
    if (cut < 1400)
      cut = rest.lastIndexOf(" ", 3400);
    if (cut < 1400)
      cut = 3400;
    await sendBotMessage(id, rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return true;
}
async function telegramWebhook(req) {
  const sec = Bun.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (Bun.env.BOT_WEBHOOK_ENABLED !== "true" || !Bun.env.TELEGRAM_BOT_TOKEN || sec.length < 32)
    return resp({ error: "bot_not_configured" }, 503);
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== sec)
    return resp({ error: "invalid_webhook_secret" }, 403);
  const up = await parseBody(req);
  if (!db || !await tgForecastSchema)
    return resp({ error: "database_not_ready" }, 503);
  if (Number.isSafeInteger(up?.update_id)) {
    const claimed = await db.unsafe("INSERT INTO liz_tg_processed_updates(update_id) VALUES($1::bigint) ON CONFLICT DO NOTHING RETURNING update_id", [up.update_id]);
    if (!claimed.length)
      return resp({ ok: true, duplicate: true });
  }
  if (up?.callback_query) {
    const q = up.callback_query, id = tgId(q.from?.id);
    if(id && q.message?.chat?.type === "private" && tgId(q.message.chat.id)===id && (q.data==="astroday_join" || q.data==="astroday_today")) { const tester=await astrodayTesterById(id,q.from?.username); try{await botApi("answerCallbackQuery",{callback_query_id:q.id,text:tester?"🖤":"Профиль пока не найден"})}catch(ackErr){console.warn("ASTRO_CALLBACK_ACK_WARN "+String(ackErr))} if(tester){try{if(q.data==="astroday_join")await astrodayJoinOnce(id,tester);else await astrodayToday(id,tester.handle_key);console.log("ASTRO_BUTTON_OK "+JSON.stringify({action:q.data,id}));}catch(ex){console.error("ASTRO_BUTTON_FAIL "+String(ex?.stack||ex));await sendBotMessage(id,"Ой, кнопка закапризничала 🥲 Попробуй /today или нажми ещё раз.");}}else{console.log("ASTRO_BUTTON_NO_PROFILE "+JSON.stringify({id,username:q.from?.username}));await sendBotMessage(id,"Котик, пока не нашла твою анкету 🖤 Напиши Лизе, чтобы подключила тебя.");} return resp({ok:true}); }
    if (id && q.message?.chat?.type === "private" && tgId(q.message.chat.id) === id && q.data === "activate_test") {
      await botApi("answerCallbackQuery", { callback_query_id: q.id });
      await finishTesterActivation(id, q.from?.username || null);
    }
    return resp({ ok: true });
  }
  if (up?.pre_checkout_query) {
    await botApi("answerPreCheckoutQuery", { pre_checkout_query_id: up.pre_checkout_query.id, ok: false, error_message: "\u041E\u043F\u043B\u0430\u0442\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0435\u0440\u0435\u0437 \u042EKassa \u043D\u0430 \u0441\u0430\u0439\u0442\u0435 ASTRODAY." });
    return resp({ ok: true, rejected: "unsupported_payment_channel" });
  }
  const msg = up?.message;
  if (!msg || msg.chat?.type !== "private")
    return resp({ ok: true, ignored: true });
  const chat = tgId(msg.chat?.id), id = tgId(msg.from?.id);
  if (!id || chat !== id)
    return resp({ ok: true, ignored: true });
  if (msg.successful_payment || msg.refunded_payment)
    return resp({ ok: true, ignored: "unsupported_payment_channel" });
  if (!db || !await profileSchema)
    throw Error("db_unavailable");
  await db.unsafe("INSERT INTO liz_clients(telegram_id,telegram_username) VALUES($1,$2) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username=COALESCE(EXCLUDED.telegram_username,liz_clients.telegram_username),updated_at=NOW()", [id, typeof msg.from?.username === "string" ? msg.from.username : null]);
  const rawCommand = String(msg.text || "").trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  const command = rawCommand === "join_test" ? "/join_test" : rawCommand;
  if(await adCommand(id,msg.from?.username,command))return resp({ok:true});
  if (msg.contact) {
    await finishTesterActivation(id, msg.from?.username || null, msg.contact);
    return resp({ ok: true });
  }
  if (command === "/start") {
    await db.unsafe("UPDATE liz_clients SET chat_started_at=COALESCE(chat_started_at,NOW()),updated_at=NOW() WHERE telegram_id=$1", [id]);
    const deep = String(msg.text || "").trim().split(/\s+/)[1] || "";
    const astroTester=await astrodayTesterById(id,msg.from?.username); if(astroTester && !/^login_/.test(deep) && deep!=="forecast") { await astrodayStartOnce(id,astroTester); return resp({ok:true}); } if(astroTester && deep==="forecast"){await astrodayToday(id,astroTester.handle_key);return resp({ok:true});}
    if (/^login_[A-Za-z0-9_-]{22}$/.test(deep)) {
      await tgAuthSchema;
      const paired = await db.unsafe("UPDATE liz_tg_auth_pairings SET confirmed_telegram_id=$2 WHERE code_hash=$1 AND confirmed_telegram_id IS NULL AND used_at IS NULL AND expires_at>NOW() RETURNING code_hash", [tgDigest(deep.slice(6)), id]);
      await sendBotMessage(id, paired.length ? "Telegram \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D. \u0412\u0435\u0440\u043D\u0438\u0441\u044C \u043D\u0430 \u0441\u0430\u0439\u0442 \u2014 \u0442\u044B \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0432\u043E\u0439\u0434\u0451\u0448\u044C \u0432 \u0441\u0432\u043E\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442. \u041F\u0440\u043E\u0433\u043D\u043E\u0437\u044B \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u044C \u0438\u043C\u0435\u043D\u043D\u043E \u0441\u044E\u0434\u0430." : "\u0421\u0441\u044B\u043B\u043A\u0430 \u0432\u0445\u043E\u0434\u0430 \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041E\u0442\u043A\u0440\u043E\u0439 \u043D\u043E\u0432\u0443\u044E \u043D\u0430 \u0441\u0430\u0439\u0442\u0435.");
      return resp({ ok: true, login: paired.length ? "confirmed" : "expired" });
    }
    if (deep === "test") {
      await testerConsentMessage(id);
      return resp({ ok: true });
    }
    await sendBotMessage(id, "\u041F\u0440\u0438\u0432\u0435\u0442! \u042D\u0442\u043E \xABASTRODAY\xBB \u041B\u0438\u0437\u044B. \u041B\u0438\u0447\u043D\u0430\u044F \u043D\u0430\u0442\u0430\u043B\u044C\u043D\u0430\u044F \u043A\u0430\u0440\u0442\u0430, \u0442\u0440\u0430\u043D\u0437\u0438\u0442\u044B \u0438 \u0443\u0442\u0440\u0435\u043D\u043D\u0438\u0435 \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u044B. \u041A\u043E\u043C\u0430\u043D\u0434\u044B: /status, /today, /join_test, /day, /stop, /resume, /plans.", { reply_markup: { inline_keyboard: [[{ text: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C ASTRODAY", web_app: { url: "https://lizty666-stage.up.railway.app/login" } }]] } });
  } else if (command === "/status") {
    const rows = await db.unsafe("SELECT valid_until FROM liz_subscriptions WHERE telegram_id=$1", [id]);
    await sendBotMessage(id, rows.length && Date.parse(rows[0].valid_until) > Date.now() ? "\u0414\u043E\u0441\u0442\u0443\u043F \u0430\u043A\u0442\u0438\u0432\u0435\u043D \u0434\u043E " + new Date(rows[0].valid_until).toLocaleDateString("ru-RU", { timeZone: "UTC" }) + "." : "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.");
  } else if (command === "/today") {
    try {
      const profile = (await db.unsafe("SELECT time_zone FROM liz_birth_profiles WHERE telegram_id=$1", [id]))[0];
      if (!profile)
        throw new ForecastError("birth_profile_required", 404);
      const item = await ensureDailyForecast(db, id, localForecastDay(profile.time_zone));
      await sendTesterForecast(id, item.body);
    } catch (e) {
      await sendBotMessage(id, forecastErrorText(e));
    }
  } else if (command === "/day") {
    const day = String(msg.text || "").trim().split(/\s+/)[1] || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      await sendBotMessage(id, "\u0423\u043A\u0430\u0436\u0438 \u0434\u0430\u0442\u0443: /day 2026-11-13 (\u043F\u0435\u0440\u0438\u043E\u0434 13.11\u201317.12.2026).");
    } else {
      const body = await loadVerifiedTesterText(id, day);
      if (body)
        await sendTesterForecast(id, body);
      else
        await sendBotMessage(id, "\u041D\u0430 \u044D\u0442\u043E\u0442 \u0434\u0435\u043D\u044C \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u0435\u0449\u0451 \u043D\u0435 \u0433\u043E\u0442\u043E\u0432 \u0438\u043B\u0438 \u0442\u0435\u0441\u0442\u043E\u0432\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D. \u041D\u0430\u0447\u043D\u0438 \u0441 /join_test.");
    }
  } else if (command === "/join_test")
    await finishTesterActivation(id, msg.from?.username || null);
  else if (command === "/test")
    await testerConsentMessage(id);
  else if (command === "/confirm_test" || command === "/activate_test") {
    await finishTesterActivation(id, msg.from?.username || null);
    return resp({ ok: true });
  } else if (command === "/stop") {
    if (!await tgForecastSchema)
      throw Error("delivery_preferences_unavailable");
    await db.begin(async (tx) => {
      await tx.unsafe("UPDATE liz_clients SET notify_enabled=FALSE,updated_at=NOW() WHERE telegram_id=$1", [id]);
      await tx.unsafe("UPDATE liz_birth_profiles SET consented_to_daily=FALSE,updated_at=NOW() WHERE telegram_id=$1", [id]);
      await tx.unsafe("UPDATE liz_tg_consents SET daily_delivery=FALSE WHERE telegram_id=$1", [id]);
    });
    await sendBotMessage(id, "\u0415\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B. \u0412\u043E\u0437\u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C: /resume.");
  } else if (command === "/resume") {
    if (!await tgForecastSchema)
      throw Error("delivery_preferences_unavailable");
    const resumed = await db.begin(async (tx) => {
      const profiles = await tx.unsafe("UPDATE liz_birth_profiles SET consented_to_daily=TRUE,updated_at=NOW() WHERE telegram_id=$1 RETURNING telegram_id", [id]);
      if (!profiles.length)
        return false;
      await tx.unsafe("UPDATE liz_clients SET notify_enabled=TRUE,updated_at=NOW() WHERE telegram_id=$1", [id]);
      await tx.unsafe("UPDATE liz_tg_consents SET daily_delivery=TRUE WHERE telegram_id=$1", [id]);
      return true;
    });
    await sendBotMessage(id, resumed ? Bun.env.LIVE_DELIVERY_ENABLED !== "true" ? "\u0421\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043D\u0430 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E. \u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043D\u0430\u0447\u043D\u0451\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0441\u0435\u0440\u0432\u0438\u0441\u0430 \u043F\u0440\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0435." : "\u0415\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B. \u041F\u0440\u043E\u0433\u043D\u043E\u0437\u044B \u043F\u0440\u0438\u0445\u043E\u0434\u044F\u0442 \u043F\u0440\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0435. \u041E\u0442\u043A\u0430\u0437\u0430\u0442\u044C\u0441\u044F: /stop." : "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0438 \u0430\u043D\u043A\u0435\u0442\u0443 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u0432 ASTRODAY.", { reply_markup: { inline_keyboard: [[{ text: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C ASTRODAY", web_app: { url: "https://lizty666-stage.up.railway.app/login" } }]] } });
  } else if (["/plans", "/buy_month", "/buy_halfyear", "/buy_year"].includes(command))
    await sendYooKassaPlans(id);
  else
    await sendBotMessage(id, command === "/help" ? `ASTRODAY \u2014 \u0442\u0432\u043E\u044F \u043B\u0438\u0447\u043D\u0430\u044F \u043A\u0430\u0440\u0442\u0430 \u0438 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u044B.
/status \u2014 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430
/today \u2014 \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F
/stop \u2014 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F
/resume \u2014 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F
/plans \u2014 \u0442\u0430\u0440\u0438\u0444\u044B
\u0410\u043D\u043A\u0435\u0442\u0430 \u0438 \u043B\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442 \u2014 \u043F\u043E \u043A\u043D\u043E\u043F\u043A\u0435 \u043D\u0438\u0436\u0435.` : "\u041E\u0442\u043A\u0440\u043E\u0439 \u043B\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442 \u043F\u043E \u043A\u043D\u043E\u043F\u043A\u0435 \u043D\u0438\u0436\u0435. \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B: /help, /status, /today, /stop, /resume.", { reply_markup: { inline_keyboard: [[{ text: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C ASTRODAY", web_app: { url: "https://lizty666-stage.up.railway.app/login" } }]] } });
  return resp({ ok: true });
}
var WEB_ASTRO_VERSION = "astro-v2-placidus-swe-2.10";
var ASTRO_SIGNS = { Aries: "\u041E\u0432\u0435\u043D", Taurus: "\u0422\u0435\u043B\u0435\u0446", Gemini: "\u0411\u043B\u0438\u0437\u043D\u0435\u0446\u044B", Cancer: "\u0420\u0430\u043A", Leo: "\u041B\u0435\u0432", Virgo: "\u0414\u0435\u0432\u0430", Libra: "\u0412\u0435\u0441\u044B", Scorpio: "\u0421\u043A\u043E\u0440\u043F\u0438\u043E\u043D", Sagittarius: "\u0421\u0442\u0440\u0435\u043B\u0435\u0446", Capricorn: "\u041A\u043E\u0437\u0435\u0440\u043E\u0433", Aquarius: "\u0412\u043E\u0434\u043E\u043B\u0435\u0439", Pisces: "\u0420\u044B\u0431\u044B" };
var ASTRO_ASPECTS = { conjunction: "\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435", opposition: "\u043E\u043F\u043F\u043E\u0437\u0438\u0446\u0438\u044F", square: "\u043A\u0432\u0430\u0434\u0440\u0430\u0442", trine: "\u0442\u0440\u0438\u043D", sextile: "\u0441\u0435\u043A\u0441\u0442\u0438\u043B\u044C" };
async function webCallAstro(p, mode) {
  const token = Bun.env.ASTRO_INTERNAL_TOKEN || "";
  if (token.length < 32)
    throw Error("astro_service_unconfigured");
  const local = localParts(new Date, p.delivery_timezone);
  const day = [local.year, String(local.month).padStart(2, "0"), String(local.day).padStart(2, "0")].join("-");
  if (mode === "text") {
    const result = await calculateProfileForecast({ birth_at_iso: p.birth_at_iso, birth_lat: p.birth_lat, birth_lon: p.birth_lon, birth_time_verified: !!p.birth_local_time, time_zone: p.delivery_timezone, delivery_hour_local: 8 }, day);
    return { text: result.text, calculation: result.calculation };
  }
  const res = await fetch("http://liz-astro-v2.railway.internal:8080/v2/forecast", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ day, timeZone: p.delivery_timezone, birth: { at: p.birth_at_iso, latitude: Number(p.birth_lat), longitude: Number(p.birth_lon), accurateBirthTime: !!p.birth_local_time } }), signal: AbortSignal.timeout(45000) });
  if (!res.ok)
    throw Error("astro_v2_http_" + res.status);
  const calc = await res.json();
  if (calc.version !== WEB_ASTRO_VERSION || calc.houseSystem !== "placidus" || calc.day !== day || calc.houseKnown !== !!p.birth_local_time || calc.natalMoonReliable !== !!p.birth_local_time || !calc.natalProfile?.natalPositions)
    throw Error("astro_v2_contract_invalid");
  const positions = {};
  for (const [name, value] of Object.entries(calc.natalProfile.natalPositions)) {
    if (name === "Moon" && !calc.natalMoonReliable)
      continue;
    const x = value;
    if (Number.isFinite(x.longitude) && ASTRO_SIGNS[x.sign])
      positions[name] = { longitude: x.longitude, sign: ASTRO_SIGNS[x.sign], signDegree: x.degree };
  }
  return { ...calc, natalProfile: { ...calc.natalProfile, positions }, aspects: (calc.activeAspects || []).filter((x) => calc.natalMoonReliable || x.natal !== "Moon").map((x) => ({ ...x, aspect: ASTRO_ASPECTS[x.aspect] || x.aspect, orb: x.orbDeg })) };
}
var TG_SID = "liz_tg_sid";
var TG_PAIR = "liz_tg_pair";
var tgAuthSchema = (async () => {
  if (!db || !await profileSchema)
    return false;
  await db.unsafe("CREATE TABLE IF NOT EXISTS liz_tg_auth_sessions(session_hash TEXT PRIMARY KEY,telegram_id TEXT NOT NULL REFERENCES liz_clients(telegram_id),expires_at TIMESTAMPTZ NOT NULL,revoked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.unsafe("CREATE TABLE IF NOT EXISTS liz_tg_auth_pairings(code_hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL UNIQUE,confirmed_telegram_id TEXT REFERENCES liz_clients(telegram_id),expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  return true;
})().catch((err) => {
  console.error("Telegram identity schema error", err?.name || "unknown");
  return false;
});
var tgDigest = (v) => createHash2("sha256").update(v).digest("hex");
var tgSecret = () => randomBytes(32).toString("base64url");
function tgReadCookie(req, name) {
  const v = (req.headers.get("cookie") || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(name + "="))?.slice(name.length + 1) || "";
  return /^[a-zA-Z0-9_-]{43}$/.test(v) ? v : null;
}
var tgSetCookie = (name, v, age) => name + "=" + v + "; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=" + age;
var tgJSON = (x, status = 200, headers = {}) => resp({ json: x }, status, headers);
async function tgSession(req) {
  const t = tgReadCookie(req, TG_SID);
  if (!t || !db || !await tgAuthSchema)
    return null;
  const users = await db.unsafe("SELECT s.telegram_id,c.telegram_username,c.chat_started_at,c.notify_enabled FROM liz_tg_auth_sessions s JOIN liz_clients c ON c.telegram_id=s.telegram_id WHERE s.session_hash=$1 AND s.expires_at>NOW() AND s.revoked_at IS NULL LIMIT 1", [tgDigest(t)]);
  return users[0] || null;
}
async function issueTGSession(id) {
  const token = tgSecret();
  await db.unsafe("INSERT INTO liz_tg_auth_sessions(session_hash,telegram_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '14 days')", [tgDigest(token), id]);
  return tgJSON({ ok: true, user: { id, telegramId: id } }, 200, { "Set-Cookie": tgSetCookie(TG_SID, token, 1209600) });
}
async function tgAuthHandler(req, path) {
  if (!db || !await tgAuthSchema)
    return tgJSON({ error: "Telegram authentication unavailable" }, 503);
  const act = path.slice("/v1/tg-auth/".length);
  if (req.method === "GET") {
    if (act === "session") {
      const user = await tgSession(req);
      return user ? tgJSON({ user: { id: user.telegram_id, telegramId: user.telegram_id, username: user.telegram_username || null, chatBound: !!user.chat_started_at } }) : tgJSON({ error: "Not authenticated" }, 401);
    }
    if (act === "status") {
      const user = await tgSession(req);
      if (user)
        return tgJSON({ state: "authenticated", user: { telegramId: user.telegram_id, chatBound: !!user.chat_started_at } });
      const browser = tgReadCookie(req, TG_PAIR);
      if (!browser)
        return tgJSON({ state: "not_started" }, 401);
      const confirmed = await db.begin(async (tx) => {
        const rows = await tx.unsafe("UPDATE liz_tg_auth_pairings SET used_at=NOW() WHERE browser_hash=$1 AND confirmed_telegram_id IS NOT NULL AND used_at IS NULL AND expires_at>NOW() RETURNING confirmed_telegram_id", [tgDigest(browser)]);
        return rows[0]?.confirmed_telegram_id || null;
      });
      return confirmed ? issueTGSession(confirmed) : tgJSON({ state: "waiting" }, 202);
    }
    return tgJSON({ error: "Unknown auth action" }, 404);
  }
  if (req.method !== "POST")
    return tgJSON({ error: "Method not allowed" }, 405);
  if (req.headers.get("origin") !== (Bun.env.EXTERNAL_SITE_ORIGIN || "https://lizty666-stage.up.railway.app") || !req.headers.get("content-type")?.startsWith("application/json"))
    return tgJSON({ error: "Invalid origin" }, 403);
  if (act === "logout") {
    const token = tgReadCookie(req, TG_SID);
    if (token)
      await db.unsafe("UPDATE liz_tg_auth_sessions SET revoked_at=NOW() WHERE session_hash=$1", [tgDigest(token)]);
    return tgJSON({ ok: true }, 200, { "Set-Cookie": tgSetCookie(TG_SID, "", 0) });
  }
  if (act === "start") {
    if (!Bun.env.TELEGRAM_BOT_TOKEN || Bun.env.BOT_WEBHOOK_ENABLED !== "true" || !Bun.env.TELEGRAM_WEBHOOK_SECRET || Bun.env.TELEGRAM_WEBHOOK_SECRET.length < 32)
      return tgJSON({ error: "Telegram bot and webhook not connected" }, 503);
    let telegramWebhookOnThisStaging = false;
    try {
      const check = await fetch("https://api.telegram.org/bot" + Bun.env.TELEGRAM_BOT_TOKEN + "/getWebhookInfo", {
        method: "GET",
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json" }
      });
      if (check.ok) {
        const status = await check.json();
        telegramWebhookOnThisStaging = status?.ok === true && status?.result?.url === "https://lizty666-api-stage.up.railway.app/v1/telegram/webhook";
      }
    } catch {}
    if (!telegramWebhookOnThisStaging)
      return tgJSON({
        error: "Telegram bot is still served by the existing Floot app; Railway bot sign-in cannot run until a safe webhook cutover."
      }, 503);
    const code = randomBytes(16).toString("base64url"), browser = tgSecret();
    await db.unsafe("INSERT INTO liz_tg_auth_pairings(code_hash,browser_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')", [tgDigest(code), tgDigest(browser)]);
    return tgJSON({ botUrl: "https://t.me/Lizty666bot?start=login_" + code, expiresInSeconds: 600 }, 200, { "Set-Cookie": tgSetCookie(TG_PAIR, browser, 600) });
  }
  if (act === "mini") {
    if (!Bun.env.TELEGRAM_BOT_TOKEN)
      return tgJSON({ error: "Telegram Mini App bot not connected" }, 503);
    const data = await parseBody(req), raw = data?.initData;
    if (typeof raw !== "string")
      return tgJSON({ error: "Telegram initData signature required" }, 401);
    const created = Number(new URLSearchParams(raw).get("auth_date") || 0), age = Math.floor(Date.now() / 1000) - created;
    const who = verifyMiniAppInit(raw);
    if (!who || age < -60 || age > 300)
      return tgJSON({ error: "Invalid or expired Telegram Mini App identity" }, 401);
    await db.unsafe("INSERT INTO liz_clients(telegram_id,telegram_username) VALUES($1,$2) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username=COALESCE(EXCLUDED.telegram_username,liz_clients.telegram_username),updated_at=NOW()", [who.id, who.username]);
    return issueTGSession(who.id);
  }
  return tgJSON({ error: "Unknown authentication action" }, 404);
}
var tgForecastSchema = (async () => {
  if (!db || !await tgAuthSchema)
    return false;
  await db.unsafe("CREATE TABLE IF NOT EXISTS liz_tg_free_previews(telegram_id TEXT PRIMARY KEY REFERENCES liz_clients(telegram_id),forecast_date DATE NOT NULL,body TEXT NOT NULL,birth_fingerprint TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.unsafe("ALTER TABLE liz_tg_free_previews ADD COLUMN IF NOT EXISTS engine_version TEXT NOT NULL DEFAULT 'legacy'");
  await ensureForecastSchema(db);
  await ensureTesterRuntimeSchema(db);
  await db.unsafe("CREATE TABLE IF NOT EXISTS liz_tg_consents(telegram_id TEXT PRIMARY KEY REFERENCES liz_clients(telegram_id),terms_version TEXT NOT NULL,marketing BOOLEAN NOT NULL DEFAULT FALSE,daily_delivery BOOLEAN NOT NULL DEFAULT FALSE,accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  return true;
})().catch((e) => {
  console.error("Telegram profile schema unavailable", e?.name || "unknown");
  return false;
});
var tgBirthFingerprint = (p) => tgDigest(JSON.stringify([p.birth_day, p.birth_at_iso, p.birth_time_verified, p.birth_city_id, p.birth_timezone, p.birth_lat, p.birth_lon]));
var tgReaderFriendlyV2 = (s) => typeof s === "string" && s.length >= 150 && s.length <= 4000 && !/\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B|\u0422\u043E\u0447\u043D\u044B\u0435 \u043B\u0438\u0447\u043D\u044B\u0435 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B|\u0420\u0430\u0437\u0432\u043E\u0440\u043E\u0442\u044B \u043F\u043B\u0430\u043D\u0435\u0442, \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u043D\u044B\u0435|\u0418\u0437 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0445 \u043B\u0438\u0447\u043D\u044B\u0445 \u0430\u0441\u043F\u0435\u043A\u0442\u043E\u0432|\(\u043E\u0440\u0431 \d/i.test(s);
async function tgForecastHandler(req, path) {
  const action = path.slice("/v1/tg-forecast/".length);
  if (!["me", "register", "settings", "chart", "preview", "today"].includes(action))
    return tgJSON({ error: "Unknown forecast action" }, 404);
  if (!db || !await tgForecastSchema)
    return tgJSON({ error: "Telegram profile unavailable" }, 503);
  const session = await tgSession(req);
  if (!session) {
    if (req.method === "GET" && (action === "me" || action === "chart"))
      return tgJSON({ registered: false });
    return tgJSON({ error: "\u041E\u0442\u043A\u0440\u043E\u0439 \u0430\u043A\u0430\u0434\u0435\u043C\u0438\u044E \u0447\u0435\u0440\u0435\u0437 Telegram." }, 401);
  }
  const id = String(session.telegram_id);
  const rows = await db.unsafe("SELECT p.*,p.birth_local_date::text AS birth_day,s.valid_until FROM liz_birth_profiles p LEFT JOIN liz_subscriptions s ON s.telegram_id=p.telegram_id WHERE p.telegram_id=$1 LIMIT 1", [id]);
  const profile = rows[0] || null, accurate = profile?.birth_time_verified === true;
  const birthTime = profile && accurate ? new Intl.DateTimeFormat("en-GB", { timeZone: profile.birth_timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(profile.birth_at_iso)) : null;
  const astro = profile ? { birth_at_iso: profile.birth_at_iso, birth_day: profile.birth_day, birth_local_time: birthTime, birth_lat: profile.birth_lat, birth_lon: profile.birth_lon, delivery_timezone: profile.time_zone } : null;
  if (req.method === "GET") {
    if (action === "me") {
      if (!profile)
        return tgJSON({ registered: false, telegramLinked: true, chatBound: !!session.chat_started_at });
      const cached = await db.unsafe("SELECT body,birth_fingerprint,engine_version FROM liz_tg_free_previews WHERE telegram_id=$1", [id]);
      const trialRows = await db.unsafe("SELECT trial_end_exclusive::text AS until FROM liz_astro_testers WHERE verified_telegram_id=$1 AND consent_status='confirmed_by_account_holder' AND trial_start<=(now() AT TIME ZONE 'Asia/Novokuznetsk')::date AND trial_end_exclusive>(now() AT TIME ZONE 'Asia/Novokuznetsk')::date ORDER BY trial_end_exclusive DESC LIMIT 1", [id]);
      const same = cached[0]?.birth_fingerprint === tgBirthFingerprint(profile);
      return tgJSON({ registered: true, telegramLinked: true, chatBound: !!session.chat_started_at, telegramId: id, fullName: profile.preferred_name || "", birthDate: profile.birth_day, birthTime, birthCity: profile.birth_city_name || "", birthPlaceId: profile.birth_city_id ? Number(profile.birth_city_id) : null, deliveryTimezone: profile.time_zone, deliveryHour: Number(profile.delivery_hour_local), dailyConsent: profile.consented_to_daily === true, notifyEnabled: session.notify_enabled === true, subscriptionUntil: profile.valid_until || null, trialActive: trialRows.length > 0, trialUntil: trialRows[0]?.until || null, freePreview: same && cached[0]?.engine_version === FORECAST_EDITORIAL_VERSION && tgReaderFriendlyV2(cached[0].body) ? cached[0].body : null, trialConsumed: cached.length > 0, trialProfileChanged: cached.length > 0 && !same });
    }
    if (action === "chart") {
      if (!profile)
        return tgJSON({ registered: false });
      try {
        const calc = await webCallAstro(astro, "chart"), names = { Sun: "\u0421\u043E\u043B\u043D\u0446\u0435", Moon: "\u041B\u0443\u043D\u0430", Mercury: "\u041C\u0435\u0440\u043A\u0443\u0440\u0438\u0439", Venus: "\u0412\u0435\u043D\u0435\u0440\u0430", Mars: "\u041C\u0430\u0440\u0441", Jupiter: "\u042E\u043F\u0438\u0442\u0435\u0440", Saturn: "\u0421\u0430\u0442\u0443\u0440\u043D", Uranus: "\u0423\u0440\u0430\u043D", Neptune: "\u041D\u0435\u043F\u0442\u0443\u043D", Pluto: "\u041F\u043B\u0443\u0442\u043E\u043D" };
        const natal = {};
        for (const [k, v] of Object.entries(calc.natalProfile?.positions || {})) {
          const z = v;
          if (z?.longitude !== null && z?.sign)
            natal[names[k] || k] = z.sign + " " + Number(z.signDegree).toFixed(1) + "\xB0";
        }
        const aspects = Array.isArray(calc.aspects) ? calc.aspects.slice(0, 80).map((z) => ({ transit: names[z.transit] || z.transit, natal: names[z.natal] || z.natal, aspect: z.aspect, orb: Number(z.orb) })).filter((z) => Number.isFinite(z.orb)) : [];
        return tgJSON({ registered: true, natal, aspects, birthTimeKnown: accurate, birthTimeNote: accurate ? "" : "\u0411\u0435\u0437 \u0442\u043E\u0447\u043D\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u041B\u0443\u043D\u0430 \u0438 \u0434\u043E\u043C\u0430 \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u043C\u0438." });
      } catch {
        return tgJSON({ error: "\u0420\u0430\u0441\u0447\u0451\u0442 \u043D\u0430\u0442\u0430\u043B\u044C\u043D\u043E\u0439 \u043A\u0430\u0440\u0442\u044B \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D." }, 503);
      }
    }
    if (action === "today") {
      const testerDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Novokuznetsk", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const testerText = await db.unsafe("SELECT f.body,f.forecast_day::text AS day FROM liz_astro_testers t JOIN liz_tester_forecasts f ON f.handle_key=t.handle_key WHERE t.verified_telegram_id=$1 AND t.consent_status='confirmed_by_account_holder' AND t.trial_start<=$2::date AND t.trial_end_exclusive>$2::date AND f.forecast_day=$2::date ORDER BY f.created_at DESC LIMIT 1", [id, testerDay]);
      if (testerText[0]?.body)
        return tgJSON({ text: testerText[0].body, day: testerText[0].day, version: "astroday-tester" });
      if (!profile)
        return tgJSON({ error: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0438 \u0430\u043D\u043A\u0435\u0442\u0443 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F." }, 404);
      try {
        const item = await ensureDailyForecast(db, id, localForecastDay(profile.time_zone));
        return tgJSON({ text: item.body, day: item.day, version: item.editorial_version });
      } catch (e) {
        return tgJSON({ error: forecastErrorText(e), code: e.code || "forecast_unavailable" }, e.httpStatus === 202 ? 503 : e.httpStatus || 503);
      }
    }
    return tgJSON({ error: "Method not allowed" }, 405);
  }
  if (req.method !== "POST")
    return tgJSON({ error: "Method not allowed" }, 405);
  if (req.headers.get("origin") !== (Bun.env.EXTERNAL_SITE_ORIGIN || "https://lizty666-stage.up.railway.app") || !req.headers.get("content-type")?.startsWith("application/json"))
    return tgJSON({ error: "Invalid request origin" }, 403);
  let input;
  try {
    const data = await parseBody(req);
    input = data?.json || data;
  } catch {
    return tgJSON({ error: "Invalid JSON" }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    return tgJSON({ error: "Invalid form" }, 400);
  if (action === "register") {
    if (input.acceptTerms !== true || input.pdConsent !== true || typeof input.legalVersion !== "string" || input.legalVersion.length < 1 || input.legalVersion.length > 100)
      return tgJSON({ error: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u0441 \u0443\u0441\u043B\u043E\u0432\u0438\u044F\u043C\u0438 \u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u043E\u0439 \u0434\u0430\u043D\u043D\u044B\u0445." }, 400);
    const name = typeof input.fullName === "string" ? input.fullName.trim() : "";
    if (name.length < 2 || name.length > 100 || /[\x00-\x1f<>]/.test(name) || !validateDate(input.birthDate) || !/^[0-9]{1,12}$/.test(String(input.birthPlaceId || "")))
      return tgJSON({ error: "\u041F\u0440\u043E\u0432\u0435\u0440\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F." }, 400);
    const city = (await db.unsafe("SELECT city_id::text AS id,name_ru,latitude,longitude,time_zone FROM liz_geo_cities WHERE city_id=$1::bigint LIMIT 1", [String(input.birthPlaceId)]))[0];
    if (!city || !goodZone(city.time_zone) || !goodZone(input.deliveryTimezone) || !Number.isInteger(input.deliveryHour) || input.deliveryHour < 0 || input.deliveryHour > 23)
      return tgJSON({ error: "\u0412\u044B\u0431\u0435\u0440\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u0433\u043E\u0440\u043E\u0434 \u0438 \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438." }, 422);
    const bt = input.birthTime === null || input.birthTime === "" ? null : input.birthTime;
    if (bt !== null && (typeof bt !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(bt)))
      return tgJSON({ error: "\u041D\u0435\u0432\u0435\u0440\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F." }, 400);
    let utc;
    try {
      utc = localBirthToUtc(input.birthDate, bt || "12:00", city.time_zone);
    } catch {
      return tgJSON({ error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0434\u043D\u043E\u0437\u043D\u0430\u0447\u043D\u043E \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F." }, 422);
    }
    await db.begin(async (tx) => {
      await tx.unsafe("INSERT INTO liz_birth_profiles(telegram_id,birth_at_iso,birth_local_date,birth_lat,birth_lon,birth_time_verified,birth_timezone,time_zone,delivery_hour_local,consented_to_daily,preferred_name,birth_city_id,birth_city_name) VALUES($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12::bigint,$13) ON CONFLICT(telegram_id) DO UPDATE SET birth_at_iso=EXCLUDED.birth_at_iso,birth_local_date=EXCLUDED.birth_local_date,birth_lat=EXCLUDED.birth_lat,birth_lon=EXCLUDED.birth_lon,birth_time_verified=EXCLUDED.birth_time_verified,birth_timezone=EXCLUDED.birth_timezone,time_zone=EXCLUDED.time_zone,delivery_hour_local=EXCLUDED.delivery_hour_local,consented_to_daily=EXCLUDED.consented_to_daily,preferred_name=EXCLUDED.preferred_name,birth_city_id=EXCLUDED.birth_city_id,birth_city_name=EXCLUDED.birth_city_name,updated_at=NOW()", [id, utc, input.birthDate, Number(city.latitude), Number(city.longitude), !!bt, city.time_zone, input.deliveryTimezone, input.deliveryHour, input.deliveryConsent === true, name, city.id, city.name_ru]);
      await tx.unsafe("INSERT INTO liz_tg_consents(telegram_id,terms_version,marketing,daily_delivery) VALUES($1,$2,$3,$4) ON CONFLICT(telegram_id) DO UPDATE SET terms_version=EXCLUDED.terms_version,marketing=EXCLUDED.marketing,daily_delivery=EXCLUDED.daily_delivery,accepted_at=NOW()", [id, input.legalVersion, input.marketingConsent === true, input.deliveryConsent === true]);
      await tx.unsafe("UPDATE liz_clients SET notify_enabled=$2,updated_at=NOW() WHERE telegram_id=$1", [id, input.deliveryConsent === true]);
    });
    return tgJSON({ registered: true, telegramLinked: true, chatBound: !!session.chat_started_at });
  }
  if (action === "settings") {
    if (!profile)
      return tgJSON({ error: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0438 \u0430\u043D\u043A\u0435\u0442\u0443." }, 404);
    if (!goodZone(input.deliveryTimezone) || !Number.isInteger(input.deliveryHour) || input.deliveryHour < 0 || input.deliveryHour > 23)
      return tgJSON({ error: "\u041F\u0440\u043E\u0432\u0435\u0440\u044C \u0432\u0440\u0435\u043C\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438." }, 400);
    if (input.dailyConsent !== undefined && typeof input.dailyConsent !== "boolean")
      return tgJSON({ error: "\u0421\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043D\u0430 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0434\u0430 \u0438\u043B\u0438 \u043D\u0435\u0442." }, 400);
    await db.begin(async (tx) => {
      await tx.unsafe("UPDATE liz_birth_profiles SET time_zone=$2,delivery_hour_local=$3,consented_to_daily=COALESCE($4::boolean,consented_to_daily),updated_at=NOW() WHERE telegram_id=$1", [id, input.deliveryTimezone, input.deliveryHour, input.dailyConsent ?? null]);
      if (typeof input.dailyConsent === "boolean") {
        await tx.unsafe("UPDATE liz_clients SET notify_enabled=$2,updated_at=NOW() WHERE telegram_id=$1", [id, input.dailyConsent]);
        await tx.unsafe("UPDATE liz_tg_consents SET daily_delivery=$2 WHERE telegram_id=$1", [id, input.dailyConsent]);
        await tx.unsafe("UPDATE astroday_tester_joins SET notifications_enabled=$2 WHERE telegram_id=$1",[id,input.dailyConsent]);
      }
    });
    return tgJSON({ ok: true, ...typeof input.dailyConsent === "boolean" ? { dailyConsent: input.dailyConsent, notifyEnabled: input.dailyConsent } : {} });
  }
  if (action === "preview") {
    if (!profile)
      return tgJSON({ error: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0438 \u043A\u0430\u0440\u0442\u0443." }, 404);
    const fp = tgBirthFingerprint(profile), rows = await db.unsafe("SELECT body,birth_fingerprint,engine_version FROM liz_tg_free_previews WHERE telegram_id=$1", [id]);
    if (rows.length) {
      if (rows[0].birth_fingerprint !== fp)
        return tgJSON({ error: "\u0411\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u0439 \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u0443\u0436\u0435 \u0431\u044B\u043B \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u043F\u043E \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0439 \u043A\u0430\u0440\u0442\u0435." }, 409);
      let text = rows[0].body;
      if (rows[0].engine_version !== FORECAST_EDITORIAL_VERSION || !tgReaderFriendlyV2(text)) {
        let revised;
        try {
          revised = await webCallAstro(astro, "text");
        } catch {
          return tgJSON({ error: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437." }, 503);
        }
        if (!tgReaderFriendlyV2(revised?.text) || !revised?.calculation?.day)
          return tgJSON({ error: "\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u043F\u043E\u043A\u0430 \u043F\u0440\u043E\u0445\u043E\u0434\u0438\u0442 \u043B\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u043D\u0443\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443." }, 503);
        const changed = await db.unsafe("UPDATE liz_tg_free_previews SET body=$2,forecast_date=$3::date,engine_version=$6 WHERE telegram_id=$1 AND birth_fingerprint=$4 AND body=$5 RETURNING body", [id, revised.text, revised.calculation.day, fp, text, FORECAST_EDITORIAL_VERSION]);
        text = changed[0]?.body || ((await db.unsafe("SELECT body FROM liz_tg_free_previews WHERE telegram_id=$1 AND birth_fingerprint=$2", [id, fp]))[0]?.body || text);
        if (!tgReaderFriendlyV2(text))
          return tgJSON({ error: "\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u043F\u043E\u043A\u0430 \u043F\u0440\u043E\u0445\u043E\u0434\u0438\u0442 \u043B\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u043D\u0443\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443." }, 503);
      }
      return tgJSON({ preview: text, alreadyUsed: true });
    }
    let calc;
    try {
      calc = await webCallAstro(astro, "text");
    } catch {
      return tgJSON({ error: "\u041B\u0438\u0447\u043D\u044B\u0439 \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D." }, 503);
    }
    if (!tgReaderFriendlyV2(calc?.text) || !calc?.calculation?.day)
      return tgJSON({ error: "\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u043F\u043E\u043A\u0430 \u043F\u0440\u043E\u0445\u043E\u0434\u0438\u0442 \u043B\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u043D\u0443\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443." }, 503);
    await db.unsafe("INSERT INTO liz_tg_free_previews(telegram_id,forecast_date,body,birth_fingerprint,engine_version) VALUES($1,$2::date,$3,$4,$5) ON CONFLICT(telegram_id) DO NOTHING", [id, calc.calculation.day, calc.text, fp, FORECAST_EDITORIAL_VERSION]);
    const saved = await db.unsafe("SELECT body,birth_fingerprint,engine_version FROM liz_tg_free_previews WHERE telegram_id=$1", [id]);
    return saved[0]?.birth_fingerprint === fp ? tgJSON({ preview: saved[0].body, alreadyUsed: saved[0].body !== calc.text }) : tgJSON({ error: "\u0410\u043D\u043A\u0435\u0442\u0430 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0430\u0441\u044C \u0432\u043E \u0432\u0440\u0435\u043C\u044F \u0440\u0430\u0441\u0447\u0451\u0442\u0430." }, 409);
  }
  return tgJSON({ error: "Unsupported operation" }, 405);
}
Bun.serve({
  idleTimeout: 60,
  port: Number(Bun.env.PORT || "3000"),
  async fetch(req) {
    const url = new URL(req.url), path = url.pathname;
    const ch = cors(req);
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: ch });
    const guarded = (v, status = 200) => resp(v, status, ch);
    try {
      if (isStaging() && ["/v1/astro/forecast"].includes(path))
        return guarded({ error: "\u0410\u0441\u0442\u0440\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0440\u0430\u0441\u0447\u0451\u0442\u044B \u043F\u0440\u043E\u0445\u043E\u0434\u044F\u0442 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0443\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443. \u041F\u0440\u043E\u0433\u043D\u043E\u0437\u044B \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B.", code: "astro_house_qa_pending" }, 503);
      if (req.method === "POST" && path === "/v1/telegram/webhook")
        return await telegramWebhook(req);
      if (path.startsWith("/v1/tg-auth/"))
        return await tgAuthHandler(req, path);
      if (path.startsWith("/v1/tg-forecast/"))
        return await tgForecastHandler(req, path);
      if (path.startsWith("/v1/web-auth/"))
        return guarded({ error: "Email/password registration retired. Sign in through Telegram." }, 410);
      if (req.method === "GET" && path === "/v1/staging/tester-month")
        return await reviewerMonthExport(req);
      if (req.method === "GET" && path === "/health") {
        const database = !!db && await schema;
        return guarded({ ok: database, role: "astroday_api", databaseReady: database, externalPaymentsEnabled: (await paymentGate()).ready, sourceMigrated: Bun.env.SOURCE_MIGRATION_VERIFIED === "true", telegramDispatchOperational: Bun.env.TELEGRAM_DISPATCH_VERIFIED === "true" }, database ? 200 : 503);
      }
      if (path.startsWith("/v1/web-forecast/"))
        return guarded({ error: "Legacy email forecast accounts retired; use Telegram" }, 410);
      if (req.method === "GET" && path === "/v1/geo/cities")
        return await searchGeoCities(req, guarded);
      if (req.method === "GET" && path === "/v1/app-status") {
        const databaseReady = !!db && await tgForecastSchema;
        const telegramConfigured = !!Bun.env.TELEGRAM_BOT_TOKEN && Bun.env.BOT_WEBHOOK_ENABLED === "true" && (Bun.env.TELEGRAM_WEBHOOK_SECRET || "").length >= 32;
        const gate = await paymentGate();
        return guarded({ databaseReady, profileAvailable: databaseReady, telegramConfigured, telegramIdentityVerified: Bun.env.TELEGRAM_IDENTITY_E2E_VERIFIED === "true", forecastAvailable: databaseReady && (Bun.env.ASTRO_INTERNAL_TOKEN || "").length >= 32, chartAvailable: databaseReady && (Bun.env.ASTRO_INTERNAL_TOKEN || "").length >= 32, forecastQaPending: false, forecastMode: "personal_editorial", houseSystem: "placidus", forecastEngine: WEB_ASTRO_VERSION, dailyDeliveryAvailable: Bun.env.LIVE_DELIVERY_ENABLED === "true" && Bun.env.FORECAST_SERVICE_ENABLED === "true", paymentsAvailable: gate.ready, paymentProvider: "yookassa", paymentCurrency: "RUB", paymentLocation: "external_website_only", botUsername: "Lizty666bot" });
      }
      if (req.method === "GET" && path === "/v1/plans")
        return guarded({ currency: "RUB", plans: Object.entries(PLANS).map(([code, p]) => ({ code, months: p.months, rub: p.rub, title: p.title })), provider: "yookassa", paymentLocation: "external_website_only" });
      if (req.method === "GET" && path === "/v1/release-readiness") {
        const gate = await paymentGate();
        return guarded({ readyForPublicSales: gate.ready, blockedBy: gate.reasons, sourceMigrated: Bun.env.SOURCE_MIGRATION_VERIFIED === "true", realTelegramDeliveryVerified: Bun.env.TELEGRAM_DISPATCH_VERIFIED === "true" });
      }
      if (req.method === "POST" && path === "/v1/testers/claim")
        return await secureTesterClaim(req, guarded);
      if (req.method === "POST" && path === "/v1/astro/profile")
        return await secureMiniProfile(req, guarded);
      if (req.method === "POST" && path === "/v1/astro/forecast")
        return await secureMiniForecast(req, guarded);
      if (req.method === "POST" && path === "/v1/checkout") {
        const gate = await paymentGate();
        if (!gate.ready)
          return guarded({ error: "Checkout temporarily unavailable", blockedBy: gate.reasons }, 503);
        const data = await parseBody(req);
        const client = await paymentClient(req, data);
        if (!client)
          return guarded({ error: "\u0412\u043E\u0439\u0434\u0438 \u0447\u0435\u0440\u0435\u0437 Telegram \u043D\u0430 \u0441\u0430\u0439\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443." }, 401);
        if (data.acceptOffer !== true || data.acceptData !== true || data.legalVersion !== "ASTRODAY-20261115")
          return guarded({ error: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u0438 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043D\u0430 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443 \u0434\u0430\u043D\u043D\u044B\u0445." }, 400);
        const account = (await db.unsafe("SELECT p.telegram_id,c.chat_started_at FROM liz_birth_profiles p JOIN liz_clients c ON c.telegram_id=p.telegram_id WHERE p.telegram_id=$1", [client.id]))[0];
        if (!account || !account.chat_started_at)
          return guarded({ error: "\u041F\u0435\u0440\u0435\u0434 \u043E\u043F\u043B\u0430\u0442\u043E\u0439 \u0437\u0430\u043F\u043E\u043B\u043D\u0438 \u0430\u043D\u043A\u0435\u0442\u0443 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u0438 \u043D\u0430\u0436\u043C\u0438 \u0421\u0442\u0430\u0440\u0442 \u0432 \u0431\u043E\u0442\u0435." }, 422);
        const plan = PLANS[data.plan];
        if (!plan)
          return guarded({ error: "Unknown plan" }, 400);
        if (!emailOk(data.receiptEmail))
          return guarded({ error: "Valid email required for fiscal receipt" }, 400);
        const idkey = orderKey(req.headers.get("Idempotency-Key"));
        if (!idkey)
          return guarded({ error: "Idempotency-Key required (16-100 alphanumeric/._- chars)" }, 400);
        const old = await db.unsafe("SELECT id,telegram_id,plan_code,amount_kopeks,receipt_email,confirmation_url,provider_payment_id,status,needs_review,provider_request,created_at,activated_at FROM liz_orders WHERE idempotency_key=$1", [idkey]);
        if (old.length) {
          if (Number(old[0].amount_kopeks) !== plan.rub * 100)
            return guarded({ error: "Saved order uses a superseded price; manual review required; no charge attempted" }, 409);
          if (old[0].telegram_id !== client.id || old[0].plan_code !== data.plan || old[0].receipt_email !== data.receiptEmail)
            return guarded({ error: "Idempotency conflict" }, 409);
          if (old[0].needs_review)
            return guarded({ error: "Payment needs manual review; no new charge will be attempted" }, 409);
          if (["paid", "canceled", "refunded"].includes(old[0].status))
            return guarded({ orderId: old[0].id, status: old[0].status, activated: !!old[0].activated_at });
          if (old[0].confirmation_url && old[0].status === "pending")
            return guarded({ orderId: old[0].id, confirmationUrl: old[0].confirmation_url, status: old[0].status });
          if (old[0].status === "creating" && !old[0].provider_payment_id) {
            const order = old[0];
            if (Date.now() - Date.parse(order.created_at) > 23 * 3600000)
              return guarded({ error: "\u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u0437\u0430\u043A\u0430\u0437\u0430 \u043D\u0443\u0436\u043D\u043E \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0432 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0435. \u041D\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u0442\u0451\u0436 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F." }, 409);
            const recovered = await yk("payments", "POST", order.provider_request || buildProviderPayment(String(order.id), order.plan_code, order.receipt_email), String(order.id));
            if (typeof recovered.id !== "string" || recovered.metadata?.order_id !== String(order.id) || recovered.metadata?.plan !== order.plan_code || recovered.recipient?.account_id !== Bun.env.YOOKASSA_SHOP_ID || recovered.test !== false || !["pending", "succeeded", "canceled"].includes(recovered.status) || recovered.status === "pending" && (typeof recovered.confirmation?.confirmation_url !== "string" || !recovered.confirmation.confirmation_url.startsWith("https://")) || exactKopeks(recovered.amount?.value) !== plan.rub * 100 || recovered.amount?.currency !== "RUB")
              throw new Error("provider_recovery_mismatch");
            await db.unsafe("UPDATE liz_orders SET provider_payment_id=$1,status='pending',confirmation_url=$2,updated_at=NOW() WHERE id=$3::uuid AND status='creating'", [recovered.id, recovered.confirmation?.confirmation_url || null, order.id]);
            const reconciled = await handleProviderPayment(recovered);
            if (reconciled === "activated" || reconciled === "already_activated")
              return guarded({ orderId: order.id, status: "paid", activated: true });
            return guarded({ orderId: order.id, confirmationUrl: recovered.confirmation?.confirmation_url || null, status: recovered.status === "canceled" ? "canceled" : "pending" });
          }
          return guarded({ error: "Existing order cannot be charged again; verify status or contact support" }, 409);
        }
        await db.unsafe("INSERT INTO liz_clients(telegram_id,telegram_username) VALUES($1,$2) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username=COALESCE(EXCLUDED.telegram_username,liz_clients.telegram_username),updated_at=NOW()", [client.id, client.username]);
        const orderId = randomUUID2();
        const inserted = await db.unsafe("INSERT INTO liz_orders(id,idempotency_key,telegram_id,plan_code,plan_months,amount_kopeks,receipt_email,legal_version,terms_accepted_at) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id", [orderId, idkey, client.id, data.plan, plan.months, plan.rub * 100, data.receiptEmail, data.legalVersion]);
        if (!inserted.length)
          return guarded({ error: "Idempotent request already exists" }, 409);
        const payload = buildProviderPayment(orderId, data.plan, data.receiptEmail);
        await db.unsafe("UPDATE liz_orders SET provider_request=($2::text)::jsonb WHERE id=$1::uuid", [orderId, JSON.stringify(payload)]);
        const response = await yk("payments", "POST", payload, orderId);
        if (typeof response.id !== "string" || typeof response.confirmation?.confirmation_url !== "string" || response.metadata?.order_id !== orderId || response.metadata?.plan !== data.plan || response.recipient?.account_id !== Bun.env.YOOKASSA_SHOP_ID || response.test !== false || response.status !== "pending" || !response.confirmation.confirmation_url.startsWith("https://") || exactKopeks(response.amount?.value) !== plan.rub * 100 || response.amount?.currency !== "RUB")
          throw new Error("provider_confirmation_invalid");
        await db.unsafe("UPDATE liz_orders SET provider_payment_id=$1,status='pending',confirmation_url=$2,updated_at=NOW() WHERE id=$3::uuid", [response.id, response.confirmation.confirmation_url, orderId]);
        return guarded({ orderId, confirmationUrl: response.confirmation.confirmation_url, status: "pending" });
      }
      if (req.method === "POST" && path === "/v1/yookassa/webhook") {
        if (!Bun.env.YOOKASSA_SHOP_ID || !Bun.env.YOOKASSA_SECRET_KEY)
          return guarded({ error: "Provider credentials not configured" }, 503);
        const body = await parseBody(req);
        const payId = String(body?.object?.id || "");
        if (!/^[a-zA-Z0-9-]{8,90}$/.test(payId))
          return guarded({ ok: true, ignored: "invalid_reference" });
        if (body?.type !== "notification")
          return guarded({ ok: true, ignored: "not_notification" });
        if (!db || !await schema)
          return guarded({ error: "Database unavailable" }, 503);
        if (body.event === "refund.succeeded") {
          const paymentReference = String(body?.object?.payment_id || "");
          if (!/^[a-zA-Z0-9-]{8,90}$/.test(paymentReference))
            return guarded({ ok: true, ignored: "invalid_payment_reference" });
          const known = await db.unsafe("SELECT id FROM liz_orders WHERE provider_payment_id=$1 LIMIT 1", [paymentReference]);
          if (!known.length)
            return guarded({ ok: true, ignored: "unknown_order" });
          const ref = await yk("refunds/" + encodeURIComponent(payId), "GET");
          if (ref?.payment_id !== paymentReference)
            return guarded({ error: "Refund payment reference mismatch" }, 422);
          const cents = exactKopeks(ref?.amount?.value);
          if (ref?.id !== payId || ref.status !== "succeeded" || ref.amount?.currency !== "RUB" || !cents || !/^[a-zA-Z0-9-]{8,90}$/.test(String(ref.payment_id || "")))
            return guarded({ error: "Refund verification failed" }, 422);
          const decision = await applyProviderRefund(db, ref);
          return guarded({ ok: true, refund: decision });
        }
        if (!["payment.succeeded", "payment.canceled", "payment.waiting_for_capture"].includes(body.event))
          return guarded({ ok: true, ignored: "unsupported_event" });
        const known = await db.unsafe("SELECT id FROM liz_orders WHERE provider_payment_id=$1 LIMIT 1", [payId]);
        if (!known.length) {
          const pendingOrder = String(body?.object?.metadata?.order_id || "");
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pendingOrder)) {
            const pending = await db.unsafe("SELECT id FROM liz_orders WHERE id=$1::uuid AND status='creating' AND provider_payment_id IS NULL LIMIT 1", [pendingOrder]);
            if (pending.length)
              return guarded({ error: "Order payment reference is being saved; retry notification" }, 503);
          }
          return guarded({ ok: true, ignored: "unknown_order" });
        }
        const provider = await yk("payments/" + encodeURIComponent(payId), "GET");
        const result = await handleProviderPayment(provider);
        if (["metadata_mismatch", "amount_mismatch"].includes(result))
          console.error("YooKassa reconcile mismatch", result);
        return guarded({ ok: true, result });
      }
      if (req.method === "POST" && path === "/v1/order/status") {
        const data = await parseBody(req), identity = await paymentClient(req, data);
        if (!identity)
          return guarded({ error: "Unverified browser Telegram login" }, 401);
        if (!/^[0-9a-f-]{36}$/i.test(String(data.orderId || "")))
          return guarded({ error: "Invalid order" }, 400);
        if (!db || !await schema)
          return guarded({ error: "db unavailable" }, 503);
        const existing = await db.unsafe("SELECT id,status,provider_payment_id,activated_at,needs_review FROM liz_orders WHERE id=$1::uuid AND telegram_id=$2", [data.orderId, identity.id]);
        if (!existing.length)
          return guarded({ error: "Order not found" }, 404);
        const order = existing[0];
        if (order.status === "pending" && order.provider_payment_id && Bun.env.YOOKASSA_SHOP_ID && Bun.env.YOOKASSA_SECRET_KEY) {
          const current = await yk("payments/" + encodeURIComponent(order.provider_payment_id), "GET");
          await handleProviderPayment(current);
        }
        const rows = await db.unsafe("SELECT status,activated_at,needs_review FROM liz_orders WHERE id=$1::uuid", [data.orderId]);
        const sub = (await db.unsafe("SELECT valid_until FROM liz_subscriptions WHERE telegram_id=$1", [identity.id]))[0];
        return guarded({ status: rows[0]?.status, activated: !!rows[0]?.activated_at, needsReview: !!rows[0]?.needs_review, validUntil: sub?.valid_until || null });
      }
      if (req.method === "POST" && path === "/v1/subscription") {
        const data = await parseBody(req), identity = await paymentClient(req, data);
        if (!identity)
          return guarded({ error: "Unverified login" }, 401);
        if (!db || !await schema)
          return guarded({ error: "db unavailable" }, 503);
        const rows = await db.unsafe("SELECT valid_until,source FROM liz_subscriptions WHERE telegram_id=$1", [identity.id]);
        return guarded({ active: !!rows[0] && Date.parse(rows[0].valid_until) > Date.now(), validUntil: rows[0]?.valid_until || null, source: rows[0]?.source || null });
      }
      return guarded({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Payment API error:", String(error?.message || error));
      if (String(error?.message || "") === "payload_too_large")
        return guarded({ error: "Request too large" }, 413);
      if(error instanceof SyntaxError)return guarded({error:"Invalid JSON"},400);
      return guarded({ error: "Temporary backend failure; no payment status is assumed" }, 503);
    }
  }
});
