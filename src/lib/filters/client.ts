/**
 * Pannello filtri (bottom sheet).
 * Filtra i distributori sulla mappa per: prezzo massimo, modalità (self/
 * servito/entrambi), disponibilità del carburante selezionato, e marca.
 * I distributori esclusi vengono NASCOSTI dalla mappa. Aggiornamento in tempo
 * reale mentre l'utente tocca i controlli.
 *
 * Interagisce con la mappa tramite hook esposti da lib/map/client.ts:
 *  - __pienoGetStations(): tutte le stazioni;
 *  - __pienoApplyFilter(predicate): mostra solo le stazioni che soddisfano il
 *    predicato per il carburante corrente.
 */
import './filters.css';
import type { Station, FuelKey, FuelPrice } from '../../types/pieno.ts';

export type FilterMode = 'self' | 'served' | 'both';

export interface FilterState {
  maxPrice: number | null;
  mode: FilterMode;
  onlyWithFuel: boolean;
  brands: Set<string>; // vuoto = tutte
}

interface FiltersDeps {
  getStations: () => Station[];
  /** Applica un predicato ai marker: true = mostra. */
  applyFilter: (pred: (s: Station) => boolean) => void;
  /** Carburante attualmente selezionato in pagina. */
  getFuel: () => FuelKey;
  /** Etichetta UI di un carburante (es. gasolio -> "Diesel"). */
  fuelLabel: (f: FuelKey) => string;
}

const BRAND_OTHER = '__other__';
const TOP_BRANDS_COUNT = 6;

/** Prezzo rilevante per una stazione, secondo la modalità. */
function priceByMode(fp: FuelPrice | undefined, mode: FilterMode): number | null {
  if (!fp) return null;
  if (mode === 'self') return fp.self;
  if (mode === 'served') return fp.served;
  return fp.self ?? fp.served; // both: il migliore disponibile
}

/** Normalizza il nome marca per raggruppare varianti. */
function brandKey(brand: string): string {
  const b = brand.toLowerCase().trim();
  if (!b || b === 'distributore' || b.includes('senza')) return 'Pompe bianche';
  return brand.trim();
}

export function initFilters(deps: FiltersDeps): void {
  const stations = deps.getStations();

  // Marche più frequenti dai dati reali.
  const counts = new Map<string, number>();
  for (const s of stations) {
    const k = brandKey(s.brand);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const topBrands = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_BRANDS_COUNT)
    .map(([name]) => name);

  // Range di prezzo dai dati (per lo slider), sul carburante corrente.
  function priceRange(fuel: FuelKey): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const s of stations) {
      const p = s.fuels[fuel]?.self ?? s.fuels[fuel]?.served;
      if (p == null) continue;
      if (p < min) min = p;
      if (p > max) max = p;
    }
    if (!Number.isFinite(min)) return [1, 3];
    return [Math.floor(min * 100) / 100, Math.ceil(max * 100) / 100];
  }

  const state: FilterState = {
    maxPrice: null,
    mode: 'self',
    onlyWithFuel: false,
    brands: new Set(),
  };

  // --- costruzione UI ---
  const trigger = document.getElementById('filters-trigger');
  const sheet = buildSheet();
  document.body.appendChild(sheet.root);

  function activeCount(): number {
    let n = 0;
    if (state.maxPrice != null) n++;
    if (state.mode !== 'self') n++;
    if (state.onlyWithFuel) n++;
    if (state.brands.size > 0) n++;
    return n;
  }

  function updateBadge(): void {
    const badge = document.getElementById('filters-badge');
    const n = activeCount();
    if (badge) {
      badge.textContent = String(n);
      badge.hidden = n === 0;
    }
  }

  function predicate(): (s: Station) => boolean {
    const fuel = deps.getFuel();
    const { maxPrice, mode, onlyWithFuel, brands } = state;
    return (s: Station) => {
      const fp = s.fuels[fuel];
      const price = priceByMode(fp, mode);
      if (onlyWithFuel && price == null) return false;
      if (maxPrice != null && (price == null || price > maxPrice)) return false;
      if (brands.size > 0) {
        const k = brandKey(s.brand);
        const match = brands.has(k) || (brands.has(BRAND_OTHER) && !topBrands.includes(k));
        if (!match) return false;
      }
      return true;
    };
  }

  function apply(): void {
    deps.applyFilter(predicate());
    updateBadge();
    updateResultCount();
  }

  function updateResultCount(): void {
    const pred = predicate();
    const n = stations.filter(pred).length;
    const btn = document.getElementById('filters-apply');
    if (btn) btn.textContent = `Mostra ${n.toLocaleString('it-IT')} distributori`;
  }

  // apertura/chiusura
  function open(): void {
    // aggiorna lo slider al range del carburante corrente
    const [lo, hi] = priceRange(deps.getFuel());
    const slider = sheet.root.querySelector<HTMLInputElement>('#f-price');
    if (slider) {
      slider.min = String(lo);
      slider.max = String(hi);
      slider.step = '0.01';
      if (state.maxPrice == null) {
        slider.value = String(hi);
        updatePriceLabel(hi, true);
      }
    }
    updateResultCount();
    sheet.root.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close(): void {
    sheet.root.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (trigger) trigger.addEventListener('click', open);
  sheet.backdrop.addEventListener('click', close);
  sheet.closeBtn.addEventListener('click', close);
  sheet.applyBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.root.classList.contains('open')) close();
  });

  function updatePriceLabel(v: number, isMax = false): void {
    const label = sheet.root.querySelector('#f-price-val');
    if (label)
      label.textContent = isMax && state.maxPrice == null
        ? 'tutti'
        : `${v.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/L`;
  }

  // --- listener controlli (aggiornano in tempo reale) ---
  const priceSlider = sheet.root.querySelector<HTMLInputElement>('#f-price')!;
  priceSlider.addEventListener('input', () => {
    const v = parseFloat(priceSlider.value);
    const isAtMax = v >= parseFloat(priceSlider.max);
    state.maxPrice = isAtMax ? null : v;
    updatePriceLabel(v, isAtMax);
    apply();
  });

  sheet.root.querySelectorAll<HTMLElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode as FilterMode;
      sheet.root.querySelectorAll('[data-mode]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      apply();
    });
  });

  const availToggle = sheet.root.querySelector<HTMLElement>('#f-avail')!;
  availToggle.addEventListener('click', () => {
    state.onlyWithFuel = !state.onlyWithFuel;
    availToggle.classList.toggle('checked', state.onlyWithFuel);
    apply();
  });

  sheet.root.querySelectorAll<HTMLElement>('[data-brand]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const b = chip.dataset.brand!;
      if (state.brands.has(b)) state.brands.delete(b);
      else state.brands.add(b);
      chip.classList.toggle('active', state.brands.has(b));
      apply();
    });
  });

  sheet.resetBtn.addEventListener('click', () => {
    state.maxPrice = null;
    state.mode = 'self';
    state.onlyWithFuel = false;
    state.brands.clear();
    // reset UI
    sheet.root.querySelectorAll('[data-brand].active, [data-mode].active').forEach((el) => {
      if (!el.matches('[data-mode="self"]')) el.classList.remove('active');
    });
    sheet.root.querySelector('[data-mode="self"]')?.classList.add('active');
    availToggle.classList.remove('checked');
    const [, hi] = priceRange(deps.getFuel());
    priceSlider.value = String(hi);
    updatePriceLabel(hi, true);
    apply();
  });

  updateBadge();

  // aggiorna l'etichetta "solo chi ha X" quando cambia il carburante
  (window as unknown as { __pienoOnFuelChange?: (f: FuelKey) => void }).__pienoOnFuelChange =
    () => {
      const lbl = sheet.root.querySelector('#f-avail-label strong');
      if (lbl) lbl.textContent = deps.fuelLabel(deps.getFuel()).toLowerCase();
      apply();
    };

  // --- template del bottom sheet ---
  function buildSheet() {
    const root = document.createElement('div');
    root.className = 'filters-sheet';
    root.innerHTML = `
      <div class="filters-backdrop"></div>
      <div class="filters-panel" role="dialog" aria-label="Filtri" aria-modal="true">
        <div class="filters-grip"></div>
        <div class="filters-head">
          <button class="filters-close" aria-label="Chiudi">✕</button>
          <span class="filters-title">Filtri</span>
          <button class="filters-reset">Azzera</button>
        </div>
        <div class="filters-body">
          <div class="filter-group">
            <div class="filter-row">
              <span class="filter-label">Prezzo massimo</span>
              <span id="f-price-val" class="filter-value">tutti</span>
            </div>
            <input type="range" id="f-price" min="1" max="3" step="0.01" />
          </div>

          <div class="filter-group">
            <span class="filter-label">Modalità</span>
            <div class="seg">
              <button data-mode="self" class="active">Self</button>
              <button data-mode="served">Servito</button>
              <button data-mode="both">Entrambi</button>
            </div>
          </div>

          <div class="filter-group">
            <button id="f-avail" class="checkrow">
              <span class="checkbox"></span>
              <span id="f-avail-label">Solo chi ha <strong>benzina</strong> disponibile</span>
            </button>
          </div>

          <div class="filter-group">
            <span class="filter-label">Marca</span>
            <div class="brand-chips">
              ${topBrands
                .map((b) => `<button class="brand-chip" data-brand="${escapeAttr(b)}">${escapeHtml(b)}</button>`)
                .join('')}
              <button class="brand-chip" data-brand="${BRAND_OTHER}">Altre</button>
            </div>
          </div>
        </div>
        <div class="filters-foot">
          <button id="filters-apply" class="filters-apply">Mostra distributori</button>
        </div>
      </div>`;
    return {
      root,
      backdrop: root.querySelector('.filters-backdrop') as HTMLElement,
      closeBtn: root.querySelector('.filters-close') as HTMLElement,
      resetBtn: root.querySelector('.filters-reset') as HTMLElement,
      applyBtn: root.querySelector('#filters-apply') as HTMLElement,
    };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
