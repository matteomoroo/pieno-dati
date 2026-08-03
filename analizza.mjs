/**
 * Script di analisi una-tantum: elenca TUTTE le descrizioni carburante del
 * dataset MIMIT che il classificatore attuale NON riconosce, ordinate per
 * frequenza. Serve a decidere, su dati reali, quali nomi commerciali mappare.
 *
 * Uso:
 *   node --experimental-strip-types analizza.mjs
 *
 * Scarica direttamente dal MIMIT (come fa la pipeline).
 */
import { classifyFuel } from './scripts/lib/fuels.ts';

const PREZZI_URL =
  'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';

const res = await fetch(PREZZI_URL, {
  headers: { 'User-Agent': 'pieno-analisi/1.0' },
});
const text = await res.text();
const lines = text.split(/\r?\n/);
const header = lines[1].split('|').map((h) => h.trim());
const descIdx = header.indexOf('descCarburante');

const counts = new Map();
for (let i = 2; i < lines.length; i++) {
  if (!lines[i]) continue;
  const cols = lines[i].split('|');
  const desc = (cols[descIdx] || '').trim();
  if (!desc) continue;
  if (classifyFuel(desc) === null) {
    counts.set(desc, (counts.get(desc) || 0) + 1);
  }
}

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\nDescrizioni NON riconosciute: ${sorted.length} distinte\n`);
console.log('conteggio | descrizione');
console.log('----------|------------');
for (const [desc, n] of sorted) {
  console.log(`${String(n).padStart(9)} | ${desc}`);
}
