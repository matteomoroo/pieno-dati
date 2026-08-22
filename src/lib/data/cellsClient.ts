/**
 * Caricamento lato client delle celle geografiche.
 *
 * Sostituisce il download del dataset nazionale (7 MB) con quello delle sole
 * celle che coprono il raggio di ricerca: in pratica 1-4 file da poche decine
 * di KB ciascuno.
 */
import type { Station, FuelKey, FuelPrice } from '../../types/pieno.ts';

const CELL_SIZE = 1;

interface CellsIndex {
  cellSize: number;
  fuels: FuelKey[];
  cells: string[];
  sourceExtractionDate: string;
}

type CompactFuel = [number | null, number | null] | 0;
type CompactStation = [
  string,
  number,
  number,
  string,
  string,
  string,
  string,
  CompactFuel[],
];

interface CellFile {
  fuels: FuelKey[];
  sourceExtractionDate: string;
  stations: CompactStation[];
}

export interface CellLoadResult {
  stations: Station[];
  /** Data di estrazione MIMIT dei dati effettivamente usati. */
  sourceExtractionDate: string;
  /** Vero se almeno una cella è arrivata dalla cache del service worker. */
  fromCache: boolean;
}

/** Errore con messaggio già pronto per l'utente, in italiano semplice. */
export class DataError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DataError';
  }
}

function expand(compact: CompactStation, fuels: FuelKey[]): Station {
  const [id, lat, lng, name, brand, comune, provincia, prices] = compact;
  const fuelMap: Partial<Record<FuelKey, FuelPrice>> = {};

  fuels.forEach((fuel, i) => {
    const entry = prices[i];
    if (!entry) return;
    const [self, served] = entry;
    fuelMap[fuel] = {
      self: self == null ? null : self / 1000,
      served: served == null ? null : served / 1000,
      updatedAt: '',
    };
  });

  return {
    id,
    name,
    brand,
    comune,
    provincia,
    lat: lat / 1e5,
    lng: lng / 1e5,
    fuels: fuelMap,
  } as Station;
}

/** Chiavi delle celle che coprono il raggio richiesto. */
export function cellKeysForRadius(
  lat: number,
  lng: number,
  radiusKm: number,
): string[] {
  const latSpan = radiusKm / 111;
  const lngSpan = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  const keys: string[] = [];
  for (
    let la = Math.floor((lat - latSpan) / CELL_SIZE);
    la <= Math.floor((lat + latSpan) / CELL_SIZE);
    la++
  ) {
    for (
      let ln = Math.floor((lng - lngSpan) / CELL_SIZE);
      ln <= Math.floor((lng + lngSpan) / CELL_SIZE);
      ln++
    ) {
      keys.push(`${la}_${ln}`);
    }
  }
  return keys;
}

/** Crea un caricatore con cache in memoria, legato a un base path. */
export function createCellLoader(base: string) {
  const cellCache = new Map<string, CellFile>();
  let indexPromise: Promise<CellsIndex> | null = null;

  async function getIndex(): Promise<CellsIndex> {
    if (!indexPromise) {
      indexPromise = fetch(`${base}/data/cells-index.json`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<CellsIndex>;
        })
        .catch((err: unknown) => {
          indexPromise = null;
          throw new DataError(
            'Non riesco a caricare i prezzi. Controlla la connessione e riprova tra poco.',
            err,
          );
        });
    }
    return indexPromise;
  }

  return async function loadAround(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<CellLoadResult> {
    const index = await getIndex();
    const wanted = cellKeysForRadius(lat, lng, radiusKm).filter((k) =>
      index.cells.includes(k),
    );

    if (wanted.length === 0) {
      return {
        stations: [],
        sourceExtractionDate: index.sourceExtractionDate,
        fromCache: false,
      };
    }

    let fromCache = false;

    const files = await Promise.all(
      wanted.map(async (key) => {
        const cached = cellCache.get(key);
        if (cached) return cached;

        let res: Response;
        try {
          res = await fetch(`${base}/data/cells/${key}.json`);
        } catch (err) {
          throw new DataError(
            'Non riesco a caricare i prezzi. Controlla la connessione e riprova tra poco.',
            err,
          );
        }
        if (!res.ok) {
          throw new DataError(
            'Non riesco a caricare i prezzi di questa zona. Riprova tra poco.',
          );
        }
        if (res.headers.get('X-Pieno-From-Cache') === '1') fromCache = true;

        const file = (await res.json()) as CellFile;
        cellCache.set(key, file);
        return file;
      }),
    );

    const stations: Station[] = [];
    let extraction = index.sourceExtractionDate;
    for (const file of files) {
      if (file.sourceExtractionDate) extraction = file.sourceExtractionDate;
      for (const compact of file.stations) stations.push(expand(compact, file.fuels));
    }

    return { stations, sourceExtractionDate: extraction, fromCache };
  };
}
