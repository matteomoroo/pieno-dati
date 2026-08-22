# Deploy di Pieno

## Architettura

```
GitHub  →  GitHub Actions  →  astro build  →  dist/  →  Cloudflare Workers Static Assets  →  dominio
```

Pieno è interamente statico. `wrangler.jsonc` non dichiara nessun `main`,
quindi nessun codice Worker viene eseguito: le richieste sono servite
direttamente dagli asset.

### Perché Workers e non Pages

La build produce oltre 22.000 file. Cloudflare Pages si ferma a 20.000 file per
deployment; Workers sul piano Paid arriva a 100.000 asset per versione.
Richiede Wrangler ≥ 4.34.0.

Nota sul conteggio: `find dist -type f` conta 22.883 file, ma il manifest di
Wrangler ne registra circa 45.700, perché ogni pagina viene indicizzata sia
come `/percorso/index.html` sia come `/percorso`. Il margine rispetto al limite
è quindi minore di quanto suggerisca il conteggio grezzo, ma resta ampio.

## Configurazione al primo deploy

### 1. Segreti del repository

In *Settings → Secrets and variables → Actions → Secrets*:

| Nome | Da dove |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → template "Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages, colonna destra |

### 2. Variabili del repository

In *Settings → Secrets and variables → Actions → Variables*:

| Nome | Valore prima del dominio | Valore dopo il dominio |
|---|---|---|
| `SITE_URL` | `https://matteomoroo.github.io` | `https://tuodominio.it` |
| `BASE_PATH` | `/pieno-dati/` | `/` |

Il workflow ha dei default che puntano a GitHub Pages, quindi funziona anche
senza queste variabili. **Al momento del passaggio al dominio definitivo basta
cambiare queste due variabili**: nessun file sorgente va toccato.

### 3. Custom domain

Su Cloudflare: *Workers & Pages → pieno → Settings → Domains & Routes → Add
custom domain*. Il DNS viene configurato automaticamente se il dominio è già
su Cloudflare.

Subito dopo, aggiornare `SITE_URL` e `BASE_PATH` come sopra e rilanciare il
workflow: canonical, sitemap, robots, manifest e service worker si
riallineeranno da soli.

## Pipeline

Ogni deploy esegue in ordine, e si ferma al primo fallimento:

```
npm ci → lint → typecheck → unit test → dataset → build → smoke test → commit dati → deploy
```

Il commit del dataset aggiornato avviene **dopo** che build e smoke test sono
passati: un dataset che non produce un sito sano non viene registrato come
valido.

### Protezione dell'ultimo dataset valido

`scripts/build.ts` interrompe con codice di uscita non-zero, **prima di
scrivere qualsiasi file**, se:

- i CSV MIMIT hanno meno di 5.000 righe;
- la data di estrazione è assente o non valida;
- il numero di stazioni prodotte scende sotto 10.000.

In tutti questi casi il job fallisce, nessun commit viene fatto e la versione
in produzione resta quella precedente.

## Comandi locali

```bash
npm ci                  # installazione pulita
npm run lint            # ESLint
npm run typecheck       # tsc --noEmit && astro check
npm test                # unit test (vitest)
npm run build           # build del sito con SITE_URL/BASE_PATH correnti
npm run smoke           # verifica dist/ (18 controlli)
npm run preview         # serve dist/ in locale
npm run verify          # tutta la catena in un colpo solo
```

Build mirate:

```bash
npm run build:preview   # SITE_URL=github.io  BASE_PATH=/pieno-dati/
npm run build:root      # SITE_URL=esempio    BASE_PATH=/
```

Dataset:

```bash
npm run data            # scarica MIMIT e rigenera public/data/
```

Test end-to-end:

```bash
npx playwright install chromium
npm run test:e2e
```

## Deploy manuale

```bash
SITE_URL=https://tuodominio.it BASE_PATH=/ npm run build
SITE_URL=https://tuodominio.it BASE_PATH=/ npm run smoke
npx wrangler deploy
```

Verificare sempre la configurazione senza pubblicare:

```bash
npx wrangler deploy --dry-run
```

## Rollback

Cloudflare conserva le versioni precedenti:

```bash
npx wrangler deployments list
npx wrangler rollback
```

Non richiede di rigenerare il dataset.
