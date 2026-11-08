import {
  child,
  childrenNamed,
  find,
  findAll,
  multilingual,
  num,
  path,
  text,
  type XmlNode,
} from '../xml/stream';

/**
 * Representación cruda (sin normalizar) de un `energyInfrastructureSite` DATEX II v3,
 * común a todos los NAP que publican la tabla de infraestructura de recarga.
 */
export interface DatexConnector {
  connectorType: string | null;
  chargingMode: string | null;
  connectorFormat: string | null;
  maxPowerAtSocketW: number | null;
  voltage: number | null;
  maximumCurrent: number | null;
}

export interface DatexRefillPoint {
  id: string;
  name: string | null;
  externalIdentifier: string | null;
  brandsAccepted: string[];
  connectors: DatexConnector[];
}

export interface DatexStation {
  id: string;
  authMethods: string[];
  refillPoints: DatexRefillPoint[];
}

export interface DatexHoursPeriod {
  day: string;
  start: string;
  end: string;
}

export interface DatexSite {
  id: string;
  name: string | null;
  externalIdentifier: string | null;
  lastUpdated: string | null;
  hours: { type: string | null; label: string | null; periods: DatexHoursPeriod[] };
  lat: number | null;
  lng: number | null;
  address: {
    postcode: string | null;
    city: string | null;
    countryCode: string | null;
    lines: Array<{ type: string | null; text: string }>;
  };
  operator: {
    id: string | null;
    name: string | null;
    phone: string | null;
    website: string | null;
  } | null;
  typeOfSite: string | null;
  facilities: string[];
  stations: DatexStation[];
}

function parseConnector(node: XmlNode): DatexConnector {
  return {
    connectorType: text(child(node, 'connectorType')),
    chargingMode: text(child(node, 'chargingMode')),
    connectorFormat: text(child(node, 'connectorFormat')),
    maxPowerAtSocketW: num(child(node, 'maxPowerAtSocket')),
    voltage: num(child(node, 'voltage')),
    maximumCurrent: num(child(node, 'maximumCurrent')),
  };
}

function parseRefillPoint(node: XmlNode): DatexRefillPoint {
  return {
    id: node.attrs.id ?? '',
    name: multilingual(child(node, 'name')),
    externalIdentifier: text(child(node, 'externalIdentifier')),
    brandsAccepted: findAll(child(node, 'rates'), 'brandsAccepted')
      .map((n) => n.text)
      .filter(Boolean),
    connectors: childrenNamed(node, 'connector').map(parseConnector),
  };
}

function parseStation(node: XmlNode): DatexStation {
  return {
    id: node.attrs.id ?? '',
    authMethods: childrenNamed(node, 'authenticationAndIdentificationMethods')
      .map((n) => n.text)
      .filter(Boolean),
    refillPoints: childrenNamed(node, 'refillPoint').map(parseRefillPoint),
  };
}

function parseHours(node: XmlNode | undefined): DatexSite['hours'] {
  if (!node) return { type: null, label: null, periods: [] };
  const periods: DatexHoursPeriod[] = [];
  for (const vp of findAll(node, 'validPeriod')) {
    const tp = find(vp, 'recurringTimePeriodOfDay');
    const start = text(child(tp, 'startTimeOfPeriod'));
    const end = text(child(tp, 'endTimeOfPeriod'));
    if (!start || !end) continue;
    for (const day of findAll(vp, 'applicableDay')) {
      if (day.text) periods.push({ day: day.text, start, end });
    }
  }
  return { type: node.attrs.type ?? null, label: text(child(node, 'label')), periods };
}

export function parseDatexSite(node: XmlNode): DatexSite {
  const location = child(node, 'locationReference');
  const address = find(location, 'address');
  const operator = child(node, 'operator');

  const facilities = [
    ...findAll(node, 'serviceFacilityType').map((n) => n.text),
    ...findAll(child(node, 'associatedFacility'), 'type').map((n) => n.text),
  ].filter(Boolean);

  return {
    id: node.attrs.id ?? '',
    name: multilingual(child(node, 'name')),
    externalIdentifier: text(child(node, 'externalIdentifier')),
    lastUpdated: text(child(node, 'lastUpdated')),
    hours: parseHours(child(node, 'operatingHours')),
    lat: num(find(location, 'latitude')),
    lng: num(find(location, 'longitude')),
    address: {
      postcode: text(child(address, 'postcode')),
      city: multilingual(child(address, 'city')),
      countryCode: text(child(address, 'countryCode')),
      lines: childrenNamed(address, 'addressLine')
        .sort((a, b) => Number(a.attrs.order ?? 0) - Number(b.attrs.order ?? 0))
        .map((line) => ({
          type: text(child(line, 'type')),
          text: multilingual(child(line, 'text')) ?? '',
        }))
        .filter((l) => l.text),
    },
    operator: operator
      ? {
          id: operator.attrs.id ?? text(child(operator, 'nationalOrganisationNumber')),
          name: multilingual(child(operator, 'name')),
          phone: text(find(operator, 'telephoneNumber')),
          website: text(child(operator, 'linkToGeneralInformation')),
        }
      : null,
    typeOfSite: text(child(node, 'typeOfSite')),
    facilities,
    stations: childrenNamed(node, 'energyInfrastructureStation').map(parseStation),
  };
}

/* ---------- Publicación de estados (EnergyInfrastructureStatusPublication) ---------- */

export interface DatexRate {
  pricingPolicy: string | null;
  value: number | null;
  currency: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export interface DatexRefillPointStatus {
  siteId: string | null;
  refillPointId: string;
  status: string | null;
  rates: DatexRate[];
}

/** Convierte un `energyInfrastructureSiteStatus` en estados por punto de recarga. */
export function parseDatexSiteStatus(node: XmlNode): DatexRefillPointStatus[] {
  const siteId = child(node, 'reference')?.attrs.id ?? null;
  return findAll(node, 'refillPointStatus').map((rp) => ({
    siteId,
    refillPointId: child(rp, 'reference')?.attrs.id ?? '',
    status: text(child(rp, 'status')),
    rates: findAll(rp, 'rates').map((rate) => ({
      pricingPolicy: text(find(rate, 'pricingPolicy')),
      value: num(find(rate, 'minimumDeliveryFee')),
      currency: text(child(rate, 'applicableCurrency')),
      validFrom: text(path(rate, 'overallPeriod', 'overallStartTime')),
      validTo: text(path(rate, 'overallPeriod', 'overallEndTime')),
    })),
  }));
}
