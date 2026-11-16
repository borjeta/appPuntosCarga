/**
 * Enumeraciones del dominio. Se siguen los nombres de OCPI 2.2.1 siempre que existen,
 * para que el futuro módulo eMSP (fase 3) no necesite traducciones.
 */

export const CONNECTOR_STANDARDS = [
  'IEC_62196_T2',
  'IEC_62196_T2_COMBO',
  'CHADEMO',
  'DOMESTIC_F',
  'DOMESTIC_E',
  'DOMESTIC_A',
  'DOMESTIC_L',
  'IEC_62196_T1',
  'IEC_62196_T1_COMBO',
  'IEC_60309_2_single_16',
  'IEC_60309_2_three_32',
  'IEC_62196_T3A',
  'IEC_62196_T3C',
  'TESLA_S',
  'OTHER',
] as const;
export type ConnectorStandard = (typeof CONNECTOR_STANDARDS)[number];

/** Grupos de conectores que ve el usuario en los filtros (varios estándares → un chip). */
export const CONNECTOR_GROUPS = {
  CCS2: ['IEC_62196_T2_COMBO'],
  TYPE2: ['IEC_62196_T2'],
  CHADEMO: ['CHADEMO'],
  SCHUKO: ['DOMESTIC_F', 'DOMESTIC_E'],
  TYPE1: ['IEC_62196_T1'],
  CCS1: ['IEC_62196_T1_COMBO'],
  OTHER: [
    'DOMESTIC_A',
    'DOMESTIC_L',
    'IEC_60309_2_single_16',
    'IEC_60309_2_three_32',
    'IEC_62196_T3A',
    'IEC_62196_T3C',
    'TESLA_S',
    'OTHER',
  ],
} as const satisfies Record<string, readonly ConnectorStandard[]>;
export type ConnectorGroup = keyof typeof CONNECTOR_GROUPS;
export const CONNECTOR_GROUP_KEYS = Object.keys(CONNECTOR_GROUPS) as ConnectorGroup[];

export function connectorGroupOf(standard: ConnectorStandard): ConnectorGroup {
  for (const key of CONNECTOR_GROUP_KEYS) {
    if ((CONNECTOR_GROUPS[key] as readonly ConnectorStandard[]).includes(standard)) return key;
  }
  return 'OTHER';
}

export const POWER_TYPES = ['AC_1_PHASE', 'AC_3_PHASE', 'DC'] as const;
export type PowerType = (typeof POWER_TYPES)[number];

export const CONNECTOR_FORMATS = ['SOCKET', 'CABLE'] as const;
export type ConnectorFormat = (typeof CONNECTOR_FORMATS)[number];

export const EVSE_STATUSES = [
  'AVAILABLE',
  'CHARGING',
  'BLOCKED',
  'RESERVED',
  'OUTOFORDER',
  'INOPERATIVE',
  'PLANNED',
  'REMOVED',
  'UNKNOWN',
] as const;
export type EvseStatus = (typeof EVSE_STATUSES)[number];

/** Estado resumido de una estación, el que se pinta en el mapa. */
export const SITE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'OUT_OF_SERVICE', 'UNKNOWN'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const PAYMENT_METHODS = [
  'AD_HOC_CARD',
  'OPERATOR_APP',
  'RFID',
  'QR',
  'PLUG_AND_CHARGE',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SITE_TYPES = ['ON_STREET', 'PARKING', 'IN_BUILDING', 'OPEN_SPACE', 'OTHER'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const FACILITIES = [
  'RESTAURANT',
  'CAFE',
  'SHOP',
  'SUPERMARKET',
  'HOTEL',
  'FUEL_STATION',
  'PARKING',
  'TRANSPORT_HUB',
  'TRAIN_STATION',
  'LEISURE',
] as const;
export type Facility = (typeof FACILITIES)[number];

export const PRICE_COMPONENT_TYPES = ['ENERGY', 'TIME', 'FLAT'] as const;
export type PriceComponentType = (typeof PRICE_COMPONENT_TYPES)[number];

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
