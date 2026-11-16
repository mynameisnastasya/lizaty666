// Воспроизведение дефектов развёрнутой версии (original/api.mjs) и проверка исправления (release/api.mjs) на одном сценарии.
import { test, expect, afterAll } from "bun:test";
import { Mocks, freshDb, startApi, runScheduler, update, callback, sendUpdate, miniSession, apiPost, registerProfile, waitFor } from "./harness.mjs";

const builds = { original: ["original/api.mjs", "original/scheduler.mjs"], release: ["release/api.mjs", "release/scheduler.mjs"] };
const cleanup = [];
afterAll(async () => { for (const f of cleanup) await f(); });
async function env(kind, n) {
  const mocks = new Mocks().start();
  const name = "astroday_reg_" + kind + "_" + n;
  const db = await freshDb(name);
  const api = await startApi(mocks, name, builds[kind][0]);
  const stop = async () => { api.stop(); mocks.stop(); await db.close(); };
  cleanup.push(stop);
  return { mocks, db, api, name, stop };
}
const results = {};
for (const kind of ["original", "release"]) {
  test(kind + ": неизвестная (устаревшая) кнопка получает answerCallbackQuery", async () => {
    const { mocks, api } = await env(kind, 1);
    await sendUpdate(api, callback("710000001", "buy_month_old_button"));
    const answered = mocks.tg.some((x) => x.method === "answerCallbackQuery");
    results["callback_" + kind] = answered;
    expect(answered).toBe(kind === "release");
  });
  test(kind + ": сбой при обработке апдейта → повтор Telegram обрабатывается, а не теряется", async () => {
    const { mocks, api } = await env(kind, 2);
    const upd = update("710000002", "/help");
    mocks.tgFail = { method: "sendMessage", status: "network", times: 1 };
    const first = await sendUpdate(api, upd);
    const second = await sendUpdate(api, upd); // Telegram повторяет тот же update_id
    const delivered = mocks.tg.filter((x) => x.method === "sendMessage" && String(x.body.chat_id) === "710000002").length;
    results["retry_" + kind] = { first: first.status, second: second.body, delivered };
    if (kind === "original") expect(second.body?.duplicate).toBe(true);
    else { expect(first.status).toBe(500); expect(delivered).toBe(2); }
  });
  test(kind + ": /start покупателя не предлагает /join_test", async () => {
    const { mocks, api } = await env(kind, 3);
    await sendUpdate(api, update("710000003", "/start"));
    const t = mocks.sentTexts("710000003").at(-1) || "";
    results["start_" + kind] = t.slice(0, 120);
    expect(t.includes("/join_test")).toBe(kind === "original");
  });
  test(kind + ": после оплаты — сообщение в Telegram и текст через OpenAI", async () => {
    const { mocks, db, api, name } = await env(kind, 4);
    await runScheduler(mocks, name, builds[kind][1]);
    const id = "710000004";
    await sendUpdate(api, update(id, "/start"));
    const s = await miniSession(api, id, "buyer4");
    await registerProfile(api, s.cookie);
    const r = await apiPost(api, "/v1/checkout", { plan: "month", receiptEmail: "x@example.ru", acceptOffer: true, acceptData: true, legalVersion: "ASTRODAY-20261115" }, s.cookie, { "Idempotency-Key": "reg-pay-key-00000001" });
    const pid = (await db`SELECT provider_payment_id FROM liz_orders WHERE id=${r.body.orderId}::uuid`)[0].provider_payment_id;
    mocks.succeed(pid);
    // В исходной версии live-проверка test===false; имитация отдаёт test=false для live-магазина.
    await apiPost(api, "/v1/yookassa/webhook", { type: "notification", event: "payment.succeeded", object: { id: pid } });
    await Bun.sleep(1500);
    await runScheduler(mocks, name, builds[kind][1]);
    const texts = mocks.sentTexts(id);
    const paidMsg = texts.some((t) => t.includes("Оплата прошла"));
    const forecastSent = texts.some((t) => t.length > 300);
    const row = (await db`SELECT text_mode,body FROM liz_daily_messages WHERE telegram_id=${id}`)[0];
    results["payment_" + kind] = { paidMsg, forecastSent, openaiCalls: mocks.openai.length, textMode: row?.text_mode, sections: !!row?.body?.includes("ДЕЛА, УЧЁБА") };
    if (kind === "original") { expect(paidMsg).toBe(false); expect(mocks.openai.length).toBe(0); expect(row?.body?.includes("ДЕЛА, УЧЁБА")).toBe(false); }
    else { expect(paidMsg).toBe(true); expect(forecastSent).toBe(true); expect(mocks.openai.length).toBeGreaterThan(0); }
  }, 30000);
}
test("сводка", () => { console.log("REGRESSION_SUMMARY " + JSON.stringify(results, null, 1)); });
