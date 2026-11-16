// ASTRODAY tester delivery — astroday-daily7-20261117-r2
// 07:00 по Кемерово (Asia/Novokuznetsk). Если утреннее окно пропущено (простой сервиса),
// прогноз этого дня всё равно уходит позже — до 12:00 по Кемерово. Дубли исключены ключом
// (handle_key, день). Неопределённый результат отправки не повторяется вслепую.
// Каждая отправка дублируется владельцам в закрытую группу (через очередь astroday_admin_outbox).
import { SQL } from "bun";

const DELIVERY_ZONE = "Asia/Novokuznetsk";
const START_HOUR = 7, LATE_UNTIL_HOUR = 12;
function deliveryDay(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: DELIVERY_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  const hour = Number(p.hour);
  return { day: p.year + "-" + p.month + "-" + p.day, due: hour >= START_HOUR && hour < LATE_UNTIL_HOUR, late: hour > START_HOUR || Number(p.minute) >= 20 };
}
function trialActive(user, day) { return typeof user.trial_start === "string" && typeof user.trial_end === "string" && day >= user.trial_start && day < user.trial_end; }
function telegramText(body) { return String(body).split("\n").map((line) => { const t = line.trim(); let out = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/\*\*/g, ""); if (t.length > 0 && t.length < 115 && (t.startsWith("🔮") || /^[^\p{Ll}]{0,5}[\p{Lu}\d][^\p{Ll}]*$/u.test(t)) && !out.includes("<b>")) out = "<b>" + out + "</b>"; return out; }).join("\n"); }
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function admin(db, kind, body, key = null) {
  try {
    await db.unsafe("INSERT INTO astroday_admin_outbox(kind,dedupe_key,body) VALUES($1,$2,$3) ON CONFLICT(dedupe_key) DO NOTHING", [kind, key, body.length > 3900 ? body.slice(0, 3880) + "\n…(обрезано)" : body]);
  } catch (e) { console.error("DAILY7_ADMIN_ENQUEUE_FAIL " + String(e?.message || e).slice(0, 80)); }
}

export async function runDaily(db, token, send = fetch, now = new Date()) {
  const { day, due, late } = deliveryDay(now);
  const stats = { day, eligible: 0, due: 0, sent: 0, errors: 0, review: 0, skipped: 0, blocked: 0, late };
  if (day < "2026-11-17" || !due) return stats;
  if (!token) throw Error("telegram_not_configured");
  await db.unsafe("CREATE TABLE IF NOT EXISTS astroday_daily_delivery_claims(handle_key text NOT NULL,forecast_day date NOT NULL,status text NOT NULL,attempts int NOT NULL DEFAULT 1,message_id text,error_code text,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(handle_key,forecast_day))");
  await db.unsafe("CREATE TABLE IF NOT EXISTS astroday_admin_outbox(id BIGSERIAL PRIMARY KEY,kind TEXT NOT NULL,dedupe_key TEXT UNIQUE,body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),sent_at TIMESTAMPTZ,attempts INT NOT NULL DEFAULT 0,last_error TEXT,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const people = await db.unsafe("SELECT t.handle_key,t.telegram_username,t.display_name,t.verified_telegram_id::text AS chat_id,t.trial_start::date::text AS trial_start,t.trial_end_exclusive::date::text AS trial_end FROM liz_astro_testers t WHERE t.consent_status='confirmed_by_account_holder' AND t.verified_telegram_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM astroday_tester_joins j WHERE j.telegram_id=t.verified_telegram_id AND j.notifications_enabled=false) AND NOT EXISTS(SELECT 1 FROM liz_clients c WHERE c.telegram_id=t.verified_telegram_id AND c.notify_enabled=false)");
  stats.eligible = people.length;
  for (const user of people) {
    if (!trialActive(user, day)) { stats.skipped++; continue; }
    stats.due++;
    const key = "daily7:2026:" + user.handle_key + ":" + day;
    const previous = await db.unsafe("SELECT status FROM liz_manual_telegram_tests WHERE test_key=$1 AND status='sent'", [key]);
    if (previous.length) { stats.skipped++; continue; }
    const forecasts = await db.unsafe("SELECT body FROM liz_tester_forecasts WHERE handle_key=$1 AND forecast_day=$2::date ORDER BY created_at DESC LIMIT 1", [user.handle_key, day]);
    const who = [user.display_name, user.telegram_username ? "@" + user.telegram_username : null, "[" + user.handle_key + "]"].filter(Boolean).join(" · ");
    if (typeof forecasts[0]?.body !== "string" || !forecasts[0].body.trim() || forecasts[0].body.length > 4000) {
      stats.errors++; console.error("DAILY7_FORECAST_INVALID " + user.handle_key);
      await admin(db, "alert", "⚠️ <b>Нет текста прогноза тестеру</b>\n" + esc(who) + "\n" + day, "d7missing:" + key);
      continue;
    }
    const text = telegramText(forecasts[0].body);
    const claim = await db.unsafe("INSERT INTO astroday_daily_delivery_claims(handle_key,forecast_day,status) VALUES($1,$2::date,'sending') ON CONFLICT(handle_key,forecast_day) DO UPDATE SET status='sending',attempts=astroday_daily_delivery_claims.attempts+1,updated_at=now() WHERE astroday_daily_delivery_claims.status='retry' AND astroday_daily_delivery_claims.attempts<3 RETURNING handle_key", [user.handle_key, day]);
    if (!claim.length) { stats.skipped++; continue; }
    // Повторная проверка согласия после захвата: /stop во время прохода соблюдается.
    const allowed = await db.unsafe("SELECT 1 FROM liz_astro_testers t WHERE t.handle_key=$1 AND t.verified_telegram_id=$2 AND t.consent_status='confirmed_by_account_holder' AND t.trial_start<=$3::date AND t.trial_end_exclusive>$3::date AND NOT EXISTS(SELECT 1 FROM astroday_tester_joins j WHERE j.telegram_id=$2 AND j.notifications_enabled=false) AND NOT EXISTS(SELECT 1 FROM liz_clients c WHERE c.telegram_id=$2 AND c.notify_enabled=false)", [user.handle_key, user.chat_id, day]);
    if (!allowed.length) { await db.unsafe("UPDATE astroday_daily_delivery_claims SET status='cancelled',updated_at=now() WHERE handle_key=$1 AND forecast_day=$2::date", [user.handle_key, day]); stats.skipped++; continue; }
    let result, response;
    try {
      result = await send("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: user.chat_id, text, parse_mode: "HTML", disable_notification: false, disable_web_page_preview: true }), signal: AbortSignal.timeout(14000) });
      response = await result.json();
    } catch {
      // Telegram мог принять сообщение, а ответ потерялся. Не отправляем повторно вслепую.
      await db.unsafe("UPDATE astroday_daily_delivery_claims SET status='review',error_code='delivery_outcome_unknown',updated_at=now() WHERE handle_key=$1 AND forecast_day=$2::date", [user.handle_key, day]);
      stats.review++;
      await admin(db, "alert", "⚠️ <b>Неясно, дошёл ли прогноз тестеру</b> (сеть) — повторно не шлём\n" + esc(who) + "\n" + day, "d7review:" + key);
      continue;
    }
    if (response?.ok === true && Number.isSafeInteger(response.result?.message_id)) {
      const message = String(response.result.message_id);
      await db.begin(async (tx) => {
        await tx.unsafe("UPDATE astroday_daily_delivery_claims SET status='sent',message_id=$3,updated_at=now() WHERE handle_key=$1 AND forecast_day=$2::date", [user.handle_key, day, message]);
        await tx.unsafe("INSERT INTO liz_manual_telegram_tests(test_key,handle_key,forecast_date,status,telegram_message_id,sent_at) VALUES($1,$2,$3::date,'sent',$4,now()) ON CONFLICT(test_key) DO NOTHING", [key, user.handle_key, day, message]);
      });
      stats.sent++;
      await admin(db, "forecast_sent", "✅ <b>Прогноз тестеру отправлен</b>" + (late ? " (с опозданием)" : "") + "\n" + esc(who) + "\n" + day + "\n\n" + esc(forecasts[0].body), "d7sent:" + key);
    } else {
      const code = Number(response?.error_code || 0);
      const state = code === 403 ? "blocked" : response?.ok === false ? "retry" : "review";
      await db.unsafe("UPDATE astroday_daily_delivery_claims SET status=$3,error_code=$4,updated_at=now() WHERE handle_key=$1 AND forecast_day=$2::date", [user.handle_key, day, state, "telegram_" + String(code || "invalid_response")]);
      if (code === 403) stats.blocked++; else stats.errors++;
      await admin(db, "alert", "⚠️ <b>Прогноз тестеру не доставлен</b> (Telegram " + (code || "?") + (code === 403 ? ", бот заблокирован" : "") + ")\n" + esc(who) + "\n" + day, "d7fail:" + key + ":" + code);
      if (code === 429) break; // лимит Telegram: остальные — на следующем запуске (через 5 минут)
    }
  }
  if (stats.sent || stats.errors || stats.review || stats.blocked)
    await admin(db, "summary", "📬 <b>Рассылка тестерам " + day + "</b>: отправлено " + stats.sent + (stats.errors ? ", ошибок " + stats.errors : "") + (stats.blocked ? ", заблокировали бота " + stats.blocked : "") + (stats.review ? ", под вопросом " + stats.review : ""), null);
  return stats;
}
if (Bun.env.ASTRODAY_UNIT_TEST !== "true") {
  const db = new SQL(Bun.env.DATABASE_URL);
  try { console.log("DAILY7_AUDIT " + JSON.stringify(await runDaily(db, Bun.env.TELEGRAM_BOT_TOKEN))); }
  catch (e) { console.error("DAILY7_FATAL " + String(e?.message || "unknown")); process.exitCode = 1; }
  finally { await db.close(); }
}
