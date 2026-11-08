import { Injectable } from '@nestjs/common';
import type { Pool } from '@pc/db';
import type { ChargingCurvePoint, ConnectorGroup, VehicleSpec } from '@pc/shared';
import { InjectPool } from '../db.module';

interface VehicleRow {
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
  connector_groups: ConnectorGroup[];
}

const COLUMNS = `id, brand, model, variant, release_year, usable_battery_kwh, consumption_kwh_100,
  ac_max_kw, ac_phases, dc_max_kw, dc_curve, connector_groups`;

export function toVehicleSpec(r: VehicleRow): VehicleSpec {
  return {
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
  };
}

@Injectable()
export class VehiclesService {
  constructor(@InjectPool() private readonly pool: Pool) {}

  /** Busca por marca, modelo, versión o año. Todas las palabras deben aparecer. */
  async search(q: string, limit: number): Promise<VehicleSpec[]> {
    const words = q
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[\\%_]/g, ''))
      .filter(Boolean)
      .slice(0, 6);
    const params: unknown[] = [];
    const where = ['is_active', "vehicle_type IN ('car', 'microcar')"];
    for (const w of words) {
      params.push(`%${w}%`);
      where.push(`search_text LIKE $${params.length}`);
    }
    params.push(limit);
    const { rows } = await this.pool.query<VehicleRow>(
      `SELECT ${COLUMNS} FROM vehicle_models WHERE ${where.join(' AND ')}
       ORDER BY brand, model, release_year DESC NULLS LAST, variant NULLS FIRST LIMIT $${params.length}`,
      params,
    );
    return rows.map(toVehicleSpec);
  }

  async byId(id: string): Promise<VehicleSpec | null> {
    const { rows } = await this.pool.query<VehicleRow>(
      `SELECT ${COLUMNS} FROM vehicle_models WHERE id = $1 AND is_active`,
      [id],
    );
    return rows[0] ? toVehicleSpec(rows[0]) : null;
  }
}
