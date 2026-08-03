/**
 * Calcolo della freschezza del dato.
 *
 * Il frontend vecchio mostrava un pallino "live" anche con dati di 3 giorni.
 * Qui deriviamo uno stato onesto dall'età in giorni, così la UI può dire la
 * verità: fresh / delayed / stale.
 */

import type { Freshness, FreshnessStatus } from '../../src/types/pieno.ts';

/** Giorni interi trascorsi fra due date (UTC), non negativi. */
export function ageInDays(sourceExtractionDate: string, now: Date): number {
  const src = new Date(sourceExtractionDate + 'T00:00:00Z').getTime();
  // Confronta a mezzanotte UTC per contare i giorni di calendario.
  const nowMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const diffMs = nowMidnight - src;
  const days = Math.floor(diffMs / 86_400_000);
  return Math.max(0, days);
}

/** Mappa l'età in giorni sullo stato di freschezza. */
export function freshnessStatus(ageDays: number): FreshnessStatus {
  if (ageDays <= 1) return 'fresh';
  if (ageDays === 2) return 'delayed';
  return 'stale';
}

/** Costruisce l'oggetto Freshness completo. */
export function computeFreshness(
  sourceExtractionDate: string,
  now: Date = new Date(),
): Freshness {
  const ageDays = ageInDays(sourceExtractionDate, now);
  return {
    sourceExtractionDate,
    generatedAt: now.toISOString(),
    ageDays,
    status: freshnessStatus(ageDays),
  };
}
