import { describe, it, expect } from 'vitest';
import {
  computeBestChoice,
  ROAD_FACTOR,
  type NearbyStation,
} from '../src/lib/savings/compute.ts';

function st(id: string, price: number, crowKm: number): NearbyStation {
  return { id, slug: id, name: id, brand: 'X', comune: 'Y', price, crowKm };
}

describe('computeBestChoice', () => {
  it('gestisce lista vuota', () => {
    const r = computeBestChoice({ stations: [], liters: 50, kmPerLiter: 15 });
    expect(r.best).toBeNull();
    expect(r.worthDetour).toBe(false);
  });

  it('se il più vicino è anche il più economico, non conviene deviare', () => {
    const r = computeBestChoice({
      stations: [st('a', 1.8, 1), st('b', 1.9, 5)],
      liters: 50,
      kmPerLiter: 15,
    });
    expect(r.best!.id).toBe('a');
    expect(r.worthDetour).toBe(false);
  });

  it('consiglia la deviazione se il risparmio supera il costo del viaggio', () => {
    // b è 10¢/L più economico su 50L = 5€ risparmio; a 6km (andata) il viaggio costa poco
    const r = computeBestChoice({
      stations: [st('a', 1.9, 1), st('b', 1.8, 6)],
      liters: 50,
      kmPerLiter: 15,
    });
    expect(r.best!.id).toBe('b');
    expect(r.worthDetour).toBe(true);
    expect(r.best!.netVsNearest).toBeGreaterThan(0);
  });

  it('NON consiglia la deviazione se troppo lontano annulla il risparmio', () => {
    // b è solo 1¢/L più economico (0,50€ su 50L) ma è a 40km: il viaggio costa di più
    const r = computeBestChoice({
      stations: [st('a', 1.9, 1), st('b', 1.89, 40)],
      liters: 50,
      kmPerLiter: 15,
    });
    expect(r.best!.id).toBe('a');
    expect(r.worthDetour).toBe(false);
  });

  it('calcola i km stradali con andata+ritorno e fattore strada', () => {
    const r = computeBestChoice({
      stations: [st('a', 1.8, 10)],
      liters: 50,
      kmPerLiter: 15,
    });
    // 10km crow × 1.3 × 2 (a/r) = 26 km
    expect(r.ranked[0].roadKm).toBeCloseTo(10 * ROAD_FACTOR * 2, 1);
  });

  it('include il costo del viaggio nel totale', () => {
    const r = computeBestChoice({
      stations: [st('a', 2.0, 15)],
      liters: 50,
      kmPerLiter: 15,
    });
    const s = r.ranked[0];
    expect(s.totalCost).toBeGreaterThan(2.0 * 50); // pieno + viaggio > solo pieno
    expect(s.travelCost).toBeGreaterThan(0);
  });
});
