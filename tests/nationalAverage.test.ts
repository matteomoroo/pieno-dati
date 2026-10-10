import { describe, it, expect } from 'vitest';
import {
  buildAverageTable,
  averageFor,
  averageLabel,
  formatAverage,
} from '../src/lib/data/nationalAverage.ts';
import { FUEL_DISPLAY_ORDER, FUEL_UI_LABELS } from '../src/lib/data/fuels-ui.ts';
import type { NationalStats } from '../src/types/pieno.ts';

const stat = (mean: number, count = 10) => ({ count, mean, median: mean, min: mean, max: mean });

const stats: NationalStats = {
  benzina: { self: stat(1.859), served: stat(1.999) },
  gasolio: { self: stat(1.759), served: stat(1.899) },
  gpl: { served: stat(0.699) }, // nessun self
  metano: { self: stat(Number.NaN), served: stat(0, 0) }, // valori non validi
  // benzina_plus, diesel_plus, hvo: assenti
};

describe('media nazionale per carburante', () => {
  const table = buildAverageTable(stats, FUEL_DISPLAY_ORDER);

  it('restituisce la media del carburante richiesto', () => {
    expect(averageFor(table, 'benzina')).toEqual({ self: 1.859, served: 1.999 });
    expect(averageFor(table, 'gasolio')).toEqual({ self: 1.759, served: 1.899 });
  });

  it('non ripiega mai sulla benzina quando manca il dato', () => {
    for (const fuel of ['benzina_plus', 'diesel_plus', 'hvo'] as const) {
      expect(averageFor(table, fuel)).toEqual({ self: null, served: null });
    }
    expect(averageFor(table, 'gpl')).toEqual({ self: null, served: 0.699 });
  });

  it('scarta medie non numeriche, nulle o senza prezzi', () => {
    expect(averageFor(table, 'metano')).toEqual({ self: null, served: null });
  });

  it('regge statistiche assenti', () => {
    const empty = buildAverageTable(undefined, FUEL_DISPLAY_ORDER);
    for (const fuel of FUEL_DISPLAY_ORDER) {
      expect(averageFor(empty, fuel)).toEqual({ self: null, served: null });
    }
    expect(averageFor(null, 'benzina')).toEqual({ self: null, served: null });
  });

  it("l'etichetta nomina il carburante selezionato", () => {
    expect(averageLabel(FUEL_UI_LABELS.gasolio, true)).toBe('Media nazionale Diesel · self');
    expect(averageLabel(FUEL_UI_LABELS.hvo, true)).toBe('Media nazionale HVO · self');
  });

  it('self assente e servito presente: niente "· self", nessuno scambio di valori', () => {
    const gpl = averageFor(table, 'gpl');
    // Il self resta assente: il servito non viene promosso a media self...
    expect(gpl.self).toBeNull();
    // ...e resta disponibile come dato servito separato.
    expect(gpl.served).toBe(0.699);
    // L'etichetta non dichiara "self" quando il self non c'è.
    const label = averageLabel(FUEL_UI_LABELS.gpl, gpl.self != null);
    expect(label).toBe('Media nazionale GPL');
    expect(label).not.toMatch(/self/);
  });

  it('formatta in italiano a tre decimali', () => {
    expect(formatAverage(1.8)).toBe('1,800');
  });
});
