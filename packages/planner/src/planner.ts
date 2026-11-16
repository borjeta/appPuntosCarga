import {
  bestConnector,
  consumptionPerKm,
  estimateCharge,
  powerAt,
  type ChargeConnector,
} from '@pc/pricing';
import type { NearbySite, RouteStop, Tariff, VehicleSpec } from '@pc/shared';

/**
 * Algoritmo del planificador (sección 5.7 del prompt). Puro: recibe la ruta ya calculada y los
 * cargadores cercanos a ella, y decide dónde parar y cuánto cargar.
 *
 * Estrategia voraz: desde la posición actual se mira el tramo alcanzable sin bajar del mínimo; de
 * entre los cargadores del último 30 % de ese tramo se elige el de más potencia efectiva (así se
 * avanza mucho y se carga rápido). Se carga lo justo para llegar (con margen), sin pasar del máximo.
 */

export interface RouteCandidate {
  site: NearbySite;
  /** Posición a lo largo de la ruta, en km desde el origen. */
  kmAlong: number;
  /** Desvío de ida (km) desde la ruta hasta el cargador. */
  detourKm: number;
  connectors: Array<ChargeConnector & { tariffs: Tariff[] }>;
}

export interface PlanParams {
  vehicle: VehicleSpec;
  totalKm: number;
  startSoc: number;
  arrivalMinSoc: number;
  stopMinSoc: number;
  maxChargeSoc: number;
  minPowerKw: number;
}

export interface PlanResult {
  feasible: boolean;
  reason: string | null;
  stops: RouteStop[];
  arrivalSoc: number;
  chargeMinutes: number;
  detourKm: number;
}

const MAX_STOPS = 20;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function planStops(params: PlanParams, candidates: RouteCandidate[]): PlanResult {
  const { vehicle, totalKm } = params;
  const socPerKm = (consumptionPerKm(vehicle) / vehicle.usableBatteryKwh) * 100;

  const usable = candidates
    .map((c) => ({ c, connector: bestConnector(vehicle, c.connectors) }))
    .filter(
      (x): x is { c: RouteCandidate; connector: ChargeConnector & { tariffs: Tariff[] } } =>
        !!x.connector &&
        powerAt(vehicle, x.connector, 50) >=
          Math.min(params.minPowerKw, vehicle.dc?.maxPowerKw ?? 0) &&
        x.c.site.status !== 'OUT_OF_SERVICE',
    )
    .sort((a, b) => a.c.kmAlong - b.c.kmAlong);

  const stops: RouteStop[] = [];
  let soc = params.startSoc;
  let pos = 0;
  let chargeMinutes = 0;
  let detourKm = 0;

  for (let i = 0; i <= MAX_STOPS; i++) {
    const arrival = soc - (totalKm - pos) * socPerKm;
    if (arrival >= params.arrivalMinSoc) {
      return {
        feasible: true,
        reason: null,
        stops,
        arrivalSoc: round1(arrival),
        chargeMinutes,
        detourKm,
      };
    }
    if (stops.length === MAX_STOPS) break;

    const maxReachKm = pos + (soc - params.stopMinSoc) / socPerKm;
    const reachable = usable.filter(
      ({ c }) => c.kmAlong > pos + 1 && c.kmAlong + c.detourKm <= maxReachKm,
    );
    if (!reachable.length) {
      return {
        feasible: false,
        reason: stops.length
          ? 'No hay cargadores compatibles alcanzables para continuar desde la última parada.'
          : 'No hay cargadores compatibles alcanzables con la batería de salida.',
        stops,
        arrivalSoc: round1(arrival),
        chargeMinutes,
        detourKm,
      };
    }

    const windowStart = pos + 0.7 * (maxReachKm - pos);
    const late = reachable.filter(({ c }) => c.kmAlong >= windowStart);
    const pool = late.length ? late : reachable.slice(-5);
    const chosen = pool.reduce((best, cur) =>
      powerAt(vehicle, cur.connector, 50) > powerAt(vehicle, best.connector, 50) ? cur : best,
    );

    const { c, connector } = chosen;
    const arriveSoc = soc - (c.kmAlong - pos + c.detourKm) * socPerKm;
    // Lo necesario para llegar al destino (volviendo a la ruta) con el mínimo pedido y un 3 % de margen.
    const needed = (totalKm - c.kmAlong + c.detourKm) * socPerKm + params.arrivalMinSoc + 3;
    const target = Math.min(params.maxChargeSoc, Math.max(needed, arriveSoc + 5));
    const est = estimateCharge({
      vehicle,
      connector,
      fromSoc: Math.round(arriveSoc),
      toSoc: Math.round(target),
      tariffs: connector.tariffs,
    });
    if (!est.compatible || target <= arriveSoc) {
      return {
        feasible: false,
        reason: 'No se puede cargar lo suficiente con los cargadores disponibles en la ruta.',
        stops,
        arrivalSoc: round1(arriveSoc),
        chargeMinutes,
        detourKm,
      };
    }

    const cheapest = est.costs[0];
    stops.push({
      site: c.site,
      kmFromStart: round1(c.kmAlong),
      detourKm: round1(c.detourKm),
      arrivalSoc: round1(arriveSoc),
      departureSoc: round1(target),
      chargeMinutes: Math.round(est.minutes),
      energyKwh: est.batteryKwh,
      chargerPowerKw: round1(est.peakPowerKw),
      cost: cheapest ? { total: cheapest.total, currency: cheapest.currency } : null,
    });
    chargeMinutes += Math.round(est.minutes);
    detourKm += 2 * c.detourKm;
    soc = target - c.detourKm * socPerKm; // vuelta a la ruta
    pos = c.kmAlong;
  }

  return {
    feasible: false,
    reason: 'Demasiadas paradas necesarias.',
    stops,
    arrivalSoc: round1(soc - (totalKm - pos) * socPerKm),
    chargeMinutes,
    detourKm,
  };
}

/** Reduce una polilínea a como mucho `max` puntos (para enviarla a la app). */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}
