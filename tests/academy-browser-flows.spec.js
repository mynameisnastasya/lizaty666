const { test, expect } = require('@playwright/test');

const STAGE = 'https://lizty666-stage.up.railway.app';

test('a visitor can search and choose their birthplace on Railway Academy', async ({ page }) => {
  const assetFailures = [];
  page.on('response', response => {
    if (response.url().startsWith(STAGE + '/_assets/') && response.status() >= 400) {
      assetFailures.push({ status: response.status(), url: response.url() });
    }
  });
  await page.goto(STAGE + '/ezhednevka', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await expect(page.locator('#daily-city')).toBeVisible({ timeout: 20000 });
  await page.locator('#daily-city').fill('Москва');
  await page.getByRole('button', { name: 'НАЙТИ ГОРОД' }).click();
  await expect(page.getByRole('button', { name: /Москва, Россия/ }).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /Москва, Россия/ }).first().click();
  await expect(page.locator('#daily-city')).toHaveValue('Москва, Россия', { timeout: 10000 });
  expect(assetFailures).toEqual([]);
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
  await expect(page.locator('body')).toContainText('Ежедневка');
});

test('original storefront no longer appears at Academy Railway staging', async ({ page }) => {
  await page.goto(STAGE + '/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('LIZ_TY666 — личные разборы, соляр, затмения и обучение');
  await expect(page.locator('body')).toContainText('ЧТО ДЕЛАТЬ');
});
