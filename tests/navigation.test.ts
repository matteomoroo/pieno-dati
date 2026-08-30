import { describe, it, expect } from 'vitest';
import {
  googleMapsUrl,
  appleMapsUrl,
  wazeUrl,
  detectPlatform,
  navigationOptions,
} from '../src/lib/navigation/apps.ts';

const LAT = 45.4642;
const LNG = 9.19;

describe('URL delle app di navigazione', () => {
  it('costruisce l\'URL di Google Maps nel formato documentato', () => {
    const u = new URL(googleMapsUrl(LAT, LNG));
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/');
    expect(u.searchParams.get('api')).toBe('1');
    expect(u.searchParams.get('destination')).toBe('45.4642,9.19');
  });

  it('costruisce l\'URL di Apple Maps nel formato documentato', () => {
    const u = new URL(appleMapsUrl(LAT, LNG));
    expect(u.origin + u.pathname).toBe('https://maps.apple.com/');
    expect(u.searchParams.get('daddr')).toBe('45.4642,9.19');
  });

  it('costruisce l\'URL di Waze nel formato documentato', () => {
    const u = new URL(wazeUrl(LAT, LNG));
    expect(u.origin + u.pathname).toBe('https://www.waze.com/ul');
    expect(u.searchParams.get('ll')).toBe('45.4642,9.19');
    expect(u.searchParams.get('navigate')).toBe('yes');
  });

  it('non trasmette parametri oltre alle coordinate', () => {
    for (const url of [googleMapsUrl(LAT, LNG), appleMapsUrl(LAT, LNG), wazeUrl(LAT, LNG)]) {
      const chiavi = [...new URL(url).searchParams.keys()].sort();
      expect(chiavi).toEqual(
        expect.arrayContaining(chiavi.filter((k) =>
          ['api', 'destination', 'daddr', 'll', 'navigate'].includes(k)),
        ),
      );
      expect(chiavi.length).toBeLessThanOrEqual(2);
    }
  });

  it('gestisce coordinate negative e decimali lunghi', () => {
    const u = new URL(googleMapsUrl(-33.8688, 151.2093456789));
    expect(u.searchParams.get('destination')).toBe('-33.8688,151.209346');
  });

  it('rifiuta coordinate non valide invece di produrre URL rotti', () => {
    expect(() => googleMapsUrl(Number.NaN, 9)).toThrow();
    expect(() => appleMapsUrl(91, 9)).toThrow();
    expect(() => wazeUrl(45, 181)).toThrow();
  });
});

describe('riconoscimento piattaforma', () => {
  it('riconosce iPhone e iPad', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('ios');
  });

  it('riconosce iPadOS che si presenta come Macintosh', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
    expect(detectPlatform(ua, 5)).toBe('ios');
    // Un Mac vero non ha touch: resta desktop.
    expect(detectPlatform(ua, 0)).toBe('other');
  });

  it('riconosce Android', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('android');
  });

  it('ricade su other quando non riconosce nulla', () => {
    expect(detectPlatform('')).toBe('other');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('other');
  });
});

describe('ordinamento delle opzioni', () => {
  it('su iOS mette Apple Maps per prima', () => {
    expect(navigationOptions(LAT, LNG, 'ios').map((o) => o.id)).toEqual([
      'apple', 'google', 'waze',
    ]);
  });

  it('su Android mette Google Maps per prima', () => {
    expect(navigationOptions(LAT, LNG, 'android').map((o) => o.id)).toEqual([
      'google', 'waze', 'apple',
    ]);
  });

  it('su desktop mette Google Maps per prima', () => {
    expect(navigationOptions(LAT, LNG, 'other').map((o) => o.id)).toEqual([
      'google', 'apple', 'waze',
    ]);
  });

  it('offre sempre tutte e tre le app: la scelta resta dell\'utente', () => {
    for (const p of ['ios', 'android', 'other'] as const) {
      const opt = navigationOptions(LAT, LNG, p);
      expect(opt).toHaveLength(3);
      expect(opt.map((o) => o.label).sort()).toEqual(['Apple Maps', 'Google Maps', 'Waze']);
    }
  });

  it('espone i nomi dei servizi per esteso', () => {
    const etichette = navigationOptions(LAT, LNG, 'ios').map((o) => o.label);
    expect(etichette).toContain('Apple Maps');
    expect(etichette).toContain('Waze');
  });
});
