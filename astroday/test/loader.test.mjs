// Загрузчики: код из GitHub по коммиту с проверкой SHA; при недоступности GitHub — проверенная копия из базы.
import { test, expect, afterAll } from "bun:test";
import { Mocks, freshDb, startApi, runScheduler, update, sendUpdate } from "./harness.mjs";
const DB = "astroday_loader";
const mocks = new Mocks().start();
const db = await freshDb(DB);
let api;
afterAll(async () => { api?.stop(); mocks.stop(); await db.close(); });
test("API загружается из GitHub и сохраняет копию в базе", async () => {
  api = await startApi(mocks, DB, "release/deploy/api-loader.ts");
  expect(api.log.out).toContain('"from":"github"');
  await sendUpdate(api, update("750000001", "/start"));
  expect(mocks.sentTexts("750000001").length).toBe(1);
  expect((await db`SELECT count(*)::int n FROM astroday_release_artifacts WHERE name='api'`)[0].n).toBe(1);
});
test("планировщик: GitHub недоступен → проверенная копия из базы после первого запуска", async () => {
  expect(await runScheduler(mocks, DB, "release/deploy/scheduler-loader.ts")).toContain('"from":"github"');
  mocks.githubDown = true;
  const out = await runScheduler(mocks, DB, "release/deploy/scheduler-loader.ts");
  expect(out).toContain('"from":"database"');
  expect(out).toContain("ASTRODAY_WORKER_DELIVERY");
});
test("подмена кода (SHA не совпал) не запускается", async () => {
  mocks.githubDown = false;
  await db`DELETE FROM astroday_release_artifacts`;
  const orig = await Bun.file("release/scheduler.mjs").text();
  await Bun.write("release/scheduler.mjs", orig + "\n// tampered");
  try {
    const out = await runScheduler(mocks, DB, "release/deploy/scheduler-loader.ts");
    expect(out).toContain("ASTRODAY_LOADER_SHA_MISMATCH");
    expect(out).not.toContain("ASTRODAY_WORKER_DELIVERY");
  } finally { await Bun.write("release/scheduler.mjs", orig); }
});
