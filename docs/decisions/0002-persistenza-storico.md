# ADR 0002 — Persistenza dello storico

Data: 2026-08 · Stato: accettato

## Contesto

Lo storico delle medie nazionali (`public/data/history.json`) serve a calcolare
i trend e alimenta le future pagine di andamento prezzi. Deve **sopravvivere fra
un'esecuzione GitHub Actions e la successiva** e crescere fino ad almeno 365
giorni.

Il workflow precedente pubblicava `public/` come artifact di GitHub Pages
tramite `upload-pages-artifact` + `deploy-pages`, ma **non committava mai**
`history.json` nel repository. Ogni run ripartiva quindi dal file committato a
mano nel branch (fermo a pochi giorni), lo storico non avanzava, e i trend erano
calcolati su una finestra che di fatto non cresceva mai.

## Opzioni considerate

1. **Commit automatico dei file generati sul branch** (scelta).
2. Branch dati dedicato (es. `data`) con commit separati.
3. Artifact persistente di Actions (`actions/cache` o artifact fra run).
4. Storage esterno (S3, Cloudflare KV, ecc.).

## Decisione

Adottiamo l'**opzione 1**: il workflow esegue la pipeline, poi committa
`public/data/**` sul branch principale con un commit `[skip ci]`, e infine
pubblica su Pages.

Motivi:

- è la più semplice e non introduce infrastruttura esterna (coerente con
  l'obiettivo "costi infrastrutturali iniziali bassi");
- `history.json` è piccolo (kilobyte), quindi il peso nel repo è trascurabile;
- ogni giorno di storia diventa un commit tracciabile e ispezionabile;
- si estende naturalmente allo storico delle singole stazioni in futuro
  (partizionando i file), restando sullo stesso meccanismo.

## Conseguenze e mitigazioni

- **Loop di workflow**: evitato con `[skip ci]` nel messaggio di commit e con il
  trigger limitato a `schedule` + `workflow_dispatch` (non `push`).
- **Commit inutili**: il passo di commit controlla `git diff --quiet` e non
  committa nulla se non ci sono cambiamenti (es. il MIMIT non ha aggiornato).
- **Rilanci nello stesso giorno**: gestiti a monte dalla pipeline, che fa
  *upsert* per data (`upsertHistory`), quindi niente duplicati anche se si
  committa due volte lo stesso giorno.
- **`stations.json` pesante**: viene rigenerato ogni giorno; per non gonfiare la
  storia git con diff enormi lo committiamo comunque (serve a Pages), ma un
  futuro passaggio a partizionamento per regione ridurrà i diff. Vedi ADR sul
  partizionamento (da redigere in Fase D).

## Salvaguardia anti-distruzione

La pipeline esce con codice non-zero se il download MIMIT fallisce, se il
formato CSV cambia, o se produce meno di 10.000 stazioni. In quei casi il passo
di commit e quello di deploy **non vengono eseguiti**, quindi l'ultima versione
valida pubblicata resta intatta.
