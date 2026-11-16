// OpenAI-сбои, проверка ответа, фолбэк, бюджет; доставка: параллельные планировщики, блокировка, перезапуск, позднее окно.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { Mocks, freshDb, startApi, runScheduler, update, sendUpdate, miniSession, registerProfile, waitFor, localDay } from "./harness.mjs";

const DB = "astroday_editorial";
let mocks, db, api;
const users = { a: "720000001", b: "720000002", c: "720000003" };
async function makePaidUser(id, profile = {}) {
  await sendUpdate(api, update(id, "/start"));
  const s = await miniSession(api, id, "u" + id);
  const r = await registerProfile(api, s.cookie, profile);
  if (r.status !== 200) throw Error("register " + JSON.stringify(r.body));
  await db`INSERT INTO liz_subscriptions(telegram_id,valid_until,source) VALUES(${id},NOW()+INTERVAL '30 days','yookassa') ON CONFLICT(telegram_id) DO UPDATE SET valid_until=EXCLUDED.valid_until`;
}
const row = async (id) => (await db`SELECT * FROM liz_daily_messages WHERE telegram_id=${id}`)[0];
beforeAll(async () => {
  mocks = new Mocks().start();
  db = await freshDb(DB);
  api = await startApi(mocks, DB);
  await runScheduler(mocks, DB);
  // delivery hour in the past for all, so the scheduler delivers on the same run
  await makePaidUser(users.a, { fullName: "Аня", deliveryHour: 0 });
  await makePaidUser(users.b, { fullName: "Вика", birthDate: "1979-11-02", birthTime: "06:05", birthPlaceId: 524901, deliveryTimezone: "Europe/Moscow", deliveryHour: 0 });
  await makePaidUser(users.c, { fullName: "Оля", birthDate: "2001-01-20", birthTime: "", birthPlaceId: 1496153, deliveryTimezone: "Asia/Omsk", deliveryHour: 0 });
});
afterAll(async () => { api?.stop(); mocks?.stop(); await db?.close(); });

test("OpenAI 500 → задача сохраняется, ничего не отправлено, повтор по расписанию даёт текст", async () => {
  mocks.openaiScript = ["500", "500", "500"]; // по одной неудаче на каждого из трёх пользователей
  const out = await runScheduler(mocks, DB);
  expect(out).toContain("FORECAST_EDITORIAL_FAIL");
  const r = await row(users.a);
  expect(r.generation_state).toBe("waiting_editorial");
  expect(r.editorial_attempts).toBe(1);
  expect(r.status).toBe("pending");
  expect(mocks.sentTexts(users.a).filter((t) => t.includes("ДЕЛА")).length).toBe(0);
  // Повтор раньше срока бэкоффа не тратит запросы
  const calls = mocks.openai.length;
  mocks.openaiScript = [];
  await runScheduler(mocks, DB);
  expect(mocks.openai.length).toBe(calls);
  await db`UPDATE liz_daily_messages SET next_editorial_at=NOW()-INTERVAL '1 second' WHERE generation_state='waiting_editorial'`;
  await runScheduler(mocks, DB);
  const r2 = await row(users.a);
  expect(r2.text_source).toBe("openai");
  expect(r2.status).toBe("sent");
  expect(r2.editorial_attempts).toBe(2);
});

test("Ответ с выдуманной астрологией отклоняется, вторая попытка с замечаниями проходит", async () => {
  const r = await row(users.b);
  expect(r.status).toBe("sent");
  const reqs = mocks.openai;
  expect(reqs.length).toBeGreaterThan(0);
  // направленный сценарий для отдельного дня
  await db`DELETE FROM liz_daily_messages WHERE telegram_id=${users.b}`;
  mocks.openaiScript = ["astro", "valid"];
  const before = mocks.openai.length;
  await runScheduler(mocks, DB);
  const r2 = await row(users.b);
  expect(r2.text_source).toBe("openai");
  expect(mocks.openai.length - before).toBe(2);
  expect(JSON.stringify(mocks.openai.at(-1).input)).toContain("introduces_astronomy");
  expect(r2.editorial_meta.attempts[0].ok).toBe(false);
});

test("Инъекция инструкций в ответе модели не проходит проверку", async () => {
  await db`DELETE FROM liz_daily_messages WHERE telegram_id=${users.c}`;
  mocks.openaiScript = ["injection", "injection"];
  await runScheduler(mocks, DB);
  const r = await row(users.c);
  expect(r.generation_state).toBe("waiting_editorial");
  expect(r.editorial_error).toBe("openai_validation_failed");
});

test("Политика: после крайнего срока — расчётный текст с пометкой fallback, а не тишина", async () => {
  await db`UPDATE liz_birth_profiles SET delivery_hour_local=0 WHERE telegram_id=${users.c}`;
  await db`UPDATE liz_daily_messages SET next_editorial_at=NOW()-INTERVAL '1 second', due_at=NOW()-INTERVAL '3 hours' WHERE telegram_id=${users.c}`;
  mocks.openaiScript = ["500", "500"];
  // крайний срок наступил (due_at + 60 мин в прошлом при часе 00) — проверяем только если сейчас позже 01:00 по Омску
  const omskHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Omsk", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  await runScheduler(mocks, DB, "release/scheduler.mjs", { EDITORIAL_FALLBACK_GRACE_MINUTES: "0" });
  const r = await row(users.c);
  if (omskHour >= 0) {
    expect(r.text_source).toBe("calculated_fallback");
    expect(r.status).toBe("sent");
  }
});

test("Политика hold: без OpenAI ничего не отправляется", async () => {
  const id = "720000009";
  await makePaidUser(id, { fullName: "Ира", deliveryHour: 0 });
  mocks.openaiScript = ["500", "500", "500"];
  await runScheduler(mocks, DB, "release/scheduler.mjs", { EDITORIAL_FALLBACK_POLICY: "hold", EDITORIAL_FALLBACK_GRACE_MINUTES: "0" });
  const r = await row(id);
  expect(r.generation_state).toBe("waiting_editorial");
  expect(mocks.sentTexts(id).filter((t) => t.includes("ДЕЛА")).length).toBe(0);
  mocks.openaiScript = [];
});

test("Два разных профиля: разные факты и разные тексты, без смешения имён", async () => {
  const a = await row(users.a), b = await row(users.b);
  expect(a.body).not.toBe(b.body);
  expect(a.body).toContain("Аня");
  expect(a.body).not.toContain("Вика");
  expect(b.body).toContain("Вика");
  expect(JSON.stringify(a.calculation)).not.toBe(JSON.stringify(b.calculation));
  // строки фактов (вставляются кодом из расчёта) различаются, а не только имя
  const facts = (x) => x.body.split("\n").filter((l) => /Луна в|образует|часовому поясу/.test(l)).join("|").replace(/Аня|Вика/g, "");
  expect(facts(a)).not.toBe(facts(b));
});

test("Неизвестное время рождения: в тексте нет домов", async () => {
  const c = await row(users.c);
  expect(c.body).not.toMatch(/натальный дом|натальном доме/);
  expect(c.calculation.houseKnown).toBe(false);
});

test("Дневной бюджет OpenAI соблюдается", async () => {
  const id = "720000010";
  await makePaidUser(id, { fullName: "Ника", deliveryHour: 0 });
  const before = mocks.openai.length;
  await db`UPDATE astroday_openai_usage SET requests=1000`;
  await runScheduler(mocks, DB, "release/scheduler.mjs", { OPENAI_DAILY_REQUEST_LIMIT: "5" });
  expect(mocks.openai.length).toBe(before);
  expect((await row(id)).editorial_error).toBe("openai_daily_budget_exhausted");
  await db`UPDATE astroday_openai_usage SET requests=0`;
});

test("Параллельные планировщики не отправляют прогноз дважды", async () => {
  const id = "720000011";
  await makePaidUser(id, { fullName: "Женя", deliveryHour: 0 });
  await Promise.all([runScheduler(mocks, DB), runScheduler(mocks, DB), runScheduler(mocks, DB)]);
  await runScheduler(mocks, DB);
  const sent = mocks.sentTexts(id).filter((t) => t.includes("ДЕЛА"));
  expect(sent.length).toBe(1);
});

test("Пользователь заблокировал бота: ошибка обработана, доступ сохранён", async () => {
  const id = "720000012";
  await makePaidUser(id, { fullName: "Лена", deliveryHour: 0 });
  mocks.tgFail = { method: "sendMessage", status: 403, times: 1 };
  await runScheduler(mocks, DB);
  const r = await row(id);
  expect(r.status).toBe("failed_permanent");
  expect((await db`SELECT valid_until>NOW() AS ok FROM liz_subscriptions WHERE telegram_id=${id}`)[0].ok).toBe(true);
  mocks.tgFail = null;
});

test("Перезапуск во время генерации: просроченная аренда подхватывается", async () => {
  const id = "720000013";
  await makePaidUser(id, { fullName: "Маша", deliveryHour: 0 });
  const day = localDay("Asia/Novokuznetsk");
  await db`INSERT INTO liz_daily_messages(telegram_id,forecast_date,body,due_at,generation_state,generation_token,generation_started_at) VALUES(${id},${day}::date,'Прогноз готовится.',NOW(),'generating',gen_random_uuid(),NOW()-INTERVAL '10 minutes')`;
  await runScheduler(mocks, DB);
  const r = await row(id);
  expect(r.generation_state).toBe("ready");
  expect(r.status).toBe("sent");
});

test("Пропущенное утреннее окно: прогноз дня уходит при следующем запуске в тот же день", async () => {
  const id = "720000014";
  await makePaidUser(id, { fullName: "Даша", deliveryHour: 0 }); // час доставки 00:00, «окно» давно прошло
  await runScheduler(mocks, DB);
  expect((await row(id)).status).toBe("sent");
});

test("/stop останавливает автоматическую доставку", async () => {
  const id = "720000015";
  await makePaidUser(id, { fullName: "Катя", deliveryHour: 0 });
  await sendUpdate(api, update(id, "/stop"));
  await runScheduler(mocks, DB);
  const r = await row(id);
  expect(r?.status === "sent").toBe(false);
  expect(mocks.sentTexts(id).filter((t) => t.includes("ДЕЛА")).length).toBe(0);
});
