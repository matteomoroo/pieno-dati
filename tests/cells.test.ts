import { describe, it, expect } from 'vitest';
import {
  buildCells,
  cellKey,
  cellKeysForRadius,
  compactStation,
  CELL_SIZE,
} from '../scripts/lib/cells.ts';
import type { Station } from '../src/types/pieno.ts';

function station(overrides: Partial<Station> = {}): Station {
  return {
    id: '1',
    name: 'Distributore',
    brand: 'Eni',
    comune: 'Milano',
    provincia: 'MI',
    lat: 45.4642,
    lng: 9.19,
    fuels: { benzina: { self: 1.899, served: 2.019, updatedAt: '' } },
    ...overrides,
  } as Station;
}

describe('celle geografiche', () => {
  it('assegna le coordinate alla cella che le contiene', () => {
    expect(cellKey(45.4642, 9.19)).toBe('45_9');
    expect(cellKey(41.9028, 12.4964)).toBe('41_12');
  });

  it('gestisce le coordinate negative senza saltare cella', () => {
    // Math.floor(-0.5) = -1: la cella deve essere quella inferiore.
    expect(cellKey(45.5, -0.5)).toBe('45_-1');
  });

  it('copre il raggio richiesto con una finestra di celle contigue', () => {
    const keys = cellKeysForRadius(45.4642, 9.19, 15);
    expect(keys).toContain('45_9');
    // Un raggio di 15 km non può richiedere più di una finestra 2x2 di celle
    // da 1 grado, quindi al massimo quattro chiavi.
    expect(keys.length).toBeLessThanOrEqual(4);
  });

  it('include le celle adiacenti quando il punto è vicino a un bordo', () => {
    // 45.995 è a circa 550 m dal confine con la cella 46.
    const keys = cellKeysForRadius(45.995, 9.5, 15);
    expect(keys).toContain('45_9');
    expect(keys).toContain('46_9');
  });

  it('non perde stazioni nel partizionamento', () => {
    const stations = [
      station({ id: 'a', lat: 45.4, lng: 9.1 }),
      station({ id: 'b', lat: 41.9, lng: 12.5 }),
      station({ id: 'c', lat: 45.6, lng: 9.4 }),
    ];
    const { index, files } = buildCells(stations, '2026-08-20', 2);

    const total = [...files.values()].reduce((n, f) => n + f.stations.length, 0);
    expect(total).toBe(3);
    expect(index.cells).toHaveLength(files.size);
    expect(index.cellSize).toBe(CELL_SIZE);
  });

  it('scarta le stazioni senza coordinate valide invece di creare celle NaN', () => {
    const stations = [
      station({ id: 'ok' }),
      station({ id: 'rotta', lat: Number.NaN, lng: 9.2 }),
    ];
    const { index, files } = buildCells(stations, '2026-08-20', 2);
    expect(index.cells).toEqual(['45_9']);
    expect(files.get('45_9')?.stations).toHaveLength(1);
  });

  it('non genera celle vuote', () => {
    const { files } = buildCells([station()], '2026-08-20', 2);
    for (const file of files.values()) {
      expect(file.stations.length).toBeGreaterThan(0);
    }
  });

  it('comprime i prezzi in millesimi senza perdita significativa', () => {
    const compact = compactStation(station());
    const prices = compact[7];
    const benzina = prices[0];
    expect(benzina).not.toBe(0);
    if (benzina !== 0) {
      expect(benzina[0]).toBe(1899);
      expect(benzina[1]).toBe(2019);
    }
  });

  it('conserva le coordinate con precisione sufficiente', () => {
    const compact = compactStation(station({ lat: 45.46421, lng: 9.19004 }));
    expect(compact[1] / 1e5).toBeCloseTo(45.46421, 5);
    expect(compact[2] / 1e5).toBeCloseTo(9.19004, 5);
  });

  it('rappresenta i carburanti assenti come 0 invece che come tupla vuota', () => {
    const compact = compactStation(station({ fuels: {} } as Partial<Station>));
    expect(compact[7].every((p) => p === 0)).toBe(true);
  });
});
