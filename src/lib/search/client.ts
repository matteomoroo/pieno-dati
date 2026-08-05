/**
 * Ricerca lato client.
 * Cerca solo le città (comuni) da search-index.json. La ricerca dei
 * distributori sarà gestita nei filtri.
 *
 * Applica debounce (non cerca a ogni carattere), mostra un dropdown di
 * suggerimenti navigabile da tastiera, e alla selezione sposta la mappa.
 */
import './search.css';

interface Locality {
  q: string;
  name: string;
  prov: string;
  lat: number;
  lng: number;
  count: number;
}

interface SearchDeps {
  /** Sposta la mappa su un punto. */
  flyTo: (lat: number, lng: number, zoom: number) => void;
  indexUrl: string;
}

type Result = {
  kind: 'locality';
  label: string;
  sub: string;
  lat: number;
  lng: number;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function initSearch(deps: SearchDeps): void {
  const inputEl = document.getElementById('q') as HTMLInputElement | null;
  if (!inputEl) return;
  const input: HTMLInputElement = inputEl;

  // Dropdown ancorato al contenitore .search (position:relative), non dopo
  // l'input: così occupa tutta la larghezza sotto la barra invece di finire
  // affiancato come elemento flex.
  const box = document.createElement('ul');
  box.className = 'search-results';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  const searchContainer = input.closest('.search') ?? input.parentElement;
  (searchContainer ?? input).appendChild(box);

  let localities: Locality[] | null = null;
  let loadingIndex = false;
  let activeIndex = -1;
  let current: Result[] = [];

  async function ensureIndex(): Promise<void> {
    if (localities || loadingIndex) return;
    loadingIndex = true;
    try {
      const res = await fetch(deps.indexUrl);
      localities = (await res.json()) as Locality[];
    } catch {
      localities = [];
    } finally {
      loadingIndex = false;
    }
  }

  function search(term: string): Result[] {
    const q = norm(term);
    if (q.length < 2) return [];
    if (!localities) return [];

    // Città: prefisso prima (match più forte), poi "contiene".
    const starts = localities.filter((l) => l.q.startsWith(q));
    const contains = localities.filter(
      (l) => !l.q.startsWith(q) && l.q.includes(q),
    );
    return [...starts, ...contains].slice(0, 7).map((l) => ({
      kind: 'locality' as const,
      label: l.name,
      sub: l.prov,
      lat: l.lat,
      lng: l.lng,
    }));
  }

  function render(results: Result[]): void {
    current = results;
    activeIndex = -1;
    if (results.length === 0) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = results
      .map(
        (r, i) =>
          `<li role="option" id="sr-${i}" data-i="${i}" class="search-item">
            <span class="search-item-label">${escapeHtml(r.label)}</span>
            <span class="search-item-sub">${escapeHtml(r.sub)}</span>
          </li>`,
      )
      .join('');    box.hidden = false;
  }

  function choose(i: number): void {
    const r = current[i];
    if (!r) return;
    deps.flyTo(r.lat, r.lng, 12);
    input.value = r.label;
    box.hidden = true;
  }

  // Debounce
  let timer: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const term = input.value;
    timer = setTimeout(async () => {
      await ensureIndex();
      render(search(term));
    }, 200);
  });

  input.addEventListener('focus', () => {
    void ensureIndex();
  });

  // Navigazione da tastiera
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, current.length - 1);
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(activeIndex >= 0 ? activeIndex : 0);
    } else if (e.key === 'Escape') {
      box.hidden = true;
    }
  });

  function highlight(): void {
    [...box.children].forEach((li, i) => {
      li.classList.toggle('active', i === activeIndex);
      if (i === activeIndex) input.setAttribute('aria-activedescendant', `sr-${i}`);
    });
  }

  box.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('.search-item');
    if (li) choose(Number((li as HTMLElement).dataset.i));
  });

  // Chiudi cliccando fuori
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target as Node) && e.target !== input) {
      box.hidden = true;
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  );
}
