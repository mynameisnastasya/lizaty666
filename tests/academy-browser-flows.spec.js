const { test, expect } = require('@playwright/test');

const STAGE = 'https://lizty666-stage.up.railway.app';

test('a logged-out visitor cannot access the protected birth form', async ({ page }) => {
  const missingAssets = [];
  page.on('response', r => {
    if (r.url().startsWith(STAGE + '/_assets/') && r.status() >= 400) missingAssets.push(r.url());
  });
  await page.goto(STAGE + '/ezhednevka', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await expect(page.locator('body')).toContainText('TELEGRAM', { timeout: 10000 });
  // The form is intentionally behind TelegramForecastGate; do not fake a logged-in user.
  await expect(page.locator('#daily-city')).toHaveCount(0);
  await expect(page.locator('a[href*="t.me/Lizty666bot"]').first()).toBeAttached();
  expect(missingAssets).toEqual([]);
});

test('logged-out Academy renders an explicit guest state', async ({ page }) => {
  await page.goto(STAGE + '/app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const response = await page.request.get(STAGE + '/_api/forecast/me');
  expect(response.status()).toBe(200);
  expect((await response.json()).json.registered).toBe(false);
  await expect(page.locator('body')).toContainText('ЕЖЕДНЕВКА');
});

test('checkout shows safely unavailable payment status instead of attempting charges', async ({ page }) => {
  await page.goto(STAGE + '/ezhednevka-oplata', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const [availability, status] = await Promise.all([
    page.request.get(STAGE + '/_api/payments/yookassa-ready'),
    page.request.get(STAGE + '/_api/forecast/rub-status'),
  ]);
  expect(availability.status()).toBe(200);
  expect((await availability.json()).enabled).toBe(false);
  expect((await status.json()).salesOpen).toBe(false);
  await expect(page.locator('body')).toContainText('Оплата пока не открыта');
});

test('original storefront no longer appears at Academy Railway staging', async ({ page }) => {
  await page.goto(STAGE + '/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('LIZ_TY666 — личные разборы, соляр, затмения и обучение');
  await expect(page.locator('body')).toContainText('ЧТО ДЕЛАТЬ');
});

test('staging sign-in uses Telegram only and never requests email or password', async ({page}) => {
  await page.goto(STAGE+'/login',{waitUntil:'domcontentloaded',timeout:30_000});
  await expect(page).toHaveTitle('Вход через Telegram — LIZ_TY666');
  await expect(page.getByRole('button',{name:'ВОЙТИ ЧЕРЕЗ TELEGRAM'})).toBeVisible();
  await expect(page.locator('input[type=email]')).toHaveCount(0);
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('Один Telegram ID');
  await page.getByRole('button',{name:'ВОЙТИ ЧЕРЕЗ TELEGRAM'}).click();
  await expect(page.locator('#message')).not.toBeEmpty({timeout:15_000});
  const identity=await page.request.get(STAGE+'/_api/auth/session');
  expect(identity.status()).toBe(401,'No session without verified Telegram message');
});

test('Telegram Mini App shows the same verified identity gateway', async ({page}) => {
  await page.goto(STAGE+'/ezhednevka-mini',{waitUntil:'domcontentloaded',timeout:30_000});
  await expect(page).toHaveTitle('Вход через Telegram — LIZ_TY666');
  await expect(page.locator('input[type=email]')).toHaveCount(0);
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'ВОЙТИ ЧЕРЕЗ TELEGRAM'})).toBeVisible();
});

test('staging birth form remains gated for a logged-out visitor', async ({page}) => {
  await page.goto(STAGE+'/railway-profile',{waitUntil:'domcontentloaded',timeout:30_000});
  await expect(page.locator('#gate')).toBeVisible({timeout:12_000});
  await expect(page.locator('#panel')).toBeHidden();
});
