/**
 * Confronto LOCALE del prezzo e classificazione (Milestone 4).
 *
 * La valutazione di una stazione non deve dipendere dalla media nazionale, ma
 * dal contesto locale. Qui calcoliamo la mediana di un campione locale e
 * classifichiamo il prezzo rispetto ad essa, restituendo sempre la dimensione
 * del campione usato (così la UI può dire su quanti dati si basa il giudizio).
 *
 * Funzioni pure, indipendenti dal framework, interamente testate.
 */

import type { FuelKey } from '../../src/types/pieno.ts';
import { median } from './stats.ts';
import { haversineKm } from './geo.ts';

/** Classi di convenienza. */
export type PriceClass =
  | 'molto_conveniente'
  | 'conveniente'
  | 'nella_media'
  | 'caro'
  | 'molto_caro'
  | 'dati_insufficienti';

/**
 * Soglie di classificazione, espresse in centesimi di € rispetto alla mediana
 * locale. Documentate qui perché sono l'unico punto in cui vivono.
 *
 *   delta = prezzoStazione - medianaLocale   (in €/L)
 *   deltaCents = delta * 100
 *
 *   deltaCents <= -3      -> molto conveniente
 *   -3 <  deltaCents <= -1-> conveniente
 *   -1 <  deltaCents <  +1-> nella media
 *   +1 <= deltaCents <  +3-> caro
 *   deltaCents >= +3      -> molto caro
 */
export const CLASS_THRESHOLDS_CENTS = {
  moltoConveniente: -3,
  conveniente: -1,
  caro: 1,
  moltoCaro: 3,
} as const;

/** Campione minimo per considerare la mediana locale affidabile. */
export const MIN_LOCAL_SAMPLE = 4;

export interface LocalComparison {
  class: PriceClass;
  /** Mediana del campione locale (€/L), o null se campione insufficiente. */
  localMedian: number | null;
  /** Scarto in centesimi rispetto alla mediana locale (negativo = più economico). */
  deltaCents: number | null;
  /** Numero di prezzi nel campione locale (trasparenza). */
  sampleSize: number;
  /** Raggio in km entro cui è stato costruito il campione. */
  radiusKm: number;
}

/** Classifica un deltaCents secondo le soglie documentate. */
export function classifyByDelta(deltaCents: number): PriceClass {
  if (deltaCents <= CLASS_THRESHOLDS_CENTS.moltoConveniente)
    return 'molto_conveniente';
  if (deltaCents <= CLASS_THRESHOLDS_CENTS.conveniente) return 'conveniente';
  if (deltaCents < CLASS_THRESHOLDS_CENTS.caro) return 'nella_media';
  if (deltaCents < CLASS_THRESHOLDS_CENTS.moltoCaro) return 'caro';
  return 'molto_caro';
}

/** Un punto minimo con coordinate e un prezzo per il carburante scelto. */
export interface PricedPoint {
  lat: number;
  lng: number;
  price: number;
}

/**
 * Confronta il prezzo di una stazione con la mediana dei prezzi entro `radiusKm`.
 * `neighbours` deve già contenere solo punti con un prezzo valido per il
 * carburante in esame (self OPPURE served, coerente con la stazione). La
 * stazione stessa può essere inclusa: la sua presenza non falsa la mediana in
 * modo significativo ed evita che una stazione isolata resti senza campione.
 */
export function compareLocal(
  stationPrice: number,
  stationLat: number,
  stationLng: number,
  neighbours: PricedPoint[],
  radiusKm: number,
): LocalComparison {
  const within: number[] = [];
  for (const n of neighbours) {
    if (haversineKm(stationLat, stationLng, n.lat, n.lng) <= radiusKm) {
      within.push(n.price);
    }
  }

  if (within.length < MIN_LOCAL_SAMPLE) {
    return {
      class: 'dati_insufficienti',
      localMedian: null,
      deltaCents: null,
      sampleSize: within.length,
      radiusKm,
    };
  }

  const localMedian = median(within);
  const deltaCents = Math.round((stationPrice - localMedian) * 100 * 10) / 10;

  return {
    class: classifyByDelta(deltaCents),
    localMedian,
    deltaCents,
    sampleSize: within.length,
    radiusKm,
  };
}
