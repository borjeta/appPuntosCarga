import type {
  ConnectorFormat,
  ConnectorStandard,
  EvseStatus,
  Facility,
  PaymentMethod,
  PowerType,
  PriceComponentType,
  SiteType,
} from '@pc/shared';

/** Traducción de los enumerados DATEX II v3 (energyInfrastructure) al modelo OCPI interno. */

const CONNECTOR_TYPES: Record<string, ConnectorStandard> = {
  iec62196T2: 'IEC_62196_T2',
  iec62196T2COMBO: 'IEC_62196_T2_COMBO',
  chademo: 'CHADEMO',
  domesticF: 'DOMESTIC_F',
  domesticE: 'DOMESTIC_E',
  domesticA: 'DOMESTIC_A',
  domesticL: 'DOMESTIC_L',
  iec62196T1: 'IEC_62196_T1',
  iec62196T1COMBO: 'IEC_62196_T1_COMBO',
  iec60309x2single16: 'IEC_60309_2_single_16',
  iec60309x2three32: 'IEC_60309_2_three_32',
  iec62196T3A: 'IEC_62196_T3A',
  iec62196T3C: 'IEC_62196_T3C',
  teslaS: 'TESLA_S',
};

export function mapConnectorType(value: string | null): ConnectorStandard {
  return (value && CONNECTOR_TYPES[value]) || 'OTHER';
}

export function mapChargingMode(value: string | null): PowerType | null {
  if (!value) return null;
  if (/DC/i.test(value)) return 'DC';
  if (/3p/i.test(value)) return 'AC_3_PHASE';
  if (/1p/i.test(value)) return 'AC_1_PHASE';
  return null;
}

export function mapConnectorFormat(value: string | null): ConnectorFormat | null {
  if (!value) return null;
  if (value === 'socket') return 'SOCKET';
  if (value.startsWith('cable')) return 'CABLE';
  return null;
}

/**
 * Potencia en kW a partir del valor DATEX (vatios). Algunos publicadores meten kW por error;
 * un valor < 1000 se interpreta ya como kW (ningún punto público da menos de 1 kW).
 */
export function powerToKw(watts: number | null): number {
  if (watts === null || watts <= 0) return 0;
  const kw = watts < 1000 ? watts : watts / 1000;
  return Math.round(kw * 10) / 10;
}

const AUTH_TO_PAYMENT: Record<string, PaymentMethod> = {
  apps: 'OPERATOR_APP',
  rfid: 'RFID',
  creditCard: 'AD_HOC_CARD',
  debitCard: 'AD_HOC_CARD',
  nfc: 'AD_HOC_CARD',
  pinpad: 'AD_HOC_CARD',
  cashPayment: 'AD_HOC_CARD',
  plc: 'PLUG_AND_CHARGE',
  plugAndCharge: 'PLUG_AND_CHARGE',
  qrCode: 'QR',
  overTheAir: 'OPERATOR_APP',
};

export function mapAuthMethods(values: readonly string[]): PaymentMethod[] {
  const out = new Set<PaymentMethod>();
  for (const v of values) {
    const mapped = AUTH_TO_PAYMENT[v];
    if (mapped) out.add(mapped);
  }
  return [...out].sort();
}

const STATUS: Record<string, EvseStatus> = {
  available: 'AVAILABLE',
  charging: 'CHARGING',
  occupied: 'CHARGING',
  blocked: 'BLOCKED',
  reserved: 'RESERVED',
  outOfOrder: 'OUTOFORDER',
  faulted: 'OUTOFORDER',
  inoperative: 'INOPERATIVE',
  planned: 'PLANNED',
  removed: 'REMOVED',
  unknown: 'UNKNOWN',
};

export function mapStatus(value: string | null): EvseStatus {
  return (value && STATUS[value]) || 'UNKNOWN';
}

const SITE_TYPES: Record<string, SiteType> = {
  onstreet: 'ON_STREET',
  onStreet: 'ON_STREET',
  openSpace: 'OPEN_SPACE',
  inBuilding: 'IN_BUILDING',
  parking: 'PARKING',
  other: 'OTHER',
};

export function mapSiteType(value: string | null): SiteType | null {
  return (value && SITE_TYPES[value]) || null;
}

const FACILITY: Record<string, Facility> = {
  restaurant: 'RESTAURANT',
  cafe: 'CAFE',
  shop: 'SHOP',
  foodShopping: 'SUPERMARKET',
  hotel: 'HOTEL',
  petrolStation: 'FUEL_STATION',
  parkingSite: 'PARKING',
  publicTransportHub: 'TRANSPORT_HUB',
  trainStation: 'TRAIN_STATION',
  leisureActivities: 'LEISURE',
};

export function mapFacilities(values: readonly string[]): Facility[] {
  const out = new Set<Facility>();
  for (const v of values) {
    const mapped = FACILITY[v];
    if (mapped) out.add(mapped);
  }
  return [...out].sort();
}

const PRICING_POLICY: Record<string, PriceComponentType> = {
  pricePerDeliveryUnit: 'ENERGY',
  pricePerChargingTime: 'TIME',
  flatRate: 'FLAT',
};

export function mapPricingPolicy(value: string | null): PriceComponentType | null {
  return (value && PRICING_POLICY[value]) || null;
}

const DAYS: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

export function mapWeekday(value: string): number | null {
  return DAYS[value.toLowerCase()] ?? null;
}
