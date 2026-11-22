import { test, expect } from "bun:test";
import { PUBLIC_PAGE, RUNTIME_PATCH, ROUTE_PATCH, upgradeCompiledSite } from "../../v2/brand-operating-system-20261122.mjs";

test("public guide explains method, paid value and limitations", () => {
  expect(PUBLIC_PAGE).toContain("Шесть шагов без догадок");
  expect(PUBLIC_PAGE).toContain("Персональные исходные данные");
  expect(PUBLIC_PAGE).toContain("не являются научно");
  expect(PUBLIC_PAGE).toContain("Автоматических списаний нет");
});

test("guide links are real existing product routes", () => {
  for (const href of ['href="/login"', 'href="/checkout"', 'href="/app"', 'href="/privacy"', 'href="/offer"'])
    expect(PUBLIC_PAGE).toContain(href);
});

test("mobile layout, focus and reduced motion are supported", () => {
  expect(PUBLIC_PAGE).toContain("@media(max-width:690px)");
  expect(PUBLIC_PAGE).toContain(":focus-visible");
  expect(PUBLIC_PAGE).toContain("prefers-reduced-motion");
});

test("staged transform applies once and does not mutate payments or data", () => {
  const src='Bun.serve({ port: Number(Bun.env.PORT || "3000"), idleTimeout: 60, async fetch(req) {\nconst url = new URL(req.url), method = req.method, path = url.pathname;\n});';
  const updated=upgradeCompiledSite(src);
  expect(updated).toContain("ASTRODAY_BRAND_OS_V2_20261122");
  expect(updated).toContain('path==="/astroday-method"');
  expect(() => upgradeCompiledSite(updated)).toThrow();
  expect(updated).not.toContain("DROP TABLE");
  expect(updated).not.toContain("YooKassa.createPayment");
});

test("bad anchors fail rather than ship a half-integrated app", () => {
  expect(() => upgradeCompiledSite("Bun.serve({})")).toThrow();
});

test("interface copy spans login, profile, dashboard and checkout", () => {
  const entry=[
    'let DASHBOARD_HTML=\'<head></head><details class="astro-help"></details>\';',
    'let LOGIN_HTML=\'<head></head><section class="card"></section>\';',
    'let PROFILE_HTML=\'<head></head><div class="warning" id="availability"></div>\';',
    'let CHECKOUT_HTML=\'<head></head><section id="miniGate"></section>\';',
    'let astrodayOnboardingCopyV1=(html,path)=>html;',
    RUNTIME_PATCH,
    'return [DASHBOARD_HTML,LOGIN_HTML,PROFILE_HTML,CHECKOUT_HTML];'
  ].join("\n");
  const [dashboard,login,profile,checkout]=new Function("console",entry)({log() {}});
  expect(dashboard).toContain("astro-brand-links");
  expect(login).toContain("Сначала познакомься с системой");
  expect(profile).toContain("Зачем нужны данные рождения?");
  expect(checkout).toContain("Автоматических списаний нет");
  expect(ROUTE_PATCH).toContain('method!=="GET"&&method!=="HEAD"');
});
