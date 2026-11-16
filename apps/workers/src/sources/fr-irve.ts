import type { ConnectorStandard, PaymentMethod, PowerType, SiteType } from '@pc/shared';
import { downloadToCache, USER_AGENT } from '../download';
import { operatorDisplayName } from '../normalize/operators';
import { normalizeEvseId, smartTitleCase, tidyStreet } from '../normalize/text';
import { partyIdFromEvseId, validCoordinates } from './common';
import { csvRows, parseBool, parseDecimal, UnionFind } from './csv';
import type { NormalizedConnector, NormalizedEvse, NormalizedSite, SourceAdapter } from './types';

/**
 * Francia — Base nationale des IRVE (consolidación de data.gouv.fr, esquema IRVE estático 2.3).
 * CSV de ~110 MB con una fila por punto de carga (PDC). Licence Ouverte / Etalab 2.0 (atribución).
 * https://www.data.gouv.fr/fr/datasets/fichier-consolide-des-bornes-de-recharge-pour-vehicules-electriques/
 *
 * La consolidación junta datos de varios publicadores y el mismo punto puede aparecer varias veces con
 * ids de estación distintos: se agrupan las filas que comparten id de PDC (union-find).
 */
export const FR_DATASET_API =
  'https://www.data.gouv.fr/api/1/datasets/fichier-consolide-des-bornes-de-recharge-pour-vehicules-electriques/';

export async function resolveFrCsvUrl(): Promise<string> {
  const res = await fetch(FR_DATASET_API, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`data.gouv.fr HTTP ${res.status}`);
  const d = (await res.json()) as {
    resources: Array<{ format: string; title: string; url: string }>;
  };
  const r =
    d.resources.find((x) => x.format === 'csv' && /dernière version/i.test(x.title)) ??
    d.resources.find((x) => x.format === 'csv' && /^Consolidation/i.test(x.title));
  if (!r) throw new Error('No se encontró el CSV consolidado de IRVE en data.gouv.fr');
  return r.url;
}

const SITE_TYPES: Record<string, SiteType> = {
  Voirie: 'ON_STREET',
  'Parking public': 'PARKING',
  'Parking privé à usage public': 'PARKING',
  'Parking privé réservé à la clientèle': 'PARKING',
  'Station dédiée à la recharge rapide': 'OPEN_SPACE',
};

type Row = Record<string, string>;

/** Conectores de un PDC a partir de las columnas prise_type_* y la potencia nominal. */
export function frConnectors(row: Row): NormalizedConnector[] {
  let p = parseDecimal(row.puissance_nominale) ?? 0;
  if (p > 1000) p = p / 1000; // algunos publicadores ponen vatios
  const hasDc = parseBool(row.prise_type_combo_ccs) || parseBool(row.prise_type_chademo);
  const out: NormalizedConnector[] = [];
  const add = (
    standard: ConnectorStandard,
    powerType: PowerType,
    kw: number,
    format: 'SOCKET' | 'CABLE',
  ) =>
    out.push({
      standard,
      format,
      powerType,
      maxPowerKw: Math.round(kw * 10) / 10,
      maxVoltage: null,
      maxAmperage: null,
    });
  if (parseBool(row.prise_type_combo_ccs)) add('IEC_62196_T2_COMBO', 'DC', p, 'CABLE');
  if (parseBool(row.prise_type_chademo)) add('CHADEMO', 'DC', p, 'CABLE');
  // En un cargador rápido la toma Tipo 2 no da la potencia DC: como mucho 43 kW (22 si no consta).
  if (parseBool(row.prise_type_2)) {
    add(
      'IEC_62196_T2',
      'AC_3_PHASE',
      hasDc ? Math.min(p, 43, 22) : Math.min(p, 43),
      parseBool(row.cable_t2_attache) ? 'CABLE' : 'SOCKET',
    );
  }
  if (parseBool(row.prise_type_ef)) add('DOMESTIC_E', 'AC_1_PHASE', Math.min(p, 3.7), 'SOCKET');
  if (parseBool(row.prise_type_autre) && !out.length) add('OTHER', 'AC_3_PHASE', p, 'SOCKET');
  return out.filter((c) => c.maxPowerKw > 0);
}

function frPayments(row: Row): PaymentMethod[] {
  const out = new Set<PaymentMethod>();
  if (parseBool(row.paiement_cb)) out.add('AD_HOC_CARD');
  if (parseBool(row.paiement_acte)) out.add('QR'); // pago puntual sin contrato (web/QR/tarjeta)
  if (parseBool(row.paiement_autre)) out.add('RFID');
  return [...out].sort();
}

/** id de estación "FR*ABC*P…" válido (muchos publicadores ponen "Non concerné" o vacío). */
const VALID_STATION = /^FR\*?[A-Z0-9]{3}\*?P[A-Z0-9*]+$/i;

export function frStationKey(row: Row, lat: number, lng: number): string {
  const id = (row.id_station_itinerance ?? '').trim().toUpperCase();
  if (VALID_STATION.test(id)) return id;
  const op = (row.nom_operateur || row.nom_amenageur || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `geo:${lat.toFixed(4)},${lng.toFixed(4)}|${op}`;
}

/** Agrupa las filas (PDC) en estaciones y las normaliza. Exportado para los tests. */
export function groupFrRows(rows: Row[], sourceId: string): NormalizedSite[] {
  const uf = new UnionFind();
  const pdcOwner = new Map<string, string>();
  const byKey = new Map<string, Row[]>();
  for (const row of rows) {
    if (/réservé/i.test(row.condition_acces ?? '')) continue; // solo puntos de acceso público
    const lat = parseDecimal(row.consolidated_latitude);
    const lng = parseDecimal(row.consolidated_longitude);
    if (!validCoordinates(lat, lng)) continue;
    const key = frStationKey(row, lat, lng!);
    uf.find(key);
    const pdc = (row.id_pdc_itinerance || '').trim().toUpperCase();
    if (pdc && !/non concern/i.test(pdc)) {
      const owner = pdcOwner.get(pdc);
      if (owner) uf.union(owner, key);
      else pdcOwner.set(pdc, key);
    }
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const groups = new Map<string, Row[]>();
  for (const [key, list] of byKey) {
    const root = uf.find(key);
    const g = groups.get(root);
    if (g) g.push(...list);
    else groups.set(root, [...list]);
  }

  const sites: NormalizedSite[] = [];
  for (const [root, list] of groups) {
    const first = list[0]!;
    const evses: NormalizedEvse[] = [];
    const seenPdc = new Set<string>();
    for (const [i, row] of list.entries()) {
      const pdcRaw = (row.id_pdc_itinerance || row.id_pdc_local || '').trim();
      const pdc = pdcRaw && !/non concern/i.test(pdcRaw) ? pdcRaw.toUpperCase() : `${root}#${i}`;
      if (seenPdc.has(pdc)) continue; // mismo punto publicado dos veces
      seenPdc.add(pdc);
      const connectors = frConnectors(row);
      if (!connectors.length) continue;
      evses.push({ externalId: pdc, evseId: normalizeEvseId(pdc), connectors, tariffs: [] });
    }
    if (!evses.length) continue;
    const party = evses.map((e) => partyIdFromEvseId(e.evseId)).find(Boolean);
    const legal = first.nom_operateur || first.nom_amenageur || null;
    const operatorId =
      party ??
      (legal
        ? `FR:${legal
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 40)}`
        : null);
    const h24 = list.some((r) => r.horaires?.trim() === '24/7');
    const hoursText = list.map((r) => r.horaires?.trim()).find((h) => h && h !== '24/7') ?? null;
    const payments = [...new Set(list.flatMap(frPayments))].sort();
    const name =
      first.nom_station || first.nom_enseigne || first.adresse_station || 'Borne de recharge';
    sites.push({
      sourceId,
      externalId: root,
      name: smartTitleCase(name),
      operator: operatorId
        ? {
            id: operatorId,
            legalName: legal,
            displayName: operatorDisplayName(operatorId, legal),
            countryCode: 'FR',
            website: null,
            phone: first.telephone_operateur || null,
          }
        : null,
      street: tidyStreet(first.adresse_station || null),
      city: first.consolidated_commune || null,
      postalCode: first.consolidated_code_postal || null,
      province: null,
      region: null,
      countryCode: 'FR',
      lat: parseDecimal(first.consolidated_latitude)!,
      lng: parseDecimal(first.consolidated_longitude)!,
      openingHours: h24
        ? { twentyFourSeven: true, regularHours: [], text: null }
        : { twentyFourSeven: false, regularHours: [], text: hoursText },
      siteType: SITE_TYPES[first.implantation_station ?? ''] ?? null,
      paymentMethods: payments,
      acceptedProviders: [],
      facilities: [],
      evses,
      sourceUpdatedAt: first.date_maj ? new Date(first.date_maj).toISOString() : null,
    });
  }
  return sites;
}

export async function readFrRows(file: string): Promise<Row[]> {
  const rows: Row[] = [];
  let header: string[] | null = null;
  for await (const cells of csvRows(file, ',')) {
    if (!header) {
      header = cells;
      continue;
    }
    const row: Row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    rows.push(row);
  }
  return rows;
}

export const frIrve: SourceAdapter = {
  meta: {
    id: 'fr-irve',
    name: 'Base nationale des IRVE (data.gouv.fr)',
    attribution: 'Fuente: Base nationale des IRVE, data.gouv.fr (Etalab)',
    licenseName: 'Licence Ouverte 2.0',
    licenseUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
    priority: 75,
  },
  async *sites({ file, force }) {
    const path =
      file ??
      (await downloadToCache(await resolveFrCsvUrl(), 'fr-irve.csv', {
        maxAgeMinutes: 20 * 60,
        force,
      }));
    yield* groupFrRows(await readFrRows(path), this.meta.id);
  },
};
