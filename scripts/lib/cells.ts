/**
 * Partizionamento geografico del dataset stazioni.
 *
 * Problema risolto: il calcolatore del risparmio scaricava l'intero
 * `stations.json` nazionale (7 MB) per cercare distributori entro 15 km. Su
 * rete mobile lenta è un'attesa che nessuno aspetta.
 *
 * Soluzione: il dataset viene diviso in celle da 1° di latitudine/longitudine
 * (circa 111 km per 75-90 km alle latitudini italiane). Un raggio di 15 km
 * ricade sempre dentro una finestra 3x3 di celle, quindi il client ne scarica
 * al massimo nove — in pratica molte meno, perché il mare e la montagna
 * lasciano celle vuote che non vengono nemmeno generate.
 *
 * Il formato è a tuple invece che a oggetti: meno byte, stessa informazione.
 */
import type { Station, FuelKey } from '../../src/types/pieno.ts';
import { FUEL_KEYS } from '../../src/types/pieno.ts';

/** Ampiezza della cella in gradi. */
export const CELL_SIZE = 1;

/** Prezzi in millesimi di euro: `[self, served]`, oppure `0` se assenti. */
export type CompactFuel = [number | null, number | null] | 0;

/** `[id, lat*1e5, lng*1e5, nome, brand, comune, provincia, prezzi]` */
export type CompactStation = [
  string,
  number,
  number,
  string,
  string,
  string,
  string,
  CompactFuel[],
];

export interface CellFile {
  schemaVersion: number;
  sourceExtractionDate: string;
  /** Ordine dei carburanti nelle tuple prezzo. */
  fuels: readonly FuelKey[];
  stations: CompactStation[];
}

/** Indice delle celle non vuote: evita al client richieste destinate a 404. */
export interface CellsIndex {
  schemaVersion: number;
  sourceExtractionDate: string;
  cellSize: number;
  fuels: readonly FuelKey[];
  /** Chiavi cella presenti, es. `45_9`. */
  cells: string[];
}

/** Chiave della cella che contiene le coordinate date. */
export function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_SIZE)}_${Math.floor(lng / CELL_SIZE)}`;
}

/**
 * Chiavi delle celle che coprono un raggio attorno a un punto.
 * Include sempre la cella centrale, anche se non contiene stazioni: sarà il
 * chiamante a scartarla confrontandola con l'indice.
 */
export function cellKeysForRadius(
  lat: number,
  lng: number,
  radiusKm: number,
): string[] {
  // 1° di latitudine ≈ 111 km; la longitudine si accorcia con il coseno.
  const latSpan = radiusKm / 111;
  const lngSpan = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  const latMin = Math.floor((lat - latSpan) / CELL_SIZE);
  const latMax = Math.floor((lat + latSpan) / CELL_SIZE);
  const lngMin = Math.floor((lng - lngSpan) / CELL_SIZE);
  const lngMax = Math.floor((lng + lngSpan) / CELL_SIZE);

  const keys: string[] = [];
  for (let la = latMin; la <= latMax; la++) {
    for (let ln = lngMin; ln <= lngMax; ln++) keys.push(`${la}_${ln}`);
  }
  return keys;
}

function toMilli(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value * 1000);
}

export function compactStation(s: Station): CompactStation {
  return [
    s.id,
    Math.round(s.lat * 1e5),
    Math.round(s.lng * 1e5),
    s.name ?? '',
    s.brand ?? '',
    s.comune ?? '',
    s.provincia ?? '',
    FUEL_KEYS.map((f): CompactFuel => {
      const p = s.fuels[f];
      if (!p) return 0;
      return [toMilli(p.self), toMilli(p.served)];
    }),
  ];
}

/** Raggruppa le stazioni per cella. Le celle vuote non compaiono. */
export function buildCells(
  stations: Station[],
  sourceExtractionDate: string,
  schemaVersion: number,
): { index: CellsIndex; files: Map<string, CellFile> } {
  const buckets = new Map<string, CompactStation[]>();

  for (const s of stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const key = cellKey(s.lat, s.lng);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(compactStation(s));
    else buckets.set(key, [compactStation(s)]);
  }

  const files = new Map<string, CellFile>();
  for (const [key, list] of buckets) {
    files.set(key, {
      schemaVersion,
      sourceExtractionDate,
      fuels: FUEL_KEYS,
      stations: list,
    });
  }

  return {
    index: {
      schemaVersion,
      sourceExtractionDate,
      cellSize: CELL_SIZE,
      fuels: FUEL_KEYS,
      cells: [...files.keys()].sort(),
    },
    files,
  };
}
