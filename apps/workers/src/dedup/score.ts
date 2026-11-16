import { haversineMeters } from '@pc/shared';
import { comparableName } from '../normalize/text';

/**
 * Deduplicación entre fuentes (sección 9 del prompt). Lógica pura para poder testearla:
 * la base de datos solo aporta los candidatos cercanos.
 */

export const MAX_DISTANCE_M = 75;
export const MERGE_THRESHOLD = 0.8;
export const REVIEW_THRESHOLD = 0.6;

export interface DedupSubject {
  lat: number;
  lng: number;
  operatorId: string | null;
  operatorName: string | null;
  evseIds: string[];
  connectorGroups: string[];
  maxPowerKw: number;
}

export interface DedupCandidate extends DedupSubject {
  locationId: string;
}

export interface ScoreResult {
  score: number;
  reasons: Record<string, number>;
}

function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function operatorSimilarity(a: DedupSubject, b: DedupSubject): number {
  if (a.operatorId && b.operatorId && a.operatorId === b.operatorId) return 1;
  const na = comparableName(a.operatorName);
  const nb = comparableName(b.operatorName);
  if (!na || !nb) return 0.5; // sin información: neutro
  if (na === nb || na.includes(nb) || nb.includes(na)) return 1;
  return jaccard(na.split(' '), nb.split(' '));
}

export function scoreCandidate(subject: DedupSubject, candidate: DedupCandidate): ScoreResult {
  const shared = subject.evseIds.filter((id) => candidate.evseIds.includes(id));
  if (shared.length) return { score: 1, reasons: { evseIdMatch: shared.length } };

  const distance = haversineMeters(subject.lat, subject.lng, candidate.lat, candidate.lng);
  const distanceScore = Math.max(0, 1 - distance / MAX_DISTANCE_M);
  const operatorScore = operatorSimilarity(subject, candidate);
  const connectorScore = jaccard(subject.connectorGroups, candidate.connectorGroups);
  const maxPower = Math.max(subject.maxPowerKw, candidate.maxPowerKw);
  const powerScore =
    maxPower > 0 ? 1 - Math.abs(subject.maxPowerKw - candidate.maxPowerKw) / maxPower : 1;

  const score =
    0.35 * distanceScore + 0.35 * operatorScore + 0.2 * connectorScore + 0.1 * powerScore;
  return {
    score: Math.round(score * 1000) / 1000,
    reasons: {
      distanceM: Math.round(distance),
      distance: distanceScore,
      operator: operatorScore,
      connectors: connectorScore,
      power: powerScore,
    },
  };
}

export type DedupDecision =
  | { action: 'merge'; locationId: string; score: number; reasons: Record<string, number> }
  | { action: 'review'; locationId: string; score: number; reasons: Record<string, number> }
  | { action: 'new' };

export function decide(subject: DedupSubject, candidates: DedupCandidate[]): DedupDecision {
  let best: { c: DedupCandidate; r: ScoreResult } | null = null;
  for (const c of candidates) {
    const r = scoreCandidate(subject, c);
    if (!best || r.score > best.r.score) best = { c, r };
  }
  if (!best) return { action: 'new' };
  if (best.r.score >= MERGE_THRESHOLD) {
    return {
      action: 'merge',
      locationId: best.c.locationId,
      score: best.r.score,
      reasons: best.r.reasons,
    };
  }
  if (best.r.score >= REVIEW_THRESHOLD) {
    return {
      action: 'review',
      locationId: best.c.locationId,
      score: best.r.score,
      reasons: best.r.reasons,
    };
  }
  return { action: 'new' };
}
