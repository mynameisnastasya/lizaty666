// Тестерские сценарии не должны сломаться: join_test, повтор, /stop, /resume, /today, контакт, чужой профиль.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { Mocks, freshDb, startApi, update, callback, sendUpdate, localDay, waitFor } from "./harness.mjs";
import { createHmac } from "node:crypto";

const DB = "astroday_testers";
let mocks, db, api;
const TESTER = "730000001", STRANGER = "730000099", PHONE_TESTER = "730000002";
const today = localDay("Asia/Novokuznetsk");
beforeAll(async () => {
  mocks = new Mocks().start();
  db = await freshDb(DB);
  api = await startApi(mocks, DB);
  await Bun.sleep(300);
  const phoneHash = createHmac("sha256", "a".repeat(40)).update("79001234567").digest("hex");
  for (const [handle, uname, expected, phone] of [["kate_test", "kate_test", TESTER, null], ["pending_city", "pending_city", null, phoneHash]]) {
    await db`INSERT INTO liz_astro_testers(handle_key,telegram_username,display_name,birth_local_date,birth_local_time,birth_utc,birth_city,birth_region,birth_lat,birth_lon,birth_zone,birth_time_precision,forecast_zone_assumed,delivery_hour_assumed,trial_start,trial_end_exclusive,identity_status,consent_status,subscription_status,profile_hash,expected_telegram_id,phone_hash)
      VALUES(${handle},${uname},'Катя','1992-05-05','10:00','1992-05-05T03:00:00Z','Кемерово','Кемеровская',55.33,86.08,'Asia/Novokuznetsk','exact_reported','Asia/Novokuznetsk',7,'2026-11-13','2026-12-18','username_only_unverified','pending_individual_confirmation','not_granted','h',${expected},${phone})`;
    await db`INSERT INTO liz_tester_forecasts(handle_key,forecast_day,body,calculation,fact_ids,profile_fingerprint,engine_version,editorial_version,text_mode) VALUES(${handle},${today}::date,${"🔮 ТЕСТ\nОДОБРЕННЫЙ ТЕКСТ ДЛЯ " + handle + "\n" + "Текст прогноза. ".repeat(20)},'{}','[]','fp','astro-v2-placidus-swe-2.10','astroday-editorial-v6-20261115','calculated_editorial')`;
  }
});
afterAll(async () => { api?.stop(); mocks?.stop(); await db?.close(); });

test("/join_test подключает известного тестера сразу: доступ, уведомления, второе сообщение", async () => {
  await sendUpdate(api, update(TESTER, "/join_test", { username: "kate_test" }));
  const t = (await db`SELECT verified_telegram_id,consent_status FROM liz_astro_testers WHERE handle_key='kate_test'`)[0];
  expect(t.verified_telegram_id).toBe(TESTER);
  expect(t.consent_status).toBe("confirmed_by_account_holder");
  expect((await db`SELECT notifications_enabled FROM astroday_tester_joins WHERE telegram_id=${TESTER}`)[0].notifications_enabled).toBe(true);
  expect((await db`SELECT source FROM liz_subscriptions WHERE telegram_id=${TESTER}`)[0].source).toBe("astroday_tester_trial");
  expect(mocks.sentTexts(TESTER).at(-1)).toContain("ты в ASTRODAY");
});

test("Повторный join_test после /stop снимает паузу и не плодит записи", async () => {
  await sendUpdate(api, update(TESTER, "/stop", { username: "kate_test" }));
  expect((await db`SELECT notifications_enabled FROM astroday_tester_joins WHERE telegram_id=${TESTER}`)[0].notifications_enabled).toBe(false);
  await sendUpdate(api, update(TESTER, "join_test", { username: "kate_test" }));
  expect((await db`SELECT notifications_enabled FROM astroday_tester_joins WHERE telegram_id=${TESTER}`)[0].notifications_enabled).toBe(true);
  expect((await db`SELECT count(*)::int n FROM astroday_tester_joins`)[0].n).toBe(1);
});

test("Кнопка «Мой прогноз» у тестера отдаёт одобренный текст тестера", async () => {
  const before = mocks.sentTexts(TESTER).length;
  await sendUpdate(api, callback(TESTER, "astroday_today", { username: "kate_test" }));
  const got = await waitFor(() => mocks.sentTexts(TESTER).slice(before).find((x) => x.includes("ОДОБРЕННЫЙ ТЕКСТ ДЛЯ kate_test")));
  expect(got).toBeTruthy();
  expect(mocks.openai.length).toBe(0);
});

test("Повторная активация тестера не сокращает более длинную оплаченную подписку", async () => {
  await db`UPDATE liz_subscriptions SET valid_until='2027-06-01T00:00:00Z',source='yookassa' WHERE telegram_id=${TESTER}`;
  await sendUpdate(api, update(TESTER, "/join_test", { username: "kate_test" }));
  expect(new Date((await db`SELECT valid_until FROM liz_subscriptions WHERE telegram_id=${TESTER}`)[0].valid_until).toISOString()).toBe("2027-06-01T00:00:00.000Z");
});

test("Посторонний не может занять чужую анкету по /join_test", async () => {
  await sendUpdate(api, update(STRANGER, "/join_test", { username: "kate_test" }));
  expect((await db`SELECT verified_telegram_id FROM liz_astro_testers WHERE handle_key='kate_test'`)[0].verified_telegram_id).toBe(TESTER);
});

test("Подключение по контакту: принимается только собственный контакт", async () => {
  // чужой контакт (user_id другого человека) не подтверждает
  await sendUpdate(api, update(PHONE_TESTER, "", { message: { contact: { phone_number: "+7 900 123-45-67", user_id: 999 } } }));
  expect((await db`SELECT verified_telegram_id FROM liz_astro_testers WHERE handle_key='pending_city'`)[0].verified_telegram_id).toBe(null);
  await sendUpdate(api, update(PHONE_TESTER, "", { message: { contact: { phone_number: "+7 900 123-45-67", user_id: Number(PHONE_TESTER) } } }));
  expect((await db`SELECT verified_telegram_id FROM liz_astro_testers WHERE handle_key='pending_city'`)[0].verified_telegram_id).toBe(PHONE_TESTER);
});

test("Тестер видит /status с понятным статусом", async () => {
  const before = mocks.sentTexts(TESTER).length;
  await sendUpdate(api, update(TESTER, "/status", { username: "kate_test" }));
  expect(mocks.sentTexts(TESTER).slice(before).at(-1)).toMatch(/доступ|Доступ/);
});
