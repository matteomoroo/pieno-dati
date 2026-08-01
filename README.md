# Pieno — Dati MIMIT (aggiornamento automatico gratuito)

Questo repository aggancia l'app "Pieno" ai dati **reali** del Ministero (MIMIT)
e li tiene **aggiornati da soli ogni mattina**, senza server e senza costi.

Come funziona, in breve:

1. Ogni mattina **GitHub Actions** esegue uno script che scarica i due file
   ufficiali del MIMIT (anagrafica impianti + prezzi), li unisce, scarta gli
   errori dei gestori e produce due file: `stations.json` e `meta.json`.
2. Quei file vengono pubblicati su **GitHub Pages** (hosting statico gratuito,
   con i permessi CORS corretti così il browser può leggerli).
3. L'app li carica all'apertura e mostra i prezzi reali.

Tutto gira sul piano gratuito di GitHub. Niente carta di credito, niente
manutenzione.

> **Perché GitHub e non un server?** I file del MIMIT non si possono leggere
> direttamente dal browser (mancano gli header CORS) e vanno normalizzati. Serve
> qualcosa "in mezzo" che lo faccia una volta al giorno. GitHub Actions fa il
> lavoro pesante gratis e senza limiti di tempo, e Pages serve il risultato da
> CDN. È più semplice e robusto di un server da mantenere.

---

## Cosa ti serve

Solo un account **GitHub** (gratuito). Nient'altro.

## Passo 1 — Crea il repository

1. Crea un nuovo repository su GitHub (es. `pieno-dati`), pubblico.
2. Caricaci questi file mantenendo la struttura:
   ```
   .github/workflows/update.yml
   scripts/build.mjs
   package.json
   README.md
   ```

## Passo 2 — Attiva GitHub Pages

Nel repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
(Non serve scegliere un branch: ci pensa il workflow.)

## Passo 3 — Lancia il primo aggiornamento

Vai su **Actions → "Aggiorna prezzi MIMIT" → Run workflow**.
In un paio di minuti genera i dati e li pubblica. Da qui in poi parte **da solo
ogni mattina** alle 08:45 (ora italiana).

Al termine, i tuoi dati saranno raggiungibili a questi indirizzi:

```
https://TUO-UTENTE.github.io/pieno-dati/stations.json
https://TUO-UTENTE.github.io/pieno-dati/meta.json
```

(GitHub te lo mostra in **Settings → Pages** come "Your site is live at …".)

## Passo 4 — Collega l'app

Apri `pieno-prototipo.html`, cerca vicino all'inizio dello script:

```js
const API_BASE = 'https://UTENTE.github.io/REPO';
```

Sostituisci con il tuo indirizzo Pages, es.
`https://mario.github.io/pieno-dati`. Salva. Fatto: l'app mostra i prezzi reali
e si aggiorna ogni giorno senza che tu faccia nulla.

---

## I file prodotti

**`stations.json`** — array di distributori:
```json
{ "id":0, "b":"Agip Eni", "n":"Via Roma 12", "c":"Milano", "p":"MI",
  "la":45.46, "lo":9.19, "f":{"benzina":1.989,"gasolio":2.066}, "s":"self+servito" }
```

**`meta.json`** — riepilogo:
```json
{ "extraction":"2026-07-30", "updatedAt":"...", "total":21565,
  "counts":{...}, "averages":{"benzina":1.991,"gasolio":2.080,...} }
```

## Provare lo script in locale

```bash
node scripts/build.mjs
```

Crea la cartella `public/` con i due file. Utile per verificare prima di
pubblicare.

## Note

- **Fonte**: MIMIT — Osservaprezzi Carburanti, licenza aperta IODL 2.0. I prezzi
  sono quelli "in vigore alle 8 del mattino" comunicati dai gestori: si
  aggiornano una volta al giorno.
- **Orario del job**: in `.github/workflows/update.yml`, riga `cron: '45 6 * * *'`
  (UTC). 06:45 UTC = 08:45 ora italiana d'estate. Cambialo lì se vuoi.
- **Se il MIMIT è irraggiungibile** un giorno, il workflow fallisce senza
  toccare i dati già pubblicati: l'app continua a mostrare l'ultimo aggiornamento
  riuscito. Puoi vedere gli esiti nel tab **Actions**.
- **Limiti**: GitHub Actions include 2000 minuti/mese sul piano gratuito; questo
  job ne usa ~1 al giorno. Pages ha banda ampia per un prototipo.
