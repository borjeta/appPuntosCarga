import { readFile } from 'node:fs/promises';
import type { Pool } from '@pc/db';
import type { ChargingCurvePoint, ConnectorGroup, VehicleSpec } from '@pc/shared';
import { downloadToCache } from '../download';
import { ensureSource } from '../pipeline/ingest';
import type { SourceMeta } from '../sources/types';

/**
 * Open EV Data: especificaciones de carga de ~1.300 modelos.
 * Licencia MIT con atribución obligatoria y visible (se muestra en "Fuentes de datos").
 * https://github.com/KilowattApp/open-ev-data
 */
export const OPEN_EV_DATA_URL =
  'https://raw.githubusercontent.com/KilowattApp/open-ev-data/master/data/ev-data.json';

export const openEvDataMeta: SourceMeta = {
  id: 'open-ev-data',
  name: 'Open EV Data',
  attribution: 'Open EV Data (https://github.com/KilowattApp/open-ev-data)',
  licenseName: 'MIT con atribución',
  licenseUrl: 'https://github.com/KilowattApp/open-ev-data/blob/master/LICENSE',
  priority: 50,
};

export interface RawEvVehicle {
  id: string;
  brand: string;
  model: string;
  variant?: string | null;
  release_year?: number | null;
  vehicle_type?: string;
  usable_battery_size: number;
  energy_consumption?: { average_consumption?: number | null } | null;
  ac_charger?: { usable_phases?: number; ports?: string[]; max_power?: number } | null;
  dc_charger?: {
    ports?: string[];
    max_power?: number;
    charging_curve?: Array<{ percentage: number; power: number }>;
  } | null;
}

/** Puertos de Open EV Data → grupos de conector de los filtros. */
export function connectorGroupsFor(raw: RawEvVehicle): ConnectorGroup[] {
  const ac = raw.ac_charger?.ports ?? [];
  const dc = raw.dc_charger?.ports ?? [];
  const groups = new Set<ConnectorGroup>();
  if (ac.includes('type2')) groups.add('TYPE2');
  if (ac.includes('type1')) groups.add('TYPE1');
  // Un CCS con toma AC Tipo 1 es CCS1 (mercado americano); en Europa, CCS2.
  if (dc.includes('ccs') || dc.includes('tesla_ccs'))
    groups.add(ac.includes('type1') ? 'CCS1' : 'CCS2');
  if (dc.includes('chademo')) groups.add('CHADEMO');
  return [...groups].sort();
}

export function toVehicleSpec(raw: RawEvVehicle): VehicleSpec | null {
  if (!raw.id || !raw.brand || !raw.model || !(raw.usable_battery_size > 0)) return null;
  const acMax = raw.ac_charger?.max_power ?? 0;
  const dcMax = raw.dc_charger?.max_power ?? 0;
  const curve: ChargingCurvePoint[] = (raw.dc_charger?.charging_curve ?? [])
    .filter((p) => Number.isFinite(p.percentage) && Number.isFinite(p.power))
    .map((p) => ({ soc: p.percentage, powerKw: p.power }))
    .sort((a, b) => a.soc - b.soc);
  const consumption = raw.energy_consumption?.average_consumption;
  return {
    id: raw.id,
    brand: raw.brand.trim(),
    model: raw.model.trim(),
    variant: raw.variant?.trim() || null,
    releaseYear: raw.release_year ?? null,
    usableBatteryKwh: raw.usable_battery_size,
    consumptionKwhPer100km: consumption && consumption > 0 ? consumption : null,
    ac: { maxPowerKw: acMax, phases: raw.ac_charger?.usable_phases ?? 1 },
    dc: dcMax > 0 ? { maxPowerKw: dcMax, curve } : null,
    connectorGroups: connectorGroupsFor(raw),
  };
}

export async function ingestVehicles(
  pool: Pool,
  options: { file?: string; force?: boolean } = {},
): Promise<{ received: number; saved: number; deactivated: number }> {
  await ensureSource(pool, openEvDataMeta);
  await pool.query("UPDATE data_sources SET kind = 'vehicles' WHERE id = $1", [openEvDataMeta.id]);
  const path =
    options.file ??
    (await downloadToCache(OPEN_EV_DATA_URL, 'open-ev-data.json', {
      maxAgeMinutes: 24 * 60,
      force: options.force,
    }));
  const json = JSON.parse(await readFile(path, 'utf8')) as {
    data: Array<RawEvVehicle & { vehicle_type?: string }>;
  };
  const specs = json.data
    .map((raw) => ({ raw, spec: toVehicleSpec(raw) }))
    .filter((x): x is { raw: RawEvVehicle; spec: VehicleSpec } => x.spec !== null);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { raw, spec } of specs) {
      await client.query(
        `INSERT INTO vehicle_models (id, source_id, brand, model, variant, release_year, vehicle_type,
           usable_battery_kwh, consumption_kwh_100, ac_max_kw, ac_phases, dc_max_kw, dc_curve, connector_groups)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET brand = EXCLUDED.brand, model = EXCLUDED.model,
           variant = EXCLUDED.variant, release_year = EXCLUDED.release_year,
           vehicle_type = EXCLUDED.vehicle_type, usable_battery_kwh = EXCLUDED.usable_battery_kwh,
           consumption_kwh_100 = EXCLUDED.consumption_kwh_100, ac_max_kw = EXCLUDED.ac_max_kw,
           ac_phases = EXCLUDED.ac_phases, dc_max_kw = EXCLUDED.dc_max_kw, dc_curve = EXCLUDED.dc_curve,
           connector_groups = EXCLUDED.connector_groups, is_active = true, updated_at = now()`,
        [
          spec.id,
          openEvDataMeta.id,
          spec.brand,
          spec.model,
          spec.variant,
          spec.releaseYear,
          raw.vehicle_type ?? 'car',
          spec.usableBatteryKwh,
          spec.consumptionKwhPer100km,
          spec.ac.maxPowerKw,
          spec.ac.phases,
          spec.dc?.maxPowerKw ?? null,
          spec.dc ? JSON.stringify(spec.dc.curve) : null,
          spec.connectorGroups,
        ],
      );
    }
    const { rowCount } = await client.query(
      'UPDATE vehicle_models SET is_active = false WHERE source_id = $1 AND NOT (id = ANY($2::text[])) AND is_active',
      [openEvDataMeta.id, specs.map((s) => s.spec.id)],
    );
    await client.query('UPDATE data_sources SET last_sync_at = now() WHERE id = $1', [
      openEvDataMeta.id,
    ]);
    await client.query('COMMIT');
    return { received: json.data.length, saved: specs.length, deactivated: rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
