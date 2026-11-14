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

test('real staging registration UI creates a secure web session and supports logout', async ({page}) => {
  const {randomUUID}=require('node:crypto');
  const email='browser-qa-'+randomUUID()+'@example.invalid';
  const password='StagingTest-'+randomUUID()+'!Aa2';
  await page.goto(STAGE+'/login',{waitUntil:'domcontentloaded',timeout:30_000});
  await page.getByRole('tab',{name:'РЕГИСТРАЦИЯ'}).click();
  await page.getByRole('textbox',{name:'Email'}).fill(email);
  await page.getByPlaceholder('Your Name').fill('Тест Вход');
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button',{name:'Create Account'}).click();
  await expect(page).toHaveURL(/\/railway-profile(?:[#?]|$)/,{timeout:20_000});
  const session=await page.request.get(STAGE+'/_api/auth/session');
  expect(session.status()).toBe(200);
  expect((await session.json()).json.user.email).toBe(email);
  await page.goto(STAGE+'/login',{waitUntil:'domcontentloaded'});
  await expect(page.getByText('С возвращением!')).toBeVisible({timeout:15_000});
  await page.getByRole('button',{name:'ВЫЙТИ ИЗ АККАУНТА'}).click();
  const revoked=await page.request.get(STAGE+'/_api/auth/session');
  expect(revoked.status()).toBe(401);
});
