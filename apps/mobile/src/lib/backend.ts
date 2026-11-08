import {
  assemblePlan,
  CORRIDOR_M,
  DETOUR_ROAD_FACTOR,
  OsrmRouting,
  PhotonGeocoder,
  type RouteCandidate,
} from '@pc/planner';
import type { LocationDetail, VehicleSpec } from '@pc/shared';
import { ApiError, serverApi, type Backend } from './api';
import { GEOCODER_URL, ROUTING_URL, SERVER_API_URL } from './config';
import { repository } from './data/repository';
import { communitySummary, EMPTY_COMMUNITY, sendReport } from './supabase';

/**
 * Backend local (sin servidor propio): las mismas operaciones que la API, resueltas en el móvil
 * con los ficheros estáticos, Supabase (comunidad) y servicios públicos de rutas y lugares.
 */

const routing = new OsrmRouting(ROUTING_URL);
const geocoder = new PhotonGeocoder(GEOCODER_URL);

async function index() {
  const repo = await repository.ready();
  if (!repo.index) throw new ApiError(503, 'Datos no disponibles');
  return repo.index;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function vehicleSearch(vehicles: VehicleSpec[], q: string): VehicleSpec[] {
  const words = normalize(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return vehicles
    .filter((v) => {
      const text = normalize(`${v.brand} ${v.model} ${v.variant ?? ''} ${v.releaseYear ?? ''}`);
      return words.every((w) => text.includes(w));
    })
    .slice(0, 40);
}

export const localBackend: Backend = {
  map: async (bbox, zoom, filters) => (await index()).map(bbox, zoom, filters),
  nearby: async (lat, lng, filters, radiusKm = 25) =>
    (await index()).nearby(lat, lng, radiusKm * 1000, 100, filters),
  search: async (q, lat, lng) => (await index()).search(q, lat ?? null, lng ?? null),
  operators: async (country) => (await index()).operators(country ?? null),
  sources: async () => (await repository.ready()).manifest?.sources ?? [],

  location: async (id): Promise<LocationDetail> => {
    const detail = (await index()).detail(id);
    if (!detail) throw new ApiError(404, 'Estación no encontrada');
    // La comunidad es opcional: si falla (sin conexión, sin Supabase) la ficha se muestra igual.
    const community = await communitySummary(id).catch(() => ({
      ...EMPTY_COMMUNITY,
      disabled: true,
    }));
    return { ...detail, community };
  },

  vehicleModels: async (q) => vehicleSearch((await repository.ready()).vehicles, q),

  geocode: (q, lat, lng) =>
    geocoder.search(q, lat !== undefined && lng !== undefined ? { lat, lng } : null),

  planRoute: async (req) => {
    const repo = await repository.ready();
    const vehicle = repo.vehicles.find((v) => v.id === req.vehicleId);
    if (!vehicle) throw new ApiError(404, 'Modelo de vehículo no encontrado');
    const route = await routing.route(req.origin, req.destination).catch((err: Error) => {
      throw new ApiError(502, `Servicio de rutas no disponible: ${err.message}`);
    });
    if (!route) throw new ApiError(422, 'No se encontró una ruta por carretera entre esos puntos.');
    const minPowerKw = vehicle.dc ? (req.minPowerKw ?? 50) : 0;
    const candidates: RouteCandidate[] = (await index())
      .corridor(route.coordinates, CORRIDOR_M, minPowerKw)
      .map(({ site, alongM, distanceM, record }) => ({
        site,
        kmAlong: alongM / 1000,
        detourKm: (distanceM / 1000) * DETOUR_ROAD_FACTOR,
        connectors: record.e.flatMap((e) =>
          (e.c ?? []).map((c) => ({
            standard: c.s,
            powerType: c.p ?? null,
            maxPowerKw: c.w,
            tariffs: e.t ?? [],
          })),
        ),
      }));
    return assemblePlan(req, vehicle, route, candidates, routing.attribution);
  },

  report: (locationId, _deviceId, type, comment) => sendReport(locationId, type, comment),
};

/** Backend en uso: local (por defecto) o la API NestJS si se define EXPO_PUBLIC_API_URL. */
export const backend: Backend = SERVER_API_URL ? serverApi : localBackend;
export const BACKEND_MODE: 'local' | 'server' = SERVER_API_URL ? 'server' : 'local';
