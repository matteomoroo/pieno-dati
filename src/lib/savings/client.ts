/**
 * Logica client del calcolatore "dove conviene fare rifornimento".
 * Chiede la posizione (solo su tocco), trova i distributori vicini per il
 * carburante scelto, e mostra dove conviene andare tenendo conto del costo
 * della deviazione. Input minimo: solo il carburante. Litri e consumo hanno
 * default modificabili.
 */
import type { Station, StationsFile, FuelKey } from '../../types/pieno.ts';
import {
  computeBestChoice,
  DEFAULTS,
  ROAD_FACTOR,
  type NearbyStation,
} from './compute.ts';

const SEARCH_RADIUS_KM = 15;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function priceFor(s: Station, fuel: FuelKey): number | null {
  const fp = s.fuels[fuel];
  return fp ? (fp.self ?? fp.served ?? null) : null;
}

function fmt(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPrice(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function initCalculator(dataUrl: string, base: string): void {
  const els = {
    fuel: document.getElementById('calc-fuel') as HTMLSelectElement,
    locate: document.getElementById('calc-locate') as HTMLButtonElement,
    liters: document.getElementById('calc-liters') as HTMLInputElement,
    kmpl: document.getElementById('calc-kmpl') as HTMLInputElement,
    status: document.getElementById('calc-status') as HTMLElement,
    result: document.getElementById('calc-result') as HTMLElement,
  };

  let stations: Station[] | null = null;
  let userPos: { lat: number; lng: number } | null = null;

  async function loadStations(): Promise<Station[]> {
    if (stations) return stations;
    const res = await fetch(dataUrl);
    const file: StationsFile = await res.json();
    stations = file.stations;
    return stations;
  }

  els.locate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      els.status.textContent = 'La geolocalizzazione non è disponibile.';
      return;
    }
    els.status.textContent = 'Individuo la tua posizione…';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        els.status.textContent = 'Posizione trovata. Calcolo…';
        await loadStations();
        recompute();
      },
      () => {
        els.status.textContent =
          'Non è stato possibile ottenere la posizione. Riprova.';
      },
    );
  });

  [els.fuel, els.liters, els.kmpl].forEach((el) =>
    el.addEventListener('change', recompute),
  );

  function recompute(): void {
    if (!userPos || !stations) return;
    const fuel = els.fuel.value as FuelKey;
    const liters = parseFloat(els.liters.value) || DEFAULTS.liters;
    const kmPerLiter = parseFloat(els.kmpl.value) || DEFAULTS.kmPerLiter;

    const nearby: NearbyStation[] = stations
      .map((s) => {
        const price = priceFor(s, fuel);
        if (price == null) return null;
        const crowKm = haversineKm(userPos!.lat, userPos!.lng, s.lat, s.lng);
        if (crowKm > SEARCH_RADIUS_KM) return null;
        return {
          id: s.id,
          slug: `${s.id}-${slugify(s.name || s.brand)}`,
          name: s.name,
          brand: s.brand,
          comune: s.comune,
          price,
          crowKm: Math.round(crowKm * 10) / 10,
        };
      })
      .filter((n): n is NearbyStation => n !== null);

    if (nearby.length === 0) {
      els.result.innerHTML =
        '<p class="calc-empty">Nessun distributore con questo carburante entro 15 km dalla tua posizione.</p>';
      els.status.textContent = '';
      return;
    }

    const { nearest, best, ranked, worthDetour } = computeBestChoice({
      stations: nearby,
      liters,
      kmPerLiter,
    });
    els.status.textContent = '';
    renderResult(nearest!, best!, ranked, worthDetour, liters);
  }

  function renderResult(
    nearest: ReturnType<typeof computeBestChoice>['ranked'][number],
    best: ReturnType<typeof computeBestChoice>['ranked'][number],
    ranked: ReturnType<typeof computeBestChoice>['ranked'],
    worthDetour: boolean,
    liters: number,
  ): void {
    const verdict = worthDetour
      ? `<div class="calc-verdict calc-verdict-yes">
           <span class="calc-verdict-icon">✓</span>
           <div>
             <strong>Conviene andare più lontano.</strong>
             Il distributore più conveniente è <strong>${best.brand} · ${best.name}</strong>
             a ${best.comune}, a circa ${best.roadKm} km (andata e ritorno).
             Rispetto al più vicino risparmi <strong>${fmt(best.netVsNearest)}€</strong>
             sul pieno, già tolto il costo del carburante per arrivarci.
           </div>
         </div>`
      : `<div class="calc-verdict calc-verdict-no">
           <span class="calc-verdict-icon">≈</span>
           <div>
             <strong>Conviene restare vicino.</strong>
             Il distributore più vicino (${nearest.brand} · ${nearest.name})
             è già la scelta migliore: andare più lontano non fa risparmiare
             abbastanza da coprire il carburante della deviazione.
           </div>
         </div>`;

    const rows = ranked
      .slice(0, 6)
      .map((s) => {
        const isBest = s.id === best.id;
        return `<li class="${isBest ? 'calc-row-best' : ''}">
          <a href="${base}/stazione/${s.slug}">${s.brand} · ${s.name}</a>
          <span class="calc-row-meta">
            ${s.crowKm} km · <strong>${fmtPrice(s.price)} €/L</strong>
            · viaggio ${fmt(s.travelCost)}€
          </span>
        </li>`;
      })
      .join('');

    els.result.innerHTML = `
      ${verdict}
      <p class="calc-assumptions">
        Stima su un pieno di ${liters} litri, consumo ${els.kmpl.value} km/l,
        distanze in linea d'aria maggiorate del ${Math.round((ROAD_FACTOR - 1) * 100)}%
        per approssimare il percorso stradale. Valori indicativi.
      </p>
      <h2 class="calc-list-title">Distributori vicini per costo totale</h2>
      <ul class="calc-list">${rows}</ul>`;
  }
}
