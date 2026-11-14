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
  assert.ok([401, 403, 405].includes(res.status), "Unauthorized or cross-origin profile submission must be rejected");
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

test('Telegram identity is the only supported staging sign-in method', async () => {
  for(const action of ['register_with_password','login_with_password','request_password_reset','reset_password']){
    const r=await getJSON(WEB,'/_api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:WEB},body:JSON.stringify({json:{email:'nobody@example.invalid',password:'test-only'}})});
    assert.equal(r.status,410,'Email/password account route has been retired: '+action);
  }
  const page=await fetch(WEB+'/login',{signal:AbortSignal.timeout(15_000)});
  assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/Войти через Telegram/i);
  assert.ok(html.includes('Lizty666bot'));
  assert.doesNotMatch(html,/<input[^>]*type=["']?password/i);
  assert.doesNotMatch(html,/<input[^>]*type=["']?email/i);
});

test('forged Telegram identity, absent bot session and unsafe profile writes are rejected', async () => {
  const csrf=await getJSON(WEB,'/_api/tg-auth/start',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://fake.example'},body:'{}'});
  assert.equal(csrf.status,403,'A foreign page must not start a Telegram login flow');
  const oldCookie=await getJSON(WEB,'/_api/tg-auth/status',{headers:{Cookie:'liz_stage_sid='+('a'.repeat(43))}});
  assert.equal(oldCookie.status,401,'Retired email session must not authenticate as Telegram');
  const status=await getJSON(WEB,'/_api/tg-auth/status');
  assert.equal(status.status,401,'No session should be minted without a bot confirmation');
  const forged=await getJSON(WEB,'/_api/tg-auth/mini',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:WEB},
    body:JSON.stringify({initData:'user=%7B%22id%22%3A123456789%7D&auth_date=1700000000&hash='+'a'.repeat(64)})
  });
  assert.ok([401,503].includes(forged.status),'Unverified Telegram initData must not sign a user in');
  const fakeCookie=await getJSON(WEB,'/_api/auth/session',{headers:{Cookie:'liz_tg_sid=fake-token'}});
  assert.equal(fakeCookie.status,401);
  for(const action of ['register','preview','settings']){
    const r=await getJSON(WEB,'/_api/forecast/'+action,{
      method:'POST',headers:{'Content-Type':'application/json',Origin:WEB},
      body:JSON.stringify({json:{fullName:'QA',birthDate:'2000-07-15',telegramId:'123456789'}})
    });
    assert.equal(r.status,401,'No arbitrary Telegram ID can write profile via '+action);
  }
});

test('Telegram account ID is bound to bot chat and payment checkout stays disabled', async () => {
  const [login,readiness]=await Promise.all([
    getJSON(WEB,'/_api/tg-auth/start',{
      method:'POST',headers:{'Content-Type':'application/json',Origin:WEB},body:JSON.stringify({})
    }),
    getJSON(API,'/v1/release-readiness')
  ]);
  assert.ok([200,503].includes(login.status),'Before bot configuration, sign-in must fail closed');
  if(login.status===200){
    assert.match(login.body.json.botUrl,/^https:\/\/t\.me\/Lizty666bot\?start=login_[A-Za-z0-9_-]{22}$/);
    assert.equal(login.body.json.expiresInSeconds,600);
  }else assert.ok(login.body.json.error);
  assert.equal(readiness.body.readyForPublicSales,false);
  assert.ok(readiness.body.blockedBy.includes('telegram_id_and_delivery_chat_not_e2e_verified'));
});

test('Telegram Mini App is backed by signature validation, not an email account', async () => {
 const response=await fetch(WEB+'/ezhednevka-mini',{signal:AbortSignal.timeout(15_000)});
 assert.equal(response.status,200);
 const html=await response.text();
 assert.match(html,/Telegram.WebApp|Telegram\?\.WebApp/);
 assert.match(html,/initData/);
 assert.match(html,/\/_api\/tg-auth\//);
 assert.doesNotMatch(html,/<input[^>]*type=["']?email/i);
 assert.doesNotMatch(html,/<input[^>]*type=["']?password/i);
 const status=await getJSON(WEB,'/_api/tg-auth/session');
 assert.equal(status.status,401);
 assert.equal(status.body.json.error,'Not authenticated');
});
