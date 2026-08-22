# Pieno — dati

Pieno mostra i prezzi ufficiali dei carburanti di oltre 21.000 distributori
italiani, aggiornati ogni giorno dagli open data MIMIT (Osservaprezzi
Carburanti).

Questo repository contiene sia la pipeline dati sia il sito Astro che la
consuma: circa 22.700 pagine statiche fra homepage, mappa, calcolatore,
andamento prezzi, pagine territoriali e una pagina per ogni distributore.

**Hosting di produzione:** Cloudflare Workers Static Assets. Vedi
[`docs/deploy.md`](docs/deploy.md).

## Cos'è (in breve)

Ogni mattina un workflow GitHub Actions:

1. scarica i due CSV ufficiali MIMIT (anagrafica impianti + prezzi);
2. li valida (formato, header, coordinate, prezzi, carburanti);
3. costruisce le stazioni con **ID MIMIT permanenti** e prezzi **self/servito
   separati**;
4. calcola medie e mediane nazionali, aggiorna la **cronologia persistente** e
   ne deriva i **trend** e le **notizie**;
5. calcola la **freschezza** del dato;
6. pubblica `stations.json`, `meta.json`, `history.json`, `status.json` e un
   report anomalie in `public/data/`.

Se la fonte è irraggiungibile o cambia formato, il job **fallisce senza
sovrascrivere** l'ultima versione valida pubblicata.

## Architettura

```
src/types/pieno.ts        Tipi condivisi (single source of truth, schema v2)
scripts/
  build.ts                Orchestratore: solo I/O e sequenza
  lib/
    csv.ts                Parsing + validazione dei CSV MIMIT
    fuels.ts              Normalizzazione carburanti (tipizzata, testata)
    validate.ts           Validatori: coordinate, prezzi, id, date
    ingest.ts             Unione anagrafica+prezzi -> stazioni + report
    stats.ts              Medie e mediane, self/servito separati
    history.ts            Cronologia (upsert idempotente) e trend
    news.ts               Notizie generate dai dati
    freshness.ts          Età del dato e stato fresh/delayed/stale
  build.mjs               Pipeline v1 legacy (conservata, non più usata)
tests/                    Unit + integrazione (Vitest), con fixture ridotte
docs/                     Documentazione tecnica e ADR
public/
  index.html              Frontend attuale (prototipo, in migrazione)
  data/                   Output della pipeline v2
```

Le scelte importanti sono negli **Architecture Decision Records**:
`docs/decisions/`. Il modello dati è in `docs/data-model.md`.

## Requisiti

- Node.js >= 22.6 (la pipeline usa `--experimental-strip-types` per eseguire
  TypeScript senza build step).

## Installazione

```bash
npm ci
```

## Avvio locale

Contro i dati veri (scarica dal MIMIT):

```bash
npm run build
```

Offline, contro fixture locali (nessuna rete):

```bash
PIENO_FIXTURE_DIR=tests/fixtures npm run build
```

I file vengono scritti in `public/data/`.

## Test

```bash
npm test          # unit + integrazione, una volta
npm run test:watch
npm run typecheck # TypeScript in modalità strict
```

I test usano fixture ridotte in `tests/fixtures/` e non scaricano l'intero
dataset. Coprono: parser, normalizzazione carburanti, self/servito, validazione
coordinate e prezzi, generazione ID, medie/mediane, trend, freschezza,
aggiornamento dello storico, input incompleto e formato fonte cambiato.

## Aggiornamento dati / deploy

Automatico via `.github/workflows/update.yml` (cron giornaliero + avvio manuale).
Il workflow esegue install pulita, typecheck, test, build, poi **committa** lo
storico e i dati generati (solo se cambiati, con `[skip ci]`) e pubblica su
GitHub Pages. La persistenza dello storico è descritta in
`docs/decisions/0002-persistenza-storico.md`.

## Variabili d'ambiente

- `PIENO_FIXTURE_DIR` — se impostata, la pipeline legge `anagrafica.csv` e
  `prezzi.csv` da quella cartella invece che dalla rete. Usata per test ed
  esecuzioni offline.

## Struttura dell'output (schema v2)

Vedi `docs/data-model.md`. In sintesi: ID stazione = `idImpianto` MIMIT; prezzi
`self` e `served` separati; statistiche con media e mediana; freschezza esplicita
(`fresh`/`delayed`/`stale`); report anomalie non silenzioso.

## Troubleshooting

- **Il build fallisce con "colonne mancanti" o "separatore inatteso"**: il MIMIT
  ha cambiato formato CSV. È il comportamento voluto (meglio fallire che
  pubblicare dati corrotti). Aggiornare `requiredColumns` in `scripts/build.ts`
  dopo aver verificato il nuovo formato.
- **"solo N stazioni prodotte"**: guardia anti-corruzione; il dataset scaricato
  è probabilmente incompleto. Il job non pubblica.
- **`node: --experimental-strip-types non riconosciuto`**: serve Node >= 22.6.

## Stato del lavoro

La **Fase A** (fondamenta dati) è implementata e testata: schema v2, ID
permanenti, self/servito, persistenza storico, validazione, freschezza, report,
rimozione dei dati hardcoded lato pipeline, CI. La migrazione del frontend ad
Astro (Fase B in poi) non è ancora iniziata; il vecchio `index.html` resta
funzionante nel frattempo.


## Configurazione dominio e base path

Dominio e base path non sono hardcoded da nessuna parte. Vivono in
`site.config.mjs` e si controllano con due environment variable:

```bash
# GitHub Pages / anteprima
SITE_URL=https://matteomoroo.github.io BASE_PATH=/pieno-dati/ npm run build

# Dominio definitivo alla radice
SITE_URL=https://tuodominio.it BASE_PATH=/ npm run build
```

Da queste due variabili derivano canonical, Open Graph, sitemap, `robots.txt`,
`manifest.webmanifest`, service worker e tutti i link interni. Il passaggio al
dominio definitivo non richiede di modificare nessun sorgente.

Lo smoke test verifica esplicitamente che con `BASE_PATH=/` non resti nessun
riferimento a `/pieno-dati` nell'output.

## Comandi

```bash
npm ci              # installazione pulita
npm run dev         # sviluppo
npm run data        # rigenera public/data/ dai CSV MIMIT
npm run build       # build del sito
npm run preview     # serve dist/ in locale
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit && astro check
npm test            # unit test
npm run smoke       # 18 controlli su dist/
npm run test:e2e    # Playwright (richiede: npx playwright install chromium)
npm run verify      # lint + typecheck + test + build + smoke
```

## Struttura dei dati generati

| File | Contenuto |
|---|---|
| `public/data/stations.json` | Dataset completo, ~7 MB. Usato dalla mappa. |
| `public/data/cells/{lat}_{lng}.json` | Partizioni geografiche da 1°, ~35 KB l'una. Usate dal calcolatore per non scaricare il dataset nazionale. |
| `public/data/cells-index.json` | Elenco delle celle non vuote. |
| `public/data/search-index.json` | Comuni con coordinate: alimenta la ricerca località, anche quella manuale del calcolatore. |
| `public/data/meta.json` | Aggregati nazionali, trend, notizie. |
| `public/data/history.json` | Cronologia persistente delle medie. |
| `public/data/status.json` | Stato sintetico: data di estrazione, freschezza, numero stazioni. |

## Freschezza dei dati

`status.json` espone `fresh`, `delayed` o `stale`. La UI mostra sempre la data
reale di rilevazione dei prezzi. Il service worker non aggira questo sistema:
quando serve dati dalla cache aggiunge l'header `X-Pieno-From-Cache`, e
l'interfaccia lo dichiara ("stai vedendo una copia salvata").

## Decisioni architetturali

- [0001 — Scelta del framework](docs/decisions/0001-scelta-framework.md)
- [0002 — Persistenza dello storico](docs/decisions/0002-persistenza-storico.md)
- [0003 — Rimandare l'upgrade Astro 4 → 7](docs/decisions/0003-upgrade-astro.md)
- [0004 — Soglia minima per le pagine comunali](docs/decisions/0004-soglia-comuni.md)
