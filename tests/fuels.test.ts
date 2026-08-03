import { describe, it, expect } from 'vitest';
import { classifyFuel } from '../scripts/lib/fuels.ts';

describe('classifyFuel', () => {
  it('classifica le benzine base', () => {
    expect(classifyFuel('Benzina')).toBe('benzina');
    expect(classifyFuel('BENZINA')).toBe('benzina');
    expect(classifyFuel('  benzina  ')).toBe('benzina');
  });

  it('classifica i gasoli base', () => {
    expect(classifyFuel('Gasolio')).toBe('gasolio');
    expect(classifyFuel('Diesel')).toBe('gasolio');
    expect(classifyFuel('Gasolio Ecologico')).toBe('gasolio');
  });

  it('classifica GPL e metano', () => {
    expect(classifyFuel('GPL')).toBe('gpl');
    expect(classifyFuel('Gpl')).toBe('gpl');
    expect(classifyFuel('Metano')).toBe('metano');
    expect(classifyFuel('GNC')).toBe('metano');
  });

  it('riconosce le varianti premium della benzina', () => {
    expect(classifyFuel('Benzina Plus')).toBe('benzina_plus');
    expect(classifyFuel('V-Power')).toBe('benzina_plus'); // niente "benzina"? vedi nota
  });

  it('riconosce le varianti premium del gasolio', () => {
    expect(classifyFuel('Blue Diesel')).toBe('diesel_plus');
    expect(classifyFuel('Hi-Q Diesel')).toBe('diesel_plus');
    expect(classifyFuel('Gasolio Premium')).toBe('diesel_plus');
    expect(classifyFuel('Diesel Excellium')).toBe('diesel_plus');
    expect(classifyFuel('Gasolio Oro')).toBe('diesel_plus');
  });

  it('NON tratta come premium un "100" dentro un codice prodotto', () => {
    // "Gasolio Art100Bis" non deve diventare diesel_plus: "100" non è isolato.
    expect(classifyFuel('Gasolio Art100Bis')).toBe('gasolio');
  });

  it('tratta "100" isolato come indicatore di ottani premium', () => {
    expect(classifyFuel('Benzina 100')).toBe('benzina_plus');
  });

  it('NON confonde "blu" come sottostringa non pertinente', () => {
    // "Gasolioblunotte" non contiene "blu" come parola isolata.
    expect(classifyFuel('Gasolioblunotte')).toBe('gasolio');
  });

  it('classifica l\'HVO (diesel rinnovabile) in categoria propria', () => {
    // descrizioni reali osservate nel dataset MIMIT 2026
    expect(classifyFuel('HVO')).toBe('hvo');
    expect(classifyFuel('HVO100')).toBe('hvo');
    expect(classifyFuel('HVOlution')).toBe('hvo');
    expect(classifyFuel('HVO Future')).toBe('hvo');
    expect(classifyFuel('BCHVO')).toBe('hvo');
    expect(classifyFuel('HVO Diesel')).toBe('hvo'); // NON deve finire in gasolio
  });

  it('non confonde il gasolio normale con l\'HVO', () => {
    expect(classifyFuel('Gasolio')).toBe('gasolio');
    expect(classifyFuel('Diesel')).toBe('gasolio');
  });

  it('mappa i nomi commerciali premium reali del dataset su benzina_plus', () => {
    // nomi realmente osservati nel dataset MIMIT 2026
    expect(classifyFuel('Blue Super')).toBe('benzina_plus');
    expect(classifyFuel('HiQ Perform+')).toBe('benzina_plus');
    expect(classifyFuel('HiQ Perform B100 Ottani')).toBe('benzina_plus');
    expect(classifyFuel('Verde speciale')).toBe('benzina_plus');
  });

  it('lascia null i codici prodotto non identificabili (F101)', () => {
    // meglio nel report anomalie che indovinare un carburante
    expect(classifyFuel('F101')).toBeNull();
    expect(classifyFuel('F-101')).toBeNull();
  });

  it('restituisce null per descrizioni sconosciute', () => {
    expect(classifyFuel('Idrogeno')).toBeNull();
    expect(classifyFuel('Elettrico')).toBeNull();
    expect(classifyFuel('')).toBeNull();
    expect(classifyFuel(null)).toBeNull();
    expect(classifyFuel(undefined)).toBeNull();
  });
});
