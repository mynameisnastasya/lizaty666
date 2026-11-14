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

test('unconfigured payment and Telegram webhooks are fail-closed', async () => {
  const [payment, telegram] = await Promise.all([
    getJSON(API, '/v1/yookassa/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id: 'bogus0000000001' } }),
    }),
    getJSON(API, '/v1/telegram/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 100000, message: { text: '/start' } }),
    }),
  ]);
  // Neither provider's credentials are available in the staging API.
  assert.equal(payment.status, 503);
  assert.equal(telegram.status, 503);
  assert.equal(payment.body.error, 'Provider credentials not configured');
  assert.equal(telegram.body.error, 'bot_not_configured');
});

test('Refund period reconciliation remains a hard checkout release blocker', async () => {
  const { status, body } = await getJSON(API, '/v1/release-readiness');
  assert.equal(status, 200);
  assert.equal(body.readyForPublicSales, false);
  assert.ok(Array.isArray(body.blockedBy));
  assert.ok(body.blockedBy.includes('refund_period_reconciliation_not_verified'),
    'Never enable checkout before every order has a verified grant period and refund policy');
});

test('Refund webhook rejects a forged notification when merchant credentials are absent', async () => {
  const r = await getJSON(API, '/v1/yookassa/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'notification',
      event: 'refund.succeeded',
      object: { id: 'forged-refund-000001' },
    }),
  });
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'Provider credentials not configured');
});

test('staging account register/login/logout with isolated cookie', async () => {
  // Synthetic account: no customer identity or real data is used or migrated.
  const { randomUUID } = await import('node:crypto');
  const email = 'qa-' + randomUUID() + '@example.invalid';
  const password = 'Qa-' + randomUUID() + '!A2';
  const request = (route, payload, cookie) => fetch(WEB + '/_api/auth/' + route, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: WEB,
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify({json: payload}),
    signal: AbortSignal.timeout(20_000)
  });
  const joined = await request('register_with_password', {
    email, password, displayName: 'Тестовая запись', role: 'admin'
  });
  assert.equal(joined.status, 200, 'Synthetic staging account registration');
  const registration = await joined.json();
  assert.equal(registration.json.user.email, email);
  assert.equal(registration.json.user.role, 'user', 'No role escalation from signup data');
  const cookie = joined.headers.get('set-cookie')?.split(';')[0] || '';
  assert.match(cookie, /^liz_stage_sid=[A-Za-z0-9_-]{43}$/);
  const setCookie = joined.headers.get('set-cookie') || '';
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Lax/i);

  const active = await fetch(WEB + '/_api/auth/session', {
    headers: {Cookie: cookie},
    signal: AbortSignal.timeout(15_000)
  });
  assert.equal(active.status, 200);
  const activeSession = await active.json();
  assert.equal(activeSession.json.user.email, email);

  const loggedOut = await request('logout', {}, cookie);
  assert.equal(loggedOut.status, 200);
  const revoked = await fetch(WEB + '/_api/auth/session', {
    headers: {Cookie: cookie}, signal: AbortSignal.timeout(15_000)
  });
  assert.equal(revoked.status, 401, 'Logout must invalidate session server-side');

  const wrong = await request('login_with_password', {email, password: 'Incorrect-Password-123'});
  assert.equal(wrong.status, 401, 'Wrong password must not authenticate');

  const loggedIn = await request('login_with_password', {email, password});
  assert.equal(loggedIn.status, 200, 'Login must work after logout');
  const login = await loggedIn.json();
  assert.equal(login.json.user.email, email);
});
