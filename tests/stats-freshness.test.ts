import { describe, it, expect } from 'vitest';
import { ageInDays, freshnessStatus, computeFreshness } from '../scripts/lib/freshness.ts';
import { mean, median, fuelStats, computeNationalStats } from '../scripts/lib/stats.ts';
import type { Station } from '../src/types/pieno.ts';

describe('freshness', () => {
  it('conta i giorni di calendario UTC', () => {
    const now = new Date('2026-07-30T09:00:00Z');
    expect(ageInDays('2026-07-30', now)).toBe(0);
    expect(ageInDays('2026-07-29', now)).toBe(1);
    expect(ageInDays('2026-07-28', now)).toBe(2);
    expect(ageInDays('2026-07-27', now)).toBe(3);
  });
  it('mappa età -> stato', () => {
    expect(freshnessStatus(0)).toBe('fresh');
    expect(freshnessStatus(1)).toBe('fresh');
    expect(freshnessStatus(2)).toBe('delayed');
    expect(freshnessStatus(3)).toBe('stale');
    expect(freshnessStatus(10)).toBe('stale');
  });
  it('costruisce Freshness completo', () => {
    const f = computeFreshness('2026-07-28', new Date('2026-07-30T09:00:00Z'));
    expect(f.ageDays).toBe(2);
    expect(f.status).toBe('delayed');
    expect(f.sourceExtractionDate).toBe('2026-07-28');
  });
});

describe('stats', () => {
  it('media e mediana', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('mediana robusta agli outlier rispetto alla media', () => {
    const vals = [1.8, 1.85, 1.9, 1.88, 50]; // un outlier
    expect(median(vals)).toBe(1.88);
    expect(mean(vals)).toBeGreaterThan(10); // la media è rovinata
  });
  it('fuelStats restituisce null su vuoto', () => {
    expect(fuelStats([])).toBeNull();
  });
  it('aggrega self e servito separatamente', () => {
    const stations: Station[] = [
      {
        id: '1', name: 'A', brand: 'X', comune: 'Y', provincia: 'MI',
        lat: 45, lng: 9,
        fuels: { benzina: { self: 1.8, served: 1.9 } },
      },
      {
        id: '2', name: 'B', brand: 'X', comune: 'Y', provincia: 'MI',
        lat: 45, lng: 9,
        fuels: { benzina: { self: 1.9, served: null } },
      },
    ];
    const s = computeNationalStats(stations);
    expect(s.benzina?.self?.count).toBe(2);
    expect(s.benzina?.self?.mean).toBeCloseTo(1.85);
    expect(s.benzina?.served?.count).toBe(1);
    expect(s.benzina?.served?.mean).toBeCloseTo(1.9);
  });
});
