/**
 * Pieno — ingest MIMIT (gira su GitHub Actions, gratis, senza limiti di CPU)
 * ---------------------------------------------------------------------------
 * Ogni mattina:
 *   1. scarica i due CSV ufficiali del MIMIT (anagrafica + prezzi)
 *   2. li unisce, pulisce gli errori dei gestori, calcola le medie di oggi
 *   3. aggiorna una cronologia delle medie degli ultimi giorni (history.json)
 *   4. calcola la TENDENZA reale (sale/scende/stabile) da quella cronologia
 *   5. genera le NOTIZIE dai dati stessi (sempre aggiornate, niente fonti esterne)
 *
 * Produce in /public:
 *   • stations.json  -> distributori con prezzi
 *   • meta.json      -> data, conteggi, medie, tendenza, notizie
 *   • history.json   -> cronologia medie giornaliere (per calcolare la tendenza)
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';

const ANAGRAFICA = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
const PREZZI     = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';

const BOUNDS = {
  benzina:[1.4,2.7], gasolio:[1.4,2.8], gpl:[0.5,1.3],
  metano:[0.8,2.6], benzina_plus:[1.6,2.9], diesel_plus:[1.6,3.0],
};
const FUEL_LABEL = {
  benzina:'Benzina', gasolio:'Gasolio', gpl:'GPL', metano:'Metano',
  benzina_plus:'Benzina Plus', diesel_plus:'Diesel Plus',
};
const HISTORY_DAYS = 14;   // quanti giorni di cronologia teniamo

function fuelKey(desc) {
  const d = (desc || '').toLowerCase();
  const premium = /(plus|special|premium|v-?power|blu|energy|excellium|hi-?q|oro|artic|100|efficient|racing)/.test(d);
  if (d.includes('benzina')) return premium ? 'benzina_plus' : 'benzina';
  if (d.includes('gasolio') || d.includes('diesel')) return premium ? 'diesel_plus' : 'gasolio';
  if (d.includes('gpl')) return 'gpl';
  if (d.includes('metano') || d.includes('gnc')) return 'metano';
  return null;
}
function titleCase(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1).toLowerCase() : s; }

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

/* ---- TENDENZA: confronta la media di oggi con quella di N giorni fa ---- */
function computeTrend(history, fuel) {
  // history: [{date, averages:{...}}, ...] ordinata dal più vecchio al più recente
  const series = history
    .map(h => ({ date: h.date, v: h.averages[fuel] }))
    .filter(p => p.v != null);
  if (series.length < 2) return null;

  const today = series[series.length - 1].v;
  // punto di riferimento: ~7 giorni fa, o il più vecchio disponibile
  const ref = series.length >= 8 ? series[series.length - 8] : series[0];
  const deltaWeek = +( (today - ref.v) * 100 ).toFixed(1);   // centesimi su ~7 giorni
  const daysBack = series.length >= 8 ? 7 : (series.length - 1);

  // direzione: guarda la variazione settimanale
  let dir;
  if (deltaWeek >= 1.0) dir = 'up';
  else if (deltaWeek <= -1.0) dir = 'down';
  else dir = 'flat';

  // "score" normalizzato per l'app: da -1 (forte calo) a +1 (forte rialzo)
  const score = Math.max(-1, Math.min(1, deltaWeek / 8));

  return { dir, deltaWeek, daysBack, score, today, ref: ref.v, points: series.length };
}

/* ---- NOTIZIE generate dai dati ---- */
function buildNews(trends, averages, extraction) {
  const news = [];
  const it = new Intl.DateTimeFormat('it-IT', { day:'numeric', month:'long', year:'numeric' });
  const dateLabel = extraction ? it.format(new Date(extraction)) : '';

  const arrow = d => d === 'up' ? 'in rialzo' : d === 'down' ? 'in calo' : 'stabile';
  const sign  = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1);

  // notizia principale: benzina
  const b = trends.benzina;
  if (b) {
    news.push({
      h: `Benzina ${arrow(b.dir)}: ${sign(b.deltaWeek)}¢ in ${b.daysBack} giorni`,
      b: `La media nazionale della benzina self è ${averages.benzina?.toFixed(3)} €/L ` +
         `(rilevazione del ${dateLabel}). Negli ultimi ${b.daysBack} giorni è passata da ` +
         `${b.ref.toFixed(3)} a ${b.today.toFixed(3)} €/L. ` +
         (b.dir==='up' ? 'Trend in salita: non aspettarti cali a breve, punta sulla pompa più conveniente.' :
          b.dir==='down' ? 'Trend in discesa: momento tutto sommato favorevole.' :
          'Prezzi sostanzialmente fermi in questi giorni.'),
    });
  }
  // notizia gasolio
  const g = trends.gasolio;
  if (g) {
    news.push({
      h: `Gasolio ${arrow(g.dir)}: ${sign(g.deltaWeek)}¢ in ${g.daysBack} giorni`,
      b: `La media nazionale del gasolio self è ${averages.gasolio?.toFixed(3)} €/L. ` +
         `Nell'ultima settimana ${g.dir==='down' ? 'è sceso' : g.dir==='up' ? 'è salito' : 'è rimasto stabile'} ` +
         `di ${Math.abs(g.deltaWeek).toFixed(1)} centesimi (da ${g.ref.toFixed(3)} a ${g.today.toFixed(3)} €/L).`,
    });
  }
  // notizia di sintesi sugli altri carburanti, se presenti
  const others = ['gpl','metano'].map(k => trends[k] ? `${FUEL_LABEL[k]} ${arrow(trends[k].dir)}` : null).filter(Boolean);
  if (others.length) {
    news.push({
      h: 'Gli altri carburanti',
      b: `${others.join(', ')}. I prezzi mostrati sono quelli comunicati dai gestori al MIMIT, ` +
         `in vigore alle 8 del mattino del ${dateLabel}.`,
    });
  }
  return news;
}

async function main() {
  console.log('Scarico i CSV MIMIT…');
  const [anagText, prezText] = await Promise.all([download(ANAGRAFICA), download(PREZZI)]);
  const anag = parseCsvPipe(anagText);
  const prez = parseCsvPipe(prezText);
  const extraction = prez.extraction || anag.extraction;
  console.log(`Anagrafica: ${anag.rows.length} righe. Prezzi: ${prez.rows.length} righe. Estrazione: ${extraction}`);

  // --- anagrafica ---
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

  // --- prezzi ---
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

  // --- array finale + medie ---
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

  // --- CRONOLOGIA: leggi quella esistente, aggiungi oggi, tieni ultimi N giorni ---
  mkdirSync('public', { recursive: true });
  let history = [];
  if (existsSync('public/history.json')) {
    try { history = JSON.parse(readFileSync('public/history.json', 'utf8')); } catch {}
  }
  // rimuovi eventuale voce di oggi già presente (rilancio dello stesso giorno)
  history = history.filter(h => h.date !== extraction);
  history.push({ date: extraction, averages });
  history.sort((a, b) => a.date.localeCompare(b.date));
  if (history.length > HISTORY_DAYS) history = history.slice(-HISTORY_DAYS);

  // --- TENDENZA per ogni carburante ---
  const trends = {};
  for (const k of Object.keys(averages)) {
    const t = computeTrend(history, k);
    if (t) trends[k] = t;
  }

  // --- NOTIZIE dai dati ---
  const news = buildNews(trends, averages, extraction);

  const meta = {
    extraction,
    updatedAt: new Date().toISOString(),
    total: stations.length,
    counts, averages, trends, news,
    historyPoints: history.length,
    source: 'MIMIT — Osservaprezzi Carburanti (IODL 2.0)',
  };

  writeFileSync('public/stations.json', JSON.stringify(stations));
  writeFileSync('public/meta.json', JSON.stringify(meta, null, 2));
  writeFileSync('public/history.json', JSON.stringify(history, null, 2));

  console.log(`\nFatto. ${stations.length} distributori. Cronologia: ${history.length} giorni.`);
  for (const k of Object.keys(counts)) {
    const t = trends[k];
    const tr = t ? `${t.dir} ${t.deltaWeek>=0?'+':''}${t.deltaWeek}¢/${t.daysBack}gg` : 'n/d';
    console.log(`  ${k.padEnd(13)} n=${String(counts[k]).padStart(5)} media=${averages[k]}  tendenza=${tr}`);
  }
}

main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
