// Рассылка тестерам 07:00 по Кемерово: окно, позднее восстановление, дубли, блокировка, отчёт владельцам.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { freshDb } from "./harness.mjs";
process.env.ASTRODAY_UNIT_TEST = "true";
const { runDaily } = await import("../release/daily7.ts");
let db;
const sends = [];
let fail = null;
const fakeSend = async (url, init) => {
  const body = JSON.parse(init.body);
  sends.push(body);
  if (fail && fail.chat === String(body.chat_id)) return new Response(JSON.stringify({ ok: false, error_code: fail.code, description: "x" }), { status: fail.code });
  return new Response(JSON.stringify({ ok: true, result: { message_id: 100 + sends.length } }));
};
const at = (kemerovoLocal) => new Date(kemerovoLocal + "+07:00");
beforeAll(async () => {
  db = await freshDb("astroday_daily7");
  await db.unsafe("CREATE TABLE liz_clients(telegram_id TEXT PRIMARY KEY,notify_enabled BOOLEAN NOT NULL DEFAULT TRUE)");
  await db.unsafe("CREATE TABLE liz_tester_forecasts(handle_key TEXT,forecast_day DATE,body TEXT,created_at TIMESTAMPTZ DEFAULT NOW())");
  for (const [h, id] of [["t1", "801"], ["t2", "802"], ["t3", "803"]]) {
    await db`INSERT INTO liz_astro_testers(handle_key,telegram_username,display_name,birth_local_date,birth_local_time,birth_utc,birth_city,birth_region,birth_lat,birth_lon,birth_zone,birth_time_precision,forecast_zone_assumed,delivery_hour_assumed,trial_start,trial_end_exclusive,identity_status,consent_status,subscription_status,profile_hash,verified_telegram_id) VALUES(${h},${h},'Имя','1990-01-01','10:00','1990-01-01T03:00:00Z','К','К',55,86,'Asia/Novokuznetsk','exact_reported','Asia/Novokuznetsk',7,'2026-11-13','2026-12-18','verified_via_bot','confirmed_by_account_holder','trial_granted','h',${id})`;
    await db`INSERT INTO liz_tester_forecasts(handle_key,forecast_day,body) VALUES(${h},'2026-11-18',${"🔮 18 НОЯБРЯ\nТЕКСТ " + h})`;
  }
  await db`INSERT INTO astroday_tester_joins(telegram_id,handle_key,notifications_enabled) VALUES('803','t3',false)`;
});
afterAll(async () => { await db?.close(); });

test("до 07:00 ничего не отправляется", async () => {
  const s = await runDaily(db, "tok", fakeSend, at("2026-11-18T06:59:00"));
  expect(s.sent).toBe(0); expect(sends.length).toBe(0);
});
test("в 07:00 отправка всем, кроме поставивших паузу; t2 заблокировал бота", async () => {
  fail = { chat: "802", code: 403 };
  const s = await runDaily(db, "tok", fakeSend, at("2026-11-18T07:00:30"));
  expect(s.sent).toBe(1); expect(s.blocked).toBe(1);
  expect(sends.filter((x) => x.chat_id === "803").length).toBe(0);
  fail = null;
});
test("повторный запуск не дублирует, заблокированному не долбим", async () => {
  const before = sends.length;
  const s = await runDaily(db, "tok", fakeSend, at("2026-11-18T07:05:00"));
  expect(sends.length).toBe(before); expect(s.sent).toBe(0);
});
test("пропущенное окно: в 09:40 прогноз дня уходит (с пометкой «с опозданием»)", async () => {
  await db`INSERT INTO liz_tester_forecasts(handle_key,forecast_day,body) VALUES('t1','2026-11-19','🔮 19 НОЯБРЯ\nТЕКСТ')`;
  const s = await runDaily(db, "tok", fakeSend, at("2026-11-19T09:40:00"));
  expect(s.sent).toBe(1);
  const notes = await db`SELECT body FROM astroday_admin_outbox WHERE kind='forecast_sent' ORDER BY id DESC LIMIT 1`;
  expect(notes[0].body).toContain("с опозданием");
});
test("после 12:00 поздняя доставка не начинается", async () => {
  await db`INSERT INTO liz_tester_forecasts(handle_key,forecast_day,body) VALUES('t1','2026-11-20','🔮 20 НОЯБРЯ\nТЕКСТ')`;
  const s = await runDaily(db, "tok", fakeSend, at("2026-11-20T12:00:00"));
  expect(s.sent).toBe(0);
});
test("владельцам: текст отправленного прогноза и сводка", async () => {
  const rows = await db`SELECT kind,body FROM astroday_admin_outbox ORDER BY id`;
  expect(rows.some((r) => r.kind === "forecast_sent" && r.body.includes("ТЕКСТ t1"))).toBe(true);
  expect(rows.some((r) => r.kind === "alert" && r.body.includes("бот заблокирован"))).toBe(true);
  expect(rows.some((r) => r.kind === "summary")).toBe(true);
});
