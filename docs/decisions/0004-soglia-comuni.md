# 0004 — Soglia minima di distributori per le pagine comunali

Data: 2026-08-21
Stato: accettata (conferma di una scelta preesistente)

## Contesto

Durante l'audit pre-lancio è emerso che Pieno pubblica 1.068 pagine comunali
mentre i dati contengono 5.265 comuni. Andava chiarito se fosse una scelta o
una perdita di dati.

## Verifica

È una scelta. `src/lib/geo/territory.ts` contiene
`MIN_COMUNE_STATIONS = 5` con un commento esplicito, e le stazioni dei comuni
sotto soglia contribuiscono comunque agli aggregati di provincia e regione.
Nessun dato viene perso.

Numeri sui dati del 20 agosto 2026:

| | |
|---|---|
| Comuni presenti nei dati | 5.265 |
| Comuni pubblicati (≥ 5 distributori) | 1.068 |
| Comuni esclusi | 4.197 |
| — di cui con 1 distributore | 2.232 |
| — con 2 | 1.080 |
| — con 3 | 533 |
| — con 4 | 352 |
| Stazioni nei comuni esclusi | 7.399 su 21.567 |

## Decisione

La soglia resta a 5. Le ragioni:

- una pagina comunale con uno o due distributori non può offrire mediane
  significative né confronti: sarebbe una pagina sottile, del tipo che i
  motori di ricerca penalizzano e che un lettore trova inutile;
- le 7.399 stazioni dei comuni esclusi **hanno comunque ognuna la propria
  pagina stazione**, tutte dichiarate in sitemap. Non si perde copertura;
- il valore long-tail di quei comuni è recuperabile in futuro, ma richiede una
  pagina progettata per il caso "un solo distributore", non la stessa
  template usata per Milano.

## Conseguenze

- `MIN_COMUNE_STATIONS` è ora esportata e coperta da quattro test in
  `tests/territory.test.ts`: un cambio accidentale del valore fa fallire la CI;
- se in futuro si volesse abbassare la soglia, va prima progettata la variante
  di pagina per i comuni piccoli.
