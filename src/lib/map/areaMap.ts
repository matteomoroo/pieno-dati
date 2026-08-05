/**
 * Mappa territoriale "su richiesta".
 * La mini-mappa nelle pagine provincia/comune parte come immagine statica
 * leggera. Al primo tocco, questo modulo la sostituisce con una mappa MapLibre
 * interattiva che mostra SOLO i distributori della zona (entro un raggio dal
 * centro), così non carichiamo l'intero dataset nazionale.
 *
 * MapLibre viene importato dinamicamente: il suo peso (~800KB) si scarica solo
 * se l'utente decide di interagire.
 */
import type { Station, StationsFile, FuelKey } from '../../types/pieno.ts';

interface AreaMapOptions {
  container: HTMLElement;
  dataUrl: string;
  lat: number;
  lng: number;
  zoom: number;
  /** Raggio in km entro cui mostrare i distributori. */
  radiusKm: number;
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

function priceFor(s: Station, fuel: FuelKey): number | null {
  const fp = s.fuels[fuel];
  return fp ? (fp.self ?? fp.served ?? null) : null;
}

let activated = false;

export async function activateAreaMap(opts: AreaMapOptions): Promise<void> {
  if (activated) return;
  activated = true;

  const { container, dataUrl, lat, lng, zoom, radiusKm } = opts;
  container.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.85rem">Carico la mappa…</div>';

  const { default: maplibregl } = await import('maplibre-gl');
  await import('maplibre-gl/dist/maplibre-gl.css');

  container.innerHTML = '';
  const map = new maplibregl.Map({
    container,
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
    center: [lng, lat],
    zoom,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  const res = await fetch(dataUrl);
  const file: StationsFile = await res.json();

  // Solo i distributori della zona.
  const nearby = file.stations.filter(
    (s) => haversineKm(lat, lng, s.lat, s.lng) <= radiusKm,
  );

  // Mediana benzina locale per colorare i pin.
  const prices = nearby
    .map((s) => priceFor(s, 'benzina'))
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b);
  const median = prices.length
    ? prices[Math.floor(prices.length / 2)]
    : 0;

  const features = nearby
    .map((s) => {
      const price = priceFor(s, 'benzina');
      if (price == null) return null;
      const deltaC = (price - median) * 100;
      const tier = deltaC <= -2 ? -1 : deltaC >= 2 ? 1 : 0;
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
        properties: { name: s.name, brand: s.brand, price, tier },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  map.on('load', () => {
    map.addSource('area', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });
    map.addLayer({
      id: 'pts',
      type: 'circle',
      source: 'area',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 8],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#fff',
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
    map.on('click', 'pts', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { name: string; brand: string; price: number };
      new maplibregl.Popup()
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<strong>${p.brand}</strong><br>${p.name}<br>${p.price
            .toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/L`,
        )
        .addTo(map);
    });
    map.on('mouseenter', 'pts', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'pts', () => (map.getCanvas().style.cursor = ''));
  });
}
