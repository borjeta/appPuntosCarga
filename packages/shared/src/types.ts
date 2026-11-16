import type {
  ConnectorFormat,
  ConnectorStandard,
  EvseStatus,
  ConnectorGroup,
  Facility,
  PaymentMethod,
  PowerType,
  PriceComponentType,
  SiteStatus,
  SiteType,
} from './enums';
import type { CommunitySummary } from './community';

/** Tipos de las respuestas de la API pública v1 (los consume la app). */

export interface PriceComponent {
  type: PriceComponentType;
  /** Precio en la moneda indicada, impuestos según `vatIncluded` del tarifario. */
  price: number;
}

export interface Tariff {
  currency: string;
  components: PriceComponent[];
  /** Descripción de quién fija el precio: el operador del punto (CPO) o un proveedor eMSP. */
  scope: 'CPO_BASE' | 'AD_HOC' | 'EMSP';
  vatIncluded: boolean | null;
  validFrom: string | null;
  validTo: string | null;
  sourceId: string;
}

export interface ConnectorDetail {
  standard: ConnectorStandard;
  format: ConnectorFormat | null;
  powerType: PowerType | null;
  maxPowerKw: number;
  maxVoltage: number | null;
  maxAmperage: number | null;
}

export interface EvseDetail {
  id: string;
  /** Identificador eMI3, p. ej. "ES*IBD*E157215". */
  evseId: string | null;
  /** Estado efectivo (ya degradado a UNKNOWN si el dato está caducado). */
  status: EvseStatus;
  statusUpdatedAt: string | null;
  connectors: ConnectorDetail[];
  tariffs: Tariff[];
}

export interface OperatorSummary {
  id: string;
  name: string;
  legalName: string | null;
  website: string | null;
  phone: string | null;
  appIosUrl: string | null;
  appAndroidPackage: string | null;
  /** Plantilla de deep link documentada por el operador (null si no la hay). `{evseId}` se sustituye. */
  deeplinkTemplate: string | null;
}

export interface Address {
  street: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  region: string | null;
  countryCode: string;
}

export interface RegularHours {
  /** 1 = lunes … 7 = domingo (ISO 8601, como OCPI). */
  weekday: number;
  periodBegin: string;
  periodEnd: string;
}

export interface OpeningHours {
  twentyFourSeven: boolean;
  regularHours: RegularHours[];
  /** Texto original de la fuente, por si el parseo no fue posible. */
  text: string | null;
}

export interface SourceAttribution {
  sourceId: string;
  name: string;
  attribution: string;
  licenseName: string | null;
  licenseUrl: string | null;
  lastSeenAt: string;
}

export interface LocationDetail {
  id: string;
  name: string;
  operator: OperatorSummary | null;
  address: Address;
  lat: number;
  lng: number;
  openingHours: OpeningHours;
  siteType: SiteType | null;
  paymentMethods: PaymentMethod[];
  /** Códigos de proveedores (eMSP) aceptados, cuando la fuente los publica (p. ej. MOBI.E). */
  acceptedProviders: string[];
  facilities: Facility[];
  maxPowerKw: number;
  status: SiteStatus;
  evses: EvseDetail[];
  sources: SourceAttribution[];
  community: CommunitySummary;
  /** Última actualización de los datos estáticos según la fuente. */
  lastUpdated: string | null;
}

export interface MapCluster {
  kind: 'cluster';
  /** Id estable de la celda, útil como `key` en la app. */
  id: string;
  lat: number;
  lng: number;
  count: number;
  maxPowerKw: number;
}

export interface MapSite {
  kind: 'site';
  id: string;
  lat: number;
  lng: number;
  name: string;
  operatorName: string | null;
  maxPowerKw: number;
  hasDc: boolean;
  evseCount: number;
  availableCount: number | null;
  status: SiteStatus;
}

export interface MapResponse {
  items: Array<MapCluster | MapSite>;
  /** true si había más estaciones que el límite devuelto (la app debe acercar el zoom). */
  truncated: boolean;
}

export interface NearbySite extends MapSite {
  distanceM: number;
  address: string | null;
  city: string | null;
}

export interface NearbyResponse {
  items: NearbySite[];
}

export interface SearchResponse {
  locations: NearbySite[];
  operators: Array<{ id: string; name: string; siteCount: number }>;
}

export interface OperatorListItem {
  id: string;
  name: string;
  siteCount: number;
}

export interface DataSourceInfo {
  id: string;
  /** 'stations' (puntos de recarga) o 'vehicles' (catálogo de modelos). */
  kind: 'stations' | 'vehicles';
  name: string;
  attribution: string;
  licenseName: string | null;
  licenseUrl: string | null;
  lastSyncAt: string | null;
  siteCount: number;
}

/* ---------- Vehículos (fase 2) ---------- */

export interface ChargingCurvePoint {
  /** Estado de carga, 0–100 %. */
  soc: number;
  powerKw: number;
}

/** Ficha técnica de un modelo de vehículo, lo necesario para estimar cargas y rutas. */
export interface VehicleSpec {
  id: string;
  brand: string;
  model: string;
  variant: string | null;
  releaseYear: number | null;
  usableBatteryKwh: number;
  /** Consumo medio en kWh/100 km (null si la fuente no lo da). */
  consumptionKwhPer100km: number | null;
  ac: { maxPowerKw: number; phases: number };
  dc: { maxPowerKw: number; curve: ChargingCurvePoint[] } | null;
  /** Grupos de conector compatibles (los mismos que los filtros del mapa). */
  connectorGroups: ConnectorGroup[];
}

/* ---------- Planificador de rutas (fase 2) ---------- */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoutePlanRequest {
  origin: LatLng;
  destination: LatLng;
  vehicleId: string;
  /** Batería al salir, en %. */
  startSoc: number;
  /** Mínimo con el que se quiere llegar al destino. */
  arrivalMinSoc?: number;
  /** Mínimo con el que se acepta llegar a una parada. */
  stopMinSoc?: number;
  /** Hasta dónde cargar como máximo en cada parada (por encima la carga es muy lenta). */
  maxChargeSoc?: number;
  /** Potencia mínima de los cargadores a usar. */
  minPowerKw?: number;
}

export interface RouteStopTariff {
  total: number;
  currency: string;
}

export interface RouteStop {
  site: NearbySite;
  kmFromStart: number;
  detourKm: number;
  arrivalSoc: number;
  departureSoc: number;
  chargeMinutes: number;
  energyKwh: number;
  chargerPowerKw: number;
  cost: RouteStopTariff | null;
}

export interface RoutePlan {
  feasible: boolean;
  /** Motivo si no es viable (p. ej. no hay cargadores alcanzables). */
  reason: string | null;
  distanceKm: number;
  driveMinutes: number;
  chargeMinutes: number;
  arrivalSoc: number;
  stops: RouteStop[];
  /** Trazado simplificado [lat, lng] para pintar en el mapa. */
  geometry: Array<[number, number]>;
  attribution: string;
}

export interface GeocodeResult {
  label: string;
  detail: string | null;
  lat: number;
  lng: number;
}
