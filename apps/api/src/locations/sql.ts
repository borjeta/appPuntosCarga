import { CONNECTOR_GROUP_KEYS, STATUS_MAX_AGE_MS, type SiteFilters } from '@pc/shared';

/**
 * Traduce los filtros a condiciones SQL parametrizadas sobre `locations` (alias `l`).
 * Añade los valores a `params` y devuelve las condiciones para unir con AND.
 */
export function filterConditions(filters: SiteFilters, params: unknown[]): string[] {
  const p = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = ['l.is_active'];
  if (filters.connectorGroups?.length) {
    const groups = filters.connectorGroups.filter((g) => CONNECTOR_GROUP_KEYS.includes(g));
    if (groups.length) where.push(`l.connector_groups && ${p(groups)}::text[]`);
  }
  if (filters.minPowerKw) where.push(`l.max_power_kw >= ${p(filters.minPowerKw)}`);
  if (filters.operatorIds?.length)
    where.push(`l.operator_id = ANY(${p(filters.operatorIds)}::text[])`);
  if (filters.paymentMethods?.length)
    where.push(`l.payment_methods && ${p(filters.paymentMethods)}::text[]`);
  if (filters.onlyAvailable) {
    where.push(
      `l.status_summary = 'AVAILABLE' AND l.status_updated_at > now() - make_interval(secs => ${p(STATUS_MAX_AGE_MS / 1000)})`,
    );
  }
  if (filters.open24h) where.push('l.is_24_7');
  return where;
}

/** Tamaño de celda (grados) para agrupar a un zoom dado: ~64 px de pantalla. */
export function clusterCellDegrees(zoom: number): number {
  return (360 / 2 ** zoom) * (64 / 256);
}

/** A partir de este zoom se devuelven estaciones individuales en vez de grupos. */
export const SITES_MIN_ZOOM = 13;
export const MAX_SITES = 1500;

/** Columnas de una estación para el mapa (alias l = locations, o = operators). */
export const MAP_SITE_COLUMNS = `
  l.id, ST_Y(l.geom) AS lat, ST_X(l.geom) AS lng, l.name, o.name AS operator_name,
  l.max_power_kw, l.has_dc, l.evse_count, l.available_count, l.status_summary, l.status_updated_at`;

/** Escapa comodines de LIKE en texto del usuario. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}
