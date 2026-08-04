/**
 * Parser dei CSV MIMIT (formato pipe-delimited).
 *
 * Struttura reale dei file MIMIT:
 *   riga 0: una riga di intestazione con la data di estrazione, es.
 *           "Estrazione del 2026-07-30 ..." (contiene una data ISO);
 *   riga 1: header dei campi separati da "|";
 *   righe 2+: i record.
 *
 * Il parser vecchio faceva split('|') senza mai verificare che il separatore
 * o l'header fossero quelli attesi. Se il MIMIT cambia formato, quel codice
 * produce silenziosamente oggetti con campi undefined. Qui invece VALIDIAMO
 * l'header e lanciamo un errore comprensibile, così il job fallisce prima di
 * pubblicare dati corrotti.
 */

export interface ParsedCsv {
  /** Data di estrazione estratta dalla prima riga (YYYY-MM-DD) o null. */
  extractionDate: string | null;
  /** Header rilevato. */
  header: string[];
  /** Righe come oggetti chiave->valore. */
  rows: Record<string, string>[];
}

export interface CsvExpectation {
  /** Campi che DEVONO essere presenti nell'header. */
  requiredColumns: string[];
  /** Numero minimo plausibile di righe dati (guardia anti-troncamento). */
  minRows: number;
  /** Nome del file, per messaggi d'errore. */
  label: string;
}

const ISO_DATE = /(\d{4}-\d{2}-\d{2})/;

/**
 * Esegue il parsing di un CSV MIMIT pipe-delimited e ne valida la struttura.
 * @throws Error con messaggio chiaro se il formato non è quello atteso.
 */
export function parseMimitCsv(text: string, expect: CsvExpectation): ParsedCsv {
  if (!text || text.trim().length === 0) {
    throw new Error(`[${expect.label}] file vuoto o non scaricato`);
  }

  const lines = text.split(/\r?\n/);
  if (lines.length < 3) {
    throw new Error(
      `[${expect.label}] troppe poche righe (${lines.length}): il file sembra troncato`,
    );
  }

  const extractionMatch = lines[0].match(ISO_DATE);
  const extractionDate = extractionMatch ? extractionMatch[1] : null;

  // Verifica del separatore: la riga header DEVE contenere delle pipe.
  if (!lines[1].includes('|')) {
    throw new Error(
      `[${expect.label}] separatore inatteso: la riga header non contiene '|'. ` +
        `Il formato della fonte potrebbe essere cambiato.`,
    );
  }

  const header = lines[1].split('|').map((h) => h.trim());

  // Validazione delle colonne obbligatorie.
  const missing = expect.requiredColumns.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `[${expect.label}] colonne mancanti nell'header: ${missing.join(', ')}. ` +
        `Header trovato: ${header.join(', ')}`,
    );
  }

  const rows: Record<string, string>[] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split('|');
    const obj: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      // Rimuove tab e spazi spuri (il vecchio output aveva "\t" nei nomi).
      obj[header[j]] = (cols[j] ?? '').replace(/\t/g, ' ').trim();
    }
    rows.push(obj);
  }

  if (rows.length < expect.minRows) {
    throw new Error(
      `[${expect.label}] solo ${rows.length} righe dati, meno del minimo ` +
        `plausibile (${expect.minRows}). Possibile fonte incompleta o cambiata.`,
    );
  }

  return { extractionDate, header, rows };
}
