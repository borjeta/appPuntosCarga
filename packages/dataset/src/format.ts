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
 * Claves cortas porque se descargan ~20.000 estaciones: el JSON se sirve comprimido (gzip).
 * Cambiar el formato de forma incompatible exige subir DATASET_VERSION.
 */
export const DATASET_VERSION = 1;

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

export interface StationsFile {
  version: number;
  generatedAt: string;
  operators: Record<string, OperatorRecord>;
  stations: StationRecord[];
}

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

export interface Manifest {
  version: number;
  generatedAt: string;
  files: { stations: ManifestEntry; status: ManifestEntry; vehicles: ManifestEntry };
  sources: DataSourceInfo[];
}
