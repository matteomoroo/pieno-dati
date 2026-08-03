import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parseMimitCsv } from '../scripts/lib/csv.ts';
import { ingest, type IngestResult } from '../scripts/lib/ingest.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures');

describe('ingest (integrazione su fixture)', () => {
  let result: IngestResult;

  beforeAll(() => {
    const anagText = readFileSync(join(FIX, 'anagrafica.csv'), 'utf8');
    const prezText = readFileSync(join(FIX, 'prezzi.csv'), 'utf8');
    const anag = parseMimitCsv(anagText, {
      label: 'anagrafica',
      requiredColumns: ['idImpianto', 'Latitudine', 'Longitudine', 'Comune', 'Provincia'],
      minRows: 1,
    });
    const prez = parseMimitCsv(prezText, {
      label: 'prezzi',
      requiredColumns: ['idImpianto', 'descCarburante', 'prezzo', 'isSelf'],
      minRows: 1,
    });
    result = ingest({
      anagrafica: anag.rows,
      prezzi: prez.rows,
      extractionDate: anag.extractionDate!,
      generatedAt: '2026-07-30T09:00:00.000Z',
      durationMs: 0,
    });
  });

  it('usa idImpianto MIMIT come id stazione (stringa stabile)', () => {
    const milano = result.stations.find((s) => s.id === '10001');
    expect(milano).toBeDefined();
    expect(typeof milano!.id).toBe('string');
    // niente id incrementali tipo 0,1,2
    expect(result.stations.every((s) => /^\d+$/.test(s.id))).toBe(true);
  });

  it('conserva self e servito SEPARATAMENTE per lo stesso carburante', () => {
    const milano = result.stations.find((s) => s.id === '10001')!;
    expect(milano.fuels.benzina).toEqual(
      expect.objectContaining({ self: 1.899, served: 1.999 }),
    );
    expect(milano.fuels.gasolio).toEqual(
      expect.objectContaining({ self: 1.959, served: 2.059 }),
    );
  });

  it('classifica correttamente le varianti premium', () => {
    const milano = result.stations.find((s) => s.id === '10001')!;
    expect(milano.fuels.diesel_plus?.self).toBe(2.159); // "Blue Diesel"
    const agrigento = result.stations.find((s) => s.id === '10002')!;
    expect(agrigento.fuels.benzina_plus?.self).toBe(2.199); // "V-Power"
    expect(agrigento.fuels.metano?.self).toBe(1.499);
  });

  it('preserva la comunicazione temporale (updatedAt) se presente', () => {
    const milano = result.stations.find((s) => s.id === '10001')!;
    expect(milano.fuels.benzina?.updatedAt).toBe('2026-07-30T06:00:00');
  });

  it('esclude le stazioni con coordinate estere (Parigi)', () => {
    expect(result.stations.find((s) => s.id === '10005')).toBeUndefined();
    expect(result.report.rejections.outOfBoundsCoords).toBeGreaterThanOrEqual(1);
  });

  it('esclude le stazioni senza alcun prezzo valido', () => {
    // 99999 è in anagrafica ma non ha prezzi -> non pubblicata
    expect(result.stations.find((s) => s.id === '99999')).toBeUndefined();
  });

  it('scarta i prezzi fuori range e li conta nel report', () => {
    const torino = result.stations.find((s) => s.id === '10003')!;
    // benzina 99,999 scartata, resta solo gasolio
    expect(torino.fuels.benzina).toBeUndefined();
    expect(torino.fuels.gasolio?.self).toBe(1.929);
    expect(result.report.rejections.priceOutOfRange).toBeGreaterThanOrEqual(1);
  });

  it('conta i carburanti non riconosciuti e ne campiona le descrizioni', () => {
    expect(result.report.rejections.unknownFuel).toBeGreaterThanOrEqual(1);
    expect(result.report.unknownFuelSamples).toContain('Idrogeno');
  });

  it('conta i prezzi non numerici', () => {
    expect(result.report.rejections.nonNumericPrice).toBeGreaterThanOrEqual(1);
  });

  it('conta i prezzi con idImpianto inesistente in anagrafica', () => {
    // 77777 non è in anagrafica
    expect(result.report.rejections.missingStation).toBeGreaterThanOrEqual(1);
  });

  it('pulisce i nomi spazzatura usando brand + comune', () => {
    const torino = result.stations.find((s) => s.id === '10003')!;
    // nome "123" era spazzatura -> fallback
    expect(torino.name).toContain('Torino');
  });

  it('produce un output deterministico ordinato per id', () => {
    const ids = result.stations.map((s) => s.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it('il report riassume righe ricevute e prodotte', () => {
    expect(result.report.rows.anagraficaReceived).toBeGreaterThan(0);
    expect(result.report.rows.prezziReceived).toBeGreaterThan(0);
    expect(result.report.rows.stationsProduced).toBe(result.stations.length);
  });
});

describe('parseMimitCsv (validazione formato)', () => {
  it('lancia errore chiaro se manca una colonna obbligatoria', () => {
    const bad = 'Estrazione del 2026-07-30\nidImpianto|prezzo\n1|1,9';
    expect(() =>
      parseMimitCsv(bad, {
        label: 'prezzi',
        requiredColumns: ['idImpianto', 'descCarburante', 'prezzo', 'isSelf'],
        minRows: 1,
      }),
    ).toThrow(/colonne mancanti/);
  });

  it('lancia errore se il separatore non è pipe', () => {
    const bad = 'Estrazione del 2026-07-30\nidImpianto,prezzo\n1,1.9';
    expect(() =>
      parseMimitCsv(bad, {
        label: 'prezzi',
        requiredColumns: ['idImpianto'],
        minRows: 1,
      }),
    ).toThrow(/separatore/);
  });

  it('lancia errore se ci sono troppe poche righe', () => {
    const bad = 'Estrazione del 2026-07-30\nidImpianto|prezzo\n1|1,9';
    expect(() =>
      parseMimitCsv(bad, {
        label: 'prezzi',
        requiredColumns: ['idImpianto'],
        minRows: 1000,
      }),
    ).toThrow(/troppe poche righe|meno del minimo/);
  });
});
