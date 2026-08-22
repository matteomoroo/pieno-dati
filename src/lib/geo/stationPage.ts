/**
 * Prepara i dati per la pagina di una singola stazione:
 *  - confronto locale del prezzo (mediana entro 5 km) per ogni carburante;
 *  - risparmio stimato su 20/40/60 litri rispetto alla mediana locale;
 *  - distributori alternativi vicini più economici.
 *
 * Riusa localCompare (Milestone 4) e l'indice spaziale.
 */
import type { Station, FuelKey } from '../../types/pieno.ts';
import { FUEL_KEYS } from '../../types/pieno.ts';
import {
  compareLocal,
  type LocalComparison,
  type PricedPoint,
} from '../../../scripts/lib/localCompare.ts';
import { regionOf, provinceName, toSlug } from './regions.ts';
import type { SpatialIndex } from './spatialIndex.ts';

const LOCAL_RADIUS_KM = 5;
const SAVING_LITERS = [20, 40, 60] as const;

export interface FuelBreakdown {
  fuel: FuelKey;
  self: number | null;
  served: number | null;
  updatedAt: string | null;
  comparison: LocalComparison | null; // sul prezzo self
  savings: { liters: number; amount: number }[]; // vs mediana locale, self
}

export interface Alternative {
  id: string;
  slug: string;
  name: string;
  brand: string;
  comune: string;
  price: number;
  distanceKm: number;
}

export interface StationPageData {
  station: Station;
  region: string | null;
  regionSlug: string | null;
  provinceFull: string;
  fuels: FuelBreakdown[];
  alternatives: Partial<Record<FuelKey, Alternative[]>>;
}

/** slug completo di una stazione: id-nome. */
export function stationSlug(s: Station): string {
  return `${s.id}-${toSlug(s.name || s.brand || 'distributore')}`;
}


export function buildStationPage(
  station: Station,
  index: SpatialIndex,
): StationPageData {
  const region = regionOf(station.provincia);
  const neighbours = index.near(station.lat, station.lng, LOCAL_RADIUS_KM, station.id);

  const fuels: FuelBreakdown[] = [];
  const alternatives: Partial<Record<FuelKey, Alternative[]>> = {};

  for (const fuel of FUEL_KEYS) {
    const fp = station.fuels[fuel];
    if (!fp) continue;

    // prezzi self dei vicini per il confronto locale
    const neighbourPrices: PricedPoint[] = neighbours
      .map((n) => {
        const p = n.fuels[fuel]?.self ?? n.fuels[fuel]?.served ?? null;
        return p != null ? { lat: n.lat, lng: n.lng, price: p } : null;
      })
      .filter((p): p is PricedPoint => p !== null);

    const stationPrice = fp.self ?? fp.served;
    let comparison: LocalComparison | null = null;
    const savings: { liters: number; amount: number }[] = [];

    if (stationPrice != null && neighbourPrices.length > 0) {
      comparison = compareLocal(
        stationPrice,
        station.lat,
        station.lng,
        neighbourPrices,
        LOCAL_RADIUS_KM,
      );
      if (comparison.localMedian != null) {
        const diff = comparison.localMedian - stationPrice; // >0 = risparmio
        for (const liters of SAVING_LITERS) {
          savings.push({ liters, amount: Math.round(diff * liters * 100) / 100 });
        }
      }
    }

    fuels.push({
      fuel,
      self: fp.self,
      served: fp.served,
      updatedAt: fp.updatedAt ?? null,
      comparison,
      savings,
    });

    // alternative più economiche vicine (per questo carburante)
    const alts: Alternative[] = neighbours
      .map((n) => {
        const p = n.fuels[fuel]?.self ?? n.fuels[fuel]?.served ?? null;
        if (p == null) return null;
        const dist =
          Math.round(
            haversineApprox(station.lat, station.lng, n.lat, n.lng) * 10,
          ) / 10;
        return {
          id: n.id,
          slug: stationSlug(n),
          name: n.name,
          brand: n.brand,
          comune: n.comune,
          price: p,
          distanceKm: dist,
        };
      })
      .filter((a): a is Alternative => a !== null)
      .filter((a) => stationPrice == null || a.price < stationPrice)
      .sort((a, b) => a.price - b.price)
      .slice(0, 3);
    if (alts.length > 0) alternatives[fuel] = alts;
  }

  return {
    station,
    region,
    regionSlug: region ? toSlug(region) : null,
    provinceFull: provinceName(station.provincia),
    fuels,
    alternatives,
  };
}

// haversine leggera (per le distanze delle alternative)
function haversineApprox(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
