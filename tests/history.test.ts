import { describe, it, expect } from 'vitest';
import {
  upsertHistory,
  computeTrend,
  buildHistoryPoint,
  HISTORY_RETENTION_DAYS,
} from '../scripts/lib/history.ts';
import type { HistoryPoint, NationalStats } from '../src/types/pieno.ts';

function pt(date: string, benzinaSelf: number): HistoryPoint {
  return { date, self: { benzina: benzinaSelf }, served: {} };
}

describe('upsertHistory', () => {
  it('aggiunge un nuovo giorno', () => {
    const h = upsertHistory([pt('2026-07-28', 1.9)], pt('2026-07-29', 1.92));
    expect(h).toHaveLength(2);
    expect(h[1].date).toBe('2026-07-29');
  });

  it('è idempotente: rilancio stesso giorno = nessun duplicato (upsert)', () => {
    let h = [pt('2026-07-29', 1.9)];
    h = upsertHistory(h, pt('2026-07-29', 1.95)); // rilancio: valore aggiornato
    expect(h).toHaveLength(1);
    expect(h[0].self.benzina).toBe(1.95);
  });

  it('mantiene ordine cronologico anche con inserimenti fuori ordine', () => {
    let h: HistoryPoint[] = [];
    h = upsertHistory(h, pt('2026-07-30', 3));
    h = upsertHistory(h, pt('2026-07-28', 1));
    h = upsertHistory(h, pt('2026-07-29', 2));
    expect(h.map((x) => x.date)).toEqual(['2026-07-28', '2026-07-29', '2026-07-30']);
  });

  it('applica la ritenzione tenendo gli ultimi N giorni', () => {
    let h: HistoryPoint[] = [];
    for (let i = 0; i < HISTORY_RETENTION_DAYS + 50; i++) {
      const d = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000)
        .toISOString()
        .slice(0, 10);
      h = upsertHistory(h, pt(d, 1.5 + i * 0.001));
    }
    expect(h.length).toBe(HISTORY_RETENTION_DAYS);
    // conserva almeno 365 giorni
    expect(h.length).toBeGreaterThanOrEqual(365);
  });
});

describe('computeTrend', () => {
  it('restituisce null con meno di 2 punti', () => {
    expect(computeTrend([pt('2026-07-30', 1.9)], 'benzina')).toBeNull();
  });

  it('rileva un aumento sopra soglia', () => {
    const h = [pt('2026-07-23', 1.9), pt('2026-07-30', 1.95)];
    const t = computeTrend(h, 'benzina')!;
    expect(t.direction).toBe('up');
    expect(t.deltaCents).toBeCloseTo(5, 1);
  });

  it('rileva un calo sopra soglia', () => {
    const h = [pt('2026-07-23', 1.95), pt('2026-07-30', 1.9)];
    const t = computeTrend(h, 'benzina')!;
    expect(t.direction).toBe('down');
    expect(t.deltaCents).toBeCloseTo(-5, 1);
  });

  it('classifica come flat variazioni piccole', () => {
    const h = [pt('2026-07-23', 1.9), pt('2026-07-30', 1.905)];
    const t = computeTrend(h, 'benzina')!;
    expect(t.direction).toBe('flat');
  });

  it('usa ~7 giorni fa quando la serie è abbastanza lunga', () => {
    const h: HistoryPoint[] = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(Date.UTC(2026, 6, 20) + i * 86_400_000)
        .toISOString()
        .slice(0, 10);
      h.push(pt(d, 1.8 + i * 0.01));
    }
    const t = computeTrend(h, 'benzina')!;
    expect(t.daysBack).toBe(7);
    expect(t.points).toBe(10);
  });
});

describe('buildHistoryPoint', () => {
  it('estrae le medie self e served dalle statistiche', () => {
    const stats: NationalStats = {
      benzina: {
        self: { count: 2, mean: 1.9, median: 1.9, min: 1.8, max: 2.0 },
        served: { count: 1, mean: 2.0, median: 2.0, min: 2.0, max: 2.0 },
      },
    };
    const p = buildHistoryPoint('2026-07-30', stats);
    expect(p.self.benzina).toBe(1.9);
    expect(p.served.benzina).toBe(2.0);
  });
});
