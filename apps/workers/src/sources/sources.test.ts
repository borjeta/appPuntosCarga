import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esNapDgt } from './es-nap-dgt';
import { ptMobie, ratesToTariffs } from './pt-mobie';
import type { NormalizedSite, StatusUpdate } from './types';

const fixture = (name: string) => join(__dirname, '..', '__fixtures__', name);

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('NAP España (DGT, DATEX II v3)', async () => {
  const sites: NormalizedSite[] = await collect(
    esNapDgt.sites({ file: fixture('es-nap-sample.xml') }),
  );

  it('lee todas las estaciones del fichero', () => {
    expect(sites).toHaveLength(3);
  });

  it('normaliza una estación de un operador pequeño', () => {
    const s = sites[0]!;
    expect(s.externalId).toBe('2023002088');
    expect(s.name).toBe('Centro Porsche Baleares CP2');
    expect(s.postalCode).toBe('07011'); // el NAP pierde el cero inicial
    expect(s.city).toBe('Palma');
    expect(s.province).toBe('Illes Balears'); // "Balears, Illes" reordenado
    expect(s.operator).toMatchObject({ id: 'ES*915', displayName: 'Motor Box Mallorca' });
    expect(s.lat).toBeCloseTo(39.5948);
    expect(s.paymentMethods).toEqual(['OPERATOR_APP', 'RFID']);
    expect(s.openingHours.twentyFourSeven).toBe(false);
    expect(s.openingHours.regularHours).toHaveLength(7);
    expect(s.evses).toEqual([
      {
        externalId: 'COD20230000010507PR00000269',
        evseId: 'ES*915*EES00025600000020000001',
        tariffs: [],
        connectors: [
          {
            standard: 'IEC_62196_T2_COMBO',
            format: 'CABLE',
            powerType: 'DC',
            maxPowerKw: 350,
            maxVoltage: 920,
            maxAmperage: 348,
          },
        ],
      },
    ]);
  });

  it('usa la dirección cuando el nombre es un código y detecta pago con tarjeta', () => {
    const s = sites[1]!;
    expect(s.name).toBe('De La Marina, S/N');
    expect(s.operator).toMatchObject({ id: 'ES*IBD', displayName: 'Iberdrola' });
    expect(s.paymentMethods).toContain('AD_HOC_CARD');
    expect(s.openingHours).toMatchObject({ twentyFourSeven: true, regularHours: [] });
    expect(s.evses).toHaveLength(10);
    expect(s.region).toBe('Andalucía');
  });

  it('extrae servicios cercanos', () => {
    expect(sites[2]!.facilities.length).toBeGreaterThan(0);
    expect(sites[2]!.postalCode).toBe('01010');
  });
});

describe('MOBI.E Portugal (DATEX II v3)', async () => {
  const sites = await collect(ptMobie.sites({ file: fixture('pt-mobie-infra-sample.xml') }));

  it('normaliza estaciones 24 h con proveedores aceptados', () => {
    const s = sites[0]!;
    expect(s.externalId).toBe('SGM-GMR-00022');
    expect(s.name).toBe('Intermarché Urgezes-Guimarães');
    expect(s.city).toBe('Guimarães');
    expect(s.countryCode).toBe('PT');
    expect(s.operator).toMatchObject({ id: 'PT*SGM', phone: '253598000' });
    expect(s.openingHours.twentyFourSeven).toBe(true);
    expect(s.acceptedProviders).toContain('MOB');
    expect(s.evses.map((e) => e.evseId)).toEqual([
      'PT*SGM*E*GMR*00022*01',
      'PT*SGM*E*GMR*00022*02',
      'PT*SGM*E*GMR*00022*03',
    ]);
    expect(s.evses[2]!.connectors[0]).toMatchObject({ standard: 'IEC_62196_T2', maxPowerKw: 22 });
  });

  it('parsea horarios estructurados', () => {
    const s = sites[1]!;
    expect(s.openingHours.twentyFourSeven).toBe(false);
    expect(s.openingHours.regularHours[0]).toEqual({
      weekday: 1,
      periodBegin: '07:30',
      periodEnd: '21:00',
    });
  });

  it('lee estados en tiempo real con tarifas base', async () => {
    const updates: StatusUpdate[] = await collect(
      ptMobie.statuses!({ file: fixture('pt-mobie-status-sample.xml') }),
    );
    expect(updates.length).toBeGreaterThanOrEqual(3);
    const first = updates.find((u) => u.evseExternalId === 'GMR-00022-01')!;
    expect(first).toBeDefined();
    expect(['AVAILABLE', 'CHARGING']).toContain(first.status);
    expect(first.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.tariffs?.[0]?.components[0]).toMatchObject({ type: 'ENERGY' });
  });
});

describe('ratesToTariffs', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  it('agrupa componentes y descarta tarifas caducadas o desconocidas', () => {
    const tariffs = ratesToTariffs(
      [
        {
          pricingPolicy: 'pricePerDeliveryUnit',
          value: 0.1,
          currency: 'EUR',
          validFrom: '2025-01-01T00:00:00Z',
          validTo: null,
        },
        { pricingPolicy: 'flatRate', value: 0.26, currency: 'EUR', validFrom: null, validTo: null },
        {
          pricingPolicy: 'pricePerChargingTime',
          value: 0.05,
          currency: 'EUR',
          validFrom: null,
          validTo: '2026-01-01T00:00:00Z',
        },
        { pricingPolicy: 'other', value: 1, currency: 'EUR', validFrom: null, validTo: null },
      ],
      'pt-mobie',
      now,
    );
    expect(tariffs).toHaveLength(1);
    expect(tariffs[0]!.components).toEqual([
      { type: 'ENERGY', price: 0.1 },
      { type: 'FLAT', price: 0.26 },
    ]);
    expect(tariffs[0]!.scope).toBe('CPO_BASE');
  });

  it('sin componentes válidos no hay tarifa', () => {
    expect(ratesToTariffs([], 'pt-mobie', now)).toEqual([]);
  });
});
