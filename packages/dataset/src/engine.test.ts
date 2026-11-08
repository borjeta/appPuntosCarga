import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StationIndex } from './engine';
import type { StationRecord, StationsFile, StatusFile } from './format';

const now = new Date('2026-06-01T12:00:00Z');

function station(
  i: string,
  y: number,
  x: number,
  over: Partial<StationRecord> = {},
): StationRecord {
  return {
    i,
    n: `Estación ${i}`,
    o: 'ES*IBD',
    cc: 'ES',
    y,
    x,
    src: ['es-nap-dgt'],
    e: [{ id: `ES*IBD*E${i}`, c: [{ s: 'IEC_62196_T2', p: 'AC_3_PHASE', w: 22 }] }],
    ...over,
  };
}

const file: StationsFile = {
  version: 1,
  generatedAt: now.toISOString(),
  operators: { 'ES*IBD': { n: 'Iberdrola' }, 'PT*ATL': { n: 'Atlante' } },
  stations: [
    station('sol', 40.4168, -3.7038, { c: 'Madrid', pm: ['AD_HOC_CARD', 'OPERATOR_APP'], h24: 1 }),
    station('cibeles', 40.4193, -3.6931, {
      c: 'Madrid',
      e: [{ c: [{ s: 'IEC_62196_T2_COMBO', p: 'DC', w: 150 }] }],
    }),
    station('malaga', 36.7213, -4.4214, { n: 'Málaga Centro', c: 'Málaga' }),
    station('lisboa', 38.7223, -9.1393, {
      o: 'PT*ATL',
      cc: 'PT',
      src: ['pt-mobie'],
      e: [
        {
          k: 'pt-mobie:A-1',
          c: [{ s: 'IEC_62196_T2_COMBO', p: 'DC', w: 60 }],
          t: [
            {
              currency: 'EUR',
              components: [{ type: 'ENERGY', price: 0.49 }],
              scope: 'CPO_BASE',
              vatIncluded: null,
              validFrom: null,
              validTo: null,
              sourceId: 'pt-mobie',
            },
          ],
        },
        { k: 'pt-mobie:A-2', c: [{ s: 'CHADEMO', p: 'DC', w: 50 }] },
      ],
    }),
  ],
};

const status = (observedAt: string): StatusFile => ({
  version: 1,
  generatedAt: observedAt,
  sources: { 'pt-mobie': { observedAt, evses: { 'A-1': 'AVAILABLE', 'A-2': 'CHARGING' } } },
});

describe('StationIndex', () => {
  const idx = new StationIndex(file);

  it('agrupa a zoom bajo y devuelve estaciones a zoom alto', () => {
    const low = idx.map([-10, 35, 4, 44], 5, {}, now);
    expect(low.items.some((i) => i.kind === 'cluster')).toBe(true);
    const total = low.items.reduce((n, i) => n + (i.kind === 'cluster' ? i.count : 1), 0);
    expect(total).toBe(4);

    const high = idx.map([-3.72, 40.4, -3.68, 40.43], 15, {}, now);
    expect(high.items.map((i) => i.id)).toEqual(['cibeles', 'sol']); // ordenadas por potencia
  });

  it('aplica filtros', () => {
    const box: [number, number, number, number] = [-10, 35, 4, 44];
    const ids = (f: Parameters<StationIndex['map']>[2]) =>
      idx
        .map(box, 15, f, now)
        .items.map((i) => i.id)
        .sort();
    expect(ids({ connectorGroups: ['CCS2'] })).toEqual(['cibeles', 'lisboa']);
    expect(ids({ minPowerKw: 100 })).toEqual(['cibeles']);
    expect(ids({ paymentMethods: ['AD_HOC_CARD'] })).toEqual(['sol']);
    expect(ids({ operatorIds: ['PT*ATL'] })).toEqual(['lisboa']);
    expect(ids({ open24h: true })).toEqual(['sol']);
  });

  it('busca sin acentos y ordena por cercanía', () => {
    const r = idx.search('malaga', 40.4, -3.7, now);
    expect(r.locations[0]?.id).toBe('malaga');
    const madrid = idx.search('madrid', 40.4193, -3.6931, now);
    expect(madrid.locations.map((l) => l.id)).toEqual(['cibeles', 'sol']);
    expect(idx.search('iberd', null, null, now).operators[0]).toEqual({
      id: 'ES*IBD',
      name: 'Iberdrola',
      siteCount: 3,
    });
  });

  it('cercanía con radio', () => {
    const r = idx.nearby(40.4168, -3.7038, 2000, 10, {}, now);
    expect(r.items.map((i) => i.id)).toEqual(['sol', 'cibeles']);
    expect(r.items[1]!.distanceM).toBeGreaterThan(900);
  });

  it('aplica el estado en tiempo real y lo caduca', () => {
    const live = new StationIndex(file);
    live.applyStatus(status('2026-06-01T11:55:00Z'));
    const d = live.detail('lisboa', now)!;
    expect(d.status).toBe('AVAILABLE');
    expect(d.evses.map((e) => e.status)).toEqual(['AVAILABLE', 'CHARGING']);
    expect(d.evses[0]!.tariffs[0]!.components[0]!.price).toBe(0.49);
    expect(live.nearby(38.7223, -9.1393, 1000, 1, { onlyAvailable: true }, now).items).toHaveLength(
      1,
    );

    live.applyStatus(status('2026-06-01T10:00:00Z')); // 2 h → caducado
    expect(live.detail('lisboa', now)!.status).toBe('UNKNOWN');
    expect(live.nearby(38.7223, -9.1393, 1000, 1, { onlyAvailable: true }, now).items).toHaveLength(
      0,
    );
  });

  it('encuentra estaciones a lo largo de una ruta', () => {
    const route: Array<[number, number]> = [
      [-3.7038, 40.4168],
      [-4.4214, 36.7213],
    ];
    const along = idx.corridor(route, 500, 0, now); // Cibeles queda a ~0,9 km del trazado
    expect(along.map((a) => a.site.id).sort()).toEqual(['malaga', 'sol']);
    const malaga = along.find((a) => a.site.id === 'malaga')!;
    expect(malaga.alongM / 1000).toBeGreaterThan(400);
  });

  it('ficha inexistente', () => {
    expect(idx.detail('nope', now)).toBeNull();
  });
});

// Prueba con el fichero real exportado (si existe): rendimiento y coherencia.
const realPath = join(__dirname, '..', '..', '..', 'data', 'public', 'stations.json');
describe.skipIf(!existsSync(realPath))('StationIndex con datos reales', () => {
  it('carga ~20.000 estaciones y responde rápido', () => {
    const t0 = performance.now();
    const real = new StationIndex(JSON.parse(readFileSync(realPath, 'utf8')) as StationsFile);
    const tLoad = performance.now() - t0;
    expect(real.size).toBeGreaterThan(20_000);

    const t1 = performance.now();
    const spain = real.map([-10, 35, 4.5, 44], 6, {}, now);
    const madrid = real.map([-3.75, 40.38, -3.65, 40.46], 14, { minPowerKw: 50 }, now);
    const near = real.nearby(40.4168, -3.7038, 5000, 50, {}, now);
    const tQuery = performance.now() - t1;

    expect(spain.items.length).toBeGreaterThan(10);
    expect(madrid.items.every((i) => i.kind === 'site' && i.maxPowerKw >= 50)).toBe(true);
    expect(near.items.length).toBe(50);
    console.log(`carga ${tLoad.toFixed(0)} ms · 3 consultas ${tQuery.toFixed(0)} ms`);
    expect(tQuery).toBeLessThan(500);
  });
});
