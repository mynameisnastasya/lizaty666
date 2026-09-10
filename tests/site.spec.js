const { test, expect } = require('@playwright/test');

const pages = [
  'index.html', 'liza-chto-delat.html', 'astrology.html', 'runes.html',
  'candles.html', 'education.html', 'reviews.html', 'about.html',
  'faq.html', 'contacts.html', 'offer.html', 'privacy.html'
];

test.describe('site integrity', () => {
  for (const path of pages) {
    test(`${path} loads without console or layout failures`, async ({ page }) => {
      const errors = [];
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('pageerror', error => errors.push(error.message));

      const response = await page.goto(`/${path}`, { waitUntil: 'domcontentloaded' });
      expect(response && response.ok()).toBeTruthy();
      await expect(page.locator('body')).toBeVisible();

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        text: document.body.innerText.trim().length
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
      expect(metrics.text).toBeGreaterThan(80);
      expect(errors).toEqual([]);
    });
  }

  test('main navigation and Telegram CTAs remain available', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('a[href*="t.me/liz_ty666"]').first()).toBeVisible();
    for (const href of ['astrology.html', 'runes.html', 'candles.html', 'education.html']) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached();
    }
  });

  test('menu supports keyboard escape', async ({ page }) => {
    await page.goto('/index.html');
    const trigger = page.locator('button[aria-controls]').first();
    if (await trigger.isVisible()) {
      await trigger.click();
      await page.keyboard.press('Escape');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('reduced motion keeps content accessible', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/index.html');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('a[href*="t.me/liz_ty666"]').first()).toBeVisible();
    await context.close();
  });
});
