const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distancia en metros entre dos coordenadas (fórmula del haversine). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type BBox = [west: number, south: number, east: number, north: number];

/** Parsea "w,s,e,n" validando rangos. Devuelve null si no es válido. */
export function parseBBox(raw: string | undefined): BBox | null {
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [w, s, e, n] = parts as [number, number, number, number];
  if (s < -90 || n > 90 || s >= n) return null;
  if (w < -180 || e > 180 || w >= e) return null;
  return [w, s, e, n];
}

export function formatDistance(meters: number, locale = 'es-ES'): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return `${km.toLocaleString(locale, { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

/* ---------- Polilíneas (rutas) ---------- */

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQ = 111_320;

export interface PolylineIndex {
  /** Coordenadas [lng, lat] (orden GeoJSON). */
  coords: Array<[number, number]>;
  /** Distancia acumulada en metros hasta cada vértice. */
  cum: number[];
  totalM: number;
  bbox: BBox;
}

export function indexPolyline(coords: Array<[number, number]>): PolylineIndex {
  const cum = [0];
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i]!;
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
    if (i > 0) {
      const [plng, plat] = coords[i - 1]!;
      cum.push(cum[i - 1]! + haversineMeters(plat, plng, lat, lng));
    }
  }
  return { coords, cum, totalM: cum[cum.length - 1] ?? 0, bbox: [w, s, e, n] };
}

/**
 * Proyecta un punto sobre la polilínea: distancia mínima al trazado y metros recorridos hasta el
 * punto más cercano. Aproximación equirectangular por segmento (error despreciable a < 10 km).
 */
export function locateOnPolyline(
  index: PolylineIndex,
  lat: number,
  lng: number,
): { distanceM: number; alongM: number } {
  const { coords, cum } = index;
  let best = { distanceM: Infinity, alongM: 0 };
  const kx = M_PER_DEG_LNG_EQ * Math.cos((lat * Math.PI) / 180);
  for (let i = 1; i < coords.length; i++) {
    const [ax, ay] = coords[i - 1]!;
    const [bx, by] = coords[i]!;
    const abx = (bx - ax) * kx;
    const aby = (by - ay) * M_PER_DEG_LAT;
    const apx = (lng - ax) * kx;
    const apy = (lat - ay) * M_PER_DEG_LAT;
    const len2 = abx * abx + aby * aby;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2)) : 0;
    const dx = apx - t * abx;
    const dy = apy - t * aby;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best.distanceM) {
      best = { distanceM: d, alongM: cum[i - 1]! + t * (cum[i]! - cum[i - 1]!) };
    }
  }
  return best;
}

/** Amplía un bbox en metros (para buscar en un corredor alrededor de una ruta). */
export function expandBBox([w, s, e, n]: BBox, meters: number): BBox {
  const dLat = meters / M_PER_DEG_LAT;
  const midLat = (s + n) / 2;
  const dLng = meters / (M_PER_DEG_LNG_EQ * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
  return [w - dLng, s - dLat, e + dLng, n + dLat];
}
