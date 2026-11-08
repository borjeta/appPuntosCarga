import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { createPool } from '@pc/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashDevice } from './community/community.service';
import { createApp } from './main';

/**
 * Pruebas de extremo a extremo contra la base de datos de desarrollo (con datos ingeridos).
 * Si no hay base disponible se omiten, para que `npm test` funcione en cualquier máquina.
 */
async function dbHasData(): Promise<boolean> {
  const pool = createPool({ connectionTimeoutMillis: 2000 });
  try {
    const { rows } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM locations WHERE is_active',
    );
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

describe('API v1 (e2e)', () => {
  let app: INestApplication | undefined;

  beforeAll(async () => {
    if (!(await dbHasData())) return;
    app = await createApp();
    await app.init();
  });

  // Sin base de datos con datos, cada prueba se marca como omitida.
  beforeEach((ctx) => {
    if (!app) ctx.skip();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('health', async () => {
    const res = await request(app!.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: true });
  });

  it('agrupa a zoom bajo y devuelve estaciones a zoom alto', async () => {
    const low = await request(app!.getHttpServer())
      .get('/v1/map')
      .query({ bbox: '-10,35,4,44.5', zoom: 5 })
      .expect(200);
    expect(low.body.items.some((i: { kind: string }) => i.kind === 'cluster')).toBe(true);

    const high = await request(app!.getHttpServer())
      .get('/v1/map')
      .query({ bbox: '-3.72,40.40,-3.68,40.43', zoom: 15 })
      .expect(200);
    expect(high.body.items.every((i: { kind: string }) => i.kind === 'site')).toBe(true);
  });

  it('aplica filtros de potencia', async () => {
    const res = await request(app!.getHttpServer())
      .get('/v1/locations/nearby')
      .query({ lat: 40.4168, lng: -3.7038, radiusKm: 10, minPowerKw: 150, limit: 20 })
      .expect(200);
    for (const s of res.body.items) expect(s.maxPowerKw).toBeGreaterThanOrEqual(150);
  });

  it('devuelve la ficha completa con fuentes y atribución', async () => {
    const near = await request(app!.getHttpServer())
      .get('/v1/locations/nearby')
      .query({ lat: 40.4168, lng: -3.7038, radiusKm: 5, limit: 1 })
      .expect(200);
    const id = near.body.items[0].id;
    const res = await request(app!.getHttpServer()).get(`/v1/locations/${id}`).expect(200);
    expect(res.body.evses.length).toBeGreaterThan(0);
    expect(res.body.sources[0].attribution).toBeTruthy();
  });

  it('valida parámetros', async () => {
    await request(app!.getHttpServer()).get('/v1/map').query({ bbox: 'x', zoom: 3 }).expect(400);
    await request(app!.getHttpServer()).get('/v1/locations/no-es-uuid').expect(400);
    await request(app!.getHttpServer())
      .get('/v1/locations/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('registra avisos de la comunidad con límites y validación', async () => {
    const server = app!.getHttpServer();
    const near = await request(server)
      .get('/v1/locations/nearby')
      .query({ lat: 40.4168, lng: -3.7038, radiusKm: 5, limit: 1 });
    const id = near.body.items[0].id;
    const device = crypto.randomUUID();
    try {
      await request(server).post(`/v1/locations/${id}/reports`).send({ type: 'WORKS' }).expect(400);
      await request(server)
        .post(`/v1/locations/${id}/reports`)
        .set('x-device-id', device)
        .send({ type: 'NOPE' })
        .expect(400);
      const ok = await request(server)
        .post(`/v1/locations/${id}/reports`)
        .set('x-device-id', device)
        .send({ type: 'WORKS', comment: '  cargó   bien  ' })
        .expect(201);
      expect(ok.body.works30d).toBeGreaterThanOrEqual(1);
      expect(ok.body.recent[0]).toMatchObject({ type: 'WORKS', comment: 'cargó bien' });
      for (let i = 0; i < 2; i++) {
        await request(server)
          .post(`/v1/locations/${id}/reports`)
          .set('x-device-id', device)
          .send({ type: 'BROKEN' });
      }
      await request(server)
        .post(`/v1/locations/${id}/reports`)
        .set('x-device-id', device)
        .send({ type: 'BROKEN' })
        .expect(429);
      const detail = await request(server).get(`/v1/locations/${id}`).expect(200);
      expect(detail.body.community.reliability).not.toBeNull();
    } finally {
      const pool = createPool();
      await pool.query('DELETE FROM community_reports WHERE device_hash = $1', [
        hashDevice(device),
      ]);
      await pool.end();
    }
  });
});
