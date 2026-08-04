/**
 * Notizie generate dai dati.
 *
 * Nessun testo hardcoded, nessuna previsione certa. Ogni voce dichiara su
 * quali dati si basa (campo `basis`). Le formulazioni sono prudenti:
 * "in aumento nell'ultima settimana", "sostanzialmente stabili", ecc.
 */

import type {
  FuelKey,
  NationalStats,
  NewsItem,
  Trends,
} from '../../src/types/pieno.ts';
import { FUEL_LABELS } from '../../src/types/pieno.ts';

function itDate(iso: string | null): string {
  if (!iso) return '';
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

function directionPhrase(dir: 'up' | 'down' | 'flat'): string {
  if (dir === 'up') return 'in aumento';
  if (dir === 'down') return 'in calo';
  return 'sostanzialmente stabili';
}

function signedCents(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  return `${sign}${Math.abs(n).toFixed(1)}`;
}

/** Costruisce le notizie a partire da trend e statistiche. */
export function buildNews(
  trends: Trends,
  stats: NationalStats,
  extractionDate: string | null,
): NewsItem[] {
  const news: NewsItem[] = [];
  const dateLabel = itDate(extractionDate);

  for (const fuel of ['benzina', 'gasolio'] as FuelKey[]) {
    const t = trends[fuel];
    const s = stats[fuel]?.self;
    if (!t || !s) continue;

    const label = FUEL_LABELS[fuel];
    const dir = directionPhrase(t.direction);

    const headline =
      t.direction === 'flat'
        ? `${label}: prezzi ${dir}`
        : `${label} ${dir}: ${signedCents(t.deltaCents)}¢ in ${t.daysBack} giorni`;

    const body =
      `La media nazionale ${label.toLowerCase()} self è ${s.mean.toFixed(3)} €/L ` +
      `(rilevazione del ${dateLabel}). ` +
      (t.direction === 'flat'
        ? `Nell'ultima settimana la media è rimasta pressoché invariata ` +
          `(${signedCents(t.deltaCents)} centesimi).`
        : `Negli ultimi ${t.daysBack} giorni è passata da ` +
          `${t.reference.toFixed(3)} a ${t.today.toFixed(3)} €/L.`);

    const basis =
      `Confronto fra la media self di oggi e quella di circa ${t.daysBack} ` +
      `giorni fa, su ${t.points} rilevazioni giornaliere in cronologia.`;

    news.push({ headline, body, basis });
  }

  // Sintesi prudente sugli altri carburanti, se presenti.
  const others = (['gpl', 'metano'] as FuelKey[])
    .filter((k) => trends[k])
    .map((k) => `${FUEL_LABELS[k]} ${directionPhrase(trends[k]!.direction)}`);

  if (others.length > 0) {
    news.push({
      headline: 'Gli altri carburanti',
      body:
        `${others.join('; ')}. I prezzi mostrati sono quelli comunicati dai ` +
        `gestori al MIMIT alla data del ${dateLabel}.`,
      basis: 'Trend settimanale delle medie self nazionali per GPL e metano.',
    });
  }

  return news;
}
