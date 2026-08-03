/**
 * Validatori puri per i campi essenziali del dataset.
 * Pensati per essere piccoli, deterministici e testabili singolarmente.
 */

import type { FuelKey } from '../../src/types/pieno.ts';

/** Bounding box continentale + isole dell'Italia (con margine). */
export const ITALY_BOUNDS = {
  latMin: 35.0,
  latMax: 47.5,
  lngMin: 6.0,
  lngMax: 19.0,
} as const;

/** Range di prezzo plausibile per carburante, in €/L. Fuori = anomalia. */
export const PRICE_BOUNDS: Record<FuelKey, [number, number]> = {
  benzina: [1.4, 2.7],
  gasolio: [1.4, 2.8],
  gpl: [0.5, 1.3],
  metano: [0.8, 2.6],
  benzina_plus: [1.6, 2.9],
  diesel_plus: [1.6, 3.0],
  hvo: [1.4, 3.0],
};

/** Vero se lat/lng cadono nel bounding box italiano. */
export function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= ITALY_BOUNDS.latMin &&
    lat <= ITALY_BOUNDS.latMax &&
    lng >= ITALY_BOUNDS.lngMin &&
    lng <= ITALY_BOUNDS.lngMax
  );
}

/** Parsea un prezzo MIMIT ("1,899" oppure "1.899") a number, o null. */
export function parsePrice(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const normalized = String(raw).replace(',', '.').trim();
  if (normalized === '') return null;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Vero se il prezzo è nel range plausibile per quel carburante. */
export function isPriceInRange(fuel: FuelKey, price: number): boolean {
  const [lo, hi] = PRICE_BOUNDS[fuel];
  return price >= lo && price <= hi;
}

/** Un idImpianto valido è una stringa non vuota e numerica. */
export function isValidStationId(id: string | null | undefined): boolean {
  return typeof id === 'string' && /^\d+$/.test(id.trim());
}

/** Vero se una data è nel formato ISO YYYY-MM-DD ed è una data reale. */
export function isValidExtractionDate(date: string | null | undefined): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(d.getTime());
}
