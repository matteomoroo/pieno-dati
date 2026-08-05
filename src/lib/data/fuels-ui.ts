/**
 * Etichette e ordine di visualizzazione dei carburanti.
 * Modulo PURO (nessun import di node:fs), così è importabile sia dal codice
 * server (pagine Astro) sia dal codice client (mappa, filtri) senza trascinare
 * dipendenze di filesystem nel bundle del browser.
 */
import type { FuelKey } from '../../types/pieno.ts';
import { FUEL_LABELS } from '../../types/pieno.ts';

/** Ordine di visualizzazione dei carburanti in UI (scelta prodotto). */
export const FUEL_DISPLAY_ORDER: FuelKey[] = [
  'benzina',
  'gasolio',
  'gpl',
  'metano',
  'benzina_plus',
  'diesel_plus',
  'hvo',
];

/**
 * Etichette UI. "Gasolio" è SEMPRE mostrato come "Diesel" (scelta prodotto):
 * l'utente non deve mai vedere la parola "gasolio".
 */
export const FUEL_UI_LABELS: Record<FuelKey, string> = {
  ...FUEL_LABELS,
  gasolio: 'Diesel',
  benzina_plus: 'Benzina+',
  diesel_plus: 'Diesel+',
  hvo: 'HVO',
};
