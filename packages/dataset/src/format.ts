import type {
  ConnectorFormat,
  ConnectorStandard,
  DataSourceInfo,
  EvseStatus,
  Facility,
  OpeningHours,
  PaymentMethod,
  PowerType,
  SiteType,
  Tariff,
  VehicleSpec,
} from '@pc/shared';

/**
 * Formato de los ficheros estáticos que publica la ingesta (GitHub Pages) y descarga la app.
 *
 * v2 (escala europea): por país, un ÍNDICE compacto (una fila por estación con lo necesario para
 * mapa, filtros, búsqueda y rutas) y TESELAS de 0,5° con las fichas completas, que la app descarga
 * solo cuando abre una estación. Cambiar el formato de forma incompatible exige subir la versión.
 */
export const DATASET_VERSION = 2;

/** Lado de las teselas de detalle, en grados. */
export const TILE_DEG = 0.5;

export function tileKey(lat: number, lng: number): string {
  return `${Math.floor(lng / TILE_DEG)}_${Math.floor(lat / TILE_DEG)}`;
}

/* ---------- Ficha completa (dentro de las teselas) ---------- */

export interface ConnectorRecord {
  /** Estándar OCPI. */
  s: ConnectorStandard;
  f?: ConnectorFormat;
  p?: PowerType;
  /** Potencia máxima, kW. */
  w: number;
  v?: number;
  a?: number;
}

export interface EvseRecord {
  /** EVSE ID eMI3. */
  id?: string;
  /** Clave para casar el estado en tiempo real: "<fuente>:<id externo>". Solo fuentes dinámicas. */
  k?: string;
  t?: Tariff[];
  c: ConnectorRecord[];
}

export interface StationRecord {
  /** Id estable entre publicaciones: "<prefijo fuente>:<id externo>" (p. ej. "es:2023002088"). */
  i: string;
  n: string;
  o?: string;
  a?: string;
  c?: string;
  z?: string;
  pr?: string;
  r?: string;
  cc: string;
  y: number;
  x: number;
  /** Horario (omitido si es 24 h: entonces h24 = 1). */
  h?: OpeningHours;
  h24?: 1;
  st?: SiteType;
  pm?: PaymentMethod[];
  ap?: string[];
  f?: Facility[];
  /** Última actualización en la fuente (ISO). */
  u?: string;
  /** Fuentes, la principal primero. */
  src: string[];
  e: EvseRecord[];
}

export interface OperatorRecord {
  n: string;
  ln?: string;
  w?: string;
  p?: string;
  ios?: string;
  and?: string;
  dl?: string;
}

/** Conjunto completo (lo genera la exportación desde la base de datos; no se publica tal cual). */
export interface StationsFile {
  version: number;
  generatedAt: string;
  operators: Record<string, OperatorRecord>;
  stations: StationRecord[];
}

export interface TileFile {
  version: number;
  cc: string;
  key: string;
  generatedAt: string;
  operators: Record<string, OperatorRecord>;
  stations: StationRecord[];
}

/* ---------- Índice compacto por país ---------- */

/**
 * Una estación en el índice. Array (no objeto) para que 80.000 filas pesen poco y se lean rápido.
 * Las máscaras usan el orden de CONNECTOR_GROUP_KEYS y PAYMENT_METHODS de @pc/shared.
 */
export type IndexRow = [
  id: string,
  name: string,
  lat: number,
  lng: number,
  /** Índice en `operators` (-1 si no hay operador). */
  op: number,
  maxKw: number,
  /** Potencia máxima en DC (0 si no hay carga rápida) y en AC. */
  dcKw: number,
  acKw: number,
  /** Bit 1 = abierta 24 h. */
  flags: number,
  groups: number,
  payments: number,
  evses: number,
  city: string | 0,
  /** Claves de estado en tiempo real ("fuente:id|fuente:id"), o 0. */
  keys: string | 0,
  /** Precio base del operador: [€/kWh, €/min, € por sesión], o 0 si no se publica. */
  tariff: [number, number, number] | 0,
];

export const FLAG_24H = 1;

export interface CountryIndexFile {
  version: number;
  cc: string;
  generatedAt: string;
  /** [id, nombre comercial] */
  operators: Array<[string, string]>;
  rows: IndexRow[];
}

/* ---------- Estado en tiempo real, vehículos y manifiesto ---------- */

export interface StatusFile {
  version: number;
  generatedAt: string;
  sources: Record<string, { observedAt: string; evses: Record<string, EvseStatus> }>;
}

export interface VehiclesFile {
  version: number;
  generatedAt: string;
  vehicles: VehicleSpec[];
}

export interface ManifestEntry {
  path: string;
  bytes: number;
  count: number;
  generatedAt: string;
}

export interface CountryEntry {
  cc: string;
  count: number;
  generatedAt: string;
  index: ManifestEntry;
  /** Carpeta de teselas (`tiles/es`) y claves existentes. */
  tilesPath: string;
  tiles: string[];
}

export interface Manifest {
  version: number;
  generatedAt: string;
  countries: CountryEntry[];
  files: { status: ManifestEntry; vehicles: ManifestEntry };
  sources: DataSourceInfo[];
}
