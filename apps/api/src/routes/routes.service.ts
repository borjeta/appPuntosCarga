import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from '@pc/db';
import type { ChargeConnector } from '@pc/pricing';
import type {
  GeocodeResult,
  LatLng,
  RoutePlan,
  RoutePlanRequest,
  Tariff,
  VehicleSpec,
} from '@pc/shared';
import { InjectPool } from '../db.module';
import { toNearbySite, type NearbyRow } from '../locations/mappers';
import { MAP_SITE_COLUMNS } from '../locations/sql';
import {
  assemblePlan,
  CORRIDOR_M,
  DETOUR_ROAD_FACTOR,
  type Geocoder,
  type RouteCandidate,
  type RoutingProvider,
} from '@pc/planner';

export const ROUTING = Symbol('ROUTING');
export const GEOCODER = Symbol('GEOCODER');

/** Corredor en grados (≈ 3 km) para el prefiltro con índice espacial. */
const CORRIDOR_DEG = CORRIDOR_M / 100_000;

export class PlanError extends Error {}

@Injectable()
export class RoutesService {
  constructor(
    @InjectPool() private readonly pool: Pool,
    @Inject(ROUTING) private readonly routing: RoutingProvider,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
  ) {}

  geocode(q: string, near: LatLng | null): Promise<GeocodeResult[]> {
    return this.geocoder.search(q, near);
  }

  async plan(req: RoutePlanRequest, vehicle: VehicleSpec): Promise<RoutePlan> {
    const route = await this.routing.route(req.origin, req.destination);
    if (!route) throw new PlanError('No se encontró una ruta por carretera entre esos puntos.');

    const minPowerKw = req.minPowerKw ?? 50;
    // Un coche sin carga rápida solo puede usar puntos AC: no se filtra por potencia.
    const sqlMinPower = vehicle.dc ? minPowerKw : 0;
    const candidates = await this.candidates(route.coordinates, route.distanceKm, sqlMinPower);

    return assemblePlan(req, vehicle, route, candidates, this.routing.attribution);
  }

  private async candidates(
    coordinates: Array<[number, number]>,
    totalKm: number,
    minPowerKw: number,
  ): Promise<RouteCandidate[]> {
    const geojson = JSON.stringify({ type: 'LineString', coordinates });
    const { rows } = await this.pool.query<
      NearbyRow & {
        frac: number;
        connectors: Array<ChargeConnector & { tariffs: Tariff[] | null }> | null;
      }
    >(
      `WITH r AS (SELECT ST_Simplify(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 0.0005) AS g),
       c AS (
         SELECT l.id, ST_LineLocatePoint(r.g, l.geom) AS frac,
                ST_Distance(l.geom::geography, ST_ClosestPoint(r.g, l.geom)::geography) AS dist_m
         FROM locations l, r
         WHERE l.is_active AND l.max_power_kw >= $2 AND ST_DWithin(l.geom, r.g, $3)
           -- La comunidad avisa de que no funciona: ≥2 averías en 14 días y ningún «funciona».
           AND NOT EXISTS (
             SELECT 1 FROM community_reports cr
             WHERE cr.location_id = l.id AND NOT cr.hidden AND cr.created_at > now() - interval '14 days'
             GROUP BY cr.location_id
             HAVING count(*) FILTER (WHERE cr.type IN ('BROKEN', 'CONNECTOR_DAMAGED', 'NOT_EXISTS')) >= 2
                AND count(*) FILTER (WHERE cr.type = 'WORKS') = 0)
       )
       SELECT ${MAP_SITE_COLUMNS}, l.street, l.city, c.frac, c.dist_m AS distance_m,
              (SELECT json_agg(json_build_object('standard', co.standard, 'powerType', co.power_type,
                        'maxPowerKw', co.max_power_kw, 'tariffs', e.tariffs))
                 FROM evses e JOIN connectors co ON co.evse_uuid = e.id
                WHERE e.location_id = l.id) AS connectors
       FROM c JOIN locations l ON l.id = c.id LEFT JOIN operators o ON o.id = l.operator_id`,
      [geojson, minPowerKw, CORRIDOR_DEG],
    );
    const now = new Date();
    return rows.map((r) => ({
      site: toNearbySite(r, now),
      kmAlong: r.frac * totalKm,
      detourKm: (r.distance_m / 1000) * DETOUR_ROAD_FACTOR,
      connectors: (r.connectors ?? []).map((c) => ({ ...c, tariffs: c.tariffs ?? [] })),
    }));
  }
}
