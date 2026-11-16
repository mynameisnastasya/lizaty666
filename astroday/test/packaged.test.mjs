// Проверка именно упакованных обёрток, которые уйдут в Railway (распаковка, SHA, публикация артефакта, загрузка планировщика).
import { test, expect, afterAll } from "bun:test";
import { Mocks, freshDb, startApi, runScheduler, update, sendUpdate, miniSession, registerProfile, apiPost } from "./harness.mjs";
const DB = "astroday_packaged";
const mocks = new Mocks().start();
const db = await freshDb(DB);
let api;
afterAll(async () => { api?.stop(); mocks.stop(); await db.close(); });
test("планировщик без опубликованного артефакта честно падает и ничего не делает", async () => {
  const out = await runScheduler(mocks, DB, "release/deploy/scheduler-wrapper.ts");
  expect(out).toContain("SCHEDULER_ARTIFACT");
});
test("API из обёртки: проверка SHA, публикация артефакта, бот отвечает", async () => {
  api = await startApi(mocks, DB, "release/deploy/api-wrapper.ts");
  expect(api.log.out).toContain("ASTRODAY_SOURCE_OK");
  expect(api.log.out).toContain("ASTRODAY_SCHEDULER_ARTIFACT_PUBLISHED");
  await sendUpdate(api, update("740000001", "/start"));
  expect(mocks.sentTexts("740000001").at(-1)).toContain("ASTRODAY");
});
test("планировщик из артефакта: полный путь оплаты и доставки", async () => {
  expect(await runScheduler(mocks, DB, "release/deploy/scheduler-wrapper.ts")).toContain("ASTRODAY_WORKER_DELIVERY");
  const id = "740000001";
  const s = await miniSession(api, id, "pk");
  await registerProfile(api, s.cookie, { deliveryHour: 0 });
  const r = await apiPost(api, "/v1/checkout", { plan: "year", receiptEmail: "p@example.ru", acceptOffer: true, acceptData: true, legalVersion: "ASTRODAY-20261115" }, s.cookie, { "Idempotency-Key": "packaged-year-key-001" });
  expect(r.status).toBe(200);
  const pid = (await db`SELECT provider_payment_id FROM liz_orders WHERE id=${r.body.orderId}::uuid`)[0].provider_payment_id;
  mocks.succeed(pid);
  await apiPost(api, "/v1/yookassa/webhook", { type: "notification", event: "payment.succeeded", object: { id: pid } });
  await Bun.sleep(1500);
  await runScheduler(mocks, DB, "release/deploy/scheduler-wrapper.ts");
  expect((await db`SELECT status,text_source FROM liz_daily_messages WHERE telegram_id=${id}`)[0]).toEqual({ status: "sent", text_source: "openai" });
  expect(mocks.sentTexts(id).some((t) => t.includes("ДЕЛА, УЧЁБА") && t.includes("🔮"))).toBe(true);
});
