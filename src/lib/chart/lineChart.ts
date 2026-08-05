/**
 * Costruttore di grafico a linee in SVG puro (nessuna libreria).
 * Leggero, adatto a un grafico storico dei prezzi medi. Genera il markup SVG
 * da una serie di punti {date, value}.
 */

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface ChartOptions {
  width?: number;
  height?: number;
  color?: string;
}

export function lineChartSvg(
  series: SeriesPoint[],
  opts: ChartOptions = {},
): string {
  const w = opts.width ?? 640;
  const h = opts.height ?? 220;
  const color = opts.color ?? 'var(--accent)';
  const padL = 48;
  const padR = 12;
  const padT = 12;
  const padB = 28;

  if (series.length < 2) {
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Grafico non disponibile">
      <text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="var(--text-faint)" font-size="13">
        Storico insufficiente: servono più giorni di dati
      </text></svg>`;
  }

  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 0.01;
  // margine visivo
  const yMin = min - range * 0.1;
  const yMax = max + range * 0.1;

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const x = (i: number): number => padL + (i / (series.length - 1)) * plotW;
  const y = (v: number): number =>
    padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const linePts = series.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const areaPts =
    `${padL},${padT + plotH} ` +
    linePts +
    ` ${padL + plotW},${padT + plotH}`;

  // etichette asse Y (min, mid, max)
  const yLabels = [yMax, (yMax + yMin) / 2, yMin]
    .map((v) => {
      const yy = y(v);
      return `<text x="${padL - 8}" y="${yy + 4}" text-anchor="end" font-size="10" fill="var(--text-faint)">${v.toFixed(3)}</text>
        <line x1="${padL}" y1="${yy}" x2="${w - padR}" y2="${yy}" stroke="var(--border)" stroke-width="0.5"/>`;
    })
    .join('');

  // etichette asse X (prima e ultima data)
  const first = series[0].date;
  const last = series[series.length - 1].date;
  const xLabels =
    `<text x="${padL}" y="${h - 8}" font-size="10" fill="var(--text-faint)">${first}</text>` +
    `<text x="${w - padR}" y="${h - 8}" text-anchor="end" font-size="10" fill="var(--text-faint)">${last}</text>`;

  // ultimo punto evidenziato
  const lastX = x(series.length - 1);
  const lastY = y(series[series.length - 1].value);

  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Andamento del prezzo medio">
    ${yLabels}
    <polygon points="${areaPts}" fill="${color}" opacity="0.08"/>
    <polyline points="${linePts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="3.5" fill="${color}"/>
    ${xLabels}
  </svg>`;
}
