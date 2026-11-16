// ---------------------------------------------------------------------------
// ASTRODAY: выполнение заказа после подтверждённой оплаты (общий модуль API и планировщика).
// Задача создаётся в той же транзакции, что и выдача доступа (applyProviderPayment),
// поэтому «деньги приняты, а задача потерялась» невозможно. Шаги идемпотентны и
// продолжаются после перезапуска с того места, где остановились.
//   paid -> notifying -> notified -> first_queued -> done
//   (+ waiting_profile, review — неопределённый результат отправки, без слепого повтора)
// ---------------------------------------------------------------------------
var FULFILLMENT_DDL = [
  "CREATE TABLE IF NOT EXISTS astroday_fulfillment_jobs(order_id UUID PRIMARY KEY REFERENCES liz_orders(id),telegram_id TEXT NOT NULL REFERENCES liz_clients(telegram_id),kind TEXT NOT NULL CHECK(kind IN ('first_purchase','renewal')),state TEXT NOT NULL DEFAULT 'paid',valid_until TIMESTAMPTZ,attempts INT NOT NULL DEFAULT 0,notify_message_id TEXT,forecast_day DATE,last_error TEXT,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),lease_until TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "CREATE INDEX IF NOT EXISTS astroday_fulfillment_open_idx ON astroday_fulfillment_jobs(state,next_attempt_at)"
];
var fulfillmentSchemaReady = new WeakMap();
async function ensureFulfillmentSchema(db) {
  let t = fulfillmentSchemaReady.get(db);
  if (!t) {
    t = (async () => { for (const q of FULFILLMENT_DDL) await db.unsafe(q); })();
    fulfillmentSchemaReady.set(db, t);
  }
  try { await t; } catch (e) { fulfillmentSchemaReady.delete(db); throw e; }
}
async function fulfillmentTelegram(method, payload) {
  const token = Bun.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { kind: "not_configured" };
  let r, data;
  try {
    r = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(14000) });
    data = await r.json().catch(() => null);
  } catch {
    return { kind: "ambiguous" };
  }
  if (r.ok && data?.ok === true && Number.isInteger(data.result?.message_id)) return { kind: "sent", messageId: String(data.result.message_id) };
  if (r.status === 429) return { kind: "retry", after: Number(data?.parameters?.retry_after || 30) };
  if (r.status === 400 || r.status === 403) return { kind: "rejected", code: "telegram_" + r.status };
  return { kind: "ambiguous" };
}
function fulfillmentDate(d, zone) {
  try { return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: zone || "Europe/Moscow" }).format(d); }
  catch { return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d); }
}
async function processFulfillment(db, options = {}) {
  await ensureFulfillmentSchema(db);
  const stats = { claimed: 0, notified: 0, queued: 0, done: 0, waiting: 0, review: 0, errors: 0 };
  const where = options.orderId ? "order_id=$1::uuid AND " : "";
  const claimed = await db.unsafe("UPDATE astroday_fulfillment_jobs j SET lease_until=NOW()+INTERVAL '2 minutes',attempts=j.attempts+1,updated_at=NOW() WHERE j.order_id IN (SELECT order_id FROM astroday_fulfillment_jobs WHERE " + where + "state IN ('paid','notified','waiting_profile','first_queued') AND next_attempt_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING j.*", options.orderId ? [options.orderId] : []);
  for (const job of claimed) {
    stats.claimed++;
    const release = (state, extra = {}) => db.unsafe("UPDATE astroday_fulfillment_jobs SET state=$2,lease_until=NULL,next_attempt_at=COALESCE($3::timestamptz,NOW()),last_error=$4,notify_message_id=COALESCE($5,notify_message_id),forecast_day=COALESCE($6::date,forecast_day),updated_at=NOW() WHERE order_id=$1::uuid", [job.order_id, state, extra.next || null, extra.error || null, extra.messageId || null, extra.day || null]);
    try {
      const acc = (await db.unsafe("SELECT c.notify_enabled,c.chat_started_at,p.telegram_id IS NOT NULL AS has_profile,p.time_zone,p.delivery_hour_local,p.consented_to_daily,s.valid_until FROM liz_clients c LEFT JOIN liz_birth_profiles p ON p.telegram_id=c.telegram_id LEFT JOIN liz_subscriptions s ON s.telegram_id=c.telegram_id WHERE c.telegram_id=$1", [job.telegram_id]))[0] || {};
      const daily = acc.notify_enabled === true && acc.consented_to_daily === true;
      let state = job.state;
      if (state === "paid") {
        const o = (await db.unsafe("SELECT plan_months,amount_kopeks,provider_mode,receipt_email FROM liz_orders WHERE id=$1::uuid", [job.order_id]))[0] || {};
        await adminNotify(db, "payment", "💳 <b>Оплата прошла" + (o.provider_mode === "test" ? " (ТЕСТОВЫЙ магазин)" : "") + "</b>\n" + adminEsc(await adminWho(db, job.telegram_id)) + "\n" + (o.plan_months || "?") + " мес. · " + new Intl.NumberFormat("ru-RU").format(Number(o.amount_kopeks || 0) / 100) + " ₽ · " + (job.kind === "renewal" ? "продление" : "первая покупка") + "\nДоступ до " + adminEsc(fulfillmentDate(new Date(job.valid_until || acc.valid_until), acc.time_zone)) + (acc.has_profile ? "" : "\n⚠️ Анкета ещё не заполнена"), "payment:" + job.order_id);
        // Отметка до отправки: если процесс упадёт посреди запроса, повторной слепой отправки не будет.
        await db.unsafe("UPDATE astroday_fulfillment_jobs SET state='notifying',updated_at=NOW() WHERE order_id=$1::uuid AND state='paid'", [job.order_id]);
        const until = fulfillmentDate(new Date(job.valid_until || acc.valid_until), acc.time_zone);
        const hour = String(Number.isInteger(Number(acc.delivery_hour_local)) ? Number(acc.delivery_hour_local) : 8).padStart(2, "0") + ":00";
        let text;
        if (job.kind === "renewal") text = "Оплата прошла ✅\nДоступ к ASTRODAY продлён до " + until + ". Прогнозы приходят как обычно 🖤";
        else if (!acc.has_profile) text = "Оплата прошла ✅\nДоступ к ASTRODAY открыт до " + until + ".\n\nОсталось заполнить анкету рождения — как только она будет готова, я посчитаю твою карту и пришлю первый прогноз сюда 🔮";
        else text = "Оплата прошла ✅\nДоступ к ASTRODAY открыт до " + until + ".\n\nСейчас посчитаю твою карту на сегодня и пришлю первый прогноз сюда — обычно это пара минут 🔮" + (daily ? "\nДальше прогноз будет приходить каждый день в " + hour + " по твоему времени." : "\nЕжедневная рассылка сейчас выключена — включить: /resume. Прогноз на сегодня всегда можно открыть: /today.");
        const keyboard = !acc.has_profile ? { reply_markup: { inline_keyboard: [[{ text: "🌙 Заполнить анкету", web_app: { url: "https://lizty666-stage.up.railway.app/login" } }]] } } : {};
        const sent = await fulfillmentTelegram("sendMessage", { chat_id: job.telegram_id, text, disable_web_page_preview: true, ...keyboard });
        if (sent.kind === "sent") { stats.notified++; state = job.kind === "renewal" ? "done" : acc.has_profile ? "notified" : "waiting_profile"; await release(state, { messageId: sent.messageId }); if (state === "done") stats.done++; if (state !== "notified") continue; }
        else if (sent.kind === "retry") { await release("paid", { next: new Date(Date.now() + Math.min(3600, Math.max(5, sent.after)) * 1000).toISOString(), error: "telegram_rate_limit" }); continue; }
        else if (sent.kind === "rejected" || sent.kind === "not_configured") { state = job.kind === "renewal" ? "done" : acc.has_profile ? "notified" : "waiting_profile"; await release(state, { error: "notify_" + (sent.code || sent.kind) }); if (state !== "notified") continue; }
        else { stats.review++; await release("review", { error: "notify_outcome_unknown" }); await adminNotify(db, "alert", "⚠️ <b>Не уверены, дошло ли сообщение об оплате</b>\n" + adminEsc(await adminWho(db, job.telegram_id)) + "\nЗаказ " + job.order_id + " — проверьте вручную, повторно не отправляем."); continue; }
      }
      if (state === "waiting_profile") {
        if (!acc.has_profile) { stats.waiting++; await release("waiting_profile", { next: new Date(Date.now() + 5 * 60000).toISOString() }); continue; }
        state = "notified";
      }
      if (state === "notified") {
        if (!acc.has_profile) { await release("waiting_profile"); continue; }
        const day = localForecastDay(acc.time_zone);
        let item;
        try {
          item = await ensureDailyForecast(db, job.telegram_id, day);
        } catch (e) {
          if (e?.code === "active_subscription_required") { await release("done", { error: "access_ended" }); stats.done++; continue; }
          stats.waiting++;
          await release("notified", { next: new Date(Date.now() + (e?.code === "forecast_preparing_retry" ? 2 : 5) * 60000).toISOString(), error: String(e?.code || e?.message || "forecast_failed").slice(0, 80) });
          continue;
        }
        if (item.sent_at || item.status === "sent") { await release("done", { day }); stats.done++; continue; }
        if (daily) {
          // Первый результат идёт через обычный механизм доставки (частями, без дублей), но сразу.
          await db.unsafe("UPDATE liz_daily_messages SET due_at=LEAST(due_at,NOW()),delivery_purpose='first_result',status=CASE WHEN status='cancelled' AND sent_at IS NULL AND telegram_next_part_index=0 THEN 'pending' ELSE status END WHERE id=$1::uuid AND sent_at IS NULL", [item.id]);
          stats.queued++;
          await release("first_queued", { day });
        } else {
          const sent = await fulfillmentTelegram("sendMessage", { chat_id: job.telegram_id, text: renderTelegramPlain(item.body), parse_mode: "HTML", disable_web_page_preview: true });
          if (sent.kind === "sent") { stats.done++; await release("done", { day, messageId: sent.messageId }); }
          else if (sent.kind === "retry") await release("notified", { next: new Date(Date.now() + sent.after * 1000).toISOString(), error: "telegram_rate_limit" });
          else if (sent.kind === "rejected") { stats.done++; await release("done", { day, error: "first_result_" + sent.code }); }
          else { stats.review++; await release("review", { day, error: "first_result_outcome_unknown" }); }
        }
        continue;
      }
      if (state === "first_queued") {
        const row = (await db.unsafe("SELECT status,sent_at FROM liz_daily_messages WHERE telegram_id=$1 AND forecast_date=$2::date", [job.telegram_id, job.forecast_day]))[0];
        if (!row) { await release("notified"); continue; }
        if (row.status === "sent") { stats.done++; await release("done"); continue; }
        if (["failed_permanent", "needs_review", "cancelled"].includes(row.status)) { stats.done++; await release("done", { error: "first_result_" + row.status }); continue; }
        await release("first_queued"); // проверяется на каждом проходе: доставка идёт в этом же запуске
      }
    } catch (e) {
      stats.errors++;
      console.error("FULFILLMENT_ERROR " + JSON.stringify({ order: job.order_id, code: String(e?.code || e?.message || "unknown").slice(0, 80) }));
      await db.unsafe("UPDATE astroday_fulfillment_jobs SET lease_until=NULL,next_attempt_at=NOW()+INTERVAL '5 minutes',last_error=$2,updated_at=NOW() WHERE order_id=$1::uuid AND state<>'notifying'", [job.order_id, String(e?.message || "unknown").slice(0, 120)]).catch(() => {});
    }
  }
  return stats;
}
function renderTelegramPlain(text) {
  return String(text).split("\n").map((line) => {
    const t = line.trim();
    let rich = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (t.length > 0 && t.length < 115 && (t.startsWith("🔮") || /^[^\p{Ll}]{0,5}[\p{Lu}\d][^\p{Ll}]*$/u.test(t))) rich = "<b>" + rich + "</b>";
    return rich;
  }).join("\n");
}
// ---------------------------------------------------------------------------
// Сравнение моделей OpenAI на реальном расчёте (включается переменными, ничего не отправляет пользователю):
// OPENAI_MODEL_TRIAL="gpt-4.1,gpt-6-luna" и OPENAI_MODEL_TRIAL_TELEGRAM_ID=<id>. Черновики уходят только владельцам.
async function editorialModelTrial(db) {
  const models = String(Bun.env.OPENAI_MODEL_TRIAL || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5);
  let id = String(Bun.env.OPENAI_MODEL_TRIAL_TELEGRAM_ID || "");
  if (!id && Bun.env.OPENAI_MODEL_TRIAL_HANDLE)
    id = String((await db.unsafe("SELECT verified_telegram_id FROM liz_astro_testers WHERE handle_key=$1", [Bun.env.OPENAI_MODEL_TRIAL_HANDLE]))[0]?.verified_telegram_id || "");
  if (!models.length || !/^\d+$/.test(id)) return { skipped: true };
  const p = (await db.unsafe("SELECT p.*,p.birth_local_date::text AS birth_day FROM liz_birth_profiles p WHERE telegram_id=$1", [id]))[0];
  if (!p) return { skipped: "no_profile" };
  const day = localForecastDay(p.time_zone);
  const done = await db.unsafe("SELECT 1 FROM astroday_admin_outbox WHERE dedupe_key=$1", ["trial:" + day + ":" + models.join(",")]).catch(() => []);
  if (done.length) return { skipped: "already_done_today" };
  const r = await fetch("http://liz-astro-v2.railway.internal:8080/v2/forecast", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (Bun.env.ASTRO_INTERNAL_TOKEN || "") }, body: JSON.stringify({ day, timeZone: p.time_zone, birth: { at: new Date(p.birth_at_iso).toISOString(), latitude: Number(p.birth_lat), longitude: Number(p.birth_lon), accurateBirthTime: p.birth_time_verified === true } }), signal: AbortSignal.timeout(45000) });
  if (!r.ok) return { error: "engine_" + r.status };
  const calc = await r.json();
  const opts = { preferredName: p.preferred_name || "", recentTexts: [] };
  const brief = getEditorialBrief(calc, opts);
  const results = [];
  for (const model of models) {
    const cfg = { ...lizaEditorialConfig(), model, enabled: !!Bun.env.OPENAI_API_KEY };
    const t0 = Date.now();
    try {
      const w = await lizaWriteForecast(db, brief, opts, cfg);
      const a = w.meta.attempts;
      results.push({ model, ok: true, ms: Date.now() - t0, attempts: a.length, tokensIn: a.reduce((s, x) => s + Number(x.inputTokens || 0), 0), tokensOut: a.reduce((s, x) => s + Number(x.outputTokens || 0), 0) });
      await adminNotify(db, "trial", "🧪 <b>Пробный текст модели " + adminEsc(model) + "</b> (пользователю не отправлялся)\n" + (Date.now() - t0) + " мс · попыток " + a.length + "\n\n" + adminEsc(w.text));
    } catch (e) {
      results.push({ model, ok: false, ms: Date.now() - t0, code: e?.code || String(e?.message || e).slice(0, 60), reasons: e?.detail?.attempts?.map((x) => x.reasons) || null });
    }
  }
  console.log("EDITORIAL_MODEL_TRIAL " + JSON.stringify(results));
  await adminNotify(db, "trial", "🧪 <b>Сравнение моделей</b>\n" + adminEsc(JSON.stringify(results)), "trial:" + day + ":" + models.join(","));
  return results;
}
