import { test, expect, type Page } from '@playwright/test';

/**
 * Controlli della homepage: posizione come prima azione, carburanti tutti
 * visibili, "Altri filtri" secondario, media nazionale coerente col carburante.
 */

const FUELS: Record<string, string> = {
  benzina: 'Benzina',
  gasolio: 'Diesel',
  gpl: 'GPL',
  metano: 'Metano',
  benzina_plus: 'Benzina+',
  diesel_plus: 'Diesel+',
  hvo: 'HVO',
};

const fmt = (v: number) =>
  v.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Mappa pronta = la mappa ha emesso "pieno:map-ready" (flag __pienoMapReady). */
async function waitForMap(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __pienoMapReady?: boolean }).__pienoMapReady === true,
    null,
    { timeout: 30_000 },
  );
}

test.describe('media nazionale', () => {
  test('segue il carburante selezionato, senza ripiegare sulla benzina', async ({
    page,
    request,
  }) => {
    const meta = await (await request.get('data/meta.json')).json();
    await page.goto('/');
    const label = page.locator('#totem-label');
    const self = page.locator('[data-avg-self]');
    const empty = page.locator('[data-avg-empty]');

    for (const [fuel, name] of Object.entries(FUELS)) {
      await page.locator(`.fuel-chip[data-fuel="${fuel}"]`).click();
      await expect(page.locator(`.fuel-chip[data-fuel="${fuel}"]`)).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const mean = meta.stats?.[fuel]?.self?.mean;
      if (typeof mean === 'number' && mean > 0) {
        await expect(label).toHaveText(`Media nazionale ${name} · self`);
        await expect(self).toHaveText(fmt(mean));
        await expect(empty).toBeHidden();
      } else {
        await expect(label).toHaveText(`Media nazionale ${name}`);
        await expect(empty).toHaveText('Dato self non disponibile');
        await expect(self).toBeHidden();
      }
    }
  });

  test('self assente e servito presente: niente "self" e servito etichettato', async ({
    page,
  }) => {
    // I dati reali hanno oggi il self per tutti i carburanti: simuliamo il caso
    // sostituendo le medie serializzate nella pagina. GPL senza self ma con
    // servito, HVO senza nessuno dei due.
    const averages = {
      benzina: { self: 1.859, served: 1.999 },
      gpl: { self: null, served: 0.699 },
      hvo: { self: null, served: null },
    };
    await page.route(
      (url) => url.pathname === '/' || url.pathname.endsWith('/index.html'),
      async (route) => {
        const res = await route.fetch();
        const html = (await res.text()).replace(
          /data-averages="[^"]*"/,
          `data-averages="${JSON.stringify(averages).replace(/"/g, '&quot;')}"`,
        );
        await route.fulfill({ response: res, body: html });
      },
    );
    await page.goto('/');
    const label = page.locator('#totem-label');
    const self = page.locator('[data-avg-self]');
    const empty = page.locator('[data-avg-empty]');
    const servedBox = page.locator('[data-avg-served-box]');

    await page.locator('.fuel-chip[data-fuel="gpl"]').click();
    await expect(label).toHaveText('Media nazionale GPL');
    await expect(label).not.toContainText('self');
    await expect(empty).toHaveText('Dato self non disponibile');
    await expect(self).toBeHidden();
    // Il servito resta visibile, ma etichettato come servito.
    await expect(servedBox).toBeVisible();
    await expect(servedBox).toContainText('servito');
    await expect(page.locator('[data-avg-served]')).toHaveText('0,699');

    await page.locator('.fuel-chip[data-fuel="hvo"]').click();
    await expect(label).toHaveText('Media nazionale HVO');
    await expect(empty).toHaveText('Dato self non disponibile');
    await expect(servedBox).toBeHidden();
    // Nessun residuo della benzina né del GPL.
    await expect(page.locator('#national-average')).not.toContainText('1,859');
    await expect(page.locator('#national-average')).not.toContainText('0,699');

    // Tornando alla benzina il self ricompare con la sua etichetta.
    await page.locator('.fuel-chip[data-fuel="benzina"]').click();
    await expect(label).toHaveText('Media nazionale Benzina · self');
    await expect(self).toHaveText('1,859');
  });

  test('il cambio carburante arriva alla mappa insieme alla media', async ({ page }) => {
    await page.goto('/');
    await waitForMap(page);
    await page.evaluate(() => {
      const w = window as unknown as {
        __pienoSetFuel: (f: string) => void;
        __fuelCalls: string[];
      };
      const orig = w.__pienoSetFuel;
      w.__fuelCalls = [];
      w.__pienoSetFuel = (f) => {
        w.__fuelCalls.push(f);
        orig(f);
      };
    });
    await page.locator('.fuel-chip[data-fuel="gpl"]').click();
    await expect(page.locator('#totem-label')).toContainText('GPL');
    const calls = await page.evaluate(
      () => (window as unknown as { __fuelCalls: string[] }).__fuelCalls,
    );
    expect(calls).toEqual(['gpl']);
  });

  test('un carburante scelto prima che la mappa sia pronta non va perso', async ({ page }) => {
    // Ritardiamo il dataset: l'utente sceglie Diesel mentre la mappa carica.
    await page.route('**/data/stations.json', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.goto('/');
    await page.locator('.fuel-chip[data-fuel="gasolio"]').click();
    await waitForMap(page);
    // I filtri si inizializzano col segnale della mappa, e una sola volta.
    await expect(page.locator('.filters-sheet')).toHaveCount(1);
    // I filtri ricevono il cambio carburante solo dalla mappa: se l'etichetta
    // dice "diesel" la mappa è stata allineata.
    await page.locator('#filters-trigger').click();
    await expect(page.locator('#f-avail-label strong')).toHaveText('diesel');
  });
});

test.describe('posizione', () => {
  test('nessuna richiesta di posizione al caricamento', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __geoCalls: number };
      w.__geoCalls = 0;
      const geo = navigator.geolocation;
      if (!geo) return;
      const orig = geo.getCurrentPosition.bind(geo);
      geo.getCurrentPosition = (...args: Parameters<Geolocation['getCurrentPosition']>) => {
        w.__geoCalls++;
        return orig(...args);
      };
      geo.watchPosition = () => {
        w.__geoCalls++;
        return 0;
      };
    });
    await page.goto('/');
    await waitForMap(page);
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);
  });

  test('posizione negata: messaggio discreto e ricerca subito usabile', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    // Rifiuto esplicito simulato: alcuni Chromium headless lasciano il prompt
    // in sospeso invece di rifiutare, e il test non deve dipenderne.
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, err) => {
        setTimeout(
          () =>
            err?.({
              code: 1,
              message: 'User denied Geolocation',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError),
          50,
        );
      };
    });
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs++;
      void d.dismiss();
    });
    await page.goto('/');
    await page.locator('#locate').click();
    await expect(page.locator('#locate-status')).toHaveText(
      'Posizione non disponibile. Cerca una località.',
      { timeout: 20_000 },
    );
    expect(dialogs).toBe(0);

    const search = page.locator('#q');
    await search.focus();
    await search.pressSequentially('Torino', { delay: 60 });
    await expect(
      page.locator('.search-results .search-item', { hasText: /Torino/i }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('posizione concessa: la mappa viene centrata', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 45.4642, longitude: 9.19 });
    await page.goto('/');
    await page.locator('#locate').click();
    await expect(page.locator('#locate-status')).toHaveText(
      'Mappa centrata sulla tua posizione.',
      { timeout: 20_000 },
    );
  });
});

test.describe('altri filtri', () => {
  test('etichetta chiara, chiusi di default, conteggio quando attivi', async ({ page }) => {
    await page.goto('/');
    const trigger = page.locator('#filters-trigger');
    await expect(trigger).toHaveText(/Altri filtri/);
    await waitForMap(page);
    await expect(page.locator('.filters-sheet.open')).toHaveCount(0);

    await trigger.click();
    await expect(page.locator('.filters-sheet.open')).toHaveCount(1);
    await page.locator('.filters-sheet [data-mode="served"]').click();
    await page.locator('#filters-apply').click();
    await expect(page.locator('.filters-sheet.open')).toHaveCount(0);

    await expect(trigger).toHaveText(/Altri filtri\s*·\s*1/);
    await expect(trigger).toHaveAttribute('aria-label', 'Altri filtri · 1 attivo');
  });
});

const WIDTHS = [360, 390, 430, 768, 1024, 1280, 1440];

for (const width of WIDTHS) {
  test.describe(`layout a ${width} px`, () => {
    test.use({ viewport: { width, height: width < 768 ? 844 : 900 } });

    test('nessun overflow e tutti i carburanti visibili', async ({ page }) => {
      await page.goto('/');
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const fuels = document.querySelector('.fuels')!;
        const box = fuels.getBoundingClientRect();
        const chips = [...document.querySelectorAll('.fuel-chip')];
        return {
          pageOverflow: de.scrollWidth - de.clientWidth,
          fuelsOverflow: fuels.scrollWidth - fuels.clientWidth,
          chips: chips.length,
          inside: chips.filter((c) => {
            const r = c.getBoundingClientRect();
            return r.left >= box.left - 1 && r.right <= box.right + 1 && r.width > 0;
          }).length,
          clipped: chips.filter((c) => c.scrollWidth > c.clientWidth + 1).length,
        };
      });
      expect(m.pageOverflow, 'la pagina deborda in orizzontale').toBeLessThanOrEqual(1);
      expect(m.fuelsOverflow, 'la riga carburanti scorre').toBeLessThanOrEqual(1);
      expect(m.chips).toBe(7);
      expect(m.inside, 'carburanti fuori vista').toBe(7);
      expect(m.clipped, 'etichette tagliate').toBe(0);
    });

    test('ordine: posizione, ricerca, carburante, filtri, media, mappa', async ({ page }) => {
      await page.goto('/');
      const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
      const locate = await y('#locate');
      const search = await y('#q');
      const fuels = await y('.fuels');
      const filters = await y('#filters-trigger');
      const totem = await y('#national-average');
      expect(locate).toBeLessThan(search);
      expect(search).toBeLessThan(fuels);
      expect(fuels).toBeLessThan(filters);
      expect(filters).toBeLessThan(totem);
      if (width < 1024) {
        // Una colonna: la mappa viene dopo tutti i controlli.
        expect(totem).toBeLessThan(await y('#map'));
      }
      const map = (await page.locator('#map').boundingBox())!;
      expect(map.height, 'mappa troppo bassa').toBeGreaterThanOrEqual(340);
      const locateBox = (await page.locator('#locate').boundingBox())!;
      expect(locateBox.height).toBeGreaterThanOrEqual(44);
    });
  });
}
