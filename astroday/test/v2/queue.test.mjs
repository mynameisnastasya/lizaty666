import { test, expect, beforeAll, afterAll } from "bun:test";
import { freshDb, addUser } from "./db.mjs";
import { fakeEngine, fakeOpenAI, ENGINE_VERSION, LUNAR_VERSION } from "./fakes.mjs";
import { syncUsers, runWorker, periodStatus, currentForecast, claim, processRow, generationWindow, loadUser, lastAccessDay } from "../../v2/queue.mjs";
import { writeForecast } from "../../v2/editorial.mjs";
import { localDay, addDays } from "../../v2/timefmt.mjs";
import { findProfanity } from "../../v2/profanity.mjs";

let db;
const CFG = { model: "gpt-6.2-astra", engineVersion: ENGINE_VERSION, lunarVersion: LUNAR_VERSION, windowDays: 31 };
const deps = (o = {}) => { const ai = o.ai || fakeOpenAI(); return { engine: o.engine || fakeEngine(), lunarVersion: LUNAR_VERSION, engineVersion: ENGINE_VERSION, dailyRequestBudget: o.budget || 10000, writer: (ctx, x) => writeForecast(ctx, { apiKey: "k", model: CFG.model, fetchImpl: ai, ...x }), ai }; };
beforeAll(async () => { db = await freshDb("v2_queue"); });
afterAll(async () => { await db.close(); });

test("30-дневный доступ → 30 отдельных задач, 30 разных проверенных прогнозов", async () => {
  await addUser(db, { id: "100", days: 30, zone: "Asia/Novosibirsk" });
  const s1 = await syncUsers(db, CFG);
  const user = await loadUser(db, "100");
  const win = generationWindow(user);
  const n = Math.round((Date.parse(win.end) - Date.parse(win.start)) / 86400000) + 1;
  expect(n).toBeGreaterThanOrEqual(30);
  expect(s1.enqueued).toBe(n);
  // повторная синхронизация (рестарт, повторный webhook) не создаёт дублей
  const s2 = await syncUsers(db, CFG);
  expect(s2.enqueued).toBe(0);
  const d = deps();
  const st = await runWorker(db, d, { concurrency: 3, maxRows: 100 });
  expect(st.ready).toBe(n);
  const rows = await db.unsafe("SELECT forecast_date::text AS day, body_html, model_output, status FROM astroday_v2_forecasts WHERE telegram_id='100' AND status='ready' ORDER BY 1");
  expect(rows.length).toBe(n);
  expect(new Set(rows.map((r) => r.body_html)).size).toBe(n);         // каждый день — свой текст
  for (const r of rows) { expect(findProfanity(r.body_html)).toEqual([]); expect(r.body_html.length).toBeLessThan(4000); }
  expect(d.ai.log.length).toBe(n);                                       // ровно один запрос на день
  // повторная обработка не делает лишних запросов
  await runWorker(db, d, { maxRows: 100 });
  expect(d.ai.log.length).toBe(n);
  // локальная дата: первый день = сегодня по Новосибирску
  expect(rows[0].day).toBe(localDay("Asia/Novosibirsk"));
});

test("сбой на части дней не удаляет готовые и восстанавливается", async () => {
  await addUser(db, { id: "200", days: 10, zone: "Europe/Moscow" });
  await syncUsers(db, CFG, { onlyId: "200" });
  const today = localDay("Europe/Moscow");
  const bad = new Set([addDays(today, 3), addDays(today, 6)]);
  const d = deps({ engine: fakeEngine({ failOn: bad }) });
  await runWorker(db, d, { maxRows: 100 });
  const st = Object.fromEntries((await periodStatus(db, "200")).map((r) => [r.status, r.n]));
  expect(st.failed).toBe(2);
  expect(st.ready).toBeGreaterThanOrEqual(8);
  // восстановление: движок снова работает, ошибочные задачи берутся после бэкоффа
  await db.unsafe("UPDATE astroday_v2_forecasts SET next_attempt_at=NOW() WHERE telegram_id='200' AND status='failed'");
  const before = d.ai.log.length;
  await runWorker(db, deps({ ai: d.ai }), { maxRows: 100 });
  const st2 = Object.fromEntries((await periodStatus(db, "200")).map((r) => [r.status, r.n]));
  expect(st2.failed).toBeUndefined();
  expect(d.ai.log.length - before).toBe(2);
});

test("истёкшая аренда (упал процесс) подхватывается, ready не трогается", async () => {
  await addUser(db, { id: "300", days: 3, zone: "Asia/Ho_Chi_Minh" });
  await syncUsers(db, CFG, { onlyId: "300" });
  const [row] = await claim(db, { limit: 1, onlyId: "300", onlyDay: localDay("Asia/Ho_Chi_Minh") });
  expect(row.status).toBe("calculating");
  await db.unsafe("UPDATE astroday_v2_forecasts SET lease_until=NOW()-interval '1 second' WHERE telegram_id='300'");
  const st = await runWorker(db, deps(), { maxRows: 10 });
  expect(st.ready).toBeGreaterThanOrEqual(3);
});

test("изменение анкеты → невыданные дни пересчитываются, смена модели — нет", async () => {
  const before = await db.unsafe("SELECT count(*)::int AS n FROM astroday_v2_forecasts WHERE telegram_id='300' AND status='ready'");
  // смена модели/промпта: готовые тексты остаются
  const s = await syncUsers(db, { ...CFG, model: "gpt-6.2-sol" }, { onlyId: "300" });
  expect(s.invalidated).toBe(0);
  // изменился город/часовой пояс
  await db.unsafe("UPDATE liz_birth_profiles SET time_zone='Europe/Moscow' WHERE telegram_id='300'");
  const s2 = await syncUsers(db, CFG, { onlyId: "300" });
  expect(s2.invalidated).toBe(before[0].n);
  expect(s2.enqueued).toBeGreaterThan(0);
  await runWorker(db, deps(), { maxRows: 20 });
  const cur = await currentForecast(db, "300", localDay("Europe/Moscow"));
  expect(cur.status).toBe("ready");
  expect(cur.time_zone).toBe("Europe/Moscow");
});

test("невалидный ответ модели (мат, цифры) не сохраняется как ready", async () => {
  await addUser(db, { id: "400", days: 1, zone: "Europe/Moscow" });
  await syncUsers(db, CFG, { onlyId: "400" });
  await runWorker(db, deps({ ai: fakeOpenAI({ mode: "profane" }) }), { maxRows: 5 });
  const rows = await db.unsafe("SELECT status, error FROM astroday_v2_forecasts WHERE telegram_id='400'");
  expect(rows.every((r) => r.status !== "ready")).toBe(true);
  expect(rows[0].error).toContain("validation_failed");
});

test("OpenAI 500 → задача в failed с бэкоффом, без падения воркера", async () => {
  await addUser(db, { id: "500", days: 1, zone: "Europe/Moscow" });
  await syncUsers(db, CFG, { onlyId: "500" });
  const st = await runWorker(db, deps({ ai: fakeOpenAI({ mode: "500" }) }), { maxRows: 5 });
  expect(st.failed).toBeGreaterThan(0);
  const r = await db.unsafe("SELECT status, next_attempt_at > NOW() AS later FROM astroday_v2_forecasts WHERE telegram_id='500'");
  expect(r.every((x) => x.status === "failed" && x.later)).toBe(true);
});

test("тестовый доступ: граница доступа по Кемерово — последний день включительно", () => {
  // доступ до полуночи 18.12 по Кемерово (= 17.12 включительно)
  const until = "2026-12-17T17:00:00Z";
  expect(lastAccessDay(until, "Asia/Novokuznetsk")).toBe("2026-12-17");
  expect(lastAccessDay(until, "Europe/Moscow")).toBe("2026-12-17");
  expect(lastAccessDay(until, "Asia/Vladivostok")).toBe("2026-12-18"); // у Владивостока полночь 18-го раньше конца доступа
});

test("Грабитель богатства рассчитан на весь период доступа (6 месяцев)", async () => {
  await addUser(db, { id: "600", days: 183, zone: "Europe/Moscow" });
  await syncUsers(db, CFG, { onlyId: "600" });
  const b = (await db.unsafe("SELECT start_day::text AS s, end_day::text AS e, jsonb_array_length(days) AS n FROM astroday_v2_bazi WHERE telegram_id='600'"))[0];
  const user = await loadUser(db, "600");
  expect(b.e).toBe(lastAccessDay(user.valid_until, user.time_zone));
  expect(b.n).toBeGreaterThan(30);
  // а прогнозы — скользящим окном (не 183 штуки сразу)
  const n = (await db.unsafe("SELECT count(*)::int AS n FROM astroday_v2_forecasts WHERE telegram_id='600'"))[0].n;
  expect(n).toBe(31);
});
