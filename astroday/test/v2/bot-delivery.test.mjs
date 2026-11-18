import { test, expect, beforeAll, afterAll } from "bun:test";
import { freshDb, addUser } from "./db.mjs";
import { fakeEngine, fakeOpenAI, ENGINE_VERSION, LUNAR_VERSION } from "./fakes.mjs";
import { syncUsers, runWorker, currentForecast } from "../../v2/queue.mjs";
import { writeForecast } from "../../v2/editorial.mjs";
import { createBot } from "../../v2/bot.mjs";
import { deliveryTick } from "../../v2/delivery.mjs";
import { localDay, tomorrowOf, zonedToUtc, addDays } from "../../v2/timefmt.mjs";
import { findProfanity } from "../../v2/profanity.mjs";

let db, sent, bot, nowProcess;
const CFG = { model: "gpt-6.2-astra", engineVersion: ENGINE_VERSION, lunarVersion: LUNAR_VERSION, windowDays: 31 };
const engine = fakeEngine();
const work = () => runWorker(db, { engine, lunarVersion: LUNAR_VERSION, engineVersion: ENGINE_VERSION, writer: (ctx, x) => writeForecast(ctx, { apiKey: "k", model: CFG.model, fetchImpl: fakeOpenAI(), ...x }) }, { maxRows: 400, concurrency: 4 });
let mid = 1;
const tg = async (method, payload) => { sent.push({ method, ...payload }); return { ok: true, result: { message_id: mid++ } }; };
const msg = (id, text, extra = {}) => ({ update_id: mid++, message: { message_id: 1, text, from: { id: Number(id), username: "u" + id }, chat: { id: Number(id), type: "private" }, ...extra } });
const cb = (id, data) => ({ update_id: mid++, callback_query: { id: "c" + mid, data, from: { id: Number(id) }, message: { message_id: 1, chat: { id: Number(id), type: "private" } } } });
const texts = () => sent.filter((x) => x.method === "sendMessage").map((x) => x.text);

beforeAll(async () => {
  db = await freshDb("v2_bot");
  await addUser(db, { id: "11", name: "Анастасия", zone: "Asia/Novosibirsk", city: "Новосибирск", lat: 55.03, lon: 82.92, days: 30 });
  await addUser(db, { id: "12", name: "Елена", zone: "Europe/Moscow", days: 1 });       // доступ кончается сегодня/завтра
  await addUser(db, { id: "13", name: "Ольга", zone: "Asia/Ho_Chi_Minh", days: 30 });
  await addUser(db, { id: "14", name: "Мария", zone: "Asia/Novokuznetsk", days: 30 });
  await addUser(db, { id: "99", name: "Не v2", zone: "Europe/Moscow", days: 30, v2: false });
  await syncUsers(db, CFG);
  await work();
  sent = [];
  nowProcess = [];
  bot = createBot({ db, tg, site: "https://example.test", cfg: CFG, engine, processNow: (id, day) => nowProcess.push([id, day]), legacyConsent: async () => {} });
});
afterAll(async () => { await db.close(); });

test("/start у существующего пользователя: без повторной анкеты, сразу меню; повтор безопасен", async () => {
  sent = [];
  expect(await bot.handleUpdate(msg("11", "/start"))).toBe(true);
  expect(await bot.handleUpdate(msg("11", "/start"))).toBe(true);
  const t = texts();
  expect(t.length).toBe(2);
  expect(t[0]).toContain("С возвращением, Анастасия");
  expect(t[0]).not.toMatch(/заполни|анкету рождения/i);
  const kb = JSON.stringify(sent.find((x) => x.method === "sendMessage").reply_markup);
  for (const b of ["Прогноз на сегодня", "Прогноз на завтра", "Грабителя богатства", "Время прогнозов", "Лунный календарь", "Натальная карта", "Мой профиль", "Настройки"]) expect(kb).toContain(b);
  expect(kb).not.toMatch(/"text":"[A-Za-z][A-Za-z ]+"/); // нет английских кнопок
});

test("пользователь вне rollout → обрабатывает старый бот", async () => {
  expect(await bot.handleUpdate(msg("99", "/start"))).toBe(false);
});

test("«Прогноз на сегодня»: готовый текст без OpenAI; повторное нажатие — тот же текст", async () => {
  sent = [];
  await bot.handleUpdate(cb("11", "v2:today"));
  await new Promise((r) => setTimeout(r, 4100));
  await bot.handleUpdate(cb("11", "v2:today"));
  const t = texts();
  const f = await currentForecast(db, "11", localDay("Asia/Novosibirsk"));
  expect(t[0]).toBe(f.body_html);
  expect(t[1]).toBe(f.body_html);
  expect(sent.filter((x) => x.method === "answerCallbackQuery").length).toBe(2);
  // нет опросов после прогноза
  expect(JSON.stringify(sent)).not.toMatch(/Откликнулось|Частично|Не откликнулось|Рассказать подробнее/);
  // старая кнопка тоже ведёт к v2
  sent = [];
  await new Promise((r) => setTimeout(r, 4100));
  await bot.handleUpdate(cb("11", "astroday_today"));
  expect(texts()[0]).toBe(f.body_html);
}, 15000);

test("«Прогноз на завтра»: дата по местному времени пользователя", async () => {
  sent = [];
  await bot.handleUpdate(cb("13", "v2:tomorrow"));
  const f = await currentForecast(db, "13", tomorrowOf("Asia/Ho_Chi_Minh"));
  expect(texts()[0]).toBe(f.body_html.replace("ТВОЙ ПРОГНОЗ НА ", "ТВОЙ ПРОГНОЗ НА ЗАВТРА, "));
});

test("завтра за пределами доступа → честный статус, без прогноза", async () => {
  await db.unsafe("UPDATE liz_subscriptions SET valid_until=$2 WHERE telegram_id=$1", ["12", new Date(zonedToUtc(addDays(localDay("Europe/Moscow"), 1), 0, 0, "Europe/Moscow")).toISOString()]);
  sent = [];
  await bot.handleUpdate(cb("12", "v2:tomorrow"));
  expect(texts()[0]).toMatch(/за пределами твоего доступа/);
  expect(texts()[0]).not.toContain("ТВОЙ ПРОГНОЗ");
});

test("ещё не готов → понятный статус, высокий приоритет и фоновая генерация", async () => {
  const day = tomorrowOf("Asia/Novokuznetsk");
  await db.unsafe("UPDATE astroday_v2_forecasts SET status='pending', body_html=NULL, priority=50 WHERE telegram_id='14' AND forecast_date=$1::date", [day]);
  sent = []; nowProcess = [];
  await bot.handleUpdate(cb("14", "v2:tomorrow"));
  expect(texts()[0]).toMatch(/ещё готовится/);
  expect(nowProcess).toEqual([["14", day]]);
  const r = (await db.unsafe("SELECT priority, notify_on_ready FROM astroday_v2_forecasts WHERE telegram_id='14' AND forecast_date=$1::date", [day]))[0];
  expect(r.priority).toBe(0);
  expect(r.notify_on_ready).toBe("14");
});

test("Грабитель богатства: личный календарь, понятные страницы", async () => {
  sent = [];
  await bot.handleUpdate(cb("11", "v2:bazi:0"));
  const t = texts()[0];
  expect(t).toContain("ДНИ ГРАБИТЕЛЯ БОГАТСТВА");
  expect(t).toContain("Анастасия");
  expect(t).toMatch(/Дневной Мастер — (Дерево|Огонь|Земля|Металл|Вода) (Ян|Инь)/);
  expect(t.length).toBeLessThan(4096);
  expect(findProfanity(t)).toEqual([]);
});

test("время рассылки: кнопка, своё время, отключение; подтверждение с городом", async () => {
  sent = [];
  await bot.handleUpdate(cb("11", "v2:time"));
  expect(texts()[0]).toContain("ВРЕМЯ ПРОГНОЗОВ");
  expect(texts()[0]).not.toMatch(/Asia\/|Europe\//);
  await bot.handleUpdate(cb("11", "v2:time:09:00"));
  expect(texts()[1]).toBe("Анастасия, твой прогноз будет приходить каждый день в <b>09:00</b> по времени: Новосибирск 🖤");
  await bot.handleUpdate(cb("11", "v2:time:custom"));
  await bot.handleUpdate(msg("11", "7:45"));
  expect(texts()[3]).toContain("<b>07:45</b>");
  await bot.handleUpdate(cb("11", "v2:time:25:99"));
  expect(texts()[4]).toMatch(/Не поняла время/);
  const p = (await db.unsafe("SELECT delivery_time, delivery_enabled FROM astroday_v2_prefs WHERE telegram_id='11'"))[0];
  expect(p).toEqual({ delivery_time: "07:45", delivery_enabled: true });
});

test("обращение по имени: Анастасия → Настюша; своё; без имени", async () => {
  sent = [];
  await bot.handleUpdate(cb("11", "v2:name"));
  expect(JSON.stringify(sent.find((x) => x.method === "sendMessage").reply_markup)).toContain("Настюша");
  await bot.handleUpdate(cb("11", "v2:name:2"));
  expect(texts()[1]).toContain("Договорились, Настюша");
  await bot.handleUpdate(cb("11", "v2:name:custom"));
  await bot.handleUpdate(msg("11", "Ася"));
  expect(texts()[3]).toContain("Договорились, Ася");
  await bot.handleUpdate(cb("11", "v2:name:custom"));
  await bot.handleUpdate(msg("11", "бл*ть"));
  expect(texts()[5]).toMatch(/попроще/);
  await bot.handleUpdate(cb("11", "v2:name:2"));
});

test("лунный календарь, натальная карта, профиль, настройки отвечают на русском", async () => {
  sent = [];
  for (const c of ["v2:lunar", "v2:natal", "v2:profile", "v2:settings", "v2:menu"]) await bot.handleUpdate(cb("11", c));
  const t = texts();
  expect(t[0]).toContain("ЛУННЫЙ КАЛЕНДАРЬ");
  expect(t[1]).toContain("НАТАЛЬНАЯ КАРТА");
  expect(t[2]).toMatch(/Прогнозы на период: готово \d+ из \d+/);
  expect(t[3]).toContain("НАСТРОЙКИ");
  for (const x of t) expect(findProfanity(x)).toEqual([]);
});

// ---------------------------------------------------------------- delivery
const at = (zone, hm, dayOffset = 0) => zonedToUtc(addDays(localDay(zone), dayOffset), +hm.slice(0, 2), +hm.slice(3), zone);

test("рассылка: в выбранное время по местной зоне, один раз, из готового текста", async () => {
  sent = [];
  await db.unsafe("DELETE FROM astroday_v2_deliveries");
  // 11 — 07:45 Новосибирск
  let st = await deliveryTick(db, { tg, now: at("Asia/Novosibirsk", "07:40") });
  expect(sent.filter((x) => x.chat_id === "11").length).toBe(0);
  st = await deliveryTick(db, { tg, now: at("Asia/Novosibirsk", "07:45") });
  const toEleven = sent.filter((x) => x.chat_id === "11");
  expect(toEleven.length).toBe(1);
  expect(toEleven[0].text).toBe((await currentForecast(db, "11", localDay("Asia/Novosibirsk"))).body_html);
  // параллельные/повторные тики — без дублей
  await Promise.all([deliveryTick(db, { tg, now: at("Asia/Novosibirsk", "07:50") }), deliveryTick(db, { tg, now: at("Asia/Novosibirsk", "07:50") })]);
  expect(sent.filter((x) => x.chat_id === "11").length).toBe(1);
});

test("рассылка: Кемерово, Вьетнам — по своему времени (08:00 по умолчанию)", async () => {
  sent = [];
  await deliveryTick(db, { tg, now: at("Asia/Novokuznetsk", "08:01") });
  expect(sent.some((x) => x.chat_id === "14")).toBe(true);
  expect(sent.some((x) => x.chat_id === "13")).toBe(true);  // Вьетнам = UTC+7, как Кемерово: тоже 08:01
  expect(sent.some((x) => x.chat_id === "12")).toBe(false); // в Москве в этот момент 04:01
});

test("отключённая рассылка не отправляет, ручные кнопки работают", async () => {
  await db.unsafe("DELETE FROM astroday_v2_deliveries WHERE telegram_id='13'");
  await bot.handleUpdate(cb("13", "v2:time:off"));
  sent = [];
  await deliveryTick(db, { tg, now: at("Asia/Ho_Chi_Minh", "09:00") });
  expect(sent.some((x) => x.chat_id === "13")).toBe(false);
  await bot.handleUpdate(cb("13", "v2:today"));
  expect(texts().some((t) => t.includes("ТВОЙ ПРОГНОЗ"))).toBe(true);
});

test("неготовый прогноз не рассылается (нет непроверенных текстов), поднимается приоритет", async () => {
  const day = localDay("Europe/Moscow");
  await db.unsafe("UPDATE liz_subscriptions SET valid_until=NOW()+interval '20 days' WHERE telegram_id='12'");
  await db.unsafe("UPDATE astroday_v2_forecasts SET status='failed', body_html=NULL, priority=99 WHERE telegram_id='12' AND forecast_date=$1::date", [day]);
  sent = [];
  const alerts = [];
  const st = await deliveryTick(db, { tg, now: at("Europe/Moscow", "09:00"), alert: async (t) => alerts.push(t) });
  expect(sent.some((x) => x.chat_id === "12")).toBe(false);
  expect(st.notReady).toBeGreaterThan(0);
  expect(alerts.length).toBe(1);
  const r = (await db.unsafe("SELECT priority FROM astroday_v2_forecasts WHERE telegram_id='12' AND forecast_date=$1::date", [day]))[0];
  expect(r.priority).toBe(0);
});
