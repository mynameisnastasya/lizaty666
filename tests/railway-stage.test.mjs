import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.RAILWAY_STAGE_URL || 'https://lizty666-stage.up.railway.app';
async function check(path) {
  const response = await fetch(new URL(path, BASE), { signal: AbortSignal.timeout(15000) });
  return response;
}

test('staging Railway health reports truthful migration state', async () => {
  const response = await check('/health');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.railwayHosted, true);
  assert.equal(body.flootDependency, false);
  assert.equal(body.staticSiteReady, true);
  assert.equal(body.fullStackMigrated, false);
  assert.equal(body.paymentsEnabled, false);
});

test('public homepage is served from Railway without Floot proxy', async () => {
  const response = await check('/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('x-migration-stage'), 'independent-static-railway');
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  const html = await response.text();
  assert.match(html, /liz_ty666/i);
  assert.doesNotMatch(html, /liz-ty666-academy\.floot\.app/i);
});

test('static sections and assets are available', async () => {
  for (const [path, type] of [
    ['/astrology.html', 'text/html'],
    ['/education.html', 'text/html'],
    ['/privacy.html', 'text/html'],
    ['/styles.css', 'text/css'],
    ['/app.js', 'text/javascript'],
    ['/assets/liza-main-photo.svg', 'image/svg+xml'],
  ]) {
    const response = await check(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(type), path);
  }
});

test('checkout preview is visible but full-stack auth is not exposed', async () => {
  const preview = await check('/ezhednevka-oplata');
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /ASTRODAY/);
  const login = await check('/login');
  assert.equal(login.status, 503);
});

test('robots excludes the staging website from search indexing', async () => {
  const response = await check('/robots.txt');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Disallow:\s*\//);
});
