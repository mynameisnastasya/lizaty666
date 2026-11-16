// Builds release/editorial-testkit.mjs: the deployed editorial code (verbatim) + the new shared Liza module, with exports for unit tests.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const sched = readFileSync(root + "original/scheduler.mjs", "utf8").split("\n");
const editorial = sched.slice(7, 361).join("\n"); // lines 8..361 = forecast-editorial.ts
const shared = readFileSync(root + "shared/liza-editorial.mjs", "utf8");
const out = [
  'import { createHash, randomUUID } from "crypto";',
  editorial,
  shared,
  "export { getEditorialBrief, renderDailyForecast, validateEditorialDraft, feSimilarity, FORECAST_EDITORIAL_VERSION, LIZA_FORBIDDEN, LIZA_SYSTEM_PROMPT, LIZA_PROMPT_VERSION, LIZA_SCHEMA, lizaValidate, lizaFactPlan, lizaAssemble, lizaPromptPayload, lizaWriteForecast, lizaEditorialConfig, LizaEditorialError, lizaDateHeader };"
].join("\n");
mkdirSync(root + "release", { recursive: true });
writeFileSync(root + "release/editorial-testkit.mjs", out);
console.log("testkit", out.length);
