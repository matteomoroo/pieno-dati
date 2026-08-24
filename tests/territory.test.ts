import { describe, it, expect } from 'vitest';
import { buildTerritory, MIN_COMUNE_STATIONS } from '../src/lib/geo/territory.ts';
import { regionOf, toSlug } from '../src/lib/geo/regions.ts';
import type { Station } from '../src/types/pieno.ts';

function station(
  id: string,
  provincia: string,
  comune: string,
  benzinaSelf: number,
): Station {
  return {
    id,
    name: `Staz ${id}`,
    brand: 'Test',
    comune,
    provincia,
    lat: 45,
    lng: 9,
    fuels: { benzina: { self: benzinaSelf, served: null } },
  };
}

describe('regionOf', () => {
  it('mappa le province sulle regioni', () => {
    expect(regionOf('MI')).toBe('Lombardia');
    expect(regionOf('RM')).toBe('Lazio');
    expect(regionOf('NA')).toBe('Campania');
    expect(regionOf('me')).toBe('Sicilia'); // case-insensitive
  });
  it('ritorna null per sigle sconosciute', () => {
    expect(regionOf('XX')).toBeNull();
  });
});

describe('toSlug', () => {
  it('produce slug URL-safe', () => {
    expect(toSlug('Lombardia')).toBe('lombardia');
    expect(toSlug("Valle d'Aosta")).toBe('valle-d-aosta');
    expect(toSlug('Reggio Emilia')).toBe('reggio-emilia');
    expect(toSlug('Forlì-Cesena')).toBe('forli-cesena');
  });
});

describe('buildTerritory', () => {
  it('aggrega per regione/provincia/comune', () => {
    const stations: Station[] = [
      // 5 a Milano (MI) -> genera comune
      ...Array.from({ length: 5 }, (_, i) => station(`mi${i}`, 'MI', 'Milano', 1.9 + i * 0.01)),
      // 3 a Roma (RM) -> sotto soglia, niente nodo comune ma conta in prov/regione
      ...Array.from({ length: 3 }, (_, i) => station(`rm${i}`, 'RM', 'Roma', 2.0)),
    ];
    const tree = buildTerritory(stations);

    const lombardia = tree.find((r) => r.name === 'Lombardia');
    expect(lombardia).toBeDefined();
    expect(lombardia!.stationCount).toBe(5);
    const mi = lombardia!.province.find((p) => p.name === 'MI');
    expect(mi!.comuni.find((c) => c.name === 'Milano')).toBeDefined();

    const lazio = tree.find((r) => r.name === 'Lazio');
    expect(lazio!.stationCount).toBe(3); // le stazioni contano
    const rm = lazio!.province.find((p) => p.name === 'RM');
    // Roma ha solo 3 stazioni (< 5): nessun nodo comune
    expect(rm!.comuni.find((c) => c.name === 'Roma')).toBeUndefined();
  });

  it('calcola statistiche corrette per il comune', () => {
    const stations = Array.from({ length: 5 }, (_, i) =>
      station(`x${i}`, 'MI', 'Milano', 1.9 + i * 0.01),
    );
    const tree = buildTerritory(stations);
    const milano = tree[0].province[0].comuni[0];
    expect(milano.stats.benzina?.self?.count).toBe(5);
    expect(milano.stats.benzina?.self?.median).toBeCloseTo(1.92);
    expect(milano.stats.benzina?.self?.min).toBeCloseTo(1.9);
  });

  it('esclude le stazioni con provincia sconosciuta', () => {
    const stations = [
      ...Array.from({ length: 5 }, (_, i) => station(`a${i}`, 'MI', 'Milano', 1.9)),
      station('bad', 'XX', 'Nonluogo', 1.9),
    ];
    const tree = buildTerritory(stations);
    const total = tree.reduce((a, r) => a + r.stationCount, 0);
    expect(total).toBe(5); // la stazione XX è esclusa
  });

  it('individua il distributore più economico', () => {
    const stations = [
      station('a', 'MI', 'Milano', 2.0),
      station('b', 'MI', 'Milano', 1.85),
      ...Array.from({ length: 3 }, (_, i) => station(`c${i}`, 'MI', 'Milano', 1.95)),
    ];
    const tree = buildTerritory(stations);
    const cheapest = tree[0].province[0].comuni[0].cheapest.benzina;
    expect(cheapest?.id).toBe('b');
    expect(cheapest?.price).toBeCloseTo(1.85);
  });
});

describe('soglia di pubblicazione dei comuni', () => {
  const base = {
    id: '',
    name: 'Distributore',
    brand: 'Eni',
    provincia: 'MI',
    lat: 45.4,
    lng: 9.1,
    fuels: { benzina: { self: 1.9, served: null, updatedAt: '' } },
  };

  function comuneWith(count: number, comune: string): Station[] {
    return Array.from({ length: count }, (_, i) => ({
      ...base,
      id: `${comune}-${i}`,
      comune,
    })) as Station[];
  }

  it('la soglia è cinque distributori', () => {
    expect(MIN_COMUNE_STATIONS).toBe(5);
  });

  it('pubblica i comuni che raggiungono la soglia', () => {
    const tree = buildTerritory(comuneWith(MIN_COMUNE_STATIONS, 'Grande'));
    const comuni = tree[0]?.province[0]?.comuni ?? [];
    expect(comuni.map((c) => c.name)).toEqual(['Grande']);
  });

  it('esclude i comuni sotto la soglia', () => {
    const tree = buildTerritory(comuneWith(MIN_COMUNE_STATIONS - 1, 'Piccolo'));
    expect(tree[0]?.province[0]?.comuni ?? []).toEqual([]);
  });

  it('conta comunque nella provincia le stazioni dei comuni esclusi', () => {
    const stations = [...comuneWith(5, 'Grande'), ...comuneWith(2, 'Piccolo')];
    const provincia = buildTerritory(stations)[0]?.province[0];
    expect(provincia?.stationCount).toBe(7);
    expect(provincia?.comuni.map((c) => c.name)).toEqual(['Grande']);
  });
});
