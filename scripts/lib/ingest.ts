/**
 * Ingest: unione anagrafica + prezzi in stazioni tipizzate.
 *
 * Funzione PURA: riceve le righe già parse dai CSV e restituisce stazioni +
 * report anomalie. Non fa rete né I/O, così è testabile con fixture piccole.
 *
 * Correzioni chiave rispetto al vecchio build.mjs:
 *  1. ID = idImpianto ufficiale MIMIT (stringa), non un contatore.
 *  2. self e servito conservati SEPARATAMENTE per ogni carburante.
 *  3. anomalie CONTATE e riportate, non scartate in silenzio.
 */

import type {
  FuelKey,
  FuelPrice,
  ImportReport,
  Station,
  StationFuelPrices,
} from '../../src/types/pieno.ts';
import { classifyFuel } from './fuels.ts';
import {
  isValidCoord,
  isValidStationId,
  isPriceInRange,
  parsePrice,
} from './validate.ts';

/** Title Case robusto per nomi di comune ("REGGIO NELL'EMILIA"). */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’\-/])([a-zà-ÿ])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

interface Accumulator {
  station: Omit<Station, 'fuels'>;
  fuels: Partial<Record<FuelKey, FuelPrice>>;
}

const UNKNOWN_FUEL_SAMPLE_CAP = 25;

export interface IngestInput {
  anagrafica: Record<string, string>[];
  prezzi: Record<string, string>[];
  extractionDate: string;
  generatedAt: string;
  durationMs: number;
}

export interface IngestResult {
  stations: Station[];
  report: ImportReport;
}

/**
 * Costruisce le stazioni dai due dataset MIMIT.
 */
export function ingest(input: IngestInput): IngestResult {
  const { anagrafica, prezzi, extractionDate, generatedAt, durationMs } = input;

  const rejections = {
    outOfBoundsCoords: 0,
    missingStation: 0,
    unknownFuel: 0,
    priceOutOfRange: 0,
    nonNumericPrice: 0,
    duplicatePrice: 0,
  };
  const unknownFuelSamples = new Set<string>();
  const warnings: string[] = [];

  // --- Fase 1: anagrafica -> mappa idImpianto -> accumulatore ---
  const acc = new Map<string, Accumulator>();
  for (const r of anagrafica) {
    const id = r['idImpianto'];
    if (!isValidStationId(id)) {
      rejections.missingStation++;
      continue;
    }
    const lat = parsePrice(r['Latitudine']);
    const lng = parsePrice(r['Longitudine']);
    if (lat == null || lng == null || !isValidCoord(lat, lng)) {
      rejections.outOfBoundsCoords++;
      continue;
    }

    const brand = (r['Bandiera'] || r['Gestore'] || 'Distributore').trim();
    const comune = titleCase((r['Comune'] || '').trim());
    let name = (r['Nome Impianto'] || '').trim();
    // Nomi inutili (solo cifre/simboli o troppo corti): fallback a brand+comune.
    if (!name || /^[\d\W_]+$/.test(name) || name.length < 3) {
      name = `${brand} · ${comune}`.trim();
    }

    acc.set(id.trim(), {
      station: {
        id: id.trim(),
        name: name.slice(0, 80),
        brand: brand.slice(0, 40),
        comune,
        provincia: (r['Provincia'] || '').trim(),
        lat: round5(lat),
        lng: round5(lng),
      },
      fuels: {},
    });
  }

  // --- Fase 2: prezzi -> merge per modalità ---
  for (const r of prezzi) {
    const id = (r['idImpianto'] || '').trim();
    const entry = acc.get(id);
    if (!entry) {
      rejections.missingStation++;
      continue;
    }

    const fuel = classifyFuel(r['descCarburante']);
    if (!fuel) {
      rejections.unknownFuel++;
      const desc = (r['descCarburante'] || '').trim();
      if (desc && unknownFuelSamples.size < UNKNOWN_FUEL_SAMPLE_CAP) {
        unknownFuelSamples.add(desc);
      }
      continue;
    }

    const price = parsePrice(r['prezzo']);
    if (price == null) {
      rejections.nonNumericPrice++;
      continue;
    }
    if (!isPriceInRange(fuel, price)) {
      rejections.priceOutOfRange++;
      continue;
    }

    const isSelf = String(r['isSelf']).trim() === '1';
    const rounded = round3(price);
    const commTime = (r['dtComu'] || '').trim() || null;

    const existing = entry.fuels[fuel] ?? { self: null, served: null, updatedAt: null };
    if (isSelf) {
      if (existing.self != null) rejections.duplicatePrice++;
      existing.self = rounded;
    } else {
      if (existing.served != null) rejections.duplicatePrice++;
      existing.served = rounded;
    }
    // Conserva la comunicazione temporale più recente disponibile.
    if (commTime && (!existing.updatedAt || commTime > existing.updatedAt)) {
      existing.updatedAt = commTime;
    }
    entry.fuels[fuel] = existing;
  }

  // --- Fase 3: materializza le stazioni con almeno un prezzo ---
  const stations: Station[] = [];
  let pricesAccepted = 0;
  for (const entry of acc.values()) {
    const fuels = pruneEmptyFuels(entry.fuels);
    if (Object.keys(fuels).length === 0) continue;
    for (const fp of Object.values(fuels)) {
      if (fp!.self != null) pricesAccepted++;
      if (fp!.served != null) pricesAccepted++;
    }
    stations.push({ ...entry.station, fuels });
  }

  // Ordinamento stabile per id, così l'output è deterministico fra i run
  // (utile per diff/commit puliti dello storico).
  stations.sort((a, b) => a.id.localeCompare(b.id));

  const pricesRejected =
    rejections.unknownFuel +
    rejections.priceOutOfRange +
    rejections.nonNumericPrice;

  const report: ImportReport = {
    generatedAt,
    sourceExtractionDate: extractionDate,
    durationMs,
    rows: {
      anagraficaReceived: anagrafica.length,
      prezziReceived: prezzi.length,
      stationsProduced: stations.length,
      pricesAccepted,
      pricesRejected,
    },
    rejections,
    unknownFuelSamples: [...unknownFuelSamples],
    warnings,
  };

  return { stations, report };
}

/** Rimuove i FuelPrice completamente vuoti (self e served entrambi null). */
function pruneEmptyFuels(fuels: StationFuelPrices): StationFuelPrices {
  const out: StationFuelPrices = {};
  for (const [k, v] of Object.entries(fuels) as [FuelKey, FuelPrice][]) {
    if (v && (v.self != null || v.served != null)) {
      out[k] = v.updatedAt ? v : { self: v.self, served: v.served };
    }
  }
  return out;
}

function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
