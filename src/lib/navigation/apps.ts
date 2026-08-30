/**
 * Costruzione dei link verso le app di navigazione esterne.
 *
 * Vincoli di progetto:
 *  - nessuna API key, solo URL universali documentati;
 *  - alle app vengono passate esclusivamente le coordinate della stazione,
 *    nessun altro dato dell'utente;
 *  - la piattaforma serve solo a ordinare le opzioni: la scelta resta sempre
 *    dell'utente e non viene memorizzata da nessuna parte.
 */

export type NavApp = 'apple' | 'google' | 'waze';

export interface NavOption {
  id: NavApp;
  /** Nome del servizio, scritto per esteso come richiesto. */
  label: string;
  url: string;
}

/** Arrotonda a 6 decimali: sufficiente a individuare un civico, non di più. */
function coord(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function assertFinite(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new RangeError('Coordinate non valide');
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new RangeError('Coordinate fuori intervallo');
  }
}

/** https://www.google.com/maps/dir/?api=1&destination=LAT,LON */
export function googleMapsUrl(lat: number, lng: number): string {
  assertFinite(lat, lng);
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  u.searchParams.set('destination', `${coord(lat)},${coord(lng)}`);
  return u.toString();
}

/** https://maps.apple.com/?daddr=LAT,LON */
export function appleMapsUrl(lat: number, lng: number): string {
  assertFinite(lat, lng);
  const u = new URL('https://maps.apple.com/');
  u.searchParams.set('daddr', `${coord(lat)},${coord(lng)}`);
  return u.toString();
}

/** https://www.waze.com/ul?ll=LAT,LON&navigate=yes */
export function wazeUrl(lat: number, lng: number): string {
  assertFinite(lat, lng);
  const u = new URL('https://www.waze.com/ul');
  u.searchParams.set('ll', `${coord(lat)},${coord(lng)}`);
  u.searchParams.set('navigate', 'yes');
  return u.toString();
}

export type Platform = 'ios' | 'android' | 'other';

/**
 * Riconosce la piattaforma solo per ordinare le opzioni.
 *
 * iPadOS recente si presenta come Macintosh: lo distinguiamo dal supporto al
 * touch. Se il riconoscimento fallisce si ricade su `other`, che è un ordine
 * valido: nessuna funzionalità dipende da questa euristica.
 */
export function detectPlatform(
  userAgent: string,
  maxTouchPoints = 0,
): Platform {
  const ua = userAgent || '';
  if (/iPhone|iPod/i.test(ua)) return 'ios';
  if (/iPad/i.test(ua)) return 'ios';
  // iPadOS 13+ in modalità desktop.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

const ORDINE: Record<Platform, NavApp[]> = {
  ios: ['apple', 'google', 'waze'],
  android: ['google', 'waze', 'apple'],
  other: ['google', 'apple', 'waze'],
};

const ETICHETTE: Record<NavApp, string> = {
  apple: 'Apple Maps',
  google: 'Google Maps',
  waze: 'Waze',
};

const COSTRUTTORI: Record<NavApp, (lat: number, lng: number) => string> = {
  apple: appleMapsUrl,
  google: googleMapsUrl,
  waze: wazeUrl,
};

/** Opzioni ordinate per la piattaforma. Contiene sempre tutte e tre le app. */
export function navigationOptions(
  lat: number,
  lng: number,
  platform: Platform = 'other',
): NavOption[] {
  return ORDINE[platform].map((id) => ({
    id,
    label: ETICHETTE[id],
    url: COSTRUTTORI[id](lat, lng),
  }));
}
