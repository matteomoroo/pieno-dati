# Pieno — dati

Pipeline giornaliera che scarica gli open data MIMIT (Osservaprezzi Carburanti),
li pulisce, normalizza e aggrega, e produce file JSON statici serviti da GitHub
Pages. Alimenta il sito Pieno, che mostra i prezzi dei carburanti in Italia.

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
