import { connectorGroupOf } from '@pc/shared';
import type { DatexRefillPoint, DatexSite } from '../datex2/site';
import {
  mapChargingMode,
  mapConnectorFormat,
  mapConnectorType,
  powerToKw,
} from '../datex2/mapping';
import { normalizeEvseId } from '../normalize/text';
import type { NormalizedConnector, NormalizedEvse } from './types';

export { connectorGroupOf };

export function datexEvses(
  site: DatexSite,
  evseIdOf: (rp: DatexRefillPoint) => string | null,
): NormalizedEvse[] {
  const evses: NormalizedEvse[] = [];
  for (const station of site.stations) {
    for (const rp of station.refillPoints) {
      if (!rp.id) continue;
      const connectors: NormalizedConnector[] = rp.connectors.map((c) => ({
        standard: mapConnectorType(c.connectorType),
        format: mapConnectorFormat(c.connectorFormat),
        powerType: mapChargingMode(c.chargingMode),
        maxPowerKw: powerToKw(c.maxPowerAtSocketW),
        maxVoltage: c.voltage,
        maxAmperage: c.maximumCurrent,
      }));
      evses.push({
        externalId: rp.id,
        evseId: normalizeEvseId(evseIdOf(rp)),
        connectors,
        tariffs: [],
      });
    }
  }
  return evses;
}

/** Coordenadas plausibles (descarta 0,0 y valores fuera de rango). */
export function validCoordinates(lat: number | null, lng: number | null): lat is number {
  return (
    lat !== null &&
    lng !== null &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)
  );
}

/** Party ID ("PT*SGM") a partir de un EVSE ID ("PT*SGM*E*GMR*00022*01"). */
export function partyIdFromEvseId(evseId: string | null): string | null {
  if (!evseId) return null;
  const m = /^([A-Z]{2})\*?([A-Z0-9]{3})\*?E/.exec(evseId);
  return m ? `${m[1]}*${m[2]}` : null;
}
