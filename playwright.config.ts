import { defineConfig, devices } from '@playwright/test';

/**
 * Configurazione Playwright.
 *
 * I test girano contro la build statica servita da `astro preview`, non contro
 * il dev server: è la stessa cosa che finisce in produzione, service worker e
 * asset con hash inclusi.
 */
const BASE_PATH = process.env.BASE_PATH ?? '/pieno-dati/';
const PORT = Number(process.env.PORT ?? 4321);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  timeout: 30_000,

  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    // Diagnostica sui fallimenti: la trace conserva DOM, rete e console del
    // primo retry; screenshot e video vengono tenuti solo quando un test
    // fallisce, per non gonfiare l'artifact con le run verdi.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Emulazione: i test reali su hardware Android restano manuali.
      name: 'mobile-android',
      use: { ...devices['Pixel 7'] },
    },
    {
      // WebKit approssima Safari iOS. Non lo sostituisce: il comportamento di
      // installazione PWA su iOS va comunque verificato a mano.
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],

  webServer: {
    command: 'npm run preview -- --port ' + PORT,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
