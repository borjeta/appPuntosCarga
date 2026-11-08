import {
  filtersToQuery,
  type CommunitySummary,
  type DataSourceInfo,
  type ReportType,
  type GeocodeResult,
  type RoutePlan,
  type RoutePlanRequest,
  type VehicleSpec,
  type LocationDetail,
  type MapResponse,
  type NearbyResponse,
  type OperatorListItem,
  type SearchResponse,
  type SiteFilters,
} from '@pc/shared';
import { SERVER_API_URL } from './config';

/** Cliente de la API NestJS (modo servidor, opcional). Ver lib/backend.ts. */
const API_URL = SERVER_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${API_URL}${path}${qs ? `?${qs}` : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function post<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
    if (!res.ok) throw new ApiError(res.status, data?.message ?? `HTTP ${res.status}`);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export type BBox = [number, number, number, number];

export type Backend = typeof serverApi;

export const serverApi = {
  map: (bbox: BBox, zoom: number, filters: SiteFilters) =>
    get<MapResponse>('/v1/map', {
      bbox: bbox.map((n) => n.toFixed(5)).join(','),
      zoom,
      ...filtersToQuery(filters),
    }),
  nearby: (lat: number, lng: number, filters: SiteFilters, radiusKm = 25) =>
    get<NearbyResponse>('/v1/locations/nearby', {
      lat,
      lng,
      radiusKm,
      limit: 100,
      ...filtersToQuery(filters),
    }),
  location: (id: string) => get<LocationDetail>(`/v1/locations/${id}`),
  search: (q: string, lat?: number, lng?: number) =>
    get<SearchResponse>('/v1/search', { q, lat, lng }),
  operators: (country?: string) => get<OperatorListItem[]>('/v1/operators', { country }),
  sources: () => get<DataSourceInfo[]>('/v1/sources'),
  vehicleModels: (q: string) => get<VehicleSpec[]>('/v1/vehicle-models', { q, limit: 40 }),
  geocode: (q: string, lat?: number, lng?: number) =>
    get<GeocodeResult[]>('/v1/geocode', { q, lat, lng }),
  planRoute: (req: RoutePlanRequest) => post<RoutePlan>('/v1/routes/plan', req),
  report: (locationId: string, deviceId: string, type: ReportType, comment?: string) =>
    post<CommunitySummary>(
      `/v1/locations/${locationId}/reports`,
      { type, comment },
      { 'x-device-id': deviceId },
    ),
};
