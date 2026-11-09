import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from '@pc/db';
import {
  DATASET_VERSION,
  splitByCountry,
  type CountryEntry,
  type ConnectorRecord,
  type EvseRecord,
  type Manifest,
  type ManifestEntry,
  type OperatorRecord,
  type StationRecord,
  type StationsFile,
  type StatusFile,
  type VehiclesFile,
} from '@pc/dataset';
import type {
  ChargingCurvePoint,
  ConnectorFormat,
  ConnectorStandard,
  DataSourceInfo,
  EvseStatus,
  OpeningHours,
  PowerType,
  Tariff,
  VehicleSpec,
} from '@pc/shared';
import type { SourceAdapter } from '../sources/types';

/**
 * Exporta lo ingerido en PostGIS a ficheros estáticos para la app sin servidor:
 * manifest.json, stations.json, status.json y vehicles.json (publicados en GitHub Pages).
 */

/** Prefijo corto de cada fuente para el id estable de estación. */
export const SOURCE_PREFIX: Record<string, string> = {
  'es-nap-dgt': 'es',
  'pt-mobie': 'pt',
  'fr-irve': 'fr',
  'de-bnetza': 'de',
};

export function stableId(sourceId: string, externalId: string): string {
  return `${SOURCE_PREFIX[sourceId] ?? sourceId}:${externalId}`;
}

const clean = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) {
    const v = o[k];
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) delete o[k];
  }
  return o;
};

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

interface Row {
  primary_source_id: string;
  primary_ext: string | null;
  srcs: string[];
  name: string;
  operator_id: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  region: string | null;
  country_code: string;
  lat: number;
  lng: number;
  opening_hours: OpeningHours;
  is_24_7: boolean;
  site_type: StationRecord['st'] | null;
  payment_methods: StationRecord['pm'];
  accepted_providers: string[];
  facilities: StationRecord['f'];
  source_updated_at: Date | null;
  evses: Array<{
    evse_id: string | null;
    source_id: string;
    ext: string;
    tariffs: Tariff[] | null;
    c: Array<{
      s: ConnectorStandard;
      f: ConnectorFormat | null;
      p: PowerType | null;
      w: number;
      v: number | null;
      a: number | null;
    }> | null;
  }> | null;
}

export async function buildStationsFile(
  pool: Pool,
  dynamicSources: Set<string>,
): Promise<StationsFile> {
  const { rows } = await pool.query<Row>(
    `SELECT l.primary_source_id,
            (SELECT sr.external_id FROM source_records sr
              WHERE sr.location_id = l.id AND sr.source_id = l.primary_source_id AND sr.removed_at IS NULL
              ORDER BY sr.first_seen_at, sr.external_id LIMIT 1) AS primary_ext,
            (SELECT array_agg(DISTINCT sr.source_id) FROM source_records sr
              WHERE sr.location_id = l.id AND sr.removed_at IS NULL) AS srcs,
            l.name, l.operator_id, l.street, l.city, l.postal_code, l.province, l.region, l.country_code,
            ST_Y(l.geom) AS lat, ST_X(l.geom) AS lng, l.opening_hours, l.is_24_7, l.site_type,
            l.payment_methods, l.accepted_providers, l.facilities, l.source_updated_at,
            (SELECT json_agg(json_build_object(
                'evse_id', e.evse_id, 'source_id', e.source_id, 'ext', e.external_id, 'tariffs', e.tariffs,
                'c', (SELECT json_agg(json_build_object('s', c.standard, 'f', c.format, 'p', c.power_type,
                        'w', c.max_power_kw, 'v', c.max_voltage, 'a', c.max_amperage)) FROM connectors c
                      WHERE c.evse_uuid = e.id)) ORDER BY e.external_id)
               FROM evses e WHERE e.location_id = l.id) AS evses
     FROM locations l WHERE l.is_active ORDER BY l.country_code, l.primary_source_id`,
  );

  const stations: StationRecord[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.primary_ext || !r.evses?.some((e) => e.c?.length)) continue;
    const id = stableId(r.primary_source_id, r.primary_ext);
    if (seen.has(id)) continue;
    seen.add(id);
    // Un punto sin conectores no sirve para cargar ni para filtrar: se omite.
    const evses: EvseRecord[] = r.evses
      .filter((e) => e.c?.length)
      .map((e) =>
        clean<EvseRecord>({
          id: e.evse_id ?? undefined,
          k: dynamicSources.has(e.source_id) ? `${e.source_id}:${e.ext}` : undefined,
          t: e.tariffs?.length ? e.tariffs : undefined,
          c: (e.c ?? []).map((c) =>
            clean<ConnectorRecord>({
              s: c.s,
              f: c.f ?? undefined,
              p: c.p ?? undefined,
              w: round(c.w, 1),
              v: c.v ?? undefined,
              a: c.a ?? undefined,
            }),
          ),
        }),
      );
    const hasHours = r.opening_hours.regularHours.length > 0 || !!r.opening_hours.text;
    stations.push(
      clean<StationRecord>({
        i: id,
        n: r.name,
        o: r.operator_id ?? undefined,
        a: r.street ?? undefined,
        c: r.city ?? undefined,
        z: r.postal_code ?? undefined,
        pr: r.province ?? undefined,
        r: r.region ?? undefined,
        cc: r.country_code.trim(),
        y: round(r.lat, 6),
        x: round(r.lng, 6),
        h24: r.is_24_7 ? 1 : undefined,
        h: !r.is_24_7 && hasHours ? r.opening_hours : undefined,
        st: r.site_type ?? undefined,
        pm: r.payment_methods,
        ap: r.accepted_providers,
        f: r.facilities,
        u: r.source_updated_at?.toISOString(),
        src: [r.primary_source_id, ...r.srcs.filter((s) => s !== r.primary_source_id)],
        e: evses,
      }),
    );
  }

  const { rows: ops } = await pool.query<{
    id: string;
    name: string;
    legal_name: string | null;
    website: string | null;
    phone: string | null;
    app_ios_url: string | null;
    app_android_package: string | null;
    deeplink_template: string | null;
  }>(
    `SELECT o.id, o.name, o.legal_name, o.website, o.phone, o.app_ios_url, o.app_android_package, o.deeplink_template
     FROM operators o WHERE EXISTS (SELECT 1 FROM locations l WHERE l.operator_id = o.id AND l.is_active)`,
  );
  const operators: Record<string, OperatorRecord> = {};
  for (const o of ops) {
    operators[o.id] = clean<OperatorRecord>({
      n: o.name,
      ln: o.legal_name ?? undefined,
      w: o.website ?? undefined,
      p: o.phone ?? undefined,
      ios: o.app_ios_url ?? undefined,
      and: o.app_android_package ?? undefined,
      dl: o.deeplink_template ?? undefined,
    });
  }
  return { version: DATASET_VERSION, generatedAt: new Date().toISOString(), operators, stations };
}

/** Estado en tiempo real leído directamente de las fuentes (no necesita base de datos). */
export async function buildStatusFile(
  adapters: SourceAdapter[],
  options: { force?: boolean } = {},
): Promise<StatusFile> {
  const sources: StatusFile['sources'] = {};
  for (const adapter of adapters) {
    if (!adapter.statuses) continue;
    const evses: Record<string, EvseStatus> = {};
    let observedAt = new Date().toISOString();
    for await (const u of adapter.statuses({ force: options.force })) {
      evses[u.evseExternalId] = u.status;
      observedAt = u.observedAt;
    }
    sources[adapter.meta.id] = { observedAt, evses };
  }
  return { version: DATASET_VERSION, generatedAt: new Date().toISOString(), sources };
}

export async function buildVehiclesFile(pool: Pool): Promise<VehiclesFile> {
  const { rows } = await pool.query<{
    id: string;
    brand: string;
    model: string;
    variant: string | null;
    release_year: number | null;
    usable_battery_kwh: number;
    consumption_kwh_100: number | null;
    ac_max_kw: number;
    ac_phases: number;
    dc_max_kw: number | null;
    dc_curve: ChargingCurvePoint[] | null;
    connector_groups: VehicleSpec['connectorGroups'];
  }>(
    `SELECT id, brand, model, variant, release_year, usable_battery_kwh, consumption_kwh_100, ac_max_kw,
            ac_phases, dc_max_kw, dc_curve, connector_groups
     FROM vehicle_models WHERE is_active AND vehicle_type IN ('car', 'microcar')
     ORDER BY brand, model, release_year DESC NULLS LAST, variant NULLS FIRST`,
  );
  const vehicles: VehicleSpec[] = rows.map((r) => ({
    id: r.id,
    brand: r.brand,
    model: r.model,
    variant: r.variant,
    releaseYear: r.release_year,
    usableBatteryKwh: r.usable_battery_kwh,
    consumptionKwhPer100km: r.consumption_kwh_100,
    ac: { maxPowerKw: r.ac_max_kw, phases: r.ac_phases },
    dc: r.dc_max_kw ? { maxPowerKw: r.dc_max_kw, curve: r.dc_curve ?? [] } : null,
    connectorGroups: r.connector_groups,
  }));
  return { version: DATASET_VERSION, generatedAt: new Date().toISOString(), vehicles };
}

async function sourcesInfo(pool: Pool): Promise<DataSourceInfo[]> {
  const { rows } = await pool.query<{
    id: string;
    kind: DataSourceInfo['kind'];
    name: string;
    attribution: string;
    license_name: string | null;
    license_url: string | null;
    last_sync_at: Date | null;
    n: number;
  }>(
    `SELECT ds.id, ds.kind, ds.name, ds.attribution, ds.license_name, ds.license_url, ds.last_sync_at,
            CASE WHEN ds.kind = 'vehicles'
              THEN (SELECT count(*)::int FROM vehicle_models v WHERE v.source_id = ds.id AND v.is_active)
              ELSE (SELECT count(DISTINCT sr.location_id)::int FROM source_records sr
                    WHERE sr.source_id = ds.id AND sr.removed_at IS NULL) END AS n
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
    siteCount: r.n,
  }));
}

async function writeJson(
  dir: string,
  name: string,
  data: unknown,
  count: number,
): Promise<ManifestEntry> {
  const json = JSON.stringify(data);
  await writeFile(join(dir, name), json);
  return {
    path: name,
    bytes: Buffer.byteLength(json),
    count,
    generatedAt: new Date().toISOString(),
  };
}

export async function exportAll(
  pool: Pool,
  adapters: SourceAdapter[],
  outDir: string,
  options: { force?: boolean } = {},
): Promise<Manifest> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const dynamic = new Set(adapters.filter((a) => a.statuses).map((a) => a.meta.id));
  const [stations, vehicles, status, sources] = await Promise.all([
    buildStationsFile(pool, dynamic),
    buildVehiclesFile(pool),
    buildStatusFile(adapters, options),
    sourcesInfo(pool),
  ]);

  // v2: por país, un índice compacto y teselas de detalle (la app solo baja lo que necesita).
  const countries: CountryEntry[] = [];
  for (const { index, tiles } of splitByCountry(stations)) {
    const cc = index.cc.toLowerCase();
    const tilesPath = `tiles/${cc}`;
    await mkdir(join(outDir, tilesPath), { recursive: true });
    for (const tile of tiles)
      await writeFile(join(outDir, tilesPath, `${tile.key}.json`), JSON.stringify(tile));
    countries.push({
      cc: index.cc,
      count: index.rows.length,
      generatedAt: index.generatedAt,
      index: await writeJson(outDir, `index-${cc}.json`, index, index.rows.length),
      tilesPath,
      tiles: tiles.map((t) => t.key).sort(),
    });
  }

  const manifest: Manifest = {
    version: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    countries,
    files: {
      vehicles: await writeJson(outDir, 'vehicles.json', vehicles, vehicles.vehicles.length),
      status: await writeJson(outDir, 'status.json', status, countStatus(status)),
    },
    sources,
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(outDir, '.nojekyll'), '');
  return manifest;
}

/** Solo refresca status.json y su entrada en el manifiesto (tarea cada 15 min, sin base de datos). */
export async function exportStatusOnly(
  adapters: SourceAdapter[],
  outDir: string,
): Promise<ManifestEntry> {
  await mkdir(outDir, { recursive: true });
  const status = await buildStatusFile(adapters, { force: true });
  const entry = await writeJson(outDir, 'status.json', status, countStatus(status));
  const manifestPath = join(outDir, 'manifest.json');
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8').catch(() => 'null'),
  ) as Manifest | null;
  if (manifest) {
    manifest.files.status = entry;
    manifest.generatedAt = new Date().toISOString();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }
  return entry;
}

function countStatus(s: StatusFile): number {
  return Object.values(s.sources).reduce((n, src) => n + Object.keys(src.evses).length, 0);
}
