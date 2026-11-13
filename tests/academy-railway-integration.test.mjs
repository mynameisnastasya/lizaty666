import test from 'node:test';
import assert from 'node:assert/strict';

const WEB = process.env.ACADEMY_STAGING_URL ?? 'https://lizty666-stage.up.railway.app';
const API = process.env.ACADEMY_API_URL ?? 'https://lizty666-api-stage.up.railway.app';
const FLOOT_PRICES = Object.freeze({ month: 3666, halfyear: 6666, year: 8888 });

async function getJSON(origin, path, opts) {
  const res = await fetch(origin + path, {
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
    ...opts,
  });
  let value;
  try { value = await res.json(); }
  catch { throw new Error(`Non-JSON response ${res.status} from ${path}`); }
  return { status: res.status, body: value };
}

test('Railway staging contains the actual published Floot Academy', async () => {
  const { status, body } = await getJSON(WEB, '/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'liz-ty666-academy');
  assert.equal(body.frontendIndependentOfFloot, true);
  assert.equal(body.frontendPages, 28);
  assert.equal(body.staticAssets, 77);
  assert.equal(body.paymentsEnabled, false);
  assert.equal(body.backendMigrated, false);
  assert.equal(body.userDataMigrated, false);
});

test('Guest authentication is explicit, not a fake signed-in session', async () => {
  const r = await getJSON(WEB, '/_api/auth/session');
  assert.equal(r.status, 401);
  assert.equal(r.body.json.error, 'Not authenticated');
});

test('Guest forecast does not leak personal data', async () => {
  const r = await getJSON(WEB, '/_api/forecast/me');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { json: { registered: false } });
});

test('Published city search is backed by Railway and preserves Floot format', async () => {
  const r = await getJSON(WEB, '/_api/forecast/places?q=' + encodeURIComponent('Москва'));
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body?.json?.places));
  assert.ok(r.body.json.places.some(p => p.name === 'Москва' && p.timezone === 'Europe/Moscow'));
  assert.ok(r.body.json.places.every(p => Number.isSafeInteger(p.id) && p.label && p.timezone));
});

test('Railway storefront does not falsely advertise available checkout', async () => {
  const [site, status] = await Promise.all([
    getJSON(WEB, '/_api/payments/yookassa-ready'),
    getJSON(WEB, '/_api/forecast/rub-status'),
  ]);
  assert.equal(site.status, 200);
  assert.equal(site.body.enabled, false);
  assert.equal(status.status, 200);
  assert.equal(status.body.salesOpen, false);
});

test('Railway API uses a real database and has not enabled sales', async () => {
  const [health, readiness] = await Promise.all([
    getJSON(API, '/health'),
    getJSON(API, '/v1/release-readiness'),
  ]);
  assert.equal(health.status, 200);
  assert.equal(health.body.databaseReady, true);
  assert.equal(health.body.externalPaymentsEnabled, false);
  assert.equal(readiness.status, 200);
  assert.equal(readiness.body.readyForPublicSales, false);
  assert.ok(readiness.body.blockedBy.includes('staging_no_real_payments'));
  assert.ok(readiness.body.blockedBy.includes('source_code_and_user_data_not_migrated'));
});

test('Price discrepancies cannot be mistaken for ready-to-launch payments', async () => {
  const [plans, readiness] = await Promise.all([
    getJSON(API, '/v1/plans'),
    getJSON(API, '/v1/release-readiness'),
  ]);
  assert.equal(plans.status, 200);
  assert.equal(plans.body.currency, 'RUB');
  const current = Object.fromEntries(plans.body.plans.map(p => [p.code, p.rub]));
  const parity = Object.entries(FLOOT_PRICES).every(([key, value]) => current[key] === value);
  assert.equal(parity, true, 'Railway prices must exactly match the published Floot Academy');
  assert.equal(readiness.body.readyForPublicSales, false, 'Staging must never permit real payments');
  assert.equal(Object.keys(current).length, 3);
});

test('Invalid checkout cannot create a real payment in staging', async () => {
  // Gate is checked before parsing the body or writing an order.
  const r = await getJSON(API, '/v1/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'staging-no-money-test-0001' },
    body: JSON.stringify({ plan: 'month', receiptEmail: 'qa@example.invalid' }),
  });
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'Checkout temporarily unavailable');
  assert.ok(r.body.blockedBy.includes('staging_no_real_payments'));
});

test('Unauthenticated order/subscription reads are rejected', async () => {
  for (const path of ['/v1/order/status', '/v1/subscription']) {
    const r = await getJSON(API, path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramLogin: null, orderId: '00000000-0000-0000-0000-000000000000' }),
    });
    assert.equal(r.status, 401, path);
  }
});

test('Staging API does not expose admin or data-writing routes', async () => {
  const r = await getJSON(WEB, '/_api/orders/admin');
  assert.equal(r.status, 503);
  const res = await fetch(WEB + '/_api/forecast/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(15_000),
  });
  assert.equal(res.status, 405);
});
