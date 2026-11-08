/** Comunidad: avisos de conductores y puntuación de fiabilidad de una estación. */

export const REPORT_TYPES = [
  'WORKS',
  'BROKEN',
  'CONNECTOR_DAMAGED',
  'BLOCKED_BY_CAR',
  'PRICE_DIFFERENT',
  'NOT_EXISTS',
  'OTHER',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface CommunityReport {
  type: ReportType;
  comment: string | null;
  createdAt: string;
}

export interface CommunitySummary {
  /** 0–100, o null si no hay avisos que indiquen si funciona. */
  reliability: number | null;
  /** Avisos de los últimos 30 días. */
  works30d: number;
  problems30d: number;
  recent: CommunityReport[];
  /** true si la comunidad no está disponible (p. ej. sin Supabase configurado). */
  disabled?: boolean;
}

/** Peso de cada tipo como señal de "no funciona" (los avisos de precio u otros no cuentan). */
const PROBLEM_WEIGHT: Partial<Record<ReportType, number>> = {
  BROKEN: 1,
  CONNECTOR_DAMAGED: 1,
  NOT_EXISTS: 1,
  BLOCKED_BY_CAR: 0.5,
};

export const RELIABILITY_HALF_LIFE_DAYS = 14;
export const RELIABILITY_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

/**
 * Fiabilidad con suavizado de Laplace y decaimiento exponencial por antigüedad:
 * score = 100 · (W + 1) / (W + P + 2), con W y P los pesos de avisos "funciona" y "problema".
 */
export function reliabilityScore(
  reports: ReadonlyArray<Pick<CommunityReport, 'type' | 'createdAt'>>,
  now: Date = new Date(),
): Pick<CommunitySummary, 'reliability' | 'works30d' | 'problems30d'> {
  let w = 0;
  let p = 0;
  let works30d = 0;
  let problems30d = 0;
  for (const r of reports) {
    const rawAge = (now.getTime() - Date.parse(r.createdAt)) / DAY_MS;
    // Un aviso "del futuro" suele ser desfase de reloj entre servidores: se trata como recién hecho.
    if (!Number.isFinite(rawAge) || rawAge < -1 || rawAge > RELIABILITY_WINDOW_DAYS) continue;
    const ageDays = Math.max(0, rawAge);
    const decay = 0.5 ** (ageDays / RELIABILITY_HALF_LIFE_DAYS);
    const problem = PROBLEM_WEIGHT[r.type] ?? 0;
    if (r.type === 'WORKS') {
      w += decay;
      if (ageDays <= 30) works30d++;
    } else if (problem > 0) {
      p += problem * decay;
      if (ageDays <= 30) problems30d++;
    }
  }
  const reliability = w + p === 0 ? null : Math.round((100 * (w + 1)) / (w + p + 2));
  return { reliability, works30d, problems30d };
}
