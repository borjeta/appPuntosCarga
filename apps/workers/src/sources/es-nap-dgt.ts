import { mapAuthMethods, mapFacilities, mapSiteType } from '../datex2/mapping';
import { parseDatexSite, type DatexSite } from '../datex2/site';
import { downloadToCache, readText } from '../download';
import { parseDatexPeriods, parseSpanishHoursLabel } from '../normalize/hours';
import { OPERATOR_CATALOG, operatorDisplayName } from '../normalize/operators';
import {
  looksLikeCode,
  normalizePartyId,
  reorderInverted,
  smartTitleCase,
  tidyStreet,
} from '../normalize/text';
import { streamElements } from '../xml/stream';
import { datexEvses, validCoordinates } from './common';
import type { NormalizedSite, SourceAdapter } from './types';

/**
 * Punto de Acceso Nacional de España (DGT), dataset "Puntos de recarga eléctrica para vehículos".
 * Datos que los operadores remiten al MITECO. DATEX II v3, solo estáticos, actualización diaria.
 * https://nap.dgt.es/dataset/puntos-de-recarga-electrica-para-vehiculos
 */
export const ES_NAP_URL =
  'https://nap.dgt.es/datex2/v3/miterd/EnergyInfrastructureTablePublication/electrolineras.xml';

const ADDRESS_PREFIXES: Record<string, 'street' | 'city' | 'province' | 'region'> = {
  dirección: 'street',
  direccion: 'street',
  municipio: 'city',
  provincia: 'province',
  'comunidad autónoma': 'region',
  'comunidad autonoma': 'region',
};

export function parseSpanishAddress(lines: Array<{ text: string }>) {
  const out = { street: null, city: null, province: null, region: null } as Record<
    'street' | 'city' | 'province' | 'region',
    string | null
  >;
  for (const { text } of lines) {
    const m = /^\s*([^:]+):\s*(.*)$/.exec(text);
    const key = m ? ADDRESS_PREFIXES[m[1]!.trim().toLowerCase()] : undefined;
    if (key && m) out[key] = m[2]!.trim() || null;
    else if (!out.street) out.street = text.trim();
  }
  return {
    street: tidyStreet(out.street),
    city: reorderInverted(out.city ? smartTitleCase(out.city) : null),
    province: reorderInverted(out.province),
    region: reorderInverted(out.region),
  };
}

export function normalizeSpanishPostcode(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}$/.test(s)) return `0${s}`; // el NAP pierde el cero inicial (07011 → 7011)
  return /^\d{5}$/.test(s) ? s : null;
}

export function normalizeSpanishSite(sourceId: string, d: DatexSite): NormalizedSite | null {
  if (!d.id || !validCoordinates(d.lat, d.lng)) return null;
  const address = parseSpanishAddress(d.address.lines);
  const partyId =
    normalizePartyId(d.operator?.id) ?? (d.operator?.id ? `ES:${d.operator.id}` : null);
  const curated = partyId ? OPERATOR_CATALOG[partyId] : undefined;
  const evses = datexEvses(d, (rp) => rp.name ?? rp.externalIdentifier);
  if (!evses.length) return null;

  const hours = d.hours.label
    ? parseSpanishHoursLabel(d.hours.label)
    : parseDatexPeriods(d.hours.type, d.hours.periods);

  return {
    sourceId,
    externalId: d.id,
    // Muchos operadores publican un código interno como nombre; entonces es más útil la dirección.
    name:
      d.name && !(looksLikeCode(d.name) && address.street)
        ? smartTitleCase(d.name)
        : (address.street ?? d.name ?? 'Punto de recarga'),
    operator: partyId
      ? {
          id: partyId,
          legalName: d.operator?.name ?? null,
          displayName: operatorDisplayName(partyId, d.operator?.name ?? null),
          countryCode: 'ES',
          website: curated?.website ?? d.operator?.website ?? null,
          phone: d.operator?.phone ?? null,
        }
      : null,
    street: address.street,
    city: address.city,
    postalCode: normalizeSpanishPostcode(d.address.postcode),
    province: address.province,
    region: address.region,
    countryCode: 'ES',
    lat: d.lat,
    lng: d.lng!,
    openingHours: hours,
    siteType: mapSiteType(d.typeOfSite),
    paymentMethods: mapAuthMethods(d.stations.flatMap((s) => s.authMethods)),
    acceptedProviders: [],
    facilities: mapFacilities(d.facilities),
    evses,
    sourceUpdatedAt: d.lastUpdated,
  };
}

export const esNapDgt: SourceAdapter = {
  meta: {
    id: 'es-nap-dgt',
    name: 'Punto de Acceso Nacional de España (DGT / MITECO)',
    attribution: 'Fuente: Punto de Acceso Nacional, Dirección General de Tráfico (nap.dgt.es)',
    licenseName: 'CC BY',
    licenseUrl: 'http://www.opendefinition.org/licenses/cc-by',
    priority: 80,
  },
  async *sites({ file, force }) {
    const path =
      file ??
      (await downloadToCache(ES_NAP_URL, 'es-nap-dgt.xml', { maxAgeMinutes: 6 * 60, force }));
    for await (const node of streamElements(readText(path), ['energyInfrastructureSite'])) {
      const site = normalizeSpanishSite(this.meta.id, parseDatexSite(node));
      if (site) yield site;
    }
  },
};
