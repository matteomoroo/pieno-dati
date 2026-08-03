/**
 * Pieno — orchestratore della pipeline (schema v2).
 *
 * Responsabilità di QUESTO file: solo I/O e sequenza.
 *   1. scarica i due CSV MIMIT;
 *   2. li parsa e valida (scripts/lib/csv.ts);
 *   3. costruisce le stazioni + report (scripts/lib/ingest.ts);
 *   4. aggrega statistiche nazionali (scripts/lib/stats.ts);
 *   5. aggiorna la cronologia persistente e i trend (scripts/lib/history.ts);
 *   6. genera le notizie dai dati (scripts/lib/news.ts);
 *   7. scrive stations.json, meta.json, history.json, status.json, report.
 *
 * Tutta la logica pura vive nei moduli lib/ ed è coperta da test.
 *
 * Uso:
 *   node --experimental-strip-types scripts/build.ts      (Node >= 22.6)
 *   oppure via `npm run build` (vedi package.json).
 *
 * Variabili d'ambiente:
 *   PIENO_FIXTURE_DIR  se impostata, legge i CSV da file locali invece che
 *                      dalla rete (utile per test d'integrazione offline).
 */

import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';

import { SCHEMA_VERSION } from '../src/types/pieno.ts';
import type {
  HistoryPoint,
  MetaFile,
  StationsFile,
  StatusFile,
} from '../src/types/pieno.ts';
import { parseMimitCsv } from './lib/csv.ts';
import { ingest } from './lib/ingest.ts';
import { computeNationalStats, computeCounts } from './lib/stats.ts';
import {
  buildHistoryPoint,
  upsertHistory,
  computeAllTrends,
} from './lib/history.ts';
import { buildNews } from './lib/news.ts';
import { computeFreshness } from './lib/freshness.ts';
import { isValidExtractionDate } from './lib/validate.ts';

const ANAGRAFICA_URL =
  'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
const PREZZI_URL =
  'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';

const PUBLIC_DIR = 'public';
const DATA_DIR = join(PUBLIC_DIR, 'data');
const REPORTS_DIR = join(DATA_DIR, 'reports');
const HISTORY_PATH = join(DATA_DIR, 'history.json');

async function download(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'pieno-ingest/2.0' },
  });
  if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  return res.text();
}

/** Sorgente dei CSV: rete oppure fixture locali. */
async function loadCsvText(): Promise<{ anag: string; prez: string }> {
  const fixtureDir = process.env.PIENO_FIXTURE_DIR;
  if (fixtureDir) {
    return {
      anag: readFileSync(join(fixtureDir, 'anagrafica.csv'), 'utf8'),
      prez: readFileSync(join(fixtureDir, 'prezzi.csv'), 'utf8'),
    };
  }
  const [anag, prez] = await Promise.all([
    download(ANAGRAFICA_URL),
    download(PREZZI_URL),
  ]);
  return { anag, prez };
}

function loadHistory(): HistoryPoint[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(HISTORY_PATH, 'utf8'));
    return Array.isArray(parsed) ? (parsed as HistoryPoint[]) : [];
  } catch (e) {
    console.warn(`⚠️  history.json illeggibile, riparto da vuoto: ${String(e)}`);
    return [];
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const generatedAt = new Date().toISOString();
  console.log('▶️  Pieno ingest v2 — avvio');

  // 1. download
  const { anag, prez } = await loadCsvText();
  console.log(`⬇️  Scaricati: anagrafica ${anag.length}B, prezzi ${prez.length}B`);

  // 2. parse + valida (fallisce con errore chiaro se il formato cambia)
  const anagParsed = parseMimitCsv(anag, {
    label: 'anagrafica',
    requiredColumns: [
      'idImpianto',
      'Latitudine',
      'Longitudine',
      'Comune',
      'Provincia',
    ],
    minRows: 5000,
  });
  const prezParsed = parseMimitCsv(prez, {
    label: 'prezzi',
    requiredColumns: ['idImpianto', 'descCarburante', 'prezzo', 'isSelf'],
    minRows: 5000,
  });

  const extractionDate =
    prezParsed.extractionDate || anagParsed.extractionDate || '';
  if (!isValidExtractionDate(extractionDate)) {
    throw new Error(
      `data di estrazione non valida o assente: "${extractionDate}". ` +
        `Interrompo per non pubblicare dati senza data affidabile.`,
    );
  }
  console.log(
    `📋 Parsati: ${anagParsed.rows.length} impianti, ${prezParsed.rows.length} prezzi. ` +
      `Estrazione: ${extractionDate}`,
  );

  // 3. ingest (ID MIMIT, self/servito separati, report anomalie)
  const { stations, report } = ingest({
    anagrafica: anagParsed.rows,
    prezzi: prezParsed.rows,
    extractionDate,
    generatedAt,
    durationMs: 0, // riempito sotto
  });

  // Guardia anti-corruzione: variazione anomala del numero di stazioni.
  if (stations.length < 10000) {
    throw new Error(
      `solo ${stations.length} stazioni prodotte: sospetto dato corrotto, ` +
        `interrompo senza sovrascrivere l'ultima versione valida.`,
    );
  }

  // 4. statistiche nazionali (media + mediana, self/served separati)
  const stats = computeNationalStats(stations);
  const counts = computeCounts(stations);

  // 5. cronologia persistente + trend
  const history = loadHistory();
  const todaysPoint = buildHistoryPoint(extractionDate, stats);
  const updatedHistory = upsertHistory(history, todaysPoint);
  const trends = computeAllTrends(updatedHistory);

  // 6. notizie dai dati
  const news = buildNews(trends, stats, extractionDate);

  // 7. freschezza
  const freshness = computeFreshness(extractionDate, new Date(generatedAt));

  const durationMs = Date.now() - startedAt;
  report.durationMs = durationMs;

  // --- scrittura file ---
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(REPORTS_DIR, { recursive: true });

  const stationsFile: StationsFile = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceExtractionDate: extractionDate,
    stations,
  };
  const metaFile: MetaFile = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceExtractionDate: extractionDate,
    freshness,
    total: stations.length,
    counts,
    stats,
    trends,
    news,
    historyPoints: updatedHistory.length,
    source: 'MIMIT — Osservaprezzi Carburanti (IODL 2.0)',
  };
  const statusFile: StatusFile = {
    status: 'ok',
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceExtractionDate: extractionDate,
    freshness: freshness.status,
    stations: stations.length,
  };

  writeFileSync(join(DATA_DIR, 'stations.json'), JSON.stringify(stationsFile));
  writeFileSync(
    join(DATA_DIR, 'meta.json'),
    JSON.stringify(metaFile, null, 2),
  );
  writeFileSync(HISTORY_PATH, JSON.stringify(updatedHistory, null, 2));
  writeFileSync(
    join(DATA_DIR, 'status.json'),
    JSON.stringify(statusFile, null, 2),
  );
  writeFileSync(
    join(REPORTS_DIR, 'latest.json'),
    JSON.stringify(report, null, 2),
  );

  // --- log riepilogo ---
  console.log(
    `\n✅ Fatto in ${durationMs}ms. ${stations.length} stazioni. ` +
      `Cronologia: ${updatedHistory.length} giorni. Freschezza: ${freshness.status}.`,
  );
  console.log(
    `   Anomalie: ${report.rows.pricesRejected} prezzi scartati ` +
      `(carburante ignoto ${report.rejections.unknownFuel}, ` +
      `fuori range ${report.rejections.priceOutOfRange}, ` +
      `non numerici ${report.rejections.nonNumericPrice}).`,
  );
  if (report.unknownFuelSamples.length > 0) {
    console.log(
      `   Descrizioni carburante non riconosciute (campione): ` +
        report.unknownFuelSamples.slice(0, 8).join(' | '),
    );
  }
}

main().catch((e: unknown) => {
  console.error('❌ ERRORE pipeline:', e instanceof Error ? e.message : e);
  // Exit non-zero: il workflow NON deve pubblicare né sovrascrivere l'ultima
  // versione valida quando l'ingest fallisce.
  process.exit(1);
});
