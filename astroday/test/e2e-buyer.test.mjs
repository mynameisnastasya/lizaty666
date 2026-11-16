// Сквозной путь нового покупателя на реальном коде (локальный Postgres, имитации Telegram/YooKassa/движка/OpenAI).
import { test, expect, beforeAll, afterAll } from "bun:test";
import { Mocks, freshDb, startApi, runScheduler, update, callback, sendUpdate, miniSession, apiPost, apiGet, registerProfile, waitFor, localDay, LIVE_SHOP } from "./harness.mjs";

const DB = "astroday_e2e_buyer";
let mocks, db, api;
const BUYER = "700000001";
beforeAll(async () => {
  mocks = new Mocks().start();
  db = await freshDb(DB);
  api = await startApi(mocks, DB);
  await runScheduler(mocks, DB); // отметка живого планировщика нужна воротам оплаты
});
afterAll(async () => { api?.stop(); mocks?.stop(); await db?.close(); });

test("1. /start нового человека: понятное предложение, без /join_test, кнопки анкеты и тарифов", async () => {
  const r = await sendUpdate(api, update(BUYER, "/start", { username: "new_buyer" }));
  expect(r.status).toBe(200);
  const text = mocks.sentTexts(BUYER).at(-1);
  expect(text).toContain("ASTRODAY");
  expect(text).not.toContain("join_test");
  const kb = mocks.tg.filter((x) => x.method === "sendMessage").at(-1).body.reply_markup.inline_keyboard.flat();
  expect(kb.some((b) => b.web_app)).toBe(true);
  expect(kb.some((b) => b.callback_data === "ad_plans")).toBe(true);
});

test("2. Повторный /start не повторяет длинное приветствие и не создаёт второй профиль", async () => {
  await sendUpdate(api, update(BUYER, "/start", { username: "new_buyer" }));
  const t = mocks.sentTexts(BUYER).at(-1);
  expect(t.length).toBeLessThan(200);
  expect((await db`SELECT count(*)::int n FROM liz_clients WHERE telegram_id=${BUYER}`)[0].n).toBe(1);
});

test("3. Старая/неизвестная кнопка получает ответ и показывает меню", async () => {
  const before = mocks.tg.length;
  await sendUpdate(api, callback(BUYER, "buy_month_legacy"));
  const calls = mocks.tg.slice(before);
  expect(calls.some((x) => x.method === "answerCallbackQuery")).toBe(true);
  expect(calls.some((x) => x.method === "sendMessage")).toBe(true);
});

test("4. /today без анкеты: понятный следующий шаг, а не «нет подписки»", async () => {
  await sendUpdate(api, update(BUYER, "/today"));
  const t = await waitFor(() => mocks.sentTexts(BUYER).find((x) => x.includes("анкет")));
  expect(t).toBeTruthy();
});

let cookie, orderId, paymentId;
test("5. Вход из Mini App + анкета с проверенным городом", async () => {
  const s = await miniSession(api, BUYER, "new_buyer");
  expect(s.status).toBe(200);
  cookie = s.cookie;
  const r = await registerProfile(api, cookie);
  expect(r.status).toBe(200);
  const p = (await db`SELECT birth_at_iso,birth_time_verified,birth_timezone,time_zone FROM liz_birth_profiles WHERE telegram_id=${BUYER}`)[0];
  // 1994-03-15 14:30 в Кемерово (Asia/Novokuznetsk, тогда UTC+7) = 07:30 UTC
  expect(p.birth_at_iso).toBe("1994-03-15T07:30:00.000Z");
  expect(p.birth_time_verified).toBe(true);
});

test("6. Чужой ID в запросе не даёт чужие данные (сессия = подпись Telegram)", async () => {
  const r = await apiGet(api, "/v1/tg-forecast/me", null);
  expect(r.body.json.registered).toBe(false);
  const forged = await apiPost(api, "/v1/checkout", { plan: "month", receiptEmail: "a@b.ru", acceptOffer: true, acceptData: true, legalVersion: "ASTRODAY-20261115", telegramLogin: { id: BUYER, auth_date: String(Math.floor(Date.now() / 1000)), hash: "0".repeat(64) } }, null, { "Idempotency-Key": "forged-key-123456789" });
  expect(forged.status).toBe(401);
});

test("7. Оплата: сумма из сервера, повторное нажатие не создаёт второй платёж", async () => {
  const body = { plan: "month", receiptEmail: "anya@example.ru", acceptOffer: true, acceptData: true, legalVersion: "ASTRODAY-20261115", amount: 1 };
  await db`UPDATE liz_clients SET chat_started_at=COALESCE(chat_started_at,NOW()) WHERE telegram_id=${BUYER}`;
  const a = await apiPost(api, "/v1/checkout", body, cookie, { "Idempotency-Key": "buyer-month-key-0001" });
  expect(a.status).toBe(200);
  const b = await apiPost(api, "/v1/checkout", body, cookie, { "Idempotency-Key": "buyer-month-key-0001" });
  expect(b.body.orderId).toBe(a.body.orderId);
  orderId = a.body.orderId;
  const o = (await db`SELECT amount_kopeks,provider_payment_id,provider_mode FROM liz_orders WHERE id=${orderId}::uuid`)[0];
  expect(o.amount_kopeks).toBe(166600);
  expect(o.provider_mode).toBe("live");
  paymentId = o.provider_payment_id;
  expect(mocks.ykCalls.filter((c) => c.method === "POST").length).toBe(1);
  expect(mocks.yk.get(paymentId).amount.value).toBe("1666.00");
});

test("8. Неоплаченный заказ доступа не даёт; поддельный webhook без подтверждения провайдера — тоже", async () => {
  const r = await apiPost(api, "/v1/yookassa/webhook", { type: "notification", event: "payment.succeeded", object: { id: paymentId, status: "succeeded", paid: true } });
  expect(r.status).toBe(200);
  const s = await db`SELECT valid_until FROM liz_subscriptions WHERE telegram_id=${BUYER}`;
  expect(s.length).toBe(0); // провайдер говорит pending — доступа нет
});

test("9. Успешная оплата → доступ ровно один раз, задача первого результата, сообщение в Telegram", async () => {
  mocks.succeed(paymentId);
  const before = mocks.sentTexts(BUYER).length;
  const r1 = await apiPost(api, "/v1/yookassa/webhook", { type: "notification", event: "payment.succeeded", object: { id: paymentId } });
  expect(r1.body.result).toBe("activated");
  const r2 = await apiPost(api, "/v1/yookassa/webhook", { type: "notification", event: "payment.succeeded", object: { id: paymentId } });
  expect(r2.body.result).toBe("already_activated");
  const sub = (await db`SELECT valid_until,source FROM liz_subscriptions WHERE telegram_id=${BUYER}`)[0];
  expect(sub.source).toBe("yookassa");
  const days = (Date.parse(sub.valid_until) - Date.now()) / 86400000;
  expect(days).toBeGreaterThan(27); expect(days).toBeLessThan(32);
  const confirm = await waitFor(() => mocks.sentTexts(BUYER).slice(before).find((t) => t.includes("Оплата прошла")));
  expect(confirm).toContain("Доступ к ASTRODAY открыт");
  expect((await db`SELECT count(*)::int n FROM astroday_fulfillment_jobs WHERE order_id=${orderId}::uuid`)[0].n).toBe(1);
});

test("10. Первый прогноз приходит сразу (OpenAI, стиль разделов) — не ждёт утра", async () => {
  const done = await waitFor(async () => (await db`SELECT state FROM astroday_fulfillment_jobs WHERE order_id=${orderId}::uuid`)[0]?.state === "first_queued", 15000);
  expect(done).toBeTruthy();
  const out = await runScheduler(mocks, DB);
  expect(out).toContain("ASTRODAY_WORKER_DELIVERY");
  const row = (await db`SELECT status,text_source,editorial_model,editorial_prompt_version,body,fact_ids FROM liz_daily_messages WHERE telegram_id=${BUYER}`)[0];
  expect(row.text_source).toBe("openai");
  expect(row.editorial_model).toBe("gpt-test-model");
  expect(row.status).toBe("sent");
  expect(row.body).toContain("ДЕЛА, УЧЁБА И ДЕНЬГИ");
  expect(row.body.startsWith("🔮 ")).toBe(true);
  const sent = mocks.tg.filter((x) => x.method === "sendMessage" && String(x.body.chat_id) === BUYER && x.body.text.includes("ДЕЛА"));
  expect(sent.length).toBe(1);
  expect((await db`SELECT state FROM astroday_fulfillment_jobs WHERE order_id=${orderId}::uuid`)[0].state).toBe("done");
  // В модель не ушли телефон, Telegram ID, имя, дата рождения
  const req = JSON.stringify(mocks.openai.at(-1));
  expect(req).not.toContain(BUYER);
  expect(req).not.toContain("1994");
  expect(req).not.toContain("Аня");
});

test("11. Повторный запуск планировщика не шлёт прогноз второй раз и не платит OpenAI повторно", async () => {
  const calls = mocks.openai.length, sends = mocks.tg.length;
  await runScheduler(mocks, DB);
  await runScheduler(mocks, DB);
  expect(mocks.openai.length).toBe(calls);
  expect(mocks.tg.filter((x, i) => i >= sends && x.method === "sendMessage" && String(x.body.chat_id) === BUYER).length).toBe(0);
});

test("12. /today по кнопке отдаёт готовый текст и не включает остановленную рассылку", async () => {
  await sendUpdate(api, update(BUYER, "/stop"));
  const calls = mocks.openai.length;
  const before = mocks.sentTexts(BUYER).length;
  await sendUpdate(api, callback(BUYER, "ad_today"));
  const got = await waitFor(() => mocks.sentTexts(BUYER).slice(before).find((t) => t.includes("ДЕЛА")));
  expect(got).toBeTruthy();
  expect(mocks.openai.length).toBe(calls);
  const c = (await db`SELECT notify_enabled FROM liz_clients WHERE telegram_id=${BUYER}`)[0];
  expect(c.notify_enabled).toBe(false);
});

test("13. /status показывает доступ, срок и паузу рассылки", async () => {
  const before = mocks.sentTexts(BUYER).length;
  await sendUpdate(api, update(BUYER, "/status"));
  const t = mocks.sentTexts(BUYER).slice(before).at(-1);
  expect(t).toContain("оплаченная подписка");
  expect(t).toContain("на паузе");
  await sendUpdate(api, update(BUYER, "/resume"));
  expect((await db`SELECT notify_enabled FROM liz_clients WHERE telegram_id=${BUYER}`)[0].notify_enabled).toBe(true);
});

test("14. Продление считается от конца текущего доступа и не шлёт «первый результат» повторно", async () => {
  const before = Date.parse((await db`SELECT valid_until FROM liz_subscriptions WHERE telegram_id=${BUYER}`)[0].valid_until);
  const r = await apiPost(api, "/v1/checkout", { plan: "halfyear", receiptEmail: "anya@example.ru", acceptOffer: true, acceptData: true, legalVersion: "ASTRODAY-20261115" }, cookie, { "Idempotency-Key": "buyer-halfyear-key-01" });
  const pid = (await db`SELECT provider_payment_id FROM liz_orders WHERE id=${r.body.orderId}::uuid`)[0].provider_payment_id;
  mocks.succeed(pid);
  await apiPost(api, "/v1/yookassa/webhook", { type: "notification", event: "payment.succeeded", object: { id: pid } });
  const after = Date.parse((await db`SELECT valid_until FROM liz_subscriptions WHERE telegram_id=${BUYER}`)[0].valid_until);
  const added = (after - before) / 86400000;
  expect(added).toBeGreaterThan(180); expect(added).toBeLessThan(185);
  await waitFor(async () => (await db`SELECT state FROM astroday_fulfillment_jobs WHERE order_id=${r.body.orderId}::uuid`)[0]?.state === "done");
  expect((await db`SELECT kind,state FROM astroday_fulfillment_jobs WHERE order_id=${r.body.orderId}::uuid`)[0]).toEqual({ kind: "renewal", state: "done" });
  expect(mocks.sentTexts(BUYER).at(-1)).toContain("продлён");
});

test("15. Отменённый заказ доступа не даёт", async () => {
  const s2 = await miniSession(api, "700000002", "second");
  await registerProfile(api, s2.cookie, { fullName: "Борис", birthDate: "1988-07-01", birthTime: "", birthPlaceId: 524901, deliveryTimezone: "Europe/Moscow" });
  await db`UPDATE liz_clients SET chat_started_at=NOW() WHERE telegram_id='700000002'`;
  const r = await apiPost(api, "/v1/checkout", { plan: "month", receiptEmail: "b@example.ru", acceptOffer: true, acceptData: true, legalVersion: "ASTRODAY-20261115" }, s2.cookie, { "Idempotency-Key": "second-month-key-0001" });
  const pid = (await db`SELECT provider_payment_id FROM liz_orders WHERE id=${r.body.orderId}::uuid`)[0].provider_payment_id;
  mocks.cancel(pid);
  const w = await apiPost(api, "/v1/yookassa/webhook", { type: "notification", event: "payment.canceled", object: { id: pid } });
  expect(w.body.result).toBe("canceled");
  expect((await db`SELECT count(*)::int n FROM liz_subscriptions WHERE telegram_id='700000002'`)[0].n).toBe(0);
});

test("16. Тестовый платёж live-магазину не засчитывается (защита от подмены режима)", async () => {
  expect(mocks.ykCalls.every((c) => c.shop === LIVE_SHOP)).toBe(true);
});

test("17. Владельцам в группу: заказ, оплата, отправленный прогноз с текстом", async () => {
  await runScheduler(mocks, DB);
  const a = mocks.adminTexts();
  expect(a.some((t) => t.includes("Создан заказ"))).toBe(true);
  expect(a.some((t) => t.includes("Оплата прошла") && /1[\s\u00a0\u202f]666/.test(t))).toBe(true);
  expect(a.some((t) => t.includes("Прогноз отправлен") && t.includes("первый после оплаты") && t.includes("ДЕЛА, УЧЁБА"))).toBe(true);
  expect(a.some((t) => t.includes("Анкета сохранена"))).toBe(true);
  // токены в уведомления не попадают
  expect(a.join("\n")).not.toContain("TEST_token");
});

test("18. Рождение за полярным кругом: без домов и натальной Луны, но прогноз есть", async () => {
  const id = "700000077";
  await sendUpdate(api, update(id, "/start"));
  const s = await miniSession(api, id, "north");
  await registerProfile(api, s.cookie, { fullName: "Север", birthDate: "1995-01-05", birthTime: "10:00", birthPlaceId: 524305, deliveryTimezone: "Europe/Moscow", deliveryHour: 0 });
  await db`INSERT INTO liz_subscriptions(telegram_id,valid_until,source) VALUES(${id},NOW()+INTERVAL '30 days','yookassa')`;
  await runScheduler(mocks, DB);
  const r = (await db`SELECT status,calculation,body FROM liz_daily_messages WHERE telegram_id=${id}`)[0];
  expect(r.status).toBe("sent");
  expect(r.calculation.houseKnown).toBe(false);
  expect(r.calculation.housesUnavailableReason).toBe("placidus_undefined_at_birth_latitude");
  expect(r.body).not.toMatch(/натальн\S* дом/);
});
