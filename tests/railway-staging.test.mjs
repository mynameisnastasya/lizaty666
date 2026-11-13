import test from 'node:test';
import assert from 'node:assert/strict';

const SITE = process.env.RAILWAY_STAGING_URL || 'https://lizty666-stage.up.railway.app';
const API = process.env.RAILWAY_STAGING_API_URL || 'https://lizty666-api-stage.up.railway.app';

async function request(base, path, opts = {}) {
  return fetch(new URL(path, base), { signal: AbortSignal.timeout(15_000), redirect: 'manual', ...opts });
}

test('Railway staging serves its own static site, not a Floot proxy', async () => {
  const r = await request(SITE, '/health');
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.equal(data.railwayHosted, true);
  assert.equal(data.flootDependency, false);
  assert.equal(data.staticSiteReady, true);
  assert.equal(data.fullStackMigrated, false);
  assert.equal(data.paymentsEnabled, false);
  assert.equal(r.headers.get('x-migration-stage'), 'independent-static-railway');
});

const pages = [
  'index.html', 'about.html', 'astrology.html', 'candles.html',
  'cases.html', 'contacts.html', 'education.html', 'faq.html',
  'foxes-144.html', 'foxes-video.html', 'liza-chto-delat.html',
  'offer.html', 'privacy.html', 'reviews.html', 'runes.html',
  'ezhednevka-oplata', 'ezhednevka-mini'
];
test('all public pages render real HTML on Railway staging', async (t) => {
  for (const page of pages) {
    await t.test(page, async () => {
      const r = await request(SITE, '/' + page);
      assert.equal(r.status, 200, page);
      assert.match(r.headers.get('content-type') || '', /^text\/html/i);
      const body = await r.text();
      assert.match(body, /<html\b/i, page);
      assert.ok(body.length > 350, page);
      assert.doesNotMatch(body, /Тестовая версия Railway · страницы перенаправляются из Floot/i);
    });
  }
});

test('CSS, JS, SVG and large photo load from Railway domain', async () => {
  for (const [path, type, min] of [
    ['/styles.css', 'text/css', 500],
    ['/app.js', 'text/javascript', 300],
    ['/assets/liza-main-photo.svg', 'image/svg+xml', 500],
    ['/assets/212CB13A-DFA8-4E37-BF86-4F200A4A0E9A.png', 'image/png', 100_000]
  ]) {
    const r = await request(SITE, path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type') || '', new RegExp('^' + type), path);
    const bytes = (await r.arrayBuffer()).byteLength;
    assert.ok(bytes > min, path + ': too small ' + bytes);
  }
});

test('private resources and legacy API are not exposed on storefront', async () => {
  for (const [path, status] of [['/.env', 404], ['/login', 503], ['/v1/plans', 503]]) {
    const r = await request(SITE, path);
    assert.equal(r.status, status, path);
  }
  const r = await request(SITE, '/');
  assert.match(await r.text(), /<title[^>]*>/i);
});

test('separate Railway API offers plans but keeps real payments closed', async () => {
  const [health, plans, gate] = await Promise.all([
    request(API, '/health'),
    request(API, '/v1/plans'),
    request(API, '/v1/release-readiness'),
  ]);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).databaseReady, true);
  assert.equal(plans.status, 200);
  const p = await plans.json();
  assert.equal(p.currency, 'RUB');
  assert.ok(Array.isArray(p.plans) && p.plans.length === 3);
  assert.equal(gate.status, 200);
  const g = await gate.json();
  assert.equal(g.readyForPublicSales, false);
  assert.ok(Array.isArray(g.blockedBy) && g.blockedBy.length > 0);
});
