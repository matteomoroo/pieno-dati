/**
 * Smoke test della build.
 *
 * Gira su `dist/` dopo `npm run build` e verifica che le pagine e i file
 * critici esistano davvero e siano coerenti con la configurazione usata per
 * compilare. È l'ultimo cancello prima del deploy: se fallisce, non si
 * pubblica.
 *
 * Non sostituisce i test E2E — non apre un browser — ma intercetta l'intera
 * classe di rotture "la build è passata ma il sito non c'è".
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_URL, BASE_PREFIX } from '../site.config.mjs';

const DIST = join(process.cwd(), 'dist');

interface Check {
  name: string;
  run: () => void;
}

const failures: string[] = [];
const passed: string[] = [];

function file(...parts: string[]): string {
  return join(DIST, ...parts);
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mustExist(relative: string): string {
  const path = file(relative);
  assert(existsSync(path), `manca ${relative}`);
  assert(statSync(path).size > 0, `${relative} è vuoto`);
  return path;
}

/** Prima directory figlia, per pescare una pagina di esempio. */
function firstChild(relative: string): string {
  const dir = file(relative);
  assert(existsSync(dir), `manca la directory ${relative}`);
  const entries = readdirSync(dir).filter((e) =>
    statSync(join(dir, e)).isDirectory(),
  );
  assert(entries.length > 0, `${relative} non contiene pagine`);
  return entries[0] as string;
}

const checks: Check[] = [
  {
    name: 'homepage',
    run: () => {
      const html = read(mustExist('index.html'));
      assert(html.includes('<html lang="it"'), 'lingua non dichiarata come it');
      assert(html.includes('rel="canonical"'), 'canonical assente');
      assert(html.includes('og:image'), 'og:image assente');
      assert(html.includes('rel="manifest"'), 'manifest non collegato');
    },
  },
  {
    name: 'pagina calcolatore',
    run: () => {
      const html = read(mustExist(join('calcola-risparmio', 'index.html')));
      assert(html.includes('calc-place'), 'manca la ricerca manuale della città');
      assert(html.includes('calc-locate'), 'manca il pulsante posizione');
    },
  },
  {
    name: 'pagina andamento prezzi',
    run: () => void mustExist(join('andamento-prezzi', 'index.html')),
  },
  {
    name: 'pagina 404',
    run: () => {
      const html = read(mustExist('404.html'));
      assert(html.includes('noindex'), 'la 404 deve essere noindex');
    },
  },
  {
    name: 'pagina offline',
    run: () => void mustExist(join('offline', 'index.html')),
  },
  {
    name: 'almeno una regione',
    run: () => {
      const regione = firstChild('prezzi-carburante');
      mustExist(join('prezzi-carburante', regione, 'index.html'));
    },
  },
  {
    name: 'almeno una provincia',
    run: () => {
      const regione = firstChild('prezzi-carburante');
      const provincia = firstChild(join('prezzi-carburante', regione));
      mustExist(join('prezzi-carburante', regione, provincia, 'index.html'));
    },
  },
  {
    name: 'almeno un comune',
    run: () => {
      const regione = firstChild('prezzi-carburante');
      const provincia = firstChild(join('prezzi-carburante', regione));
      const comune = firstChild(join('prezzi-carburante', regione, provincia));
      mustExist(join('prezzi-carburante', regione, provincia, comune, 'index.html'));
    },
  },
  {
    name: 'almeno una stazione',
    run: () => {
      const slug = firstChild('stazione');
      const html = read(mustExist(join('stazione', slug, 'index.html')));
      assert(html.includes('rel="canonical"'), 'canonical assente sulla stazione');
    },
  },
  {
    name: 'status.json',
    run: () => {
      const status = JSON.parse(read(mustExist(join('data', 'status.json')))) as {
        freshness?: string;
        sourceExtractionDate?: string;
        stations?: number;
      };
      assert(status.sourceExtractionDate, 'status senza data di estrazione');
      assert(
        ['fresh', 'delayed', 'stale'].includes(status.freshness ?? ''),
        `freschezza non riconosciuta: ${status.freshness}`,
      );
      assert((status.stations ?? 0) > 10_000, 'numero stazioni sospetto');
    },
  },
  {
    name: 'dataset stazioni',
    run: () => void mustExist(join('data', 'stations.json')),
  },
  {
    name: 'celle geografiche',
    run: () => {
      const index = JSON.parse(read(mustExist(join('data', 'cells-index.json')))) as {
        cells: string[];
      };
      assert(index.cells.length > 0, 'indice celle vuoto');
      for (const key of index.cells) {
        mustExist(join('data', 'cells', `${key}.json`));
      }
    },
  },
  {
    name: 'manifest',
    run: () => {
      const manifest = JSON.parse(read(mustExist('manifest.webmanifest'))) as {
        start_url: string;
        scope: string;
        icons: { src: string; sizes: string }[];
      };
      const expected = `${BASE_PREFIX}/`;
      assert(
        manifest.start_url === expected,
        `start_url è ${manifest.start_url}, atteso ${expected}`,
      );
      assert(manifest.scope === expected, `scope è ${manifest.scope}, atteso ${expected}`);
      for (const size of ['192x192', '512x512']) {
        assert(
          manifest.icons.some((i) => i.sizes === size),
          `manca l'icona ${size}`,
        );
      }
      for (const icon of manifest.icons) {
        assert(
          icon.src.startsWith(`${BASE_PREFIX}/`),
          `icona fuori dal base path: ${icon.src}`,
        );
        mustExist(icon.src.slice(BASE_PREFIX.length + 1));
      }
    },
  },
  {
    name: 'service worker',
    run: () => {
      const sw = read(mustExist('sw.js'));
      assert(!/pieno-v1['"]/.test(sw), 'versione cache non aggiornata (pieno-v1)');
      assert(/const BUILD = '[^']+'/.test(sw), 'BUILD non iniettato nel service worker');
      const base = sw.match(/const BASE = '([^']*)'/)?.[1];
      assert(
        base === BASE_PREFIX,
        `BASE del service worker è "${base}", atteso "${BASE_PREFIX}"`,
      );
    },
  },
  {
    name: 'robots.txt',
    run: () => {
      const robots = read(mustExist('robots.txt'));
      const expected = `${SITE_URL}${BASE_PREFIX}/sitemap.xml`;
      assert(
        robots.includes(`Sitemap: ${expected}`),
        `robots non punta a ${expected}`,
      );
    },
  },
  {
    name: 'immagine Open Graph',
    run: () => {
      const path = mustExist(join('og', 'og-default.png'));
      assert(statSync(path).size > 5_000, 'og image sospettosamente piccola');
    },
  },
  {
    name: 'sitemap completa',
    run: () => {
      const index = read(mustExist('sitemap.xml'));
      const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] as string);
      assert(children.length >= 3, 'sitemap index troppo corta');

      let total = 0;
      for (const url of children) {
        assert(url.startsWith(SITE_URL), `sitemap figlia fuori dominio: ${url}`);
        const relative = url.slice(`${SITE_URL}${BASE_PREFIX}/`.length);
        const xml = read(mustExist(relative));
        total += [...xml.matchAll(/<loc>/g)].length;
      }

      // Conta le pagine HTML realmente generate, escluse quelle noindex.
      const generated = countHtml(DIST) - 2; // 404 e offline
      assert(
        total >= generated,
        `sitemap dichiara ${total} URL ma la build ne ha generati ${generated}`,
      );
      passed.push(`  → ${total} URL dichiarati, ${generated} pagine indicizzabili`);
    },
  },
  {
    name: 'nessun riferimento residuo a /pieno-dati quando si compila alla radice',
    run: () => {
      if (BASE_PREFIX !== '') return; // controllo significativo solo alla radice
      for (const relative of ['index.html', 'manifest.webmanifest', 'sw.js', 'robots.txt']) {
        const content = read(file(relative));
        assert(
          !content.includes('/pieno-dati'),
          `${relative} contiene ancora /pieno-dati`,
        );
      }
    },
  },
];

function countHtml(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) n += countHtml(full);
    else if (entry.endsWith('.html')) n++;
  }
  return n;
}

console.log(`\n🔎 Smoke test su dist/ — SITE_URL=${SITE_URL} BASE_PATH=${BASE_PREFIX || '/'}\n`);

for (const check of checks) {
  try {
    check.run();
    console.log(`  ✅ ${check.name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ ${check.name}: ${message}`);
    failures.push(`${check.name}: ${message}`);
  }
}

for (const line of passed) console.log(line);

if (failures.length > 0) {
  console.error(`\n❌ Smoke test fallito: ${failures.length} controlli non superati.\n`);
  process.exit(1);
}

console.log(`\n✅ Smoke test superato: ${checks.length} controlli.\n`);
