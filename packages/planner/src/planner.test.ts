import type { NearbySite, VehicleSpec } from '@pc/shared';
import { describe, expect, it } from 'vitest';
import { downsample, planStops, type PlanParams, type RouteCandidate } from './planner';

const car: VehicleSpec = {
  id: 'car',
  brand: 'Test',
  model: 'EV',
  variant: null,
  releaseYear: 2024,
  usableBatteryKwh: 60,
  consumptionKwhPer100km: 15, // ×1,15 autovía → 0,1725 kWh/km → 0,2875 %/km
  ac: { maxPowerKw: 11, phases: 3 },
  dc: {
    maxPowerKw: 150,
    curve: [
      { soc: 0, powerKw: 150 },
      { soc: 80, powerKw: 60 },
      { soc: 100, powerKw: 10 },
    ],
  },
  connectorGroups: ['TYPE2', 'CCS2'],
};

function site(
  id: string,
  maxPowerKw: number,
  status: NearbySite['status'] = 'UNKNOWN',
): NearbySite {
  return {
    kind: 'site',
    id,
    lat: 0,
    lng: 0,
    name: id,
    operatorName: null,
    maxPowerKw,
    hasDc: true,
    evseCount: 2,
    availableCount: null,
    status,
    distanceM: 0,
    address: null,
    city: null,
  };
}

function charger(
  id: string,
  kmAlong: number,
  kw = 150,
  status: NearbySite['status'] = 'UNKNOWN',
): RouteCandidate {
  return {
    site: site(id, kw, status),
    kmAlong,
    detourKm: 0.5,
    connectors: [{ standard: 'IEC_62196_T2_COMBO', powerType: 'DC', maxPowerKw: kw, tariffs: [] }],
  };
}

const base = (totalKm: number, startSoc = 90): PlanParams => ({
  vehicle: car,
  totalKm,
  startSoc,
  arrivalMinSoc: 10,
  stopMinSoc: 10,
  maxChargeSoc: 80,
  minPowerKw: 50,
});

describe('planStops', () => {
  it('sin paradas si llega con batería suficiente', () => {
    const r = planStops(base(200), [charger('a', 100)]);
    expect(r).toMatchObject({ feasible: true, stops: [] });
    expect(r.arrivalSoc).toBeCloseTo(90 - 200 * 0.2875, 0);
  });

  it('elige un cargador al final del tramo alcanzable y carga lo justo', () => {
    // Alcance desde 90 % hasta 10 %: ~278 km. Ruta de 450 km.
    const r = planStops(base(450), [
      charger('pronto', 60),
      charger('medio', 150),
      charger('tarde', 250),
    ]);
    expect(r.feasible).toBe(true);
    expect(r.stops.map((s) => s.site.id)).toEqual(['tarde']);
    const stop = r.stops[0]!;
    expect(stop.departureSoc).toBeLessThanOrEqual(80);
    expect(r.arrivalSoc).toBeGreaterThanOrEqual(10);
  });

  it('prefiere el cargador más potente dentro de la ventana final', () => {
    const r = planStops(base(450), [charger('lento', 240, 50), charger('rapido', 230, 300)]);
    expect(r.stops[0]?.site.id).toBe('rapido');
  });

  it('ignora cargadores fuera de servicio o demasiado lentos', () => {
    const r = planStops(base(450), [
      charger('averiado', 250, 150, 'OUT_OF_SERVICE'),
      charger('lento', 240, 22),
      charger('bueno', 200),
    ]);
    expect(r.stops[0]?.site.id).toBe('bueno');
  });

  it('encadena varias paradas en rutas largas', () => {
    const chargers = Array.from({ length: 12 }, (_, i) => charger(`c${i}`, (i + 1) * 90));
    const r = planStops(base(1000), chargers);
    expect(r.feasible).toBe(true);
    expect(r.stops.length).toBeGreaterThanOrEqual(3);
    for (const s of r.stops) expect(s.arrivalSoc).toBeGreaterThanOrEqual(10);
  });

  it('informa si no hay cargadores alcanzables', () => {
    const r = planStops(base(600, 50), [charger('lejos', 500)]);
    expect(r.feasible).toBe(false);
    expect(r.reason).toMatch(/alcanzables/);
  });
});

describe('downsample', () => {
  it('conserva extremos y limita puntos', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => i);
    const d = downsample(pts, 10);
    expect(d).toHaveLength(10);
    expect(d[0]).toBe(0);
    expect(d[9]).toBe(999);
  });
});
