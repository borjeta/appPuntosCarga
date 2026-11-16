import type { RoutePlan, RoutePlanRequest, VehicleSpec } from '@pc/shared';
import { downsample, planStops, type RouteCandidate } from './planner';

/** Velocidad media supuesta para los desvíos hasta los cargadores. */
export const DETOUR_SPEED_KMH = 50;
/** Factor carretera/línea recta para estimar el desvío real. */
export const DETOUR_ROAD_FACTOR = 1.3;
/** Distancia máxima al trazado para considerar un cargador. */
export const CORRIDOR_M = 3000;

export interface RoadRoute {
  distanceKm: number;
  durationMin: number;
  /** [lng, lat] */
  coordinates: Array<[number, number]>;
}

/**
 * Une la ruta por carretera y los cargadores del corredor en un RoutePlan completo.
 * Lo usan igual la API (candidatos desde PostGIS) y la app (candidatos desde el motor local).
 */
export function assemblePlan(
  req: RoutePlanRequest,
  vehicle: VehicleSpec,
  route: RoadRoute,
  candidates: RouteCandidate[],
  attribution: string,
): RoutePlan {
  const result = planStops(
    {
      vehicle,
      totalKm: route.distanceKm,
      startSoc: req.startSoc,
      arrivalMinSoc: req.arrivalMinSoc ?? 10,
      stopMinSoc: req.stopMinSoc ?? 10,
      maxChargeSoc: req.maxChargeSoc ?? 80,
      minPowerKw: req.minPowerKw ?? 50,
    },
    candidates,
  );
  return {
    feasible: result.feasible,
    reason: result.reason,
    distanceKm: Math.round(route.distanceKm + result.detourKm),
    driveMinutes: Math.round(route.durationMin + (result.detourKm / DETOUR_SPEED_KMH) * 60),
    chargeMinutes: result.chargeMinutes,
    arrivalSoc: result.arrivalSoc,
    stops: result.stops,
    geometry: downsample(route.coordinates, 400).map(([lng, lat]) => [lat, lng]),
    attribution,
  };
}
