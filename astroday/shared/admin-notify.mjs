// ---------------------------------------------------------------------------
// ASTRODAY: уведомления владельцам в закрытую группу через отдельного бота.
// Запись — в таблицу-очередь (никогда не мешает основной операции); отправка — пачками
// с паузами (лимит Telegram для групп ~20 сообщений в минуту).
// ADMIN_NOTIFY_BOT_TOKEN + ADMIN_NOTIFY_CHAT_ID задаются только в переменных Railway.
// ---------------------------------------------------------------------------
var ADMIN_OUTBOX_DDL = "CREATE TABLE IF NOT EXISTS astroday_admin_outbox(id BIGSERIAL PRIMARY KEY,kind TEXT NOT NULL,dedupe_key TEXT UNIQUE,body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),sent_at TIMESTAMPTZ,attempts INT NOT NULL DEFAULT 0,last_error TEXT,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";
var adminOutboxReady = new WeakMap();
async function ensureAdminOutbox(db) {
  let t = adminOutboxReady.get(db);
  if (!t) { t = db.unsafe(ADMIN_OUTBOX_DDL).then(() => true); adminOutboxReady.set(db, t); }
  try { await t; } catch (e) { adminOutboxReady.delete(db); throw e; }
}
function adminEsc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
async function adminWho(db, telegramId) {
  const r = (await db.unsafe("SELECT c.telegram_username,p.preferred_name,t.handle_key FROM liz_clients c LEFT JOIN liz_birth_profiles p ON p.telegram_id=c.telegram_id LEFT JOIN liz_astro_testers t ON t.verified_telegram_id=c.telegram_id WHERE c.telegram_id=$1", [String(telegramId)]).catch(() => []))[0] || {};
  return [r.preferred_name, r.telegram_username ? "@" + r.telegram_username : null, r.handle_key && r.handle_key !== r.telegram_username ? "[" + r.handle_key + "]" : null, "id " + telegramId].filter(Boolean).join(" · ");
}
// Никогда не бросает исключение наружу.
async function adminNotify(db, kind, html, dedupeKey = null) {
  try {
    await ensureAdminOutbox(db);
    const body = html.length > 3900 ? html.slice(0, 3880) + "\n…(обрезано)" : html;
    await db.unsafe("INSERT INTO astroday_admin_outbox(kind,dedupe_key,body) VALUES($1,$2,$3) ON CONFLICT(dedupe_key) DO NOTHING", [kind, dedupeKey, body]);
  } catch (e) {
    console.error("ADMIN_NOTIFY_ENQUEUE_FAIL " + String(e?.message || e).slice(0, 80));
  }
}
async function drainAdminOutbox(db, limit = 12) {
  const token = Bun.env.ADMIN_NOTIFY_BOT_TOKEN, chat = Bun.env.ADMIN_NOTIFY_CHAT_ID;
  if (!token || !chat) return { skipped: "admin_chat_not_configured" };
  await ensureAdminOutbox(db);
  let sent = 0, failed = 0;
  for (let i = 0; i < limit; i++) {
    const rows = await db.unsafe("UPDATE astroday_admin_outbox SET attempts=attempts+1,next_attempt_at=NOW()+INTERVAL '2 minutes' WHERE id=(SELECT id FROM astroday_admin_outbox WHERE sent_at IS NULL AND attempts<5 AND next_attempt_at<=NOW() AND created_at>NOW()-INTERVAL '24 hours' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,body");
    if (!rows.length) break;
    let r, data;
    try {
      r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: rows[0].body, parse_mode: "HTML", disable_web_page_preview: true, disable_notification: true }), signal: AbortSignal.timeout(10000) });
      data = await r.json().catch(() => null);
    } catch { data = null; }
    if (data?.ok === true) { sent++; await db.unsafe("UPDATE astroday_admin_outbox SET sent_at=NOW(),last_error=NULL WHERE id=$1", [rows[0].id]); }
    else {
      failed++;
      const after = Number(data?.parameters?.retry_after || 0);
      await db.unsafe("UPDATE astroday_admin_outbox SET last_error=$2,next_attempt_at=NOW()+make_interval(secs=>$3::int) WHERE id=$1", [rows[0].id, String(data?.description || "network").slice(0, 120), Math.max(60, after)]);
      if (r?.status === 429 || !data) break;
    }
    await new Promise((res) => setTimeout(res, 3100));
  }
  return { sent, failed };
}
// ---------------------------------------------------------------------------
