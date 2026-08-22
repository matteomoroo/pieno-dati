/**
 * Logica client del calcolatore "dove conviene fare rifornimento".
 *
 * Due modalità di posizione, entrambe complete:
 *  - "Usa la mia posizione": il permesso del browser viene chiesto solo dopo
 *    un click esplicito;
 *  - ricerca manuale di una città: nessun obbligo di geolocalizzazione.
 *
 * Il rifiuto del permesso non è più un vicolo cieco: la ricerca manuale resta
 * disponibile e il messaggio lo dice esplicitamente.
 *
 * I dati arrivano dalle celle geografiche (poche decine di KB) invece che dal
 * dataset nazionale da 7 MB.
 */
import type { Station, FuelKey } from '../../types/pieno.ts';
import {
  computeBestChoice,
  DEFAULTS,
  ROAD_FACTOR,
  type NearbyStation,
} from './compute.ts';
import { createCellLoader, DataError } from '../data/cellsClient.ts';
import {
  createPlaceIndexLoader,
  searchPlaces,
  debounce,
  type Place,
} from '../geo/placeSearch.ts';

const SEARCH_RADIUS_KM = 15;
const GEO_TIMEOUT_MS = 10_000;

interface Position {
  lat: number;
  lng: number;
  /** Etichetta mostrata all'utente: "la tua posizione" o "Milano (MI)". */
  label: string;
}

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
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );
}

export function initCalculator(base: string): void {
  const el = <T extends HTMLElement>(id: string): T =>
    document.getElementById(id) as T;

  const els = {
    fuel: el<HTMLSelectElement>('calc-fuel'),
    locate: el<HTMLButtonElement>('calc-locate'),
    search: el<HTMLInputElement>('calc-place'),
    suggestions: el<HTMLUListElement>('calc-suggestions'),
    liters: el<HTMLInputElement>('calc-liters'),
    kmpl: el<HTMLInputElement>('calc-kmpl'),
    status: el<HTMLElement>('calc-status'),
    result: el<HTMLElement>('calc-result'),
    freshness: document.getElementById('calc-freshness'),
  };

  const loadCells = createCellLoader(base);
  const loadPlaces = createPlaceIndexLoader(base);

  let position: Position | null = null;
  let stations: Station[] = [];
  let places: Place[] | null = null;
  let busy = false;

  function setStatus(message: string, tone: 'info' | 'error' = 'info'): void {
    els.status.textContent = message;
    els.status.dataset.tone = tone;
  }

  function setBusy(value: boolean): void {
    busy = value;
    els.locate.disabled = value;
    els.locate.setAttribute('aria-busy', String(value));
  }

  // ---------------------------------------------------------------- posizione

  els.locate.addEventListener('click', () => {
    if (busy) return;

    if (!('geolocation' in navigator)) {
      setStatus(
        'Il tuo browser non offre la geolocalizzazione. Cerca una città qui sotto.',
        'error',
      );
      els.search.focus();
      return;
    }

    setBusy(true);
    setStatus('Sto cercando la tua posizione…');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setStatus(
            'La posizione ricevuta non è valida. Puoi cercare manualmente una città.',
            'error',
          );
          return;
        }
        position = { lat: latitude, lng: longitude, label: 'la tua posizione' };
        els.search.value = '';
        void refresh();
      },
      (err) => {
        setBusy(false);
        // Qualunque sia il motivo, la via d'uscita è sempre la stessa e va detta.
        const reason =
          err.code === err.PERMISSION_DENIED
            ? 'Non hai dato il permesso di usare la posizione.'
            : err.code === err.TIMEOUT
              ? 'La posizione ci sta mettendo troppo.'
              : 'La posizione non è disponibile.';
        setStatus(`${reason} Puoi cercare manualmente una città o un indirizzo.`, 'error');
        els.search.focus();
      },
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 300_000 },
    );
  });

  // ------------------------------------------------------------------ ricerca

  function renderSuggestions(matches: Place[]): void {
    if (matches.length === 0) {
      els.suggestions.innerHTML = '';
      els.suggestions.hidden = true;
      return;
    }
    els.suggestions.innerHTML = matches
      .map(
        (p, i) =>
          `<li role="option" id="calc-opt-${i}" tabindex="-1" data-lat="${p.lat}" data-lng="${p.lng}" data-label="${escapeHtml(`${p.name} (${p.prov})`)}">
             <span>${escapeHtml(p.name)}</span>
             <span class="calc-opt-meta">${escapeHtml(p.prov)} · ${p.count} distributori</span>
           </li>`,
      )
      .join('');
    els.suggestions.hidden = false;
  }

  function choose(item: HTMLElement): void {
    const lat = Number(item.dataset.lat);
    const lng = Number(item.dataset.lng);
    const label = item.dataset.label ?? '';
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    position = { lat, lng, label };
    els.search.value = label;
    els.suggestions.hidden = true;
    els.suggestions.innerHTML = '';
    void refresh();
  }

  const runSearch = debounce(async (query: string) => {
    if (query.trim().length < 2) {
      renderSuggestions([]);
      return;
    }
    try {
      if (!places) places = await loadPlaces();
    } catch {
      setStatus(
        'Non riesco a caricare l’elenco delle città. Riprova tra poco.',
        'error',
      );
      return;
    }
    const matches = searchPlaces(places, query);
    if (matches.length === 0) {
      els.suggestions.innerHTML =
        '<li class="calc-opt-empty" role="option" aria-disabled="true">Nessuna città trovata con questo nome.</li>';
      els.suggestions.hidden = false;
      return;
    }
    renderSuggestions(matches);
  }, 200);

  els.search.addEventListener('input', () => runSearch(els.search.value));

  els.suggestions.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement).closest('li');
    if (item && !item.classList.contains('calc-opt-empty')) choose(item);
  });

  els.search.addEventListener('keydown', (event) => {
    const items = [...els.suggestions.querySelectorAll<HTMLElement>('li:not(.calc-opt-empty)')];
    if (event.key === 'Escape') {
      els.suggestions.hidden = true;
      return;
    }
    if (event.key === 'Enter' && items.length > 0) {
      event.preventDefault();
      choose(items[0] as HTMLElement);
      return;
    }
    if (event.key === 'ArrowDown' && items[0]) {
      event.preventDefault();
      items[0].focus();
    }
  });

  els.suggestions.addEventListener('keydown', (event) => {
    const items = [...els.suggestions.querySelectorAll<HTMLElement>('li:not(.calc-opt-empty)')];
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (current >= 0) choose(items[current] as HTMLElement);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[Math.min(current + 1, items.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (current <= 0) els.search.focus();
      else items[current - 1]?.focus();
    } else if (event.key === 'Escape') {
      els.suggestions.hidden = true;
      els.search.focus();
    }
  });

  // ------------------------------------------------------------------ calcolo

  [els.fuel, els.liters, els.kmpl].forEach((input) =>
    input.addEventListener('change', () => {
      if (position) void refresh();
    }),
  );

  async function refresh(): Promise<void> {
    if (!position) return;
    setBusy(true);
    setStatus('Carico i prezzi della zona…');
    els.result.setAttribute('aria-busy', 'true');

    try {
      const loaded = await loadCells(position.lat, position.lng, SEARCH_RADIUS_KM);
      stations = loaded.stations;

      if (els.freshness) {
        els.freshness.textContent = loaded.fromCache
          ? `Stai vedendo una copia salvata. Prezzi rilevati il ${formatDate(loaded.sourceExtractionDate)}.`
          : `Prezzi rilevati il ${formatDate(loaded.sourceExtractionDate)}.`;
        els.freshness.hidden = false;
      }

      recompute();
    } catch (err) {
      setStatus(
        err instanceof DataError
          ? err.message
          : 'Non riesco a caricare i prezzi. Riprova tra poco.',
        'error',
      );
      els.result.innerHTML = '';
      // I dettagli tecnici restano in console, non davanti all'utente.
      console.error('[pieno] calcolatore:', err);
    } finally {
      setBusy(false);
      els.result.removeAttribute('aria-busy');
    }
  }

  function formatDate(iso: string): string {
    if (!iso) return 'data non disponibile';
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
  }

  function recompute(): void {
    if (!position) return;

    const fuel = els.fuel.value as FuelKey;
    const liters = parseFloat(els.liters.value) || DEFAULTS.liters;
    const kmPerLiter = parseFloat(els.kmpl.value) || DEFAULTS.kmPerLiter;

    const nearby: NearbyStation[] = stations
      .map((s) => {
        const price = priceFor(s, fuel);
        if (price == null) return null;
        const crowKm = haversineKm(position!.lat, position!.lng, s.lat, s.lng);
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
      els.result.innerHTML = `<p class="calc-empty">Non abbiamo trovato distributori con questo carburante entro ${SEARCH_RADIUS_KM} km da ${escapeHtml(position.label)}. Prova con un altro carburante o con una località vicina.</p>`;
      setStatus('');
      return;
    }

    const { nearest, best, ranked, worthDetour } = computeBestChoice({
      stations: nearby,
      liters,
      kmPerLiter,
    });
    setStatus('');
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
           <span class="calc-verdict-icon" aria-hidden="true">✓</span>
           <div>
             <strong>Conviene andare più lontano.</strong>
             Il distributore più conveniente è <strong>${escapeHtml(best.brand)} · ${escapeHtml(best.name)}</strong>
             a ${escapeHtml(best.comune)}, a circa ${best.roadKm} km (andata e ritorno).
             Rispetto al più vicino risparmi <strong>${fmt(best.netVsNearest)}€</strong>
             sul pieno, già tolto il costo del carburante per arrivarci.
           </div>
         </div>`
      : `<div class="calc-verdict calc-verdict-no">
           <span class="calc-verdict-icon" aria-hidden="true">≈</span>
           <div>
             <strong>Conviene restare vicino.</strong>
             Il distributore più vicino (${escapeHtml(nearest.brand)} · ${escapeHtml(nearest.name)})
             è già la scelta migliore: andare più lontano non fa risparmiare
             abbastanza da coprire il carburante della deviazione.
           </div>
         </div>`;

    const rows = ranked
      .slice(0, 6)
      .map((s) => {
        const isBest = s.id === best.id;
        return `<li class="${isBest ? 'calc-row-best' : ''}">
          <a href="${base}/stazione/${s.slug}">${escapeHtml(s.brand)} · ${escapeHtml(s.name)}</a>
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
        Stima intorno a ${escapeHtml(position!.label)}, su un pieno di ${liters} litri,
        consumo ${escapeHtml(els.kmpl.value)} km/l, distanze in linea d'aria maggiorate del
        ${Math.round((ROAD_FACTOR - 1) * 100)}% per approssimare il percorso stradale.
        Valori indicativi.
      </p>
      <h2 class="calc-list-title">Distributori vicini per costo totale</h2>
      <ul class="calc-list">${rows}</ul>`;
  }
}
