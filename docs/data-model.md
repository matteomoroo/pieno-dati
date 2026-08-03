# Modello dati — schema v2

La sorgente di verità dei tipi è [`src/types/pieno.ts`](../src/types/pieno.ts).
Pipeline e (futuro) frontend importano da lì, così lo schema non diverge.

`schemaVersion` è attualmente **2**. Ogni cambiamento incompatibile va
incrementato qui e nel tipo.

## File pubblicati (in `public/data/`)

| File | Contenuto |
|------|-----------|
| `stations.json` | Elenco stazioni con prezzi self/servito per carburante. |
| `meta.json` | Metadati, freschezza, conteggi, statistiche (media+mediana), trend, notizie. |
| `history.json` | Cronologia giornaliera delle medie nazionali (self e servito), fino a ~400 giorni. |
| `status.json` | Stato sintetico per osservabilità. |
| `reports/latest.json` | Report dell'ultima importazione: righe, scarti, anomalie, durata. |

## Differenze chiave rispetto allo schema v1

| Aspetto | v1 (vecchio) | v2 (attuale) |
|--------|--------------|--------------|
| ID stazione | intero incrementale, instabile | `idImpianto` MIMIT (stringa), stabile |
| Prezzi | un solo prezzo per carburante (self sovrascrive servito) | `self` e `served` separati, con `updatedAt` |
| Statistiche | solo media nazionale | media **e** mediana, self/servito separati |
| Freschezza | non calcolata | `ageDays` + stato `fresh`/`delayed`/`stale` |
| Anomalie | scartate in silenzio | contate e riportate in `reports/latest.json` |
| Versionamento | assente | `schemaVersion` in ogni file |

## Forma di una stazione

```jsonc
{
  "id": "10001",                // idImpianto MIMIT, stabile
  "name": "Stazione Centro",
  "brand": "Agip Eni",
  "comune": "Milano",
  "provincia": "MI",
  "lat": 45.46679,
  "lng": 9.19035,
  "fuels": {
    "benzina":     { "self": 1.899, "served": 1.999, "updatedAt": "2026-07-30T06:00:00" },
    "gasolio":     { "self": 1.959, "served": null,  "updatedAt": "2026-07-30T06:00:00" },
    "diesel_plus": { "self": 2.159, "served": null }
  }
}
```

`null` significa "modalità non comunicata" per quel carburante. Un carburante
assente dalla mappa `fuels` significa "non comunicato affatto".

## Compatibilità e migrazione

Il vecchio `index.html` legge i file dalla vecchia posizione (`public/*.json`)
con la vecchia forma. La nuova pipeline scrive sotto `public/data/` con schema
v2. Durante la transizione i due possono coesistere; la migrazione del frontend
(Fase B) adotterà lo schema v2 leggendo da `public/data/`.
