import { describe, it, expect } from 'vitest';
import { haversineKm } from '../scripts/lib/geo.ts';
import {
  classifyByDelta,
  compareLocal,
  MIN_LOCAL_SAMPLE,
  type PricedPoint,
} from '../scripts/lib/localCompare.ts';

describe('haversineKm', () => {
  it('è ~0 per lo stesso punto', () => {
    expect(haversineKm(45, 9, 45, 9)).toBeCloseTo(0, 5);
  });
  it('stima Milano-Roma ~480 km', () => {
    const d = haversineKm(45.4668, 9.1904, 41.9028, 12.4964);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(520);
  });
  it('è simmetrica', () => {
    const a = haversineKm(45, 9, 44, 8);
    const b = haversineKm(44, 8, 45, 9);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('classifyByDelta', () => {
  it('applica le soglie documentate', () => {
    expect(classifyByDelta(-5)).toBe('molto_conveniente');
    expect(classifyByDelta(-3)).toBe('molto_conveniente');
    expect(classifyByDelta(-2)).toBe('conveniente');
    expect(classifyByDelta(-1)).toBe('conveniente');
    expect(classifyByDelta(0)).toBe('nella_media');
    expect(classifyByDelta(0.9)).toBe('nella_media');
    expect(classifyByDelta(1)).toBe('caro');
    expect(classifyByDelta(2.9)).toBe('caro');
    expect(classifyByDelta(3)).toBe('molto_caro');
    expect(classifyByDelta(6)).toBe('molto_caro');
  });
});

describe('compareLocal', () => {
  // Griglia fitta di vicini attorno a (45,9) tutti a 1.900
  const cluster: PricedPoint[] = Array.from({ length: 10 }, (_, i) => ({
    lat: 45 + i * 0.001,
    lng: 9 + i * 0.001,
    price: 1.9,
  }));

  it('segnala dati_insufficienti sotto il campione minimo', () => {
    const few = cluster.slice(0, MIN_LOCAL_SAMPLE - 1);
    const r = compareLocal(1.9, 45, 9, few, 5);
    expect(r.class).toBe('dati_insufficienti');
    expect(r.localMedian).toBeNull();
    expect(r.sampleSize).toBeLessThan(MIN_LOCAL_SAMPLE);
  });

  it('classifica una stazione molto conveniente rispetto alla mediana locale', () => {
    const r = compareLocal(1.86, 45, 9, cluster, 5); // -4 cent
    expect(r.class).toBe('molto_conveniente');
    expect(r.localMedian).toBeCloseTo(1.9);
    expect(r.deltaCents).toBeCloseTo(-4, 1);
    expect(r.sampleSize).toBeGreaterThanOrEqual(MIN_LOCAL_SAMPLE);
  });

  it('classifica una stazione nella media', () => {
    const r = compareLocal(1.9, 45, 9, cluster, 5);
    expect(r.class).toBe('nella_media');
    expect(r.deltaCents).toBeCloseTo(0, 1);
  });

  it('classifica una stazione molto cara', () => {
    const r = compareLocal(1.95, 45, 9, cluster, 5); // +5 cent
    expect(r.class).toBe('molto_caro');
  });

  it('esclude i vicini fuori dal raggio', () => {
    const far: PricedPoint[] = [
      ...cluster.slice(0, 2),
      { lat: 46.5, lng: 11, price: 1.5 }, // lontano: non deve entrare
    ];
    const r = compareLocal(1.9, 45, 9, far, 5);
    // solo 2 vicini nel raggio -> sotto il minimo
    expect(r.sampleSize).toBe(2);
    expect(r.class).toBe('dati_insufficienti');
  });

  it('riporta sempre la dimensione del campione e il raggio', () => {
    const r = compareLocal(1.9, 45, 9, cluster, 5);
    expect(r.radiusKm).toBe(5);
    expect(typeof r.sampleSize).toBe('number');
  });
});
