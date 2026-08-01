/**
 * Pieno — ingest MIMIT (gira su GitHub Actions, gratis, senza limiti di CPU)
 * ---------------------------------------------------------------------------
 * Scarica i due CSV ufficiali del MIMIT, li unisce, pulisce gli errori dei
 * gestori e scrive due file statici in /public:
 *   • stations.json  -> tutti i distributori con i prezzi
 *   • meta.json      -> data estrazione, conteggi, medie per carburante
 *
 * Questi file vengono poi serviti da GitHub Pages / jsDelivr (CDN gratuita).
 * Il workflow li rigenera e committa ogni mattina.
 */

import { writeFileSync, mkdirSync } from 'node:fs';

const ANAGRAFICA = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
const PREZZI     = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';

// range plausibili: scartano gli errori di comunicazione dei gestori
const BOUNDS = {
  benzina:[1.4,2.7], gasolio:[1.4,2.8], gpl:[0.5,1.3],
  metano:[0.8,2.6], benzina_plus:[1.6,2.9], diesel_plus:[1.6,3.0],
};

function fuelKey(desc) {
  const d = (desc || '').toLowerCase();
  const premium = /(plus|special|premium|v-?power|blu|energy|excellium|hi-?q|oro|artic|100|efficient|racing)/.test(d);
  if (d.includes('benzina')) return premium ? 'benzina_plus' : 'benzina';
  if (d.includes('gasolio') || d.includes('diesel')) return premium ? 'diesel_plus' : 'gasolio';
  if (d.includes('gpl')) return 'gpl';
  if (d.includes('metano') || d.includes('gnc')) return 'metano';
  return null;
}

function titleCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function parseCsvPipe(text) {
  const lines = text.split('\n');
  let extraction = null;
  const m = lines[0].match(/(\d{4}-\d{2}-\d{2})/);
  if (m) extraction = m[1];
  const header = lines[1].split('|').map(h => h.trim());
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split('|');
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = (cols[j] || '').trim();
    rows.push(obj);
  }
  return { extraction, rows };
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'pieno-ingest/1.0' } });
  if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  return res.text();
}

async function main() {
  console.log('Scarico i CSV MIMIT…');
  const [anagText, prezText] = await Promise.all([download(ANAGRAFICA), download(PREZZI)]);

  const anag = parseCsvPipe(anagText);
  const prez = parseCsvPipe(prezText);
  console.log(`Anagrafica: ${anag.rows.length} righe (${anag.extraction}). Prezzi: ${prez.rows.length} righe (${prez.extraction}).`);

  // anagrafica: idImpianto -> impianto (solo dentro l'Italia)
  const imp = new Map();
  for (const r of anag.rows) {
    const lat = parseFloat(r['Latitudine']), lon = parseFloat(r['Longitudine']);
    if (!(lat > 35 && lat < 47.5 && lon > 6 && lon < 19)) continue;
    let name = (r['Nome Impianto'] || '').trim();
    const brand = (r['Bandiera'] || r['Gestore'] || 'Distributore').trim();
    const comune = titleCase((r['Comune'] || '').trim());
    if (!name || /^[\d\W]+$/.test(name) || name.length < 3) name = `${brand} · ${comune}`;
    imp.set(r['idImpianto'], {
      b: brand.slice(0, 26), n: name.slice(0, 48), c: comune,
      p: (r['Provincia'] || '').trim(), la: +lat.toFixed(5), lo: +lon.toFixed(5),
      f: {}, srv: new Set(),
    });
  }

  // prezzi: preferisci il self
  for (const r of prez.rows) {
    const s = imp.get(r['idImpianto']);
    if (!s) continue;
    const k = fuelKey(r['descCarburante']);
    if (!k) continue;
    const price = parseFloat(r['prezzo']);
    if (!(price > 0 && price < 5)) continue;
    const isSelf = r['isSelf'] === '1';
    if (s.f[k] == null || isSelf) s.f[k] = +price.toFixed(3);
    s.srv.add(isSelf ? 'self' : 'servito');
  }

  // costruisci array finale + pulisci outlier + statistiche
  const stations = [];
  let id = 0;
  const sums = {}, counts = {};
  for (const s of imp.values()) {
    for (const k of Object.keys(s.f)) {
      const [lo, hi] = BOUNDS[k] || [0, 99];
      if (s.f[k] < lo || s.f[k] > hi) delete s.f[k];
    }
    if (!Object.keys(s.f).length) continue;
    const served = s.srv.size === 2 ? 'self+servito' : (s.srv.has('self') ? 'self' : 'servito');
    stations.push({ id: id++, b: s.b, n: s.n, c: s.c, p: s.p, la: s.la, lo: s.lo, f: s.f, s: served });
    for (const [k, v] of Object.entries(s.f)) { sums[k] = (sums[k]||0)+v; counts[k] = (counts[k]||0)+1; }
  }

  const averages = {};
  for (const k of Object.keys(sums)) averages[k] = +(sums[k] / counts[k]).toFixed(4);

  const meta = {
    extraction: prez.extraction || anag.extraction,
    updatedAt: new Date().toISOString(),
    total: stations.length,
    counts, averages,
    source: 'MIMIT — Osservaprezzi Carburanti (IODL 2.0)',
  };

  mkdirSync('public', { recursive: true });
  writeFileSync('public/stations.json', JSON.stringify(stations));
  writeFileSync('public/meta.json', JSON.stringify(meta, null, 2));

  console.log(`\nFatto. ${stations.length} distributori.`);
  for (const k of Object.keys(counts)) console.log(`  ${k.padEnd(13)} n=${String(counts[k]).padStart(5)}  media=${averages[k]}`);
}

main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
