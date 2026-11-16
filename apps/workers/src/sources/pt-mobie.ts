import type { PriceComponent, Tariff } from '@pc/shared';
import {
  mapAuthMethods,
  mapFacilities,
  mapPricingPolicy,
  mapSiteType,
  mapStatus,
} from '../datex2/mapping';
import {
  parseDatexSite,
  parseDatexSiteStatus,
  type DatexRate,
  type DatexSite,
} from '../datex2/site';
import { downloadToCache, readText } from '../download';
import { parseDatexPeriods } from '../normalize/hours';
import { operatorDisplayName } from '../normalize/operators';
import { looksLikeCode, smartTitleCase, tidyStreet } from '../normalize/text';
import { streamElements } from '../xml/stream';
import { datexEvses, partyIdFromEvseId, validCoordinates } from './common';
import type { NormalizedSite, SourceAdapter, StatusUpdate } from './types';

/**
 * MOBI.E — Punto de Acceso Nacional de Portugal. DATEX II v3 con estáticos (≈180 MB)
 * y estado en tiempo real + tarifas base del operador (≈40 MB).
 */
export const PT_INFRA_URL = 'https://pgm.mobie.pt/integration/nap/evChargingInfra';
export const PT_STATUS_URL = 'https://pgm.mobie.pt/integration/nap/evActualStatus';

export function normalizePortugueseSite(sourceId: string, d: DatexSite): NormalizedSite | null {
  if (!d.id || !validCoordinates(d.lat, d.lng)) return null;
  const evses = datexEvses(d, (rp) => rp.externalIdentifier ?? rp.name);
  if (!evses.length) return null;

  const street = tidyStreet(
    d.address.lines.find((l) => l.type === 'street')?.text ?? d.address.lines[0]?.text ?? null,
  );
  // Muchos nombres son códigos internos ("GMR-00022"); en ese caso es más útil la dirección.
  const name =
    d.name && !(looksLikeCode(d.name) && street)
      ? d.name
      : (street ?? d.name ?? 'Posto de carregamento');

  const partyId =
    evses.map((e) => partyIdFromEvseId(e.evseId)).find(Boolean) ??
    (d.operator?.id ? `PT:${d.operator.id}` : null);

  const acceptedProviders = [
    ...new Set(d.stations.flatMap((s) => s.refillPoints.flatMap((rp) => rp.brandsAccepted))),
  ].sort();

  return {
    sourceId,
    externalId: d.id,
    name: smartTitleCase(name),
    operator: partyId
      ? {
          id: partyId,
          legalName: d.operator?.name ?? null,
          displayName: operatorDisplayName(partyId, d.operator?.name ?? null),
          countryCode: 'PT',
          website: d.operator?.website ?? null,
          phone: d.operator?.phone ?? null,
        }
      : null,
    street,
    city: d.address.city,
    postalCode: d.address.postcode,
    province: null,
    region: null,
    countryCode: (d.address.countryCode ?? 'PT').toUpperCase(),
    lat: d.lat,
    lng: d.lng!,
    openingHours: parseDatexPeriods(d.hours.type, d.hours.periods),
    siteType: mapSiteType(d.typeOfSite),
    paymentMethods: mapAuthMethods(d.stations.flatMap((s) => s.authMethods)),
    acceptedProviders,
    facilities: mapFacilities(d.facilities),
    evses,
    sourceUpdatedAt: d.lastUpdated,
  };
}

/** Agrupa las tarifas DATEX de un punto en un tarifario base del operador (OPC). */
export function ratesToTariffs(rates: DatexRate[], sourceId: string, now = new Date()): Tariff[] {
  const components: PriceComponent[] = [];
  let currency = 'EUR';
  let validFrom: string | null = null;
  let validTo: string | null = null;
  for (const rate of rates) {
    const type = mapPricingPolicy(rate.pricingPolicy);
    if (!type || rate.value === null || rate.value < 0) continue;
    if (rate.validTo && Date.parse(rate.validTo) < now.getTime()) continue;
    if (rate.validFrom && Date.parse(rate.validFrom) > now.getTime()) continue;
    components.push({ type, price: rate.value });
    currency = rate.currency ?? currency;
    validFrom = rate.validFrom ?? validFrom;
    validTo = rate.validTo ?? validTo;
  }
  if (!components.length) return [];
  return [
    { currency, components, scope: 'CPO_BASE', vatIncluded: null, validFrom, validTo, sourceId },
  ];
}

export const ptMobie: SourceAdapter = {
  meta: {
    id: 'pt-mobie',
    name: 'MOBI.E — Punto de Acceso Nacional de Portugal',
    attribution: 'Fuente: MOBI.E / NAP Portugal',
    licenseName: null,
    licenseUrl: 'https://nap-portugal.imt-ip.pt',
    priority: 80,
  },
  async *sites({ file, force }) {
    const path =
      file ??
      (await downloadToCache(PT_INFRA_URL, 'pt-mobie-infra.xml', { maxAgeMinutes: 6 * 60, force }));
    for await (const node of streamElements(readText(path), ['energyInfrastructureSite'])) {
      const site = normalizePortugueseSite(this.meta.id, parseDatexSite(node));
      if (site) yield site;
    }
  },
  async *statuses({ file, force }) {
    const path =
      file ??
      (await downloadToCache(PT_STATUS_URL, 'pt-mobie-status.xml', { maxAgeMinutes: 2, force }));
    let observedAt = new Date().toISOString();
    const now = new Date();
    for await (const node of streamElements(readText(path), [
      'publicationTime',
      'energyInfrastructureSiteStatus',
    ])) {
      if (node.name === 'publicationTime') {
        if (node.text && Number.isFinite(Date.parse(node.text))) observedAt = node.text;
        continue;
      }
      for (const rp of parseDatexSiteStatus(node)) {
        if (!rp.refillPointId) continue;
        const update: StatusUpdate = {
          sourceId: this.meta.id,
          evseExternalId: rp.refillPointId,
          status: mapStatus(rp.status),
          tariffs: ratesToTariffs(rp.rates, this.meta.id, now),
          observedAt,
        };
        yield update;
      }
    }
  },
};
