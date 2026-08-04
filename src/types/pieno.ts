/**
 * Pieno — tipi condivisi tra pipeline dati e frontend.
 *
 * Questo file è la SINGLE SOURCE OF TRUTH per la forma dei dati.
 * Sia gli script Node in scripts/ sia il futuro frontend Astro importano
 * da qui, così lo schema non può divergere fra i due lati.
 *
 * Ogni cambiamento incompatibile allo schema DEVE incrementare SCHEMA_VERSION
 * e va documentato in docs/data-model.md.
 */

/** Versione corrente dello schema dati pubblicato. */
export const SCHEMA_VERSION = 2 as const;

/**
 * Chiavi canoniche dei carburanti. Sono l'unico vocabolario ammesso a valle
 * della normalizzazione: la pipeline non deve mai emettere altre stringhe.
 */
export type FuelKey =
  | 'benzina'
  | 'gasolio'
  | 'gpl'
  | 'metano'
  | 'benzina_plus'
  | 'diesel_plus'
  | 'hvo';

export const FUEL_KEYS: readonly FuelKey[] = [
  'benzina',
  'gasolio',
  'gpl',
  'metano',
  'benzina_plus',
  'diesel_plus',
  'hvo',
] as const;

/** Etichette leggibili, in italiano, per la UI. */
export const FUEL_LABELS: Record<FuelKey, string> = {
  benzina: 'Benzina',
  gasolio: 'Gasolio',
  gpl: 'GPL',
  metano: 'Metano',
  benzina_plus: 'Benzina Plus',
  diesel_plus: 'Diesel Plus',
  hvo: 'HVO (diesel rinnovabile)',
};

/**
 * Prezzo di un carburante, modellato per MODALITÀ.
 *
 * self e servito sono conservati SEPARATAMENTE: mai più un prezzo unico che
 * sovrascrive l'altro. `null` significa "questa modalità non è comunicata"
 * per quel carburante in quella stazione.
 */
export interface FuelPrice {
  /** Prezzo self-service in €/L, oppure null se non comunicato. */
  self: number | null;
  /** Prezzo servito in €/L, oppure null se non comunicato. */
  served: number | null;
  /**
   * Data/ora di comunicazione più recente fra self e served per questo
   * carburante, in ISO 8601, se il dataset la fornisce. Preserva
   * l'informazione temporale grezza del MIMIT.
   */
  updatedAt?: string | null;
}

/** Mappa carburante -> prezzo, con chiavi opzionali. */
export type StationFuelPrices = Partial<Record<FuelKey, FuelPrice>>;

/**
 * Una stazione di servizio pubblicata.
 *
 * `id` è l'idImpianto UFFICIALE MIMIT: stabile nel tempo, adatto a URL
 * permanenti, preferiti, storico, alert. NON è un indice incrementale.
 */
export interface Station {
  /** idImpianto ufficiale MIMIT. Identificatore stabile. */
  id: string;
  /** Nome impianto, ripulito. */
  name: string;
  /** Bandiera/marchio (Eni, Q8, IP, "Distributore" se ignoto). */
  brand: string;
  /** Comune, in Title Case. */
  comune: string;
  /** Sigla provincia (es. "MI"), o stringa vuota se assente. */
  provincia: string;
  /** Latitudine WGS84. */
  lat: number;
  /** Longitudine WGS84. */
  lng: number;
  /** Prezzi per carburante, separati per modalità. */
  fuels: StationFuelPrices;
}

/** Stato di freschezza del dato, derivato dall'età in giorni. */
export type FreshnessStatus = 'fresh' | 'delayed' | 'stale';

export interface Freshness {
  /** Data di estrazione dichiarata dalla fonte (YYYY-MM-DD). */
  sourceExtractionDate: string;
  /** Momento di generazione di questo file (ISO 8601). */
  generatedAt: string;
  /** Età del dato in giorni interi rispetto a generatedAt. */
  ageDays: number;
  /** Stato leggibile: fresh (0-1gg), delayed (2gg), stale (3+gg). */
  status: FreshnessStatus;
}

/** Statistiche aggregate per un singolo carburante e modalità. */
export interface FuelStats {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
}

/** Aggregati nazionali per carburante, distinti per modalità. */
export type NationalStats = Partial<
  Record<FuelKey, { self?: FuelStats; served?: FuelStats }>
>;

/** Direzione del trend. */
export type TrendDirection = 'up' | 'down' | 'flat';

export interface Trend {
  direction: TrendDirection;
  /** Variazione in centesimi €/L sul periodo. */
  deltaCents: number;
  /** Giorni coperti dal confronto. */
  daysBack: number;
  /** Valore odierno (media self) €/L. */
  today: number;
  /** Valore di riferimento passato €/L. */
  reference: number;
  /** Numero di punti nella serie usati. */
  points: number;
}

export type Trends = Partial<Record<FuelKey, Trend>>;

/** Voce di notizia generata dai dati. */
export interface NewsItem {
  /** Titolo. */
  headline: string;
  /** Corpo. */
  body: string;
  /** Su quali dati si basa (trasparenza). */
  basis: string;
}

/** Un punto della cronologia giornaliera delle medie nazionali. */
export interface HistoryPoint {
  /** Data di estrazione (YYYY-MM-DD). */
  date: string;
  /** Media nazionale self per carburante, €/L. */
  self: Partial<Record<FuelKey, number>>;
  /** Media nazionale servito per carburante, €/L. */
  served: Partial<Record<FuelKey, number>>;
}

/** File stations.json — payload principale. */
export interface StationsFile {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  sourceExtractionDate: string;
  stations: Station[];
}

/** File meta.json — metadati, aggregati, trend, notizie. */
export interface MetaFile {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  sourceExtractionDate: string;
  freshness: Freshness;
  total: number;
  counts: Partial<Record<FuelKey, { self: number; served: number }>>;
  stats: NationalStats;
  trends: Trends;
  news: NewsItem[];
  historyPoints: number;
  source: string;
}

/** File status.json — stato sintetico per osservabilità. */
export interface StatusFile {
  status: 'ok' | 'error';
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  sourceExtractionDate: string;
  freshness: FreshnessStatus;
  stations: number;
}

/** Report di importazione — reports/latest.json. */
export interface ImportReport {
  generatedAt: string;
  sourceExtractionDate: string;
  durationMs: number;
  rows: {
    anagraficaReceived: number;
    prezziReceived: number;
    stationsProduced: number;
    pricesAccepted: number;
    pricesRejected: number;
  };
  rejections: {
    outOfBoundsCoords: number;
    missingStation: number;
    unknownFuel: number;
    priceOutOfRange: number;
    nonNumericPrice: number;
    duplicatePrice: number;
  };
  /** Descrizioni carburante non riconosciute (campionate, non esaustive). */
  unknownFuelSamples: string[];
  warnings: string[];
}
