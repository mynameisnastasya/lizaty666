// Сквозная проверка собранного релиза release-v2/* (настоящий код API и планировщика + ASTRODAY 2.0)
// на локальном PostgreSQL. Telegram, YooKassa, движок и OpenAI — имитации (test/harness.mjs).
import { test, expect, beforeAll, afterAll } from "bun:test";
import { SQL } from "bun";
import { Mocks, freshDb, startApi, runScheduler, update, callback, sendUpdate, localDay } from "../harness.mjs";

const DB = "v2_integration", INVITE = "invite-code-1234567";
let mocks, api, db;
const V2 = (extra = {}) => ({ ASTRODAY_V2_MODE: "allowlist", ASTRODAY_V2_INVITE: INVITE, ASTRODAY_V2_DELIVERY: "on", ...extra });
beforeAll(async () => {
  mocks = new Mocks().start();
  db = await freshDb(DB);
  api = await startApi(mocks, DB, "release-v2/api.mjs", { ...V2(), ASTRODAY_V2_ENGINE_URL: mocks.base + "/astro" });
}, 30000);
afterAll(async () => { api?.stop(); mocks?.stop(); await db?.close(); });

async function addProfile(id, zone = "Asia/Novosibirsk", days = 30, name = "Анастасия Петрова") {
  await db.unsafe("INSERT INTO liz_clients(telegram_id,chat_started_at) VALUES($1,NOW()) ON CONFLICT DO NOTHING", [id]);
  await db.unsafe("INSERT INTO liz_birth_profiles(telegram_id,birth_at_iso,birth_local_date,birth_lat,birth_lon,birth_time_verified,birth_timezone,time_zone,delivery_hour_local,consented_to_daily,preferred_name) VALUES($1,'1994-03-15T07:30:00Z','1994-03-15',55.35,86.08,TRUE,'Asia/Novokuznetsk',$2,8,TRUE,$3)", [id, zone, name]);
  await db.unsafe("INSERT INTO liz_subscriptions(telegram_id,valid_until,source) VALUES($1,NOW()+make_interval(days=>$2::int),'yookassa')", [id, days]);
  await db.unsafe("INSERT INTO liz_tg_consents(telegram_id,terms_version,daily_delivery) VALUES($1,'t',TRUE) ON CONFLICT DO NOTHING", [id]);
}

test("режим allowlist: обычный пользователь — старое поведение без изменений", async () => {
  await addProfile("701");
  const before = mocks.tg.length;
  await sendUpdate(api, update("701", "/start"));
  const t = mocks.sentTexts("701").join("\n");
  expect(t).toContain("ASTRODAY");
  expect(t).not.toContain("С возвращением");
  expect(mocks.tg.length).toBeGreaterThan(before);
});

test("/v2 КОД подключает к ASTRODAY 2.0 → «С возвращением» и меню, без повторной анкеты", async () => {
  await addProfile("702");
  await sendUpdate(api, update("702", "/v2 " + INVITE));
  const t = mocks.sentTexts("702");
  expect(t.at(-1)).toContain("С возвращением, Анастасия");
  const kb = JSON.stringify(mocks.tg.filter((x) => x.method === "sendMessage" && String(x.body.chat_id) === "702").at(-1).body.reply_markup);
  expect(kb).toContain("Прогноз на завтра");
  expect(kb).toContain("Грабителя богатства");
  expect((await db.unsafe("SELECT added_by FROM astroday_v2_users WHERE telegram_id='702'"))[0].added_by).toBe("invite");
  // неверный код ничего не даёт
  await addProfile("703");
  await sendUpdate(api, update("703", "/v2 wrong-code-000000"));
  expect((await db.unsafe("SELECT 1 FROM astroday_v2_users WHERE telegram_id='703'")).length).toBe(0);
});

test("планировщик: 30-дневный доступ → весь период готов, старый конвейер не трогает пользователя v2", async () => {
  const out = await runScheduler(mocks, DB, "release-v2/scheduler.mjs", { ...V2(), ASTRODAY_V2_ENGINE_URL: mocks.base + "/astro" });
  expect(out).toContain("ASTRODAY_V2_TICK");
  const st = await db.unsafe("SELECT status, count(*)::int n FROM astroday_v2_forecasts WHERE telegram_id='702' GROUP BY 1");
  const ready = st.find((r) => r.status === "ready")?.n || 0;
  expect(ready).toBeGreaterThanOrEqual(30);
  const legacy = await db.unsafe("SELECT count(*)::int n FROM liz_daily_messages WHERE telegram_id='702'");
  expect(legacy[0].n).toBe(0);
  // обычный покупатель по-прежнему в старом конвейере
  const legacy701 = await db.unsafe("SELECT count(*)::int n FROM liz_daily_messages WHERE telegram_id='701'");
  expect(legacy701[0].n).toBeGreaterThan(0);
  const bazi = await db.unsafe("SELECT jsonb_array_length(days) n FROM astroday_v2_bazi WHERE telegram_id='702'");
  expect(bazi[0].n).toBeGreaterThan(0);
}, 120000);

test("кнопки «Сегодня/Завтра» отдают сохранённый текст без OpenAI", async () => {
  const calls = mocks.openai.length;
  await sendUpdate(api, callback("702", "v2:today"));
  await sendUpdate(api, callback("702", "v2:tomorrow"));
  const t = mocks.sentTexts("702");
  const today = (await db.unsafe("SELECT body_html FROM astroday_v2_forecasts WHERE telegram_id='702' AND forecast_date=$1::date AND status='ready'", [localDay("Asia/Novosibirsk")]))[0].body_html;
  expect(t.at(-2)).toBe(today);
  expect(t.at(-1)).toContain("ТВОЙ ПРОГНОЗ НА ЗАВТРА");
  expect(mocks.openai.length).toBe(calls);
  expect(JSON.stringify(mocks.tg.slice(-6))).not.toMatch(/Откликнулось|Частично|Рассказать подробнее/);
});

test("тестер v2: /start → «Я в деле» → привязка без старых сообщений, доступ и период", async () => {
  const id = "704";
  await db.unsafe(`INSERT INTO liz_astro_testers(handle_key,telegram_username,display_name,birth_local_date,birth_local_time,birth_utc,birth_city,birth_region,birth_lat,birth_lon,birth_zone,birth_time_precision,forecast_zone_assumed,delivery_hour_assumed,trial_start,trial_end_exclusive,identity_status,consent_status,subscription_status,profile_hash,expected_telegram_id)
    VALUES('t_704','tester704','Мария Тестова','1990-05-10','14:30','1990-05-10T07:30:00Z','Кемерово','Кемеровская',55.35,86.08,'Asia/Novokuznetsk','exact_reported','Asia/Novokuznetsk',7,CURRENT_DATE-1,CURRENT_DATE+29,'username_only_unverified','pending_individual_confirmation','not_granted','h',$1)`, [id]);
  await db.unsafe("INSERT INTO liz_clients(telegram_id) VALUES($1) ON CONFLICT DO NOTHING", [id]);
  await db.unsafe("INSERT INTO astroday_v2_users(telegram_id,added_by) VALUES($1,'test')", [id]);
  await sendUpdate(api, update(id, "/start", { username: "tester704" }));
  const kb = JSON.stringify(mocks.tg.filter((x) => x.method === "sendMessage" && String(x.body.chat_id) === id).at(-1).body.reply_markup);
  expect(kb).toContain("Я в деле");
  const n0 = mocks.sentTexts(id).length;
  await sendUpdate(api, callback(id, "astroday_join", { username: "tester704" }));
  const after = mocks.sentTexts(id).slice(n0);
  expect(after.length).toBe(1); // только меню v2, без старого «ну всёёё…» и без просьбы «замечай, что совпало»
  expect(after[0]).toContain("Ты в деле");
  const sub = (await db.unsafe("SELECT source FROM liz_subscriptions WHERE telegram_id=$1", [id]))[0];
  expect(sub.source).toBe("astroday_tester_trial");
  const rows = (await db.unsafe("SELECT count(*)::int n FROM astroday_v2_forecasts WHERE telegram_id=$1", [id]))[0].n;
  expect(rows).toBeGreaterThanOrEqual(28);
  // повторное нажатие не создаёт дублей
  await sendUpdate(api, callback(id, "astroday_join", { username: "tester704" }));
  expect((await db.unsafe("SELECT count(*)::int n FROM astroday_v2_forecasts WHERE telegram_id=$1", [id]))[0].n).toBe(rows);
});

test("время рассылки и обращение сохраняются через бота", async () => {
  await sendUpdate(api, callback("702", "v2:time:07:00"));
  expect(mocks.sentTexts("702").at(-1)).toContain("<b>07:00</b>");
  await sendUpdate(api, callback("702", "v2:name:2"));
  expect(mocks.sentTexts("702").at(-1)).toContain("Настюша");
});

test("оплата: выполнение заказа v2 → период и сегодняшний прогноз сразу в чат (без старого конвейера)", async () => {
  const id = "705";
  await addProfile(id, "Europe/Moscow", 31, "Елена Смирнова");
  await db.unsafe("INSERT INTO astroday_v2_users(telegram_id,added_by) VALUES($1,'test')", [id]);
  const order = crypto.randomUUID();
  await db.unsafe("INSERT INTO liz_orders(id,idempotency_key,telegram_id,plan_code,plan_months,amount_kopeks,status,receipt_email,paid_at,activated_at) VALUES($1::uuid,$2,$3,'month',1,166600,'paid','t@example.com',NOW(),NOW())", [order, "idem-" + order, id]);
  await db.unsafe("INSERT INTO astroday_fulfillment_jobs(order_id,telegram_id,kind,state,valid_until) VALUES($1::uuid,$2,'first_purchase','notified',NOW()+interval '31 days')", [order, id]);
  const n0 = mocks.sentTexts(id).length;
  const out = await runScheduler(mocks, DB, "release-v2/scheduler.mjs", { ...V2(), ASTRODAY_V2_ENGINE_URL: mocks.base + "/astro" });
  expect(out).toContain("V2_FIRST_RESULT");
  expect((await db.unsafe("SELECT state FROM astroday_fulfillment_jobs WHERE order_id=$1::uuid", [order]))[0].state).toBe("done");
  const sent = mocks.sentTexts(id).slice(n0);
  expect(sent.some((t) => t.includes("ТВОЙ ПРОГНОЗ НА"))).toBe(true);
  expect((await db.unsafe("SELECT count(*)::int n FROM liz_daily_messages WHERE telegram_id=$1", [id]))[0].n).toBe(0);
  expect((await db.unsafe("SELECT count(*)::int n FROM astroday_v2_forecasts WHERE telegram_id=$1 AND status='ready'", [id]))[0].n).toBeGreaterThanOrEqual(31);
}, 120000);
