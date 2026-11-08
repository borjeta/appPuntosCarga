import { describe, expect, it } from 'vitest';
import { connectorGroupsFor, toVehicleSpec, type RawEvVehicle } from './open-ev-data';

const model3: RawEvVehicle = {
  id: 'fbffc80f-062d-ed16-d6df-5f621bb35848',
  brand: 'Tesla',
  model: 'Model 3',
  variant: '',
  release_year: 2023,
  vehicle_type: 'car',
  usable_battery_size: 57.5,
  energy_consumption: { average_consumption: 13.7 },
  ac_charger: { usable_phases: 3, ports: ['type2'], max_power: 11 },
  dc_charger: {
    ports: ['ccs'],
    max_power: 57.5,
    charging_curve: [
      { percentage: 80, power: 34.5 },
      { percentage: 0, power: 57.5 },
    ],
  },
};

describe('Open EV Data', () => {
  it('convierte un modelo real a VehicleSpec', () => {
    expect(toVehicleSpec(model3)).toEqual({
      id: model3.id,
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
          { soc: 80, powerKw: 34.5 },
        ],
      },
      connectorGroups: ['CCS2', 'TYPE2'],
    });
  });

  it('distingue CCS1/CCS2 y CHAdeMO', () => {
    expect(connectorGroupsFor({ ...model3, ac_charger: { ports: ['type1'] } })).toEqual([
      'CCS1',
      'TYPE1',
    ]);
    expect(connectorGroupsFor({ ...model3, dc_charger: { ports: ['chademo'] } })).toEqual([
      'CHADEMO',
      'TYPE2',
    ]);
  });

  it('un coche sin DC no tiene curva ni conector rápido', () => {
    const spec = toVehicleSpec({ ...model3, dc_charger: null });
    expect(spec?.dc).toBeNull();
    expect(spec?.connectorGroups).toEqual(['TYPE2']);
  });

  it('descarta registros sin batería', () => {
    expect(toVehicleSpec({ ...model3, usable_battery_size: 0 })).toBeNull();
  });
});
