// Test-only: route the service's outbound calls to the local mock server. Never shipped.
const base = process.env.MOCK_BASE;
if (!base) throw Error("MOCK_BASE missing");
const realFetch = globalThis.fetch;
const routes = [
  ["https://api.telegram.org/", base + "/tg/"],
  ["https://api.yookassa.ru/", base + "/yk/"],
  ["http://liz-astro-v2.railway.internal:8080/", base + "/astro/"],
  ["https://api.openai.com/", base + "/openai/"],
  ["https://lizty666-api-stage.up.railway.app/", base + "/selfapi/"],
  ["https://raw.githubusercontent.com/", base + "/gh/"]
];
globalThis.fetch = (input, init) => {
  let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  for (const [from, to] of routes) if (url.startsWith(from)) { url = to + url.slice(from.length); return realFetch(url, init); }
  if (url.startsWith(base) || url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return realFetch(input, init);
  return Promise.reject(new Error("blocked_external_fetch_in_test " + url));
};
