import type { GeocodeResult, LatLng } from '@pc/shared';

/**
 * Servicios externos de rutas y geocodificación tras una interfaz, para cambiar de proveedor
 * (p. ej. OSRM/Valhalla propios en producción) sin tocar el planificador.
 *
 * Por defecto se usan los servidores públicos de OSRM y Photon, pensados para desarrollo y
 * uso moderado (ver docs/integraciones.md). Se configuran con ROUTING_URL y GEOCODER_URL.
 */

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  /** Coordenadas [lng, lat] (orden GeoJSON). */
  coordinates: Array<[number, number]>;
}

export interface RoutingProvider {
  readonly attribution: string;
  route(origin: LatLng, destination: LatLng): Promise<RouteResult | null>;
}

export interface Geocoder {
  search(q: string, near: LatLng | null): Promise<GeocodeResult[]>;
}

const USER_AGENT = 'PuntosCarga/0.1';
/** User-Agent solo fuera del navegador (en web es una cabecera prohibida). */
const uaHeaders = (): Record<string, string> =>
  (globalThis as { window?: unknown }).window === undefined ? { 'User-Agent': USER_AGENT } : {};
const EUROPE_BBOX = '-31,27,45,72';

/** AbortSignal.timeout no existe en todos los motores JS (Hermes): versión portable. */
function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export class OsrmRouting implements RoutingProvider {
  readonly attribution = 'Rutas: OSRM · Datos © OpenStreetMap contributors';
  constructor(
    private readonly baseUrl = process.env.ROUTING_URL || 'https://router.project-osrm.org',
  ) {}

  async route(o: LatLng, d: LatLng): Promise<RouteResult | null> {
    const url = `${this.baseUrl}/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, {
      headers: uaHeaders(),
      signal: timeoutSignal(20_000),
    });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const body = (await res.json()) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: Array<[number, number]> };
      }>;
    };
    const r = body.routes?.[0];
    if (body.code !== 'Ok' || !r) return null;
    return {
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
      coordinates: r.geometry.coordinates,
    };
  }
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    osm_key?: string;
    osm_value?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

export class PhotonGeocoder implements Geocoder {
  private cache = new Map<string, { at: number; value: GeocodeResult[] }>();
  constructor(private readonly baseUrl = 'https://photon.komoot.io') {}

  async search(q: string, near: LatLng | null): Promise<GeocodeResult[]> {
    const key = `${q.toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.value;

    // Limitado a Europa: la app solo cubre países europeos.
    const params = new URLSearchParams({
      q,
      limit: '8',
      lang: 'default',
      bbox: EUROPE_BBOX,
      location_bias_scale: '0.5',
    });
    if (near) {
      params.set('lat', String(near.lat));
      params.set('lon', String(near.lng));
    }
    const res = await fetch(`${this.baseUrl}/api/?${params}`, {
      headers: uaHeaders(),
      signal: timeoutSignal(10_000),
    });
    if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
    const body = (await res.json()) as { features?: PhotonFeature[] };
    const value = rankFeatures(body.features ?? [])
      .map((f) => toGeocodeResult(f))
      .filter((r) => r.label)
      .slice(0, 6);
    if (this.cache.size > 2000) this.cache.clear();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
}

/** Importancia de cada tipo de lugar: lo que se busca como origen/destino de un viaje. */
const PLACE_RANK: Record<string, number> = {
  city: 0,
  town: 0,
  municipality: 0,
  village: 1,
  suburb: 2,
  hamlet: 2,
  locality: 2,
};

export function rankFeatures(features: PhotonFeature[]): PhotonFeature[] {
  const rank = (f: PhotonFeature) =>
    PLACE_RANK[f.properties.osm_value ?? ''] ?? (f.properties.osm_key === 'place' ? 3 : 4);
  return features
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map((x) => x.f);
}

export function toGeocodeResult(f: PhotonFeature): GeocodeResult {
  const p = f.properties;
  const street = p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : null;
  const label = p.name ?? street ?? p.city ?? '';
  const detail = [
    street && street !== label ? street : null,
    p.city !== label ? p.city : null,
    p.state,
    p.country,
  ]
    .filter(Boolean)
    .join(', ');
  return {
    label,
    detail: detail || null,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  };
}
