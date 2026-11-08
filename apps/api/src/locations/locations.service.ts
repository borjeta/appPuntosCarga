import { Injectable } from '@nestjs/common';
import type { Pool } from '@pc/db';
import { summarizeSiteStatus } from '@pc/shared';
import type {
  BBox,
  ConnectorDetail,
  DataSourceInfo,
  EvseDetail,
  EvseStatus,
  LocationDetail,
  MapCluster,
  MapResponse,
  NearbyResponse,
  OpeningHours,
  OperatorListItem,
  SearchResponse,
  SiteFilters,
  SiteStatus,
  Tariff,
} from '@pc/shared';
import { InjectPool } from '../db.module';
import { toEvseStatus, toMapSite, toNearbySite, type MapSiteRow, type NearbyRow } from './mappers';
import {
  clusterCellDegrees,
  escapeLike,
  filterConditions,
  MAP_SITE_COLUMNS,
  MAX_SITES,
  SITES_MIN_ZOOM,
} from './sql';

@Injectable()
export class LocationsService {
  constructor(@InjectPool() private readonly pool: Pool) {}

  async map(bbox: BBox, zoom: number, filters: SiteFilters): Promise<MapResponse> {
    const params: unknown[] = [...bbox];
    const where = [
      ...filterConditions(filters, params),
      'l.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)',
    ].join(' AND ');

    if (zoom >= SITES_MIN_ZOOM) {
      const { rows } = await this.pool.query<MapSiteRow>(
        `SELECT ${MAP_SITE_COLUMNS} FROM locations l LEFT JOIN operators o ON o.id = l.operator_id
         WHERE ${where} ORDER BY l.max_power_kw DESC LIMIT ${MAX_SITES + 1}`,
        params,
      );
      return {
        items: rows.slice(0, MAX_SITES).map((r) => toMapSite(r)),
        truncated: rows.length > MAX_SITES,
      };
    }

    const cell = clusterCellDegrees(zoom);
    params.push(cell);
    const cellParam = `$${params.length}`;
    const { rows } = await this.pool.query<{
      gx: number;
      gy: number;
      n: number;
      max_kw: number;
      lat: number;
      lng: number;
      one_id: string;
    }>(
      `SELECT floor(ST_X(l.geom) / ${cellParam})::int AS gx, floor(ST_Y(l.geom) / ${cellParam})::int AS gy,
              count(*)::int AS n, max(l.max_power_kw) AS max_kw,
              avg(ST_Y(l.geom)) AS lat, avg(ST_X(l.geom)) AS lng, (array_agg(l.id))[1] AS one_id
       FROM locations l WHERE ${where} GROUP BY gx, gy`,
      params,
    );

    const singles = rows.filter((r) => r.n === 1).map((r) => r.one_id);
    const siteRows = singles.length
      ? (
          await this.pool.query<MapSiteRow>(
            `SELECT ${MAP_SITE_COLUMNS} FROM locations l LEFT JOIN operators o ON o.id = l.operator_id
             WHERE l.id = ANY($1::uuid[])`,
            [singles],
          )
        ).rows
      : [];
    const now = new Date();
    const clusters: MapCluster[] = rows
      .filter((r) => r.n > 1)
      .map((r) => ({
        kind: 'cluster',
        id: `${zoom}:${r.gx}:${r.gy}`,
        lat: r.lat,
        lng: r.lng,
        count: r.n,
        maxPowerKw: r.max_kw,
      }));
    return { items: [...clusters, ...siteRows.map((r) => toMapSite(r, now))], truncated: false };
  }

  async nearby(
    lat: number,
    lng: number,
    radiusM: number,
    limit: number,
    filters: SiteFilters,
  ): Promise<NearbyResponse> {
    const params: unknown[] = [lng, lat, radiusM];
    // Prefiltro por caja (usa el índice GiST) con margen para la convergencia de meridianos.
    const degLat = radiusM / 111_320;
    const degLng = degLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    params.push(degLng, degLat);
    const where = [
      ...filterConditions(filters, params),
      `l.geom && ST_MakeEnvelope($1 - $4, $2 - $5, $1 + $4, $2 + $5, 4326)`,
      `ST_DWithin(l.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
    ].join(' AND ');
    params.push(limit);
    const { rows } = await this.pool.query<NearbyRow>(
      `SELECT ${MAP_SITE_COLUMNS}, l.street, l.city,
              ST_Distance(l.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
       FROM locations l LEFT JOIN operators o ON o.id = l.operator_id
       WHERE ${where} ORDER BY distance_m LIMIT $${params.length}`,
      params,
    );
    const now = new Date();
    return { items: rows.map((r) => toNearbySite(r, now)) };
  }

  async detail(id: string): Promise<Omit<LocationDetail, 'community'> | null> {
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      street: string | null;
      city: string | null;
      postal_code: string | null;
      province: string | null;
      region: string | null;
      country_code: string;
      opening_hours: OpeningHours;
      site_type: LocationDetail['siteType'];
      payment_methods: LocationDetail['paymentMethods'];
      accepted_providers: string[];
      facilities: LocationDetail['facilities'];
      max_power_kw: number;
      status_summary: SiteStatus;
      status_updated_at: Date | null;
      source_updated_at: Date | null;
      op_id: string | null;
      op_name: string | null;
      op_legal_name: string | null;
      op_website: string | null;
      op_phone: string | null;
      op_ios: string | null;
      op_android: string | null;
      op_deeplink: string | null;
    }>(
      `SELECT l.id, l.name, ST_Y(l.geom) AS lat, ST_X(l.geom) AS lng, l.street, l.city, l.postal_code,
              l.province, l.region, l.country_code, l.opening_hours, l.site_type, l.payment_methods,
              l.accepted_providers, l.facilities, l.max_power_kw, l.status_summary, l.status_updated_at,
              l.source_updated_at,
              o.id AS op_id, o.name AS op_name, o.legal_name AS op_legal_name, o.website AS op_website,
              o.phone AS op_phone, o.app_ios_url AS op_ios, o.app_android_package AS op_android,
              o.deeplink_template AS op_deeplink
       FROM locations l LEFT JOIN operators o ON o.id = l.operator_id
       WHERE l.id = $1 AND l.is_active`,
      [id],
    );
    const l = rows[0];
    if (!l) return null;

    const [{ rows: evseRows }, { rows: sourceRows }] = await Promise.all([
      this.pool.query<{
        id: string;
        evse_id: string | null;
        status: EvseStatus;
        status_updated_at: Date | null;
        tariffs: Tariff[];
        connectors: Array<{
          standard: ConnectorDetail['standard'];
          format: ConnectorDetail['format'];
          power_type: ConnectorDetail['powerType'];
          max_power_kw: number;
          max_voltage: number | null;
          max_amperage: number | null;
        }>;
      }>(
        `SELECT e.id, e.evse_id, e.status, e.status_updated_at, e.tariffs,
                COALESCE(json_agg(json_build_object(
                  'standard', c.standard, 'format', c.format, 'power_type', c.power_type,
                  'max_power_kw', c.max_power_kw, 'max_voltage', c.max_voltage, 'max_amperage', c.max_amperage)
                  ORDER BY c.max_power_kw DESC) FILTER (WHERE c.id IS NOT NULL), '[]') AS connectors
         FROM evses e LEFT JOIN connectors c ON c.evse_uuid = e.id
         WHERE e.location_id = $1
         GROUP BY e.id ORDER BY max(c.max_power_kw) DESC NULLS LAST, e.evse_id NULLS LAST, e.external_id`,
        [id],
      ),
      this.pool.query<{
        id: string;
        name: string;
        attribution: string;
        license_name: string | null;
        license_url: string | null;
        last_seen_at: Date;
      }>(
        `SELECT ds.id, ds.name, ds.attribution, ds.license_name, ds.license_url, sr.last_seen_at
         FROM source_records sr JOIN data_sources ds ON ds.id = sr.source_id
         WHERE sr.location_id = $1 AND sr.removed_at IS NULL ORDER BY ds.priority DESC`,
        [id],
      ),
    ]);

    const now = new Date();
    const evses: EvseDetail[] = evseRows.map((e) => ({
      id: e.id,
      evseId: e.evse_id,
      status: toEvseStatus(e.status, e.status_updated_at, now),
      statusUpdatedAt: e.status_updated_at?.toISOString() ?? null,
      connectors: e.connectors.map((c) => ({
        standard: c.standard,
        format: c.format,
        powerType: c.power_type,
        maxPowerKw: c.max_power_kw,
        maxVoltage: c.max_voltage,
        maxAmperage: c.max_amperage,
      })),
      tariffs: e.tariffs ?? [],
    }));

    return {
      id: l.id,
      name: l.name,
      operator: l.op_id
        ? {
            id: l.op_id,
            name: l.op_name ?? l.op_id,
            legalName: l.op_legal_name,
            website: l.op_website,
            phone: l.op_phone,
            appIosUrl: l.op_ios,
            appAndroidPackage: l.op_android,
            deeplinkTemplate: l.op_deeplink,
          }
        : null,
      address: {
        street: l.street,
        city: l.city,
        postalCode: l.postal_code,
        province: l.province,
        region: l.region,
        countryCode: l.country_code,
      },
      lat: l.lat,
      lng: l.lng,
      openingHours: l.opening_hours,
      siteType: l.site_type,
      paymentMethods: l.payment_methods,
      acceptedProviders: l.accepted_providers,
      facilities: l.facilities,
      maxPowerKw: l.max_power_kw,
      status: summarizeSiteStatus(evses.map((e) => e.status)),
      evses,
      sources: sourceRows.map((s) => ({
        sourceId: s.id,
        name: s.name,
        attribution: s.attribution,
        licenseName: s.license_name,
        licenseUrl: s.license_url,
        lastSeenAt: s.last_seen_at.toISOString(),
      })),
      lastUpdated: l.source_updated_at?.toISOString() ?? null,
    };
  }

  async search(q: string, lat: number | null, lng: number | null): Promise<SearchResponse> {
    const term = q
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
      .slice(0, 80);
    if (term.length < 2) return { locations: [], operators: [] };
    const like = `%${escapeLike(term)}%`;
    const hasPoint = lat !== null && lng !== null;
    const params: unknown[] = [like, term];
    if (hasPoint) params.push(lng, lat);
    const distance = hasPoint
      ? 'ST_Distance(l.geom::geography, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)'
      : '0';

    const [{ rows: locRows }, { rows: opRows }] = await Promise.all([
      this.pool.query<NearbyRow>(
        `SELECT ${MAP_SITE_COLUMNS}, l.street, l.city, ${distance} AS distance_m
         FROM locations l LEFT JOIN operators o ON o.id = l.operator_id
         WHERE l.is_active AND l.search_text LIKE $1
         ORDER BY word_similarity($2, l.search_text) DESC, distance_m ASC LIMIT 25`,
        params,
      ),
      this.pool.query<{ id: string; name: string; site_count: number }>(
        `SELECT o.id, o.name, count(l.id)::int AS site_count
         FROM operators o JOIN locations l ON l.operator_id = o.id AND l.is_active
         WHERE lower(f_unaccent(o.name)) LIKE $1 OR lower(f_unaccent(coalesce(o.legal_name, ''))) LIKE $1
         GROUP BY o.id, o.name ORDER BY site_count DESC LIMIT 8`,
        [like],
      ),
    ]);
    const now = new Date();
    return {
      locations: locRows.map((r) => toNearbySite(r, now)),
      operators: opRows.map((o) => ({ id: o.id, name: o.name, siteCount: o.site_count })),
    };
  }

  async operators(countryCode: string | null): Promise<OperatorListItem[]> {
    const { rows } = await this.pool.query<{ id: string; name: string; site_count: number }>(
      `SELECT o.id, o.name, count(l.id)::int AS site_count
       FROM operators o JOIN locations l ON l.operator_id = o.id AND l.is_active
       WHERE ($1::text IS NULL OR l.country_code = $1)
       GROUP BY o.id, o.name ORDER BY site_count DESC, o.name`,
      [countryCode],
    );
    return rows.map((r) => ({ id: r.id, name: r.name, siteCount: r.site_count }));
  }

  async sources(): Promise<DataSourceInfo[]> {
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      attribution: string;
      license_name: string | null;
      license_url: string | null;
      last_sync_at: Date | null;
      kind: DataSourceInfo['kind'];
      site_count: number;
    }>(
      `SELECT ds.id, ds.name, ds.attribution, ds.license_name, ds.license_url, ds.last_sync_at, ds.kind,
              CASE WHEN ds.kind = 'vehicles'
                THEN (SELECT count(*)::int FROM vehicle_models v WHERE v.source_id = ds.id AND v.is_active)
                ELSE (SELECT count(DISTINCT sr.location_id)::int FROM source_records sr
                      WHERE sr.source_id = ds.id AND sr.removed_at IS NULL)
              END AS site_count
       FROM data_sources ds ORDER BY ds.kind, ds.priority DESC, ds.id`,
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      attribution: r.attribution,
      licenseName: r.license_name,
      licenseUrl: r.license_url,
      lastSyncAt: r.last_sync_at?.toISOString() ?? null,
      siteCount: r.site_count,
    }));
  }

  async ping(): Promise<boolean> {
    await this.pool.query('SELECT 1');
    return true;
  }
}
