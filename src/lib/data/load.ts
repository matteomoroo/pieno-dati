/**
 * Accesso ai dati per le pagine Astro.
 *
 * Legge i file generati dalla pipeline (public/data/) in modo tipizzato,
 * riusando i tipi condivisi. In build-time Astro esegue questo codice su Node,
 * quindi possiamo leggere dal filesystem.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  MetaFile,
  StationsFile,
  Station,
} from '../../types/pieno.ts';

// Etichette e ordine vivono in un modulo puro (client-safe); qui li
// re-esportiamo per comodità del codice server.
export { FUEL_DISPLAY_ORDER, FUEL_UI_LABELS } from './fuels-ui.ts';

const DATA_DIR = join(process.cwd(), 'public', 'data');

/** Carica meta.json. Ritorna null se non ancora generato. */
export function loadMeta(): MetaFile | null {
  const p = join(DATA_DIR, 'meta.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as MetaFile;
}

/** Carica stations.json. Ritorna array vuoto se non generato. */
export function loadStations(): Station[] {
  const p = join(DATA_DIR, 'stations.json');
  if (!existsSync(p)) return [];
  const file = JSON.parse(readFileSync(p, 'utf8')) as StationsFile;
  return file.stations;
}

/** Formatta un prezzo €/L all'italiana (virgola, 3 decimali). */
export function formatPrice(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('it-IT', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

/** Formatta una data ISO in "3 agosto 2026". */
export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso + 'T00:00:00Z'));
  } catch {
    return iso;
  }
}

/** Testo leggibile dello stato di freschezza. */
export function freshnessLabel(status: string): string {
  switch (status) {
    case 'fresh':
      return 'Dati aggiornati';
    case 'delayed':
      return 'Dati di due giorni fa';
    case 'stale':
      return 'Dati non recenti';
    default:
      return 'Stato dati sconosciuto';
  }
}
