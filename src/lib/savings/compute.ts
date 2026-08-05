/**
 * Calcolo "dove conviene fare rifornimento" (Milestone 3.10, versione pratica).
 *
 * Idea: dato un punto di partenza e i distributori vicini, per ciascuno calcola
 * il risparmio NETTO rispetto ad andare al distributore più vicino, tenendo
 * conto del carburante speso per la deviazione.
 *
 * Distanza: in linea d'aria × fattore strada (le strade non sono dritte).
 * È una STIMA dichiarata, non un routing reale.
 */

/** Fattore di correzione linea d'aria -> distanza stradale approssimata. */
export const ROAD_FACTOR = 1.3;

/** Assunzioni di default, mostrate all'utente e modificabili. */
export const DEFAULTS = {
  liters: 50, // pieno tipico
  kmPerLiter: 15, // consumo medio auto benzina/diesel
};

export interface NearbyStation {
  id: string;
  slug: string;
  name: string;
  brand: string;
  comune: string;
  price: number;
  /** distanza in linea d'aria in km dal punto di partenza */
  crowKm: number;
}

export interface RankedStation extends NearbyStation {
  /** km stradali stimati (crow × fattore), andata+ritorno */
  roadKm: number;
  /** costo del carburante per raggiungerlo (andata+ritorno) */
  travelCost: number;
  /** spesa totale del pieno a questo distributore (prezzo×litri + viaggio) */
  totalCost: number;
  /** risparmio netto rispetto al più vicino (>0 = conviene la deviazione) */
  netVsNearest: number;
}

export interface CalcInput {
  stations: NearbyStation[];
  liters: number;
  kmPerLiter: number;
}

export interface CalcResult {
  nearest: RankedStation | null;
  /** miglior scelta per costo totale (pieno + viaggio) */
  best: RankedStation | null;
  /** tutti i distributori ordinati per costo totale */
  ranked: RankedStation[];
  worthDetour: boolean;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeBestChoice(input: CalcInput): CalcResult {
  const { stations, liters, kmPerLiter } = input;
  if (stations.length === 0) {
    return { nearest: null, best: null, ranked: [], worthDetour: false };
  }

  // il più vicino in assoluto (baseline)
  const nearest0 = [...stations].sort((a, b) => a.crowKm - b.crowKm)[0];

  const ranked: RankedStation[] = stations.map((s) => {
    // andata+ritorno = distanza × 2
    const roadKm = r2(s.crowKm * ROAD_FACTOR * 2);
    const fuelUsed = kmPerLiter > 0 ? roadKm / kmPerLiter : 0;
    const travelCost = r2(fuelUsed * s.price);
    const fillCost = s.price * liters;
    const totalCost = r2(fillCost + travelCost);
    return { ...s, roadKm, travelCost, totalCost, netVsNearest: 0 };
  });

  // costo totale del più vicino, come baseline per il confronto netto
  const nearest = ranked.find((r) => r.id === nearest0.id)!;
  const nearestTotal = nearest.totalCost;
  for (const r of ranked) {
    r.netVsNearest = r2(nearestTotal - r.totalCost);
  }

  ranked.sort((a, b) => a.totalCost - b.totalCost);
  const best = ranked[0];
  // conviene deviare se il migliore non è il più vicino e fa risparmiare
  const worthDetour = best.id !== nearest.id && best.netVsNearest > 0;

  return { nearest, best, ranked, worthDetour };
}
