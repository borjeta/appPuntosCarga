import type { Tariff, VehicleSpec } from '@pc/shared';
import { describe, expect, it } from 'vitest';
import {
  acPower,
  bestConnector,
  dcCurvePowerAt,
  estimateCharge,
  priceCharge,
  type ChargeConnector,
} from './index';

// Datos reales de open-ev-data (Tesla Model 3 2023, 57,5 kWh).
const model3: VehicleSpec = {
  id: 'm3',
  brand: 'Tesla',
  model: 'Model 3',
  variant: null,
  releaseYear: 2023,
  usableBatteryKwh: 57.5,
  consumptionKwhPer100km: 13.7,
  ac: { maxPowerKw: 11, phases: 3 },
  dc: {
    maxPowerKw: 57.5,
    curve: [
      { soc: 0, powerKw: 57.5 },
      { soc: 50, powerKw: 57.5 },
      { soc: 80, powerKw: 34.5 },
      { soc: 100, powerKw: 11 },
    ],
  },
  connectorGroups: ['TYPE2', 'CCS2'],
};

const onePhaseCar: VehicleSpec = {
  ...model3,
  id: 'zoe-old',
  ac: { maxPowerKw: 7.4, phases: 1 },
  dc: null,
  connectorGroups: ['TYPE2'],
};

const ccs150: ChargeConnector = {
  standard: 'IEC_62196_T2_COMBO',
  powerType: 'DC',
  maxPowerKw: 150,
};
const ccs50: ChargeConnector = { standard: 'IEC_62196_T2_COMBO', powerType: 'DC', maxPowerKw: 50 };
const t2_22: ChargeConnector = {
  standard: 'IEC_62196_T2',
  powerType: 'AC_3_PHASE',
  maxPowerKw: 22,
};
const chademo: ChargeConnector = { standard: 'CHADEMO', powerType: 'DC', maxPowerKw: 50 };

const tariff = (components: Tariff['components']): Tariff => ({
  currency: 'EUR',
  components,
  scope: 'CPO_BASE',
  vatIncluded: null,
  validFrom: null,
  validTo: null,
  sourceId: 'test',
});

describe('curva y potencia', () => {
  it('interpola la curva DC', () => {
    expect(dcCurvePowerAt(model3, 25)).toBe(57.5);
    expect(dcCurvePowerAt(model3, 65)).toBeCloseTo(46, 5);
    expect(dcCurvePowerAt(model3, 100)).toBe(11);
  });

  it('limita la potencia AC por fases y cargador de a bordo', () => {
    expect(acPower(model3, t2_22)).toBe(11);
    expect(acPower(onePhaseCar, t2_22)).toBeCloseTo(7.33, 2);
  });
});

describe('estimateCharge', () => {
  it('estima una carga rápida 20→80 % con la curva real', () => {
    const r = estimateCharge({ vehicle: model3, connector: ccs150, fromSoc: 20, toSoc: 80 });
    if (!r.compatible) throw new Error('debería ser compatible');
    expect(r.batteryKwh).toBeCloseTo(34.5, 1);
    expect(r.gridKwh).toBeCloseTo(34.5 / 0.95, 1);
    // ≈19 min hasta el 50 % a 57,5 kW + ≈24 min del 50 al 80 % con la curva bajando
    expect(r.minutes).toBeGreaterThan(38);
    expect(r.minutes).toBeLessThan(48);
    expect(r.peakPowerKw).toBe(57.5);
  });

  it('un punto de 50 kW limita la potencia', () => {
    const r = estimateCharge({ vehicle: model3, connector: ccs50, fromSoc: 20, toSoc: 50 });
    if (!r.compatible) throw new Error('debería ser compatible');
    expect(r.peakPowerKw).toBe(50);
  });

  it('carga AC a 11 kW', () => {
    const r = estimateCharge({ vehicle: model3, connector: t2_22, fromSoc: 0, toSoc: 100 });
    if (!r.compatible) throw new Error('debería ser compatible');
    expect(r.minutes / 60).toBeCloseTo(57.5 / (11 * 0.9), 1);
  });

  it('detecta conectores incompatibles', () => {
    expect(estimateCharge({ vehicle: model3, connector: chademo, fromSoc: 20, toSoc: 80 })).toEqual(
      {
        compatible: false,
        reason: 'CONNECTOR',
      },
    );
    expect(
      estimateCharge({ vehicle: onePhaseCar, connector: ccs150, fromSoc: 20, toSoc: 80 })
        .compatible,
    ).toBe(false);
  });

  it('calcula el coste con cada tarifa y ordena de más barata a más cara', () => {
    const r = estimateCharge({
      vehicle: model3,
      connector: ccs150,
      fromSoc: 20,
      toSoc: 80,
      tariffs: [
        tariff([{ type: 'ENERGY', price: 0.59 }]),
        tariff([
          { type: 'ENERGY', price: 0.49 },
          { type: 'FLAT', price: 0.26 },
        ]),
      ],
    });
    if (!r.compatible) throw new Error('debería ser compatible');
    expect(r.costs).toHaveLength(2);
    expect(r.costs[0]!.total).toBeLessThan(r.costs[1]!.total);
    expect(r.costs[0]!.total).toBeCloseTo(0.49 * r.gridKwh + 0.26, 1);
  });
});

describe('priceCharge', () => {
  it('suma energía, tiempo y tarifa fija', () => {
    const c = priceCharge(
      tariff([
        { type: 'ENERGY', price: 0.5 },
        { type: 'TIME', price: 0.1 },
        { type: 'FLAT', price: 1 },
      ]),
      20,
      30,
      19,
    );
    expect(c.total).toBe(14); // 10 + 3 + 1
    expect(c.perBatteryKwh).toBeCloseTo(14 / 19, 3);
  });
});

describe('bestConnector', () => {
  it('elige el conector compatible más rápido', () => {
    expect(bestConnector(model3, [t2_22, chademo, ccs50, ccs150])).toBe(ccs150);
    expect(bestConnector(onePhaseCar, [ccs150, t2_22])).toBe(t2_22);
    expect(bestConnector(onePhaseCar, [ccs150, chademo])).toBeNull();
  });
});
