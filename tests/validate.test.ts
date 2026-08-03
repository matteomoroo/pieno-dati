import { describe, it, expect } from 'vitest';
import {
  isValidCoord,
  parsePrice,
  isPriceInRange,
  isValidStationId,
  isValidExtractionDate,
} from '../scripts/lib/validate.ts';

describe('isValidCoord', () => {
  it('accetta coordinate italiane', () => {
    expect(isValidCoord(45.4668, 9.1904)).toBe(true); // Milano
    expect(isValidCoord(37.2982, 13.5898)).toBe(true); // Agrigento
    expect(isValidCoord(39.2153, 9.1106)).toBe(true); // Cagliari
  });
  it('rifiuta coordinate estere o assurde', () => {
    expect(isValidCoord(48.8566, 2.352)).toBe(false); // Parigi
    expect(isValidCoord(0, 0)).toBe(false);
    expect(isValidCoord(NaN, 9)).toBe(false);
    expect(isValidCoord(45, NaN)).toBe(false);
  });
});

describe('parsePrice', () => {
  it('gestisce virgola e punto decimale', () => {
    expect(parsePrice('1,899')).toBeCloseTo(1.899);
    expect(parsePrice('1.899')).toBeCloseTo(1.899);
  });
  it('restituisce null per input non numerici o vuoti', () => {
    expect(parsePrice('non-numerico')).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
});

describe('isPriceInRange', () => {
  it('accetta prezzi plausibili', () => {
    expect(isPriceInRange('benzina', 1.899)).toBe(true);
    expect(isPriceInRange('gpl', 0.699)).toBe(true);
  });
  it('rifiuta prezzi fuori scala', () => {
    expect(isPriceInRange('benzina', 99.999)).toBe(false);
    expect(isPriceInRange('benzina', 0.5)).toBe(false);
    expect(isPriceInRange('gpl', 2.5)).toBe(false);
  });
});

describe('isValidStationId', () => {
  it('accetta id numerici', () => {
    expect(isValidStationId('10001')).toBe(true);
    expect(isValidStationId(' 42 ')).toBe(true);
  });
  it('rifiuta id vuoti o non numerici', () => {
    expect(isValidStationId('')).toBe(false);
    expect(isValidStationId('abc')).toBe(false);
    expect(isValidStationId(null)).toBe(false);
    expect(isValidStationId(undefined)).toBe(false);
  });
});

describe('isValidExtractionDate', () => {
  it('accetta date ISO reali', () => {
    expect(isValidExtractionDate('2026-07-30')).toBe(true);
  });
  it('rifiuta formati o date non valide', () => {
    expect(isValidExtractionDate('30/07/2026')).toBe(false);
    expect(isValidExtractionDate('2026-13-01')).toBe(false);
    expect(isValidExtractionDate('')).toBe(false);
    expect(isValidExtractionDate(null)).toBe(false);
  });
});
