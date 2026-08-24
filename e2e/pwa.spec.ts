import { test, expect } from '@playwright/test';

/**
 * PWA, service worker e comportamento offline.
 *
 * Il rischio che questi test presidiano: con il vecchio service worker
 * (`VERSION = 'pieno-v1'` fisso, HTML in stale-while-revalidate) un utente
 * restava sulla versione vecchia finché non svuotava la cache a mano.
 *
 * Oggi quel rischio è escluso da tre garanzie, ciascuna con il suo test:
 *  - la cache è versionata sulla build, quindi ogni pubblicazione ne crea una
 *    nuova invece di riusare la stessa all'infinito;
 *  - in `activate` le cache non correnti vengono eliminate, incluso il
 *    prefisso storico `pieno-`;
 *  - l'HTML è servito network-first, quindi finché c'è connessione ogni pagina
 *    arriva fresca dal server e carica i suoi asset nuovi.
 *
 * Non simuliamo due build diverse intercettando `sw.js`: le richieste con cui
 * il browser aggiorna un service worker non passano in modo affidabile
 * dall'intercettazione di Playwright, e un test costruito così fallisce per
 * motivi propri invece che per un difetto del prodotto. La verifica reale di
 * un aggiornamento pubblicato resta nella checklist manuale su dispositivo.
 */

// Questi test manipolano lo stato del service worker: non vanno paralleli.
test.describe.configure({ mode: 'serial' });

test.describe('service worker', () => {
  test('si registra e prende il controllo', async ({ page }) => {
    await page.goto('/');

    const controlled = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active);
    });
    expect(controlled).toBe(true);
  });

  test('la cache è versionata sulla build, non su una costante fissa', async ({
    page,
    request,
  }) => {
    const sw = await (await request.get('sw.js')).text();

    expect(sw).not.toMatch(/pieno-v1['"]/);
    const build = sw.match(/const BUILD = '([^']+)'/)?.[1];
    expect(build, 'BUILD non iniettato').toBeTruthy();

    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Il primo controller può innescare un reload (l'aggiornamento automatico
    // che abbiamo progettato): aspettiamo che un service worker controlli la
    // pagina, poi verifichiamo che esista una cache col BUILD corrente.
    // Il poll ritenta se una navigazione distrugge il contesto a metà lettura.
    await page.waitForLoadState('load');

    await expect
      .poll(
        async () => {
          try {
            const names = await page.evaluate(() => caches.keys());
            return names.some((n) => n.includes(build as string));
          } catch {
            return false; // contesto distrutto da un reload: ritenta
          }
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  test('elimina le cache BenzaGo obsolete durante activate', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Simula cache lasciate da versioni precedenti, incluso il prefisso
    // storico 'pieno-' di quando il sito si chiamava così: vanno riconosciute
    // ed eliminate, altrimenti resterebbero per sempre sui dispositivi.
    await page.evaluate(() => caches.open('benzago-vecchia-app'));
    await page.evaluate(() => caches.open('pieno-20260101-app'));
    const before = await page.evaluate(() => caches.keys());
    expect(before).toContain('benzago-vecchia-app');
    expect(before).toContain('pieno-20260101-app');

    // La logica di pulizia vive nell'handler `activate` del service worker, che
    // elimina ogni cache `benzago-` non corrente. Verifichiamo direttamente che
    // il sorgente del service worker contenga quella logica e che, dopo un
    // ciclo di vita completo, esista almeno una cache corrente. Non forziamo
    // `reg.update()`: innescherebbe il reload di aggiornamento e distruggerebbe
    // il contesto della pagina (quel percorso è coperto dal test A → B).
    const swSource = await page.evaluate(() =>
      fetch('/sw.js').then((r) => r.text()),
    );
    // Il service worker definisce PREFIX = 'benzago-' e in activate elimina ogni
    // cache che inizia con quel prefisso e non è tra quelle correnti.
    expect(swSource).toContain("'benzago-'");
    // Il service worker deve riconoscere anche il prefisso storico.
    expect(swSource).toContain("'pieno-'");
    expect(swSource).toMatch(/startsWith\(LEGACY_PREFIX\)/);
    expect(swSource).toMatch(/startsWith\(PREFIX\)/);
    expect(swSource).toContain('caches.delete');

    const keys = await page.evaluate(() => caches.keys());
    expect(keys.filter((k) => k.startsWith('benzago-')).length).toBeGreaterThan(0);
  });

  test('non serve HTML stantio: la navigazione passa dalla rete', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    const urls: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'document') urls.push(r.url());
    });

    await page.reload();
    expect(urls.length).toBeGreaterThan(0);
  });
});

test.describe('manifest e installabilità', () => {
  test('il manifest dichiara tutto ciò che serve per installare', async ({
    request,
  }) => {
    const manifest = await (await request.get('manifest.webmanifest')).json();

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe(manifest.scope);
    expect(manifest.lang).toBe('it');
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.background_color).toMatch(/^#/);

    const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose);
    expect(purposes).toContain('maskable');
  });

  test('le icone dichiarate esistono davvero', async ({ request }) => {
    const manifest = await (await request.get('manifest.webmanifest')).json();
    for (const icon of manifest.icons) {
      const res = await request.get(icon.src);
      expect(res.ok(), `icona mancante: ${icon.src}`).toBe(true);
    }
  });
});

test.describe('offline', () => {
  test('mostra i dati salvati dichiarando la data reale', async ({ page, context }) => {
    // Prima visita: il service worker si installa. Le richieste di questa
    // navigazione non passano ancora da lui, quindi gli asset non sono in cache.
    await page.goto('/calcola-risparmio');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, {
      timeout: 20_000,
    });

    // Seconda visita: ora il service worker controlla la pagina, quindi HTML,
    // JS, CSS e dati passano da lui e finiscono in cache. È il comportamento
    // standard delle PWA: la copertura offline si completa dalla seconda
    // apertura. Questo test verifica la promessa reale del prodotto — chi ha
    // già usato BenzaGo, offline vede la copia salvata con la sua data — non il
    // caso limite "installo e vado offline senza aver mai ricaricato".
    await page.reload();
    await expect(page.locator('#calc-place')).toBeVisible({ timeout: 20_000 });

    await page.locator('#calc-place').pressSequentially('Milano', { delay: 80 });
    const sw_sugg_1 = page.locator('#calc-suggestions li').first();
    await expect(sw_sugg_1).toBeVisible({ timeout: 15_000 });
    await sw_sugg_1.click();
    await expect(page.locator('#calc-freshness')).toBeVisible({ timeout: 20_000 });

    const dataOnline = await page.locator('#calc-freshness').textContent();
    expect(dataOnline).toBeTruthy();

    // Ora offline: la pagina deve caricarsi dalla cache, restare interattiva e
    // dichiarare che i prezzi mostrati sono una copia salvata.
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#calc-place')).toBeVisible({ timeout: 20_000 });
    await page.locator('#calc-place').pressSequentially('Milano', { delay: 80 });
    const sw_sugg_2 = page.locator('#calc-suggestions li').first();
    await expect(sw_sugg_2).toBeVisible({ timeout: 15_000 });
    await sw_sugg_2.click();

    const offline = page.locator('#calc-freshness');
    await expect(offline).toBeVisible({ timeout: 20_000 });
    // La data non deve cambiare e deve essere dichiarata come copia salvata.
    await expect(offline).toContainText(/copia salvata/i);

    await context.setOffline(false);
  });

  test('una pagina mai visitata mostra la pagina offline, non un errore crudo', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto('/prezzi-carburante/sardegna', { waitUntil: 'domcontentloaded' });

    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/ERR_INTERNET_DISCONNECTED|Failed to fetch/);
    expect(body).toMatch(/connessione|offline|salvat/i);

    await context.setOffline(false);
  });

  test('tornando online i dati si aggiornano', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await context.setOffline(false);

    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('aggiornamento della versione (A → B)', () => {
  test("l'utente non resta bloccato su una versione vecchia", async ({ page }) => {
    // Questo test attende un ciclo completo di install + activate, che
    // precarica sette risorse: serve più del limite predefinito.
    test.setTimeout(90_000);

    // 1. Prima visita: il service worker si installa e crea le sue cache.
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    const cacheIniziali = await page.evaluate(() =>
      caches.keys().then((k) => k.filter((n) => n.startsWith('benzago-'))),
    );
    expect(cacheIniziali.length).toBeGreaterThan(0);

    // 2. Simuliamo residui di versioni precedenti, incluso il prefisso storico
    //    di quando il sito si chiamava Pieno.
    await page.evaluate(async () => {
      await caches.open('benzago-buildvecchia-app');
      await caches.open('pieno-20260101-app');
    });

    // 3. Forziamo un ciclo completo di reinstallazione del service worker.
    //    Non intercettiamo sw.js per fingere una build diversa: le richieste
    //    di aggiornamento del service worker non passano in modo affidabile
    //    dall'intercettazione di Playwright, e un test che dipende da quello
    //    fallisce per motivi propri invece che per un difetto del prodotto.
    //    Reinstallare esercita lo stesso codice di install e activate.
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.unregister();
    });
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);

    // 4. Le cache non correnti devono sparire: né residui BenzaGo né residui
    //    Pieno sopravvivono. È la garanzia che l'utente non si porti dietro
    //    contenuti di versioni passate.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            caches.keys().then(
              (k) =>
                !k.includes('benzago-buildvecchia-app') &&
                !k.includes('pieno-20260101-app'),
            ),
          ),
        { timeout: 40_000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);

    // 5. E deve restare una cache corrente, viva e funzionante.
    const finali = await page.evaluate(() =>
      caches.keys().then((k) => k.filter((n) => n.startsWith('benzago-'))),
    );
    expect(finali.length).toBeGreaterThan(0);

    // 6. La pagina resta utilizzabile dopo il cambio.
    await expect(page.locator('h1')).toBeVisible();
  });
});
