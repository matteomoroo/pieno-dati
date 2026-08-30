/**
 * Logica mappa lato client.
 * File .ts separato così Vite lo processa e bundle-a MapLibre correttamente
 * (l'import dinamico dentro uno <script define:vars> non veniva risolto).
 *
 * Espone initMap(), chiamata dall'isola con la URL dei dati e il carburante.
 */
import mapStylesUrl from 'maplibre-gl/dist/maplibre-gl.css?url';
import type { Station, StationsFile, FuelKey } from '../../types/pieno.ts';

interface InitOptions {
  dataUrl: string;
  initialFuel: FuelKey;
}

/**
 * Colori dei marker per fascia di prezzo, allineati ai token semantici.
 * MapLibre non legge le variabili CSS, quindi i valori vivono qui: questa è
 * l'unica dichiarazione, non ripetuta nelle espressioni di stile.
 *
 * La classificazione (`tier`) non cambia: qui c'è solo il colore.
 */
export const TIER_COLORS = {
  convenient: '#16825a', // tier -1
  average: '#d48a1e', //  tier  0
  expensive: '#be3e46', // tier  1
} as const;

/** Teal del brand, usato per l'anello del marker selezionato e i link. */
const BRAND = '#066a63';

/** Mascotte del popup, scelta dal `tier` già presente nella feature. */
const MASCOT_BY_TIER: Record<number, string> = {
  [-1]: 'mascot-convenient.png',
  0: 'mascot-neutral.png',
  1: 'mascot-expensive.png',
};

/**
 * Inclinazione per fascia: la mascotte sorridente si appoggia leggermente
 * all'indietro, quella delusa si affloscia in avanti. È un dettaglio di
 * carattere, non un'informazione: il dato resta il colore e il prezzo.
 */
const MASCOT_TILT: Record<number, string> = {
  [-1]: 'tilt-happy',
  0: 'tilt-neutral',
  1: 'tilt-sad',
};

/**
 * Inserisce il CSS di MapLibre come <link> a runtime.
 * Con un `import` (statico o dinamico) Astro raccoglie il foglio di stile nel
 * bundle CSS della pagina e lo mette in <head>: 65 KB render-blocking su ogni
 * pagina che includa la mappa, anche prima che la mappa serva. Con `?url`
 * otteniamo solo il percorso dell'asset e decidiamo noi quando caricarlo.
 */
let stylesPromise: Promise<void> | null = null;
function loadMapStyles(): Promise<void> {
  if (stylesPromise) return stylesPromise;
  stylesPromise = new Promise<void>((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = mapStylesUrl;
    // Non bloccare l'inizializzazione se il CSS tarda: la mappa resta usabile.
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return stylesPromise;
}

export async function initMap({ dataUrl, initialFuel }: InitOptions): Promise<void> {
  // MapLibre (800 KB di JS + 65 KB di CSS) viene caricato solo qui.
  // Con un import statico Vite issava il CSS nel <head> di ogni pagina che
  // includa la mappa, bloccando il rendering anche quando la mappa non è
  // ancora visibile.
  const { default: maplibregl } = await import('maplibre-gl');
  await loadMapStyles();
  // baseUrl derivato dalla dataUrl (.../data/stations.json -> ...)
  const baseUrl = dataUrl.replace(/\/data\/stations\.json$/, '');
  const slugify = (name: string): string =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
    center: [12.5, 42.0],
    zoom: 5,
  });

  const zi = document.getElementById('zoom-in');
  const zo = document.getElementById('zoom-out');
  if (zi) zi.onclick = () => map.zoomIn();
  if (zo) zo.onclick = () => map.zoomOut();

  let currentFuel: FuelKey = initialFuel;

  function priceFor(station: Station, fuel: FuelKey): number | null {
    const fp = station.fuels[fuel];
    if (!fp) return null;
    return fp.self ?? fp.served ?? null;
  }

  const res = await fetch(dataUrl);
  const file: StationsFile = await res.json();
  const stations = file.stations;

  // Mediana nazionale per carburante, calcolata una volta: serve a colorare i
  // punti per fascia. È una prima approssimazione; il confronto locale fine
  // (mediana entro 5 km, da localCompare.ts) arriverà in una milestone dedicata.
  function nationalMedian(fuel: FuelKey): number {
    const vals: number[] = [];
    for (const s of stations) {
      const p = priceFor(s, fuel);
      if (p != null) vals.push(p);
    }
    if (vals.length === 0) return 0;
    vals.sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
  }

  function buildGeoJSON(fuel: FuelKey) {
    const median = nationalMedian(fuel);
    return {
      type: 'FeatureCollection' as const,
      features: stations
        .map((s) => {
          const price = priceFor(s, fuel);
          if (price == null) return null;
          // tier: -1 conviene, 0 media, 1 caro (soglia ±2 centesimi)
          const deltaCents = (price - median) * 100;
          const tier = deltaCents <= -2 ? -1 : deltaCents >= 2 ? 1 : 0;
          return {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [s.lng, s.lat],
            },
            properties: {
              id: s.id,
              name: s.name,
              brand: s.brand,
              slug: `${s.id}-${slugify(s.name || s.brand || 'distributore')}`,
              price,
              tier,
            },
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    };
  }

  const setupStationsLayer = () => {
    try {
      map.addSource('stations', {
        type: 'geojson',
        data: buildGeoJSON(currentFuel),
      });

    // Un unico layer di punti, reso su GPU: regge decine di migliaia di punti
    // senza cluster e senza impallare il main thread. Il colore codifica la
    // fascia di prezzo (semaforo). Raggio che cresce leggermente con lo zoom.
    map.addLayer({
      id: 'points',
      type: 'circle',
      source: 'stations',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          3,
          10,
          5,
          14,
          7,
        ],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-color': [
          'match',
          ['get', 'tier'],
          -1,
          TIER_COLORS.convenient,
          1,
          TIER_COLORS.expensive,
          TIER_COLORS.average,
        ],
      },
    });

    // Sorgente del solo punto selezionato: contiene zero o una feature, quindi
    // non incide sulle prestazioni del layer principale, che resta intatto.
    map.addSource('selected', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Due layer sottili sopra i punti: l'anello teal del brand e, sopra, il
    // punto col colore semantico del suo tier e l'alone bianco. Il colore della
    // fascia non viene mai sostituito dal teal.
    map.addLayer({
      id: 'selected-ring',
      type: 'circle',
      source: 'selected',
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'], 5, 9, 10, 12.5, 14, 16,
        ],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': 3,
        'circle-stroke-color': BRAND,
      },
    });
    map.addLayer({
      id: 'selected-point',
      type: 'circle',
      source: 'selected',
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'], 5, 5, 10, 7.5, 14, 10,
        ],
        'circle-color': [
          'match',
          ['get', 'tier'],
          -1,
          TIER_COLORS.convenient,
          1,
          TIER_COLORS.expensive,
          TIER_COLORS.average,
        ],
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
      },
    });

    // Popup col prezzo e link alla pagina stazione al click su un punto.
    map.on('click', 'points', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as {
        name: string;
        brand: string;
        slug: string;
        price: number;
        tier: number;
      };
      const coords = (f.geometry as GeoJSON.Point).coordinates as [
        number,
        number,
      ];
      const stationUrl = `${baseUrl}/stazione/${props.slug}`;

      // Evidenzia il punto scelto: stessa feature, nessun marker DOM.
      (map.getSource('selected') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords },
            properties: { tier: props.tier },
          },
        ],
      });

      // La mascotte è decorativa: ripete un'informazione già data dal colore
      // del marker, dal prezzo e dalla legenda. Non è mai l'unico segnale.
      const mascot = MASCOT_BY_TIER[props.tier] ?? MASCOT_BY_TIER[0];

      const tilt = MASCOT_TILT[props.tier] ?? MASCOT_TILT[0];
      const prezzo = props.price.toLocaleString('it-IT', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      });

      // Due colonne: a sinistra i dati, a destra la mascotte nel suo spazio.
      // Così fa parte del layout invece di essere appoggiata sopra la card.
      const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '300px' })
        .setLngLat(coords)
        .setHTML(
          `<div class="pin-card">` +
            `<div class="pin-info">` +
              `<p class="pin-brand">${props.brand}</p>` +
              `<p class="pin-name">${props.name}</p>` +
              `<p class="pin-price">${prezzo}<span class="pin-unit"> €/L</span></p>` +
              `<a href="${stationUrl}" class="pin-link">Vedi dettagli →</a>` +
            `</div>` +
            `<img class="pin-mascot ${tilt}" src="${baseUrl}/brand/${mascot}" alt="" aria-hidden="true" width="72" height="72" decoding="async">` +
          `</div>`,
        )
        .addTo(map);

      // Chiudendo il popup il punto torna normale.
      popup.on('close', () => {
        (map.getSource('selected') as maplibregl.GeoJSONSource)?.setData({
          type: 'FeatureCollection',
          features: [],
        });
      });
    });
    map.on('mouseenter', 'points', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'points', () => {
      map.getCanvas().style.cursor = '';
    });
      console.log(
        `[pieno] mappa: ${stations.length} stazioni caricate, layer punti attivo`,
      );
    } catch (err) {
      console.error('[pieno] errore nel disegnare i punti:', err);
    }
  };

  if (map.isStyleLoaded()) {
    setupStationsLayer();
  } else {
    map.once('load', setupStationsLayer);
  }

  const locate = document.getElementById('locate');
  if (locate) {
    locate.onclick = () => {
      if (!navigator.geolocation) {
        alert('La geolocalizzazione non è disponibile su questo dispositivo.');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 13,
          });
        },
        () => alert('Non è stato possibile ottenere la posizione.'),
      );
    };
  }

  // Hook per la ricerca: spostare la mappa e leggere le stazioni caricate.
  const w = window as unknown as {
    __pienoFlyTo?: (lat: number, lng: number, zoom: number) => void;
    __pienoGetStations?: () => Station[];
    __pienoApplyFilter?: (pred: (s: Station) => boolean) => void;
  };
  w.__pienoFlyTo = (lat, lng, zoom) => map.flyTo({ center: [lng, lat], zoom });
  w.__pienoGetStations = () => stations;

  // Applica un filtro: ricostruisce il GeoJSON con le sole stazioni ammesse.
  let filterPred: ((s: Station) => boolean) | null = null;
  function currentGeoJSON() {
    const base = buildGeoJSON(currentFuel);
    if (!filterPred) return base;
    const allowed = new Set(stations.filter(filterPred).map((s) => s.id));
    return {
      ...base,
      features: base.features.filter((f) =>
        allowed.has((f.properties as { id: string }).id),
      ),
    };
  }
  w.__pienoApplyFilter = (pred) => {
    filterPred = pred;
    const src = map.getSource('stations') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(currentGeoJSON());
  };

  // Quando cambia il carburante, riapplica anche il filtro corrente.
  const prevSetFuel = (window as unknown as { __pienoSetFuel?: (f: FuelKey) => void })
    .__pienoSetFuel;
  (window as unknown as { __pienoSetFuel?: (f: FuelKey) => void }).__pienoSetFuel = (
    fuel: FuelKey,
  ) => {
    currentFuel = fuel;
    const src = map.getSource('stations') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(currentGeoJSON());
    const onFuel = (window as unknown as { __pienoOnFuelChange?: (f: FuelKey) => void })
      .__pienoOnFuelChange;
    if (onFuel) onFuel(fuel);
    void prevSetFuel;
  };
}
