import type {
  ConnectorFormat,
  ConnectorStandard,
  EvseStatus,
  Facility,
  OpeningHours,
  PaymentMethod,
  PowerType,
  SiteType,
  Tariff,
} from '@pc/shared';

/** Modelo normalizado que produce cualquier adaptador antes de deduplicar y guardar. */

export interface NormalizedConnector {
  standard: ConnectorStandard;
  format: ConnectorFormat | null;
  powerType: PowerType | null;
  maxPowerKw: number;
  maxVoltage: number | null;
  maxAmperage: number | null;
}

export interface NormalizedEvse {
  /** Id del punto dentro de la fuente (estable entre descargas). */
  externalId: string;
  /** EVSE ID eMI3 normalizado si la fuente lo da. */
  evseId: string | null;
  connectors: NormalizedConnector[];
  tariffs: Tariff[];
}

export interface NormalizedOperator {
  /** Party ID eMI3 ('ES*IBD') o, si no existe, un id con prefijo de la fuente. */
  id: string;
  legalName: string | null;
  displayName: string;
  countryCode: string | null;
  website: string | null;
  phone: string | null;
}

export interface NormalizedSite {
  sourceId: string;
  externalId: string;
  name: string;
  operator: NormalizedOperator | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  region: string | null;
  countryCode: string;
  lat: number;
  lng: number;
  openingHours: OpeningHours;
  siteType: SiteType | null;
  paymentMethods: PaymentMethod[];
  acceptedProviders: string[];
  facilities: Facility[];
  evses: NormalizedEvse[];
  sourceUpdatedAt: string | null;
}

export interface StatusUpdate {
  sourceId: string;
  /** externalId del EVSE en la fuente. */
  evseExternalId: string;
  status: EvseStatus;
  tariffs: Tariff[] | null;
  observedAt: string;
}

export interface SourceMeta {
  id: string;
  name: string;
  attribution: string;
  licenseName: string | null;
  licenseUrl: string | null;
  priority: number;
}

export interface SourceAdapter {
  meta: SourceMeta;
  /** Recorre todas las estaciones de la fuente. `file` permite usar un fichero local en vez de descargar. */
  sites(options: { file?: string; force?: boolean }): AsyncIterable<NormalizedSite>;
  /** Estados dinámicos, si la fuente los ofrece. */
  statuses?(options: { file?: string; force?: boolean }): AsyncIterable<StatusUpdate>;
}
