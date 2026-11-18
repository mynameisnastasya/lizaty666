// ASTRODAY 2.0 — доставка готовых прогнозов в выбранное пользователем время (IANA-зона текущего города).
// Ничего не генерирует: берёт проверенный текст из astroday_v2_forecasts. Нет текста — повышает приоритет и ждёт.
import { ensureSchema, loadUser, accessCovers, currentForecast, prioritize } from "./queue.mjs";
import { localDay, localHM, addDays, validZone } from "./timefmt.mjs";
import { splitHtml } from "./bot.mjs";

const minutes = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

export async function deliveryTick(db, { tg, now = Date.now(), lateWindowMin = 720, alert = async () => {} }) {
  await ensureSchema(db);
  const ids = (await db.unsafe(`SELECT u.telegram_id FROM astroday_v2_users u JOIN liz_subscriptions s USING(telegram_id) JOIN liz_birth_profiles p USING(telegram_id)
      LEFT JOIN astroday_v2_prefs pr USING(telegram_id) LEFT JOIN liz_clients c USING(telegram_id) LEFT JOIN liz_tg_consents g USING(telegram_id)
      WHERE u.enabled AND s.valid_until>NOW()-interval '1 day' AND COALESCE(pr.delivery_enabled, TRUE) AND COALESCE(c.notify_enabled, TRUE) AND c.bot_blocked_at IS NULL AND COALESCE(g.daily_delivery, p.consented_to_daily, FALSE)`)).map((r) => r.telegram_id);
  const stats = { checked: ids.length, sent: 0, notReady: 0, skipped: 0, errors: 0, review: 0 };
  for (const id of ids) {
    const u = await loadUser(db, id);
    if (!u || !validZone(u.time_zone)) { stats.skipped++; continue; }
    const day = localDay(u.time_zone, now);
    const hm = localHM(u.time_zone, now);
    const want = u.delivery_time || "08:00";
    const late = minutes(hm) - minutes(want);
    // заблаговременная проверка: к 20:00 местного завтрашний прогноз должен быть готов
    if (minutes(hm) >= 20 * 60) {
      const t = addDays(day, 1);
      if (accessCovers(u, t, now)) { const f = await currentForecast(db, id, t); if (!f || f.status !== "ready") { await prioritize(db, id, t); await alertOnce(db, alert, "tomorrow_not_ready:" + id + ":" + t, "⚠️ Прогноз на завтра ещё не готов: " + id + " " + t + " (" + (f?.status || "нет строки") + (f?.error ? ", " + f.error : "") + ")"); } }
    }
    if (late < 0 || late > lateWindowMin || !accessCovers(u, day, now)) continue;
    const done = (await db.unsafe("SELECT status FROM astroday_v2_deliveries WHERE telegram_id=$1 AND forecast_date=$2::date", [id, day]))[0];
    if (done && done.status !== "failed") continue;
    const f = await currentForecast(db, id, day);
    if (!f || f.status !== "ready" || !f.body_html) {
      stats.notReady++;
      await prioritize(db, id, day);
      if (late >= 30) await alertOnce(db, alert, "late:" + id + ":" + day, "⚠️ Прогноз не готов к времени рассылки: " + id + " " + day + " (" + (f?.status || "нет строки") + ")");
      continue;
    }
    // захват: одна отправка на (человек, дата) даже при параллельных планировщиках
    const claim = await db.unsafe(`INSERT INTO astroday_v2_deliveries(telegram_id, forecast_date, status) VALUES($1,$2::date,'sending')
        ON CONFLICT(telegram_id, forecast_date) DO UPDATE SET status='sending', attempts=astroday_v2_deliveries.attempts+1, updated_at=NOW()
        WHERE astroday_v2_deliveries.status='failed' AND astroday_v2_deliveries.attempts<3 RETURNING telegram_id`, [id, day]);
    if (!claim.length) { stats.skipped++; continue; }
    const parts = splitHtml(f.body_html);
    const ids2 = [];
    let state = "sent", err = null;
    for (const part of parts) {
      let r;
      try { r = await tg("sendMessage", { chat_id: id, text: part, parse_mode: "HTML", disable_web_page_preview: true }); }
      catch { state = "review"; err = "outcome_unknown"; break; } // ответ потерян — не переотправляем вслепую
      if (r?.ok && r.result?.message_id) { ids2.push(r.result.message_id); continue; }
      state = r?.error_code === 403 ? "failed" : "failed"; err = "telegram_" + (r?.error_code || "invalid");
      if (r?.error_code === 403) await db.unsafe("UPDATE liz_clients SET bot_blocked_at=NOW(), updated_at=NOW() WHERE telegram_id=$1", [id]);
      break;
    }
    if (state === "failed" && ids2.length) state = "review"; // часть уже ушла — повтор вслепую запрещён
    await db.unsafe("UPDATE astroday_v2_deliveries SET status=$3, message_ids=$4::jsonb, error=$5, updated_at=NOW() WHERE telegram_id=$1 AND forecast_date=$2::date", [id, day, state, ids2, err]);
    if (state === "sent") stats.sent++; else if (state === "review") stats.review++; else stats.errors++;
  }
  return stats;
}

async function alertOnce(db, alert, key, text) {
  const r = await db.unsafe("INSERT INTO astroday_v2_alerts(alert_key) VALUES($1) ON CONFLICT DO NOTHING RETURNING alert_key", [key]);
  if (r.length) await alert(text).catch(() => {});
}
