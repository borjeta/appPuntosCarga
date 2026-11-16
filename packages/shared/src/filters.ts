import {
  CONNECTOR_GROUP_KEYS,
  PAYMENT_METHODS,
  isOneOf,
  type ConnectorGroup,
  type PaymentMethod,
} from './enums';

/**
 * Filtros de búsqueda de estaciones. La app los serializa a query string y la API
 * los parsea con la misma función, así nunca se desincronizan.
 */
export interface SiteFilters {
  connectorGroups?: ConnectorGroup[];
  minPowerKw?: number;
  operatorIds?: string[];
  paymentMethods?: PaymentMethod[];
  onlyAvailable?: boolean;
  open24h?: boolean;
}

type QueryValue = string | string[] | undefined;
export type QueryLike = Record<string, QueryValue>;

function firstValue(v: QueryValue): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function listValue(v: QueryValue): string[] {
  const raw = Array.isArray(v) ? v.join(',') : (v ?? '');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function boolValue(v: QueryValue): boolean | undefined {
  const s = firstValue(v);
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

/** Parsea filtros desde query params. Ignora valores desconocidos en lugar de fallar. */
export function parseFilters(query: QueryLike): SiteFilters {
  const filters: SiteFilters = {};

  const groups = listValue(query.connectors).filter((g): g is ConnectorGroup =>
    isOneOf(CONNECTOR_GROUP_KEYS, g),
  );
  if (groups.length) filters.connectorGroups = [...new Set(groups)];

  const minPower = Number(firstValue(query.minPowerKw));
  if (Number.isFinite(minPower) && minPower > 0) filters.minPowerKw = Math.min(minPower, 1000);

  const operators = listValue(query.operators).filter((o) => o.length <= 64);
  if (operators.length) filters.operatorIds = [...new Set(operators)].slice(0, 50);

  const payments = listValue(query.payment).filter((p): p is PaymentMethod =>
    isOneOf(PAYMENT_METHODS, p),
  );
  if (payments.length) filters.paymentMethods = [...new Set(payments)];

  if (boolValue(query.onlyAvailable)) filters.onlyAvailable = true;
  if (boolValue(query.open24h)) filters.open24h = true;

  return filters;
}

/** Serializa filtros a pares clave/valor para la query string (orden estable para cachés). */
export function filtersToQuery(filters: SiteFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.connectorGroups?.length)
    out.connectors = [...filters.connectorGroups].sort().join(',');
  if (filters.minPowerKw) out.minPowerKw = String(filters.minPowerKw);
  if (filters.operatorIds?.length) out.operators = [...filters.operatorIds].sort().join(',');
  if (filters.paymentMethods?.length) out.payment = [...filters.paymentMethods].sort().join(',');
  if (filters.onlyAvailable) out.onlyAvailable = 'true';
  if (filters.open24h) out.open24h = 'true';
  return out;
}

export function countActiveFilters(filters: SiteFilters): number {
  return (
    (filters.connectorGroups?.length ? 1 : 0) +
    (filters.minPowerKw ? 1 : 0) +
    (filters.operatorIds?.length ? 1 : 0) +
    (filters.paymentMethods?.length ? 1 : 0) +
    (filters.onlyAvailable ? 1 : 0) +
    (filters.open24h ? 1 : 0)
  );
}
