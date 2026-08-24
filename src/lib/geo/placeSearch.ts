/**
 * Ricerca di una località senza geolocalizzazione.
 *
 * Non introduce nessun geocoder esterno: riusa `search-index.json`, che la
 * pipeline genera già a partire dalle stazioni e contiene nome, provincia e
 * coordinate di ogni comune con almeno un distributore. Nessuna chiave API,
 * nessun rate limit, nessun obbligo di attribuzione, nessun costo.
 */

export interface Place {
  /** Forma normalizzata usata per il confronto. */
  q: string;
  name: string;
  prov: string;
  lat: number;
  lng: number;
  count: number;
}

/**
 * Normalizza una stringa per il confronto: minuscole, senza accenti, senza
 * apostrofi, spazi compattati.
 *
 * Gli apostrofi diventano spazi da entrambi i lati del confronto, così chi
 * scrive "l aquila" o "sant elena" trova comunque "L'Aquila" e
 * "Quartu Sant'Elena". L'indice generato dalla pipeline li conserva, quindi
 * la normalizzazione va applicata anche a quello.
 */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cache delle chiavi normalizzate. L'indice comuni è caricato una sola volta
 * e ha migliaia di voci: normalizzarle a ogni tasto sarebbe uno spreco.
 */
const normalizedKeys = new WeakMap<Place[], string[]>();

function keysFor(places: Place[]): string[] {
  let keys = normalizedKeys.get(places);
  if (!keys) {
    keys = places.map((p) => normalize(p.q || p.name));
    normalizedKeys.set(places, keys);
  }
  return keys;
}

/**
 * Cerca fra i comuni. Prima i nomi che iniziano con la query, poi quelli che
 * la contengono; a parità, i comuni con più distributori.
 */
export function searchPlaces(
  places: Place[],
  rawQuery: string,
  limit = 8,
): Place[] {
  const q = normalize(rawQuery);
  if (q.length < 2) return [];

  // Supporta "Milano MI" e "Milano, MI".
  const provMatch = q.match(/^(.*?)[\s,]+([a-z]{2})$/);
  const namePart = provMatch ? (provMatch[1] as string) : q;
  const provPart = provMatch ? (provMatch[2] as string).toUpperCase() : null;

  const starts: Place[] = [];
  const contains: Place[] = [];
  const keys = keysFor(places);

  for (let i = 0; i < places.length; i++) {
    const place = places[i] as Place;
    if (provPart && place.prov.toUpperCase() !== provPart) continue;
    const idx = (keys[i] as string).indexOf(namePart);
    if (idx === 0) starts.push(place);
    else if (idx > 0) contains.push(place);
  }

  const byCount = (a: Place, b: Place): number => b.count - a.count;
  starts.sort(byCount);
  contains.sort(byCount);

  return [...starts, ...contains].slice(0, limit);
}

/** Debounce semplice, per non filtrare a ogni singolo tasto. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs = 200,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

/** Carica l'indice comuni una sola volta. */
export function createPlaceIndexLoader(base: string) {
  let promise: Promise<Place[]> | null = null;
  return (): Promise<Place[]> => {
    if (!promise) {
      promise = fetch(`${base}/data/search-index.json`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<Place[]>;
        })
        .catch((err: unknown) => {
          promise = null;
          throw err;
        });
    }
    return promise;
  };
}
