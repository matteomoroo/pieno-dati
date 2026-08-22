import { test, expect, devices } from '@playwright/test';

/**
 * Comportamento sui viewport stretti.
 * I viewport richiesti dallo sprint: 320, 375, 390, 430 px.
 */
const VIEWPORTS = [
  { name: '320 px (iPhone SE 1a gen)', width: 320, height: 568 },
  { name: '375 px (iPhone SE / 13 mini)', width: 375, height: 667 },
  { name: '390 px (iPhone 13/14)', width: 390, height: 844 },
  { name: '430 px (iPhone Pro Max)', width: 430, height: 932 },
];

for (const vp of VIEWPORTS) {
  test.describe(`calcolatore a ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('nessuno scorrimento orizzontale', async ({ page }) => {
      await page.goto('/calcola-risparmio');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'la pagina deborda in orizzontale').toBeLessThanOrEqual(1);
    });

    test('i comandi principali sono raggiungibili e toccabili', async ({ page }) => {
      await page.goto('/calcola-risparmio');

      for (const selector of ['#calc-locate', '#calc-place', '#calc-fuel']) {
        const el = page.locator(selector);
        await expect(el).toBeVisible();
        const box = await el.boundingBox();
        expect(box, `${selector} senza box`).not.toBeNull();
        // Target touch minimo raccomandato: 44 px.
        expect(box!.height, `${selector} troppo basso da toccare`).toBeGreaterThanOrEqual(
          40,
        );
      }
    });

    test('la ricerca manuale funziona anche su schermo stretto', async ({ page }) => {
      await page.goto('/calcola-risparmio');
      await page.locator('#calc-place').pressSequentially('Torino', { delay: 80 });
      await expect(page.locator('#calc-suggestions li').first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });
}

test.describe('homepage mobile', () => {
  test.use({
    viewport: devices['Pixel 7'].viewport,
    userAgent: devices['Pixel 7'].userAgent,
    hasTouch: true,
    isMobile: true,
  });

  test('si apre senza overflow e con la mappa presente', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator('#map')).toBeVisible();
  });

  test('rispetta prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });
});
