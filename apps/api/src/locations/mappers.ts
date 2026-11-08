import {
  effectiveEvseStatus,
  effectiveSiteStatus,
  type EvseStatus,
  type MapSite,
  type NearbySite,
  type SiteStatus,
} from '@pc/shared';

export interface MapSiteRow {
  id: string;
  lat: number;
  lng: number;
  name: string;
  operator_name: string | null;
  max_power_kw: number;
  has_dc: boolean;
  evse_count: number;
  available_count: number | null;
  status_summary: SiteStatus;
  status_updated_at: Date | null;
}

export function toMapSite(row: MapSiteRow, now = new Date()): MapSite {
  const status = effectiveSiteStatus(row.status_summary, row.status_updated_at, now);
  return {
    kind: 'site',
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    name: row.name,
    operatorName: row.operator_name,
    maxPowerKw: row.max_power_kw,
    hasDc: row.has_dc,
    evseCount: row.evse_count,
    // Sin dato fresco no se muestra un recuento que podría ser falso.
    availableCount: status === 'UNKNOWN' ? null : row.available_count,
    status,
  };
}

export interface NearbyRow extends MapSiteRow {
  distance_m: number;
  street: string | null;
  city: string | null;
}

export function toNearbySite(row: NearbyRow, now = new Date()): NearbySite {
  return {
    ...toMapSite(row, now),
    distanceM: Math.round(row.distance_m),
    address: row.street,
    city: row.city,
  };
}

export function toEvseStatus(
  status: EvseStatus,
  updatedAt: Date | null,
  now = new Date(),
): EvseStatus {
  return effectiveEvseStatus(status, updatedAt, now);
}
