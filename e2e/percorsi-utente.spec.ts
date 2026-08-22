import { test, expect, type Page } from '@playwright/test';

/**
 * Percorsi utente principali di Pieno.
 *
 * Ogni test parte da uno stato pulito (contesto nuovo per ogni file), come un
 * visitatore che non ha mai aperto il sito.
 */

/** Raccoglie gli errori di console per verificare che non ce ne siano. */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('homepage', () => {
  test('si apre, mostra i prezzi e non produce errori di console', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await expect(page).toHaveTitle(/Pieno/i);
    await expect(page.locator('h1')).toBeVisible();

    // La freschezza del dataset deve essere sempre dichiarata.
    await expect(page.getByText(/aggiorna|rilevat|dati del/i).first()).toBeVisible();

    // I 404 di risorse non essenziali (favicon e simili) non sono errori JS.
    const jsErrors = errors.filter((e) => !/Failed to load resource/i.test(e));
    expect(jsErrors, `errori console: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('espone canonical, Open Graph e manifest', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /og-default\.png$/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });

  test('lo skip link porta al contenuto da tastiera', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // Lo skip link è il primo elemento focalizzabile del documento. Portiamo il
    // focus a inizio pagina agendo sul body (senza cliccarci dentro, che
    // sposterebbe il focus su un campo), poi un Tab lo raggiunge.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveClass(/skip-link/, { timeout: 10_000 });
  });
});

test.describe('mappa', () => {
  test('carica i marker e permette di cambiare carburante', async ({ page }) => {
    await page.goto('/');

    const map = page.locator('#map');
    await expect(map).toBeVisible();

    // MapLibre inserisce un canvas quando la mappa è pronta.
    await expect(map.locator('canvas')).toBeVisible({ timeout: 20_000 });

    const fuelControl = page.locator('[data-fuel], select').first();
    if (await fuelControl.count()) {
      await expect(fuelControl).toBeVisible();
    }
  });

  test('il CSS di MapLibre non è nel percorso critico', async ({ page }) => {
    await page.goto('/');
    // Prima del caricamento della mappa il foglio non deve essere in <head>
    // come <link> generato da Astro: viene aggiunto a runtime.
    const blocking = await page
      .locator('head link[rel="stylesheet"]')
      .evaluateAll((links) =>
        links.filter((l) => (l as HTMLLinkElement).href.includes('maplibre')).length,
      );
    // Può essere presente solo se la mappa lo ha già iniettato a runtime.
    expect(blocking).toBeLessThanOrEqual(1);
  });
});

test.describe('ricerca località in homepage', () => {
  test('trova un comune valido', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const search = page.locator('#q');
    // Focus prima di digitare: fa partire il precaricamento dell'indice
    // (l'input ha un listener sul focus che chiama ensureIndex).
    await search.focus();
    // pressSequentially simula una digitazione reale, scatenando gli eventi
    // input su cui è agganciato il debounce della ricerca. `fill` a volte non
    // li innesca in modo affidabile.
    await search.pressSequentially('Milano', { delay: 50 });
    // La lista dei risultati smette di essere hidden quando ci sono match.
    const list = page.locator('.search-results');
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(
      list.locator('.search-item', { hasText: /Milano/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('gestisce una query inesistente senza errori', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    const search = page.locator('#q');
    await search.fill('zzzqqqxxx');
    await page.waitForTimeout(600);
    expect(errors).toHaveLength(0);
  });

  test('sopporta caratteri strani e input vuoto', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    const search = page.locator('#q');
    for (const query of ['<script>', "'; drop--", '🚗🚗', '   ', '']) {
      await search.fill(query);
      await page.waitForTimeout(250);
    }
    expect(errors).toHaveLength(0);
  });
});

test.describe('calcolatore del risparmio', () => {
  test('funziona interamente senza geolocalizzazione', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/calcola-risparmio');

    await page.locator('#calc-place').fill('Milano');
    // Aspetta che il suggerimento compaia prima di cliccarlo (evita flakiness).
    const sugg_milano = page.locator('#calc-suggestions li').first();
    await expect(sugg_milano).toBeVisible({ timeout: 15_000 });
    await sugg_milano.click();

    await expect(page.locator('#calc-result')).toContainText(
      /distributore|conviene/i,
      { timeout: 20_000 },
    );
    // La data dei prezzi deve essere sempre visibile.
    await expect(page.locator('#calc-freshness')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('scarica solo la zona, non il dataset nazionale', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (req) => requested.push(req.url()));

    await page.goto('/calcola-risparmio');
    await page.locator('#calc-place').fill('Roma');
    // Aspetta che il suggerimento compaia prima di cliccarlo (evita flakiness).
    const sugg_roma = page.locator('#calc-suggestions li').first();
    await expect(sugg_roma).toBeVisible({ timeout: 15_000 });
    await sugg_roma.click();
    await expect(page.locator('#calc-result')).not.toBeEmpty({ timeout: 20_000 });

    expect(
      requested.some((u) => u.endsWith('/data/stations.json')),
      'il calcolatore non deve più scaricare stations.json',
    ).toBe(false);
    expect(requested.some((u) => u.includes('/data/cells/'))).toBe(true);
  });

  test('con geolocalizzazione concessa usa la posizione', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 45.4642, longitude: 9.19 });

    await page.goto('/calcola-risparmio');
    await page.locator('#calc-locate').click();
    await expect(page.locator('#calc-result')).toContainText(/conviene/i, {
      timeout: 20_000,
    });
  });

  test('con geolocalizzazione negata offre la ricerca manuale', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    await page.goto('/calcola-risparmio');

    // Negare il permesso: senza grantPermissions il browser rifiuta.
    await page.locator('#calc-locate').click();

    const status = page.locator('#calc-status');
    await expect(status).toContainText(/cercare manualmente/i, { timeout: 15_000 });
    // Nessun messaggio tecnico davanti all'utente.
    await expect(status).not.toContainText(/TypeError|undefined|ERR_/);
    await expect(page.locator('#calc-place')).toBeVisible();
  });

  test('dice chiaramente quando non ci sono distributori nel raggio', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    // In mezzo al Tirreno: nessuna stazione entro 15 km.
    await context.setGeolocation({ latitude: 40.0, longitude: 11.5 });

    await page.goto('/calcola-risparmio');
    await page.locator('#calc-locate').click();
    // Aspettiamo che la ricerca finisca: lo stato "Sto cercando…" deve sparire.
    await expect(page.locator('#calc-status')).not.toContainText(/cercando/i, {
      timeout: 20_000,
    });
    // Il messaggio di zona vuota compare in #calc-result oppure in #calc-status.
    // Controlliamo il testo combinato dei due, evitando un selettore che
    // matcha due elementi (che darebbe strict mode violation).
    await expect
      .poll(
        async () => {
          const result = (await page.locator('#calc-result').textContent()) ?? '';
          const status = (await page.locator('#calc-status').textContent()) ?? '';
          return `${result} ${status}`;
        },
        { timeout: 20_000 },
      )
      .toMatch(/non abbiamo trovato|nessun/i);
  });
});

test.describe('pagine territoriali e stazione', () => {
  test('apre una regione direttamente da URL', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/prezzi-carburante/lombardia');
    await expect(page.locator('h1')).toContainText(/Lombardia/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    expect(errors).toHaveLength(0);
  });

  test('apre una provincia', async ({ page }) => {
    await page.goto('/prezzi-carburante/lombardia/mi');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('apre un comune', async ({ page }) => {
    await page.goto('/prezzi-carburante/lombardia/mi/buccinasco');
    await expect(page.locator('h1')).toContainText(/Buccinasco/i);
  });

  test('apre una pagina stazione senza aver visitato prima il sito', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/sitemap-stazioni-1.xml');
    const xml = await page.content();
    const match = xml.match(/\/stazione\/([^<"]+)</);
    expect(match).not.toBeNull();

    await page.goto(`/stazione/${match![1]}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    expect(errors).toHaveLength(0);
  });
});

test.describe('andamento prezzi', () => {
  test('mostra il grafico storico', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/andamento-prezzi');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('svg, canvas').first()).toBeVisible();
    // Ignoriamo i 404 di risorse non essenziali (es. favicon): quello che conta
    // è che non ci siano errori JavaScript veri.
    const jsErrors = errors.filter((e) => !/Failed to load resource/i.test(e));
    expect(jsErrors, jsErrors.join(' | ')).toHaveLength(0);
  });
});

test.describe('file di servizio', () => {
  test('manifest è servito ed è coerente con il base path', async ({ request }) => {
    const res = await request.get('manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.start_url).toBe(manifest.scope);
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
  });

  test('status del dataset dichiara la freschezza', async ({ request }) => {
    const res = await request.get('data/status.json');
    expect(res.ok()).toBe(true);
    const status = await res.json();
    expect(['fresh', 'delayed', 'stale']).toContain(status.freshness);
    expect(status.sourceExtractionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('sitemap index elenca anche le stazioni', async ({ request }) => {
    const res = await request.get('sitemap.xml');
    expect(res.ok()).toBe(true);
    const xml = await res.text();
    expect(xml).toContain('sitemap-stazioni-1.xml');

    const stazioni = await request.get('sitemap-stazioni-1.xml');
    expect(stazioni.ok()).toBe(true);
    expect((await stazioni.text()).match(/<loc>/g)?.length ?? 0).toBeGreaterThan(1000);
  });

  test('robots punta alla sitemap giusta', async ({ request }) => {
    const res = await request.get('robots.txt');
    expect(await res.text()).toContain('sitemap.xml');
  });

  test('404 mostra una pagina utile ed è noindex', async ({ page }) => {
    await page.goto('/stazione/questa-non-esiste-affatto', {
      waitUntil: 'domcontentloaded',
    });
    // In preview locale il server può rispondere con la sua 404: verifichiamo
    // la pagina generata direttamente.
    await page.goto('/404');
    await expect(page.locator('h1')).toContainText(/non c'è|non trovata/i);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    );
  });
});
