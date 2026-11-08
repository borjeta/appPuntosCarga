import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Pool } from '@pc/db';
import {
  RELIABILITY_WINDOW_DAYS,
  reliabilityScore,
  type CommunityReport,
  type CommunitySummary,
  type ReportType,
} from '@pc/shared';
import { InjectPool } from '../db.module';

/** Límites anti-abuso por dispositivo. */
export const MAX_PER_LOCATION_PER_DAY = 3;
export const MAX_PER_DEVICE_PER_DAY = 20;
export const MAX_COMMENT_LENGTH = 280;

export class RateLimitError extends Error {}

export function hashDevice(deviceId: string): string {
  const salt = process.env.DEVICE_HASH_SALT || 'puntos-carga-dev-salt';
  return createHash('sha256').update(`${salt}:${deviceId}`).digest('hex');
}

/** Limpia el comentario: sin caracteres de control, espacios normalizados y longitud máxima. */
export function cleanComment(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_COMMENT_LENGTH);
  return s || null;
}

/** Los comentarios con enlaces quedan ocultos hasta revisión (spam). */
export function needsModeration(comment: string | null): boolean {
  return !!comment && /(https?:\/\/|www\.|\.[a-z]{2,4}\/)/i.test(comment);
}

@Injectable()
export class CommunityService {
  constructor(@InjectPool() private readonly pool: Pool) {}

  async summary(locationId: string, now = new Date()): Promise<CommunitySummary> {
    const { rows } = await this.pool.query<{
      type: ReportType;
      comment: string | null;
      created_at: Date;
    }>(
      `SELECT type, comment, created_at FROM community_reports
       WHERE location_id = $1 AND NOT hidden AND created_at > now() - make_interval(days => $2)
       ORDER BY created_at DESC LIMIT 300`,
      [locationId, RELIABILITY_WINDOW_DAYS],
    );
    const reports: CommunityReport[] = rows.map((r) => ({
      type: r.type,
      comment: r.comment,
      createdAt: r.created_at.toISOString(),
    }));
    const monthAgo = now.getTime() - 30 * 86_400_000;
    return {
      ...reliabilityScore(reports, now),
      recent: reports.filter((r) => Date.parse(r.createdAt) >= monthAgo).slice(0, 10),
    };
  }

  /** Guarda un aviso. Devuelve false si la estación no existe. */
  async create(
    locationId: string,
    deviceId: string,
    type: ReportType,
    rawComment: unknown,
  ): Promise<boolean> {
    const deviceHash = hashDevice(deviceId);
    const { rows } = await this.pool.query<{ exists: boolean; here: number; total: number }>(
      `SELECT EXISTS (SELECT 1 FROM locations WHERE id = $1 AND is_active) AS exists,
              (SELECT count(*)::int FROM community_reports
                WHERE device_hash = $2 AND location_id = $1 AND created_at > now() - interval '1 day') AS here,
              (SELECT count(*)::int FROM community_reports
                WHERE device_hash = $2 AND created_at > now() - interval '1 day') AS total`,
      [locationId, deviceHash],
    );
    const r = rows[0]!;
    if (!r.exists) return false;
    if (r.here >= MAX_PER_LOCATION_PER_DAY || r.total >= MAX_PER_DEVICE_PER_DAY) {
      throw new RateLimitError('Has enviado demasiados avisos hoy. Inténtalo mañana.');
    }
    const comment = cleanComment(rawComment);
    await this.pool.query(
      `INSERT INTO community_reports (location_id, type, comment, device_hash, hidden)
       VALUES ($1, $2, $3, $4, $5)`,
      [locationId, type, comment, deviceHash, needsModeration(comment)],
    );
    return true;
  }
}
