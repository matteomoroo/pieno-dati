/**
 * Media nazionale per carburante, mostrata nel riquadro della homepage.
 *
 * Fonte unica: `meta.json → stats[carburante].self/served.mean`, prodotto
 * dalla pipeline. Questo modulo non calcola nulla: seleziona e valida.
 * Modulo PURO (nessun node:fs) perché lo usano sia la build (render iniziale)
 * sia il browser (cambio carburante): la stessa regola, in un solo posto.
 *
 * Regola fondamentale: se per un carburante manca un valore valido, il
 * risultato è `null`. Non esiste alcun ripiego su un altro carburante.
 */
import type { FuelKey, FuelStats, NationalStats } from '../../types/pieno.ts';

export interface FuelAverage {
  self: number | null;
  served: number | null;
}

export type AverageTable = Partial<Record<FuelKey, FuelAverage>>;

/** Mostrato al posto del valore quando manca una media self valida. */
export const SELF_UNAVAILABLE = 'Dato self non disponibile';

/** Una media è valida solo se poggia su almeno un prezzo ed è un numero > 0. */
function validMean(s: FuelStats | undefined): number | null {
  if (!s || !(s.count > 0)) return null;
  const v = s.mean;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Riduce le statistiche nazionali alle sole medie, per i carburanti dati. */
export function buildAverageTable(
  stats: NationalStats | null | undefined,
  fuels: readonly FuelKey[],
): AverageTable {
  const table: AverageTable = {};
  for (const fuel of fuels) {
    const s = stats?.[fuel];
    table[fuel] = { self: validMean(s?.self), served: validMean(s?.served) };
  }
  return table;
}

/** Media di un carburante. Se manca, entrambi i valori sono null. */
export function averageFor(table: AverageTable | null | undefined, fuel: FuelKey): FuelAverage {
  const a = table?.[fuel];
  return { self: a?.self ?? null, served: a?.served ?? null };
}

/**
 * Etichetta del riquadro, sempre col nome del carburante selezionato.
 * Dice "· self" solo se il valore principale è davvero una media self: senza
 * self, il servito resta un dato a parte con la propria etichetta "servito",
 * e nessuno dei due prende il posto dell'altro.
 */
export function averageLabel(fuelLabel: string, hasSelf: boolean): string {
  return hasSelf ? `Media nazionale ${fuelLabel} · self` : `Media nazionale ${fuelLabel}`;
}

/** Prezzo in formato italiano a tre decimali (es. 1,859). */
export function formatAverage(v: number): string {
  return v.toLocaleString('it-IT', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}
