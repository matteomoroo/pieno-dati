/**
 * Normalizzazione dei carburanti MIMIT.
 *
 * Il campo `descCarburante` del MIMIT è testo libero inserito dai gestori:
 * "Benzina", "Gasolio", "Blue Diesel", "Hi-Q Diesel", "GPL", "Metano", "GNC",
 * "Supreme+ 98", "V-Power", eccetera. Questa funzione lo mappa sulle chiavi
 * canoniche di FuelKey.
 *
 * Principi:
 *  - centralizzata: unico punto in cui esiste la logica di classificazione;
 *  - tipizzata: restituisce FuelKey | null, nient'altro;
 *  - prudente: i marcatori "premium" sono ancorati a confini di parola dove
 *    possibile, per NON classificare male i prodotti (il vecchio codice
 *    trattava "100" e "blu" come premium ovunque comparissero);
 *  - testabile: nessuna dipendenza, comportamento puro.
 */

import type { FuelKey } from '../../src/types/pieno.ts';

/**
 * Marcatori che indicano una variante "premium/plus" del carburante base.
 * Ancorati a confini di parola (\b) per evitare falsi positivi come "100"
 * dentro un codice prodotto, o "blu" dentro un nome commerciale non pertinente.
 */
const PREMIUM_PATTERNS: RegExp[] = [
  /\bplus\b/,
  /\bpremium\b/,
  /\bspecial\b/,
  /\bsupreme\b/,
  /\bv-?power\b/,
  /\bexcellium\b/,
  /\bhi-?q\b/,
  /\bblue?\b/, // "blu"/"blue" come parola intera (Blue Diesel), non come sottostringa
  /\benergy\b/,
  /\bracing\b/,
  /\bultimate\b/,
  /\befficien\w*\b/, // efficient / efficiente
  /\boro\b/, // "Diesel Oro"
  /\bartic\b/,
  /\bnexus\b/,
  /\b100\b/, // ottani 100 come token isolato, non "100" dentro altro
  /\b98\b/,
];

/** Vero se la descrizione contiene un marcatore premium isolato. */
function isPremium(desc: string): boolean {
  return PREMIUM_PATTERNS.some((re) => re.test(desc));
}

/**
 * Classifica una descrizione carburante MIMIT in una FuelKey canonica.
 * Ritorna null se la descrizione non è riconducibile a un carburante noto,
 * così il chiamante può contarla come anomalia invece di indovinare.
 */
export function classifyFuel(descRaw: string | null | undefined): FuelKey | null {
  if (!descRaw) return null;
  const d = descRaw.toLowerCase().trim();
  if (!d) return null;

  const premium = isPremium(d);

  // Ordine importante: metano e GPL prima, perché non hanno varianti "plus"
  // e le loro descrizioni non contengono "benzina"/"gasolio".
  if (/\bgpl\b/.test(d) || d.includes('gpl')) return 'gpl';
  if (d.includes('metano') || /\bgnc\b/.test(d) || d.includes('gnl')) return 'metano';

  // HVO (diesel rinnovabile) PRIMA della regola gasolio/diesel: descrizioni
  // come "HVO Diesel" o "HVOlution" contengono "diesel"/sono a base gasolio,
  // ma vanno in categoria propria. Copre HVO, HVO100, HVOlution, BCHVO,
  // "HVO Future", "HVO Diesel". Richiede "hvo" come token riconoscibile, non
  // una sottostringa casuale.
  if (/hvo/.test(d)) return 'hvo';

  // Diesel/Gasolio: molte varianti commerciali sono a base gasolio.
  if (d.includes('gasolio') || d.includes('diesel')) {
    return premium ? 'diesel_plus' : 'gasolio';
  }

  // Benzina.
  if (d.includes('benzina')) {
    return premium ? 'benzina_plus' : 'benzina';
  }

  // Nomi commerciali premium a base benzina che NON contengono la parola
  // "benzina" (alcuni gestori li inseriscono così). Mappati esplicitamente,
  // non via regex, per non indovinare.
  const GASOLINE_BRANDS = [
    /\bv-?power\b/,
    /\bsupreme\b/,
    /\bblu super\b/,
    /\bblue super\b/, // IP: benzina premium (non confondere con "Blue Diesel")
    /\bhiq perform\b/, // Q8: linea benzina premium
    /\bverde speciale\b/, // benzina verde "speciale"
  ];
  if (GASOLINE_BRANDS.some((re) => re.test(d))) {
    return 'benzina_plus';
  }

  return null;
}
