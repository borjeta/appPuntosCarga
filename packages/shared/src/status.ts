import type { EvseStatus, SiteStatus } from './enums';

/** Un estado dinámico más antiguo que esto se considera desconocido (sección 9 del prompt). */
export const STATUS_MAX_AGE_MS = 30 * 60 * 1000;

/** Devuelve el estado a mostrar: si el dato está caducado o no existe, UNKNOWN. */
export function effectiveEvseStatus(
  status: EvseStatus,
  updatedAt: Date | string | null,
  now: Date = new Date(),
): EvseStatus {
  if (status === 'UNKNOWN' || !updatedAt) return 'UNKNOWN';
  const ts = typeof updatedAt === 'string' ? Date.parse(updatedAt) : updatedAt.getTime();
  if (!Number.isFinite(ts)) return 'UNKNOWN';
  // Estados "estructurales" (avería, planificado, retirado) no caducan tan rápido como la ocupación.
  if (status === 'PLANNED' || status === 'REMOVED') return status;
  return now.getTime() - ts > STATUS_MAX_AGE_MS ? 'UNKNOWN' : status;
}

/** Estado resumido a mostrar para una estación: caduca igual que el de sus puntos. */
export function effectiveSiteStatus(
  summary: SiteStatus,
  updatedAt: Date | string | null,
  now: Date = new Date(),
): SiteStatus {
  if (!updatedAt) return 'UNKNOWN';
  const ts = typeof updatedAt === 'string' ? Date.parse(updatedAt) : updatedAt.getTime();
  if (!Number.isFinite(ts) || now.getTime() - ts > STATUS_MAX_AGE_MS) return 'UNKNOWN';
  return summary;
}

const OCCUPIED: readonly EvseStatus[] = ['CHARGING', 'BLOCKED', 'RESERVED'];
const OUT_OF_SERVICE: readonly EvseStatus[] = ['OUTOFORDER', 'INOPERATIVE', 'PLANNED', 'REMOVED'];

/**
 * Resume los estados de los puntos de una estación:
 * - alguno disponible → AVAILABLE
 * - ninguno disponible y alguno ocupado → OCCUPIED
 * - todos fuera de servicio → OUT_OF_SERVICE
 * - resto (sin datos o mezcla con desconocidos) → UNKNOWN
 */
export function summarizeSiteStatus(statuses: readonly EvseStatus[]): SiteStatus {
  if (statuses.length === 0) return 'UNKNOWN';
  if (statuses.includes('AVAILABLE')) return 'AVAILABLE';
  if (statuses.some((s) => OCCUPIED.includes(s))) return 'OCCUPIED';
  if (statuses.every((s) => OUT_OF_SERVICE.includes(s))) return 'OUT_OF_SERVICE';
  return 'UNKNOWN';
}
