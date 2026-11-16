import {
  connectorGroupOf,
  type ConnectorStandard,
  type PowerType,
  type PriceComponentType,
  type Tariff,
  type VehicleSpec,
} from '@pc/shared';

/**
 * Motor de estimación de cargas (sección 5.6 del prompt). Funciones puras: no hace E/S y se
 * puede usar igual en la app (sin conexión) y en la API (planificador de rutas).
 */

export const DEFAULT_AC_EFFICIENCY = 0.9;
export const DEFAULT_DC_EFFICIENCY = 0.95;

export interface ChargeConnector {
  standard: ConnectorStandard;
  powerType: PowerType | null;
  maxPowerKw: number;
}

export type IncompatibleReason = 'CONNECTOR' | 'NO_POWER';

export interface CostBreakdownItem {
  type: PriceComponentType;
  amount: number;
}

export interface CostEstimate {
  tariff: Tariff;
  total: number;
  currency: string;
  breakdown: CostBreakdownItem[];
  /** Coste medio por kWh que entra en la batería. */
  perBatteryKwh: number;
}

export interface ChargeEstimate {
  compatible: true;
  fromSoc: number;
  toSoc: number;
  /** Energía que entra en la batería. */
  batteryKwh: number;
  /** Energía que factura el punto (incluye pérdidas de carga). */
  gridKwh: number;
  minutes: number;
  avgPowerKw: number;
  peakPowerKw: number;
  costs: CostEstimate[];
}

export type EstimateResult = ChargeEstimate | { compatible: false; reason: IncompatibleReason };

export interface EstimateInput {
  vehicle: VehicleSpec;
  connector: ChargeConnector;
  fromSoc: number;
  toSoc: number;
  tariffs?: Tariff[];
  acEfficiency?: number;
  dcEfficiency?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

export function isDcConnector(c: ChargeConnector): boolean {
  if (c.powerType) return c.powerType === 'DC';
  return ['IEC_62196_T2_COMBO', 'IEC_62196_T1_COMBO', 'CHADEMO', 'TESLA_S'].includes(c.standard);
}

export function isCompatible(vehicle: VehicleSpec, c: ChargeConnector): boolean {
  if (!vehicle.connectorGroups.includes(connectorGroupOf(c.standard))) return false;
  return isDcConnector(c) ? vehicle.dc !== null : true;
}

/** Potencia que admite el vehículo en DC a un estado de carga dado (interpolación de la curva). */
export function dcCurvePowerAt(vehicle: VehicleSpec, soc: number): number {
  const dc = vehicle.dc;
  if (!dc) return 0;
  const curve = [...dc.curve].sort((a, b) => a.soc - b.soc);
  if (!curve.length) return dc.maxPowerKw;
  let power: number;
  if (soc <= curve[0]!.soc) power = curve[0]!.powerKw;
  else if (soc >= curve[curve.length - 1]!.soc) power = curve[curve.length - 1]!.powerKw;
  else {
    const i = curve.findIndex((p) => p.soc >= soc);
    const a = curve[i - 1]!;
    const b = curve[i]!;
    power = a.powerKw + ((soc - a.soc) / (b.soc - a.soc)) * (b.powerKw - a.powerKw);
  }
  return Math.min(power, dc.maxPowerKw);
}

/**
 * Potencia AC efectiva: un coche monofásico en un punto trifásico solo usa una fase
 * (22 kW trifásico → ~7,4 kW), y nunca más que su cargador de a bordo.
 */
export function acPower(vehicle: VehicleSpec, c: ChargeConnector): number {
  const phases = clamp(vehicle.ac.phases || 1, 1, 3);
  const perConnector = c.powerType === 'AC_3_PHASE' ? (c.maxPowerKw * phases) / 3 : c.maxPowerKw;
  return Math.min(perConnector, vehicle.ac.maxPowerKw);
}

/** Potencia de carga (lado red) a un SoC dado. */
export function powerAt(vehicle: VehicleSpec, c: ChargeConnector, soc: number): number {
  if (isDcConnector(c)) return Math.min(c.maxPowerKw, dcCurvePowerAt(vehicle, soc));
  return acPower(vehicle, c);
}

export function priceCharge(
  tariff: Tariff,
  gridKwh: number,
  minutes: number,
  batteryKwh: number,
): CostEstimate {
  const breakdown: CostBreakdownItem[] = tariff.components.map((comp) => {
    if (comp.type === 'ENERGY') return { type: comp.type, amount: comp.price * gridKwh };
    if (comp.type === 'TIME') return { type: comp.type, amount: comp.price * minutes };
    return { type: comp.type, amount: comp.price };
  });
  const total = breakdown.reduce((s, b) => s + b.amount, 0);
  return {
    tariff,
    currency: tariff.currency,
    breakdown: breakdown.map((b) => ({ ...b, amount: round(b.amount, 2) })),
    total: round(total, 2),
    perBatteryKwh: batteryKwh > 0 ? round(total / batteryKwh, 3) : 0,
  };
}

/** Simula la carga de 1 % en 1 % aplicando la curva del vehículo y el límite del punto. */
export function estimateCharge(input: EstimateInput): EstimateResult {
  const { vehicle, connector } = input;
  if (!isCompatible(vehicle, connector)) return { compatible: false, reason: 'CONNECTOR' };

  const dc = isDcConnector(connector);
  const efficiency = dc
    ? (input.dcEfficiency ?? DEFAULT_DC_EFFICIENCY)
    : (input.acEfficiency ?? DEFAULT_AC_EFFICIENCY);
  const from = clamp(input.fromSoc, 0, 100);
  const to = clamp(input.toSoc, 0, 100);

  let batteryKwh = 0;
  let hours = 0;
  let peak = 0;
  for (let soc = from; soc < to; soc += 1) {
    const step = Math.min(1, to - soc);
    const power = powerAt(vehicle, connector, soc + step / 2);
    if (power <= 0) return { compatible: false, reason: 'NO_POWER' };
    const kwh = (vehicle.usableBatteryKwh * step) / 100;
    batteryKwh += kwh;
    hours += kwh / (power * efficiency);
    peak = Math.max(peak, power);
  }

  const gridKwh = batteryKwh / efficiency;
  const minutes = hours * 60;
  const costs = (input.tariffs ?? [])
    .filter((t) => t.components.length > 0)
    .map((t) => priceCharge(t, gridKwh, minutes, batteryKwh))
    .sort((a, b) => a.total - b.total);

  return {
    compatible: true,
    fromSoc: from,
    toSoc: to,
    batteryKwh: round(batteryKwh, 2),
    gridKwh: round(gridKwh, 2),
    minutes: round(minutes, 1),
    avgPowerKw: hours > 0 ? round(gridKwh / hours, 1) : 0,
    peakPowerKw: round(peak, 1),
    costs,
  };
}

/** El conector más rápido compatible de una lista (o null si ninguno lo es). */
export function bestConnector<T extends ChargeConnector>(
  vehicle: VehicleSpec,
  connectors: T[],
): T | null {
  let best: T | null = null;
  let bestPower = 0;
  for (const c of connectors) {
    if (!isCompatible(vehicle, c)) continue;
    const p = powerAt(vehicle, c, 50);
    if (p > bestPower) {
      best = c;
      bestPower = p;
    }
  }
  return best;
}

/** Consumo por km (kWh) con un factor para autovía; 18 kWh/100 km si el modelo no lo da. */
export function consumptionPerKm(vehicle: VehicleSpec, highwayFactor = 1.15): number {
  return ((vehicle.consumptionKwhPer100km ?? 18) / 100) * highwayFactor;
}
