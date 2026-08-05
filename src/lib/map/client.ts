/**
 * Logica mappa lato client.
 * File .ts separato così Vite lo processa e bundle-a MapLibre correttamente
 * (l'import dinamico dentro uno <script define:vars> non veniva risolto).
 *
 * Espone initMap(), chiamata dall'isola con la URL dei dati e il carburante.
 */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Station, StationsFile, FuelKey } from '../../types/pieno.ts';

interface InitOptions {
  dataUrl: string;
  initialFuel: FuelKey;
}

export async function initMap({ dataUrl, initialFuel }: InitOptions): Promise<void> {
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

  map.on('load', () => {
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
          '#22c55e',
          1,
          '#ef5350',
          '#f6c34e',
        ],
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
      };
      const coords = (f.geometry as GeoJSON.Point).coordinates as [
        number,
        number,
      ];
      const stationUrl = `${baseUrl}/stazione/${props.slug}`;
      new maplibregl.Popup({ closeButton: true })
        .setLngLat(coords)
        .setHTML(
          `<strong>${props.brand}</strong><br>${props.name}<br>` +
            `${props.price.toLocaleString('it-IT', {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3,
            })} €/L<br>` +
            `<a href="${stationUrl}" style="color:#1b9e5a;font-weight:600;text-decoration:none">Vedi dettagli →</a>`,
        )
        .addTo(map);
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
  });

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
