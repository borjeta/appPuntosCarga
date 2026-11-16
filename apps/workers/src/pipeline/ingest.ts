import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from '@pc/db';
import { connectorGroupOf } from '@pc/shared';
import { decide, MAX_DISTANCE_M, type DedupCandidate, type DedupSubject } from '../dedup/score';
import { OPERATOR_CATALOG } from '../normalize/operators';
import type { NormalizedSite, SourceAdapter, SourceMeta, StatusUpdate } from '../sources/types';

export interface IngestStats {
  seen: number;
  unchanged: number;
  updated: number;
  created: number;
  merged: number;
  review: number;
  removed: number;
  removalSkipped: boolean;
  durationMs: number;
}

const BATCH_SIZE = 250;
/** Si una descarga trae menos de este % de registros que antes, no se borra nada (descarga rota). */
const MIN_RATIO_FOR_REMOVAL = 0.5;

export async function ensureSource(pool: Pool | PoolClient, meta: SourceMeta): Promise<void> {
  await pool.query(
    `INSERT INTO data_sources (id, name, attribution, license_name, license_url, priority)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, attribution = EXCLUDED.attribution,
       license_name = EXCLUDED.license_name, license_url = EXCLUDED.license_url, priority = EXCLUDED.priority`,
    [meta.id, meta.name, meta.attribution, meta.licenseName, meta.licenseUrl, meta.priority],
  );
}

export function siteHash(site: NormalizedSite): string {
  return createHash('sha1').update(JSON.stringify(site)).digest('hex');
}

function subjectOf(site: NormalizedSite): DedupSubject {
  const connectors = site.evses.flatMap((e) => e.connectors);
  return {
    lat: site.lat,
    lng: site.lng,
    operatorId: site.operator?.id ?? null,
    operatorName: site.operator?.legalName ?? site.operator?.displayName ?? null,
    evseIds: site.evses.map((e) => e.evseId).filter((x): x is string => !!x),
    connectorGroups: [...new Set(connectors.map((c) => connectorGroupOf(c.standard)))],
    maxPowerKw: Math.max(0, ...connectors.map((c) => c.maxPowerKw)),
  };
}

class BatchWriter {
  private operatorsDone = new Set<string>();

  constructor(
    private readonly meta: SourceMeta,
    private readonly stats: IngestStats,
  ) {}

  async process(client: PoolClient, sites: NormalizedSite[]): Promise<void> {
    const hashes = new Map(sites.map((s) => [s.externalId, siteHash(s)]));
    const { rows: existing } = await client.query<{
      external_id: string;
      location_id: string | null;
      payload_hash: string;
    }>(
      `SELECT external_id, location_id, payload_hash FROM source_records
       WHERE source_id = $1 AND external_id = ANY($2::text[])`,
      [this.meta.id, sites.map((s) => s.externalId)],
    );
    const known = new Map(existing.map((r) => [r.external_id, r]));

    const unchangedIds: string[] = [];
    const touched = new Set<string>();

    for (const site of sites) {
      this.stats.seen++;
      const hash = hashes.get(site.externalId)!;
      const rec = known.get(site.externalId);
      if (rec?.location_id && rec.payload_hash === hash) {
        unchangedIds.push(site.externalId);
        this.stats.unchanged++;
        continue;
      }

      await this.upsertOperator(client, site);

      let locationId: string;
      let contributesEvses: boolean;
      if (rec?.location_id) {
        locationId = rec.location_id;
        contributesEvses = await this.updateLocation(client, site, locationId);
        this.stats.updated++;
      } else {
        const decision = await this.findMatch(client, site);
        if (decision.action === 'merge') {
          locationId = decision.locationId;
          contributesEvses = await this.updateLocation(client, site, locationId);
          this.stats.merged++;
        } else {
          locationId = await this.insertLocation(client, site);
          contributesEvses = true;
          this.stats.created++;
          if (decision.action === 'review') {
            this.stats.review++;
            await client.query(
              `INSERT INTO dedup_candidates (source_id, external_id, candidate_location_id, score, reasons)
               VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
              [
                this.meta.id,
                site.externalId,
                decision.locationId,
                decision.score,
                decision.reasons,
              ],
            );
          }
        }
      }

      await client.query(
        `INSERT INTO source_records (source_id, external_id, location_id, payload_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_id, external_id) DO UPDATE SET location_id = EXCLUDED.location_id,
           payload_hash = EXCLUDED.payload_hash, last_seen_at = now(), removed_at = NULL`,
        [this.meta.id, site.externalId, locationId, hash],
      );
      if (contributesEvses) await this.writeEvses(client, site, locationId);
      touched.add(locationId);
    }

    if (unchangedIds.length) {
      await client.query(
        `UPDATE source_records SET last_seen_at = now(), removed_at = NULL
         WHERE source_id = $1 AND external_id = ANY($2::text[])`,
        [this.meta.id, unchangedIds],
      );
    }
    if (touched.size) {
      await client.query('SELECT refresh_location_summary($1::uuid[])', [[...touched]]);
    }
  }

  private async upsertOperator(client: PoolClient, site: NormalizedSite): Promise<void> {
    const op = site.operator;
    if (!op || this.operatorsDone.has(op.id)) return;
    const curated = OPERATOR_CATALOG[op.id];
    await client.query(
      `INSERT INTO operators (id, name, legal_name, country_code, website, phone,
                              app_ios_url, app_android_package, deeplink_template, curated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         name = CASE WHEN operators.curated AND NOT EXCLUDED.curated THEN operators.name ELSE EXCLUDED.name END,
         legal_name = COALESCE(EXCLUDED.legal_name, operators.legal_name),
         website = COALESCE(EXCLUDED.website, operators.website),
         phone = COALESCE(EXCLUDED.phone, operators.phone),
         app_ios_url = COALESCE(EXCLUDED.app_ios_url, operators.app_ios_url),
         app_android_package = COALESCE(EXCLUDED.app_android_package, operators.app_android_package),
         deeplink_template = COALESCE(EXCLUDED.deeplink_template, operators.deeplink_template),
         curated = operators.curated OR EXCLUDED.curated,
         updated_at = now()`,
      [
        op.id,
        op.displayName,
        op.legalName,
        op.countryCode,
        op.website,
        op.phone,
        curated?.appIosUrl ?? null,
        curated?.appAndroidPackage ?? null,
        curated?.deeplinkTemplate ?? null,
        !!curated,
      ],
    );
    this.operatorsDone.add(op.id);
  }

  private locationParams(site: NormalizedSite) {
    return [
      site.operator?.id ?? null, // $1
      site.name, // $2
      site.street, // $3
      site.city, // $4
      site.postalCode, // $5
      site.province, // $6
      site.region, // $7
      site.countryCode, // $8
      site.lng, // $9
      site.lat, // $10
      site.openingHours, // $11
      site.openingHours.twentyFourSeven, // $12
      site.siteType, // $13
      site.paymentMethods, // $14
      site.acceptedProviders, // $15
      site.facilities, // $16
      this.meta.id, // $17
      site.sourceUpdatedAt, // $18
    ];
  }

  private async insertLocation(client: PoolClient, site: NormalizedSite): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO locations (operator_id, name, street, city, postal_code, province, region, country_code,
         geom, opening_hours, is_24_7, site_type, payment_methods, accepted_providers, facilities,
         primary_source_id, source_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_SetSRID(ST_MakePoint($9, $10), 4326), $11, $12, $13,
         $14, $15, $16, $17, $18)
       RETURNING id`,
      this.locationParams(site),
    );
    return rows[0]!.id;
  }

  /** Actualiza una estación existente. Devuelve true si esta fuente es la principal (aporta puntos). */
  private async updateLocation(
    client: PoolClient,
    site: NormalizedSite,
    locationId: string,
  ): Promise<boolean> {
    const { rows } = await client.query<{ primary_source_id: string; priority: number }>(
      `SELECT l.primary_source_id, ds.priority FROM locations l
       JOIN data_sources ds ON ds.id = l.primary_source_id WHERE l.id = $1`,
      [locationId],
    );
    const current = rows[0];
    const isPrimary =
      !current ||
      current.primary_source_id === this.meta.id ||
      this.meta.priority > current.priority;

    if (isPrimary) {
      if (current && current.primary_source_id !== this.meta.id) {
        // Una fuente más fiable toma el control: sus puntos sustituyen a los de las demás.
        await client.query('DELETE FROM evses WHERE location_id = $1 AND source_id <> $2', [
          locationId,
          this.meta.id,
        ]);
      }
      await client.query(
        `UPDATE locations SET operator_id = $1, name = $2, street = $3, city = $4, postal_code = $5,
           province = $6, region = $7, country_code = $8, geom = ST_SetSRID(ST_MakePoint($9, $10), 4326),
           opening_hours = $11, is_24_7 = $12, site_type = $13, payment_methods = $14,
           accepted_providers = $15, facilities = $16, primary_source_id = $17, source_updated_at = $18,
           is_active = true, updated_at = now()
         WHERE id = $19`,
        [...this.locationParams(site), locationId],
      );
    } else {
      // Fuente secundaria: solo completa huecos y suma métodos de pago/servicios.
      await client.query(
        `UPDATE locations SET
           operator_id = COALESCE(operator_id, $1), street = COALESCE(street, $2), city = COALESCE(city, $3),
           postal_code = COALESCE(postal_code, $4),
           payment_methods = ARRAY(SELECT DISTINCT unnest(payment_methods || $5::text[]) ORDER BY 1),
           accepted_providers = ARRAY(SELECT DISTINCT unnest(accepted_providers || $6::text[]) ORDER BY 1),
           facilities = ARRAY(SELECT DISTINCT unnest(facilities || $7::text[]) ORDER BY 1),
           is_active = true, updated_at = now()
         WHERE id = $8`,
        [
          site.operator?.id ?? null,
          site.street,
          site.city,
          site.postalCode,
          site.paymentMethods,
          site.acceptedProviders,
          site.facilities,
          locationId,
        ],
      );
    }
    return isPrimary;
  }

  private async findMatch(client: PoolClient, site: NormalizedSite) {
    const subject = subjectOf(site);
    if (subject.evseIds.length) {
      const { rows } = await client.query<{ location_id: string }>(
        `SELECT e.location_id FROM evses e JOIN locations l ON l.id = e.location_id
         WHERE e.evse_id = ANY($1::text[]) AND e.source_id <> $2 AND l.is_active LIMIT 1`,
        [subject.evseIds, this.meta.id],
      );
      if (rows[0])
        return { action: 'merge' as const, locationId: rows[0].location_id, score: 1, reasons: {} };
    }

    const { rows } = await client.query<{
      id: string;
      lat: number;
      lng: number;
      operator_id: string | null;
      operator_name: string | null;
      max_power_kw: number;
      connector_groups: string[];
      evse_ids: string[] | null;
    }>(
      `WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS g)
       SELECT l.id, ST_Y(l.geom) AS lat, ST_X(l.geom) AS lng, l.operator_id,
              COALESCE(o.legal_name, o.name) AS operator_name, l.max_power_kw, l.connector_groups,
              (SELECT array_agg(e.evse_id) FROM evses e WHERE e.location_id = l.id AND e.evse_id IS NOT NULL) AS evse_ids
       FROM locations l CROSS JOIN p
       LEFT JOIN operators o ON o.id = l.operator_id
       WHERE l.is_active
         AND l.geom && ST_Expand(p.g, 0.002)
         AND ST_DWithin(l.geom::geography, p.g::geography, $3)
         AND NOT EXISTS (SELECT 1 FROM source_records sr
                         WHERE sr.location_id = l.id AND sr.source_id = $4 AND sr.removed_at IS NULL)`,
      [site.lng, site.lat, MAX_DISTANCE_M, this.meta.id],
    );
    const candidates: DedupCandidate[] = rows.map((r) => ({
      locationId: r.id,
      lat: r.lat,
      lng: r.lng,
      operatorId: r.operator_id,
      operatorName: r.operator_name,
      maxPowerKw: r.max_power_kw,
      connectorGroups: r.connector_groups,
      evseIds: r.evse_ids ?? [],
    }));
    return decide(subject, candidates);
  }

  private async writeEvses(
    client: PoolClient,
    site: NormalizedSite,
    locationId: string,
  ): Promise<void> {
    // Un mismo id repetido dentro de la estación rompería el ON CONFLICT: nos quedamos con el primero.
    const evses = [...new Map(site.evses.map((e) => [e.externalId, e])).values()];
    const { rows } = await client.query<{ id: string; external_id: string }>(
      `INSERT INTO evses (location_id, source_id, record_external_id, external_id, evse_id)
       SELECT $1, $2, $3, x.ext, x.eid FROM unnest($4::text[], $5::text[]) AS x(ext, eid)
       ON CONFLICT (source_id, external_id) DO UPDATE SET location_id = EXCLUDED.location_id,
         record_external_id = EXCLUDED.record_external_id, evse_id = EXCLUDED.evse_id
       RETURNING id, external_id`,
      [
        locationId,
        this.meta.id,
        site.externalId,
        evses.map((e) => e.externalId),
        evses.map((e) => e.evseId),
      ],
    );
    await client.query(
      `DELETE FROM evses WHERE source_id = $1 AND record_external_id = $2 AND NOT (external_id = ANY($3::text[]))`,
      [this.meta.id, site.externalId, evses.map((e) => e.externalId)],
    );

    const uuidByExt = new Map(rows.map((r) => [r.external_id, r.id]));
    await client.query('DELETE FROM connectors WHERE evse_uuid = ANY($1::uuid[])', [
      rows.map((r) => r.id),
    ]);

    const cols = {
      evse: [] as string[],
      standard: [] as string[],
      group: [] as string[],
      format: [] as (string | null)[],
      powerType: [] as (string | null)[],
      kw: [] as number[],
      volt: [] as (number | null)[],
      amp: [] as (number | null)[],
    };
    for (const e of evses) {
      const uuid = uuidByExt.get(e.externalId);
      if (!uuid) continue;
      for (const c of e.connectors) {
        cols.evse.push(uuid);
        cols.standard.push(c.standard);
        cols.group.push(connectorGroupOf(c.standard));
        cols.format.push(c.format);
        cols.powerType.push(c.powerType);
        cols.kw.push(c.maxPowerKw);
        cols.volt.push(c.maxVoltage);
        cols.amp.push(c.maxAmperage);
      }
    }
    if (cols.evse.length) {
      await client.query(
        `INSERT INTO connectors (evse_uuid, standard, group_key, format, power_type, max_power_kw, max_voltage, max_amperage)
         SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::real[], $7::real[], $8::real[])`,
        [
          cols.evse,
          cols.standard,
          cols.group,
          cols.format,
          cols.powerType,
          cols.kw,
          cols.volt,
          cols.amp,
        ],
      );
    }
  }
}

export async function ingestSites(
  pool: Pool,
  adapter: SourceAdapter,
  options: { file?: string; force?: boolean; log?: (msg: string) => void } = {},
): Promise<IngestStats> {
  const log = options.log ?? (() => undefined);
  const started = Date.now();
  await ensureSource(pool, adapter.meta);
  const { rows: startRows } = await pool.query<{ now: Date }>('SELECT now() AS now');
  const runStart = startRows[0]!.now;

  const stats: IngestStats = {
    seen: 0,
    unchanged: 0,
    updated: 0,
    created: 0,
    merged: 0,
    review: 0,
    removed: 0,
    removalSkipped: false,
    durationMs: 0,
  };
  const writer = new BatchWriter(adapter.meta, stats);

  const client = await pool.connect();
  try {
    let batch: NormalizedSite[] = [];
    const flush = async () => {
      if (!batch.length) return;
      await client.query('BEGIN');
      try {
        await writer.process(client, batch);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      batch = [];
      if (stats.seen % 2000 < BATCH_SIZE) log(`  … ${stats.seen} estaciones procesadas`);
    };
    for await (const site of adapter.sites(options)) {
      batch.push(site);
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();

    // Registros que ya no aparecen en la fuente → retirados (con salvaguarda ante descargas rotas).
    const { rows: activeRows } = await client.query<{ n: string }>(
      'SELECT count(*) AS n FROM source_records WHERE source_id = $1 AND removed_at IS NULL',
      [adapter.meta.id],
    );
    const previouslyActive = Number(activeRows[0]!.n);
    if (previouslyActive > 0 && stats.seen < previouslyActive * MIN_RATIO_FOR_REMOVAL) {
      stats.removalSkipped = true;
      log(
        `  ⚠ Solo ${stats.seen} de ${previouslyActive} registros: no se retira nada (¿descarga incompleta?)`,
      );
    } else {
      await client.query('BEGIN');
      const { rows: removed } = await client.query<{
        external_id: string;
        location_id: string | null;
      }>(
        `UPDATE source_records SET removed_at = now()
         WHERE source_id = $1 AND last_seen_at < $2 AND removed_at IS NULL
         RETURNING external_id, location_id`,
        [adapter.meta.id, runStart],
      );
      stats.removed = removed.length;
      if (removed.length) {
        await client.query(
          'DELETE FROM evses WHERE source_id = $1 AND record_external_id = ANY($2::text[])',
          [adapter.meta.id, removed.map((r) => r.external_id)],
        );
        const ids = [...new Set(removed.map((r) => r.location_id).filter(Boolean))];
        await client.query(
          `UPDATE locations l SET is_active = false, updated_at = now()
           WHERE l.id = ANY($1::uuid[]) AND NOT EXISTS (
             SELECT 1 FROM source_records sr WHERE sr.location_id = l.id AND sr.removed_at IS NULL)`,
          [ids],
        );
        await client.query('SELECT refresh_location_summary($1::uuid[])', [ids]);
      }
      await client.query('COMMIT');
    }
  } finally {
    client.release();
  }

  stats.durationMs = Date.now() - started;
  await pool.query(
    'UPDATE data_sources SET last_sync_at = now(), last_sync_stats = $2 WHERE id = $1',
    [adapter.meta.id, stats],
  );
  return stats;
}

export interface StatusStats {
  received: number;
  matched: number;
  locationsRefreshed: number;
  durationMs: number;
}

export async function ingestStatuses(
  pool: Pool,
  adapter: SourceAdapter,
  options: { file?: string; force?: boolean } = {},
): Promise<StatusStats> {
  if (!adapter.statuses)
    throw new Error(`La fuente ${adapter.meta.id} no publica estados dinámicos`);
  const started = Date.now();
  await ensureSource(pool, adapter.meta);
  const stats: StatusStats = { received: 0, matched: 0, locationsRefreshed: 0, durationMs: 0 };
  const touched = new Set<string>();

  let batch: StatusUpdate[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const { rows } = await pool.query<{ location_id: string }>(
      `UPDATE evses e SET status = u.status, status_updated_at = u.observed_at::timestamptz,
         tariffs = COALESCE(u.tariffs::jsonb, e.tariffs)
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS u(ext, status, observed_at, tariffs)
       WHERE e.source_id = $1 AND e.external_id = u.ext
       RETURNING e.location_id`,
      [
        adapter.meta.id,
        batch.map((u) => u.evseExternalId),
        batch.map((u) => u.status),
        batch.map((u) => u.observedAt),
        batch.map((u) => (u.tariffs ? JSON.stringify(u.tariffs) : null)),
      ],
    );
    stats.matched += rows.length;
    for (const r of rows) touched.add(r.location_id);
    batch = [];
  };

  for await (const update of adapter.statuses(options)) {
    stats.received++;
    batch.push(update);
    if (batch.length >= 2000) await flush();
  }
  await flush();

  const ids = [...touched];
  for (let i = 0; i < ids.length; i += 1000) {
    await pool.query('SELECT refresh_location_summary($1::uuid[])', [ids.slice(i, i + 1000)]);
  }
  stats.locationsRefreshed = ids.length;
  stats.durationMs = Date.now() - started;
  return stats;
}
