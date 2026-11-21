import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {patchSite} from "../../v2/cabinet-integration-v2.mjs";

const html=readFileSync(new URL("../../v2/reader-premium-v2.html",import.meta.url),"utf8");
const backend=readFileSync(new URL("../../v2/monthly-reader.ts",import.meta.url),"utf8");

test("premium reader HTML runs a syntactically valid Telegram WebApp script",()=>{
 const matches=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.ok(matches.length>=1);
 for(const match of matches)assert.doesNotThrow(()=>new Function(match[1]));
 assert.match(html,/telegram\.org\/js\/telegram-web-app\.js/);
 assert.match(html,/data-tab="calendar"/);
 assert.match(html,/data-tab="month"/);
 assert.match(html,/data-tab="profile"/);
 assert.match(html,/prefers-reduced-motion/);
});
test("reader uses a dynamic authenticated access window rather than a fixed future month",()=>{
 assert.match(html,/function updatePeriod\(start,end\)/);
 assert.match(html,/updatePeriod\(data\.periodStart,data\.periodEnd\)/);
 assert.match(html,/periodIndex\(calendarYear,calendarMonth\)/);
 assert.match(backend,/period_end>=CURRENT_DATE/);
 assert.match(backend,/periodStart:m\[0\]\.period_start/);
 assert.match(backend,/periodEnd:m\[0\]\.period_end/);
 assert.doesNotMatch(backend,/period_start='2026-11-21' AND period_end='2026-12-17'/);
});
test("backend retains Telegram HMAC authentication and subscription gating",()=>{
 assert.match(backend,/timingSafeEqual/);
 assert.match(backend,/valid_until>NOW\(\)/);
 assert.match(backend,/status='ready'/);
 assert.match(backend,/Cache-Control":"private,no-store"/);
 assert.match(backend,/astroday-monthly-reader-v3/);
});
test("original cabinet can be patched without touching payment routes",()=>{
 const mock='var DASHBOARD_HTML = "<html><head></head><body><div id=\\"forecast\\" class=\\"forecast\\"></div><details id=\\"cal-report\\"></details></body></html>";\n'
   +'Bun.serve({ port: Number(Bun.env.PORT || "3000"), idleTimeout: 60, async fetch(req) {\n'
   +' const url = new URL(req.url), method = req.method, path = url.pathname;\n'
   +' if(path==="/checkout")return new Response("checkout");\n return new Response("ok");\n}});';
 const patched=patchSite(mock);
 assert.doesNotThrow(()=>new Function(patched));
 assert.match(patched,/astroday-premium-global-v2/);
 assert.match(patched,/astro-month-range/);
 assert.match(patched,/bounds\.min=data\.periodStart/);
 assert.match(patched,/\/_api\/astro-premium/);
 assert.match(patched,/checkout/);
});
test("cabinet source patch rejects unrelated server",()=>{
 assert.throws(()=>patchSite("console.log('unrelated')"),/not_the_dashboard/);
});
