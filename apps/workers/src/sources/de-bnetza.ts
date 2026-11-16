import type { ConnectorStandard, PaymentMethod, PowerType, RegularHours } from '@pc/shared';
import { downloadToCache, USER_AGENT } from '../download';
import { buildOpeningHours } from '../normalize/hours';
import { operatorDisplayName } from '../normalize/operators';
import { comparableName, normalizeEvseId, smartTitleCase, tidyStreet } from '../normalize/text';
import { partyIdFromEvseId, validCoordinates } from './common';
import { csvRows, parseDecimal } from './csv';
import type { NormalizedConnector, NormalizedEvse, NormalizedSite, SourceAdapter } from './types';

/**
 * Alemania — Ladesäulenregister de la Bundesnetzagentur (registro oficial de puntos de recarga).
 * CSV (~55 MB, separado por ";", coma decimal) con una fila por equipo de carga (hasta 6 puntos).
 * La URL cambia en cada actualización: se toma el enlace vigente de la página oficial.
 * https://www.bundesnetzagentur.de/ladeinfrastruktur
 */
export const DE_PAGE =
  'https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/start.html';

export async function resolveDeCsvUrl(): Promise<string> {
  const res = await fetch(DE_PAGE, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Bundesnetzagentur HTTP ${res.status}`);
  const html = await res.text();
  const links = [
    ...html.matchAll(
      /https:\/\/data\.bundesnetzagentur\.de\/[^"']+Ladesaeulenregister[^"']*\.csv/gi,
    ),
  ].map((m) => m[0]);
  if (!links.length)
    throw new Error('No se encontró el CSV del Ladesäulenregister en la página oficial');
  return links.sort().pop()!; // el nombre lleva la fecha (…_2026-09-01.csv): la mayor es la última
}

type Row = Record<string, string>;

export function deConnector(type: string, kw: number): NormalizedConnector | null {
  const t = type.trim();
  if (!t) return null;
  let standard: ConnectorStandard = 'OTHER';
  let powerType: PowerType = 'AC_3_PHASE';
  if (/combo|ccs/i.test(t)) {
    standard = 'IEC_62196_T2_COMBO';
    powerType = 'DC';
  } else if (/chademo/i.test(t)) {
    standard = 'CHADEMO';
    powerType = 'DC';
  } else if (/typ\s*2|type\s*2/i.test(t)) standard = 'IEC_62196_T2';
  else if (/typ\s*1/i.test(t)) standard = 'IEC_62196_T1';
  else if (/schuko/i.test(t)) {
    standard = 'DOMESTIC_F';
    powerType = 'AC_1_PHASE';
  } else if (/cee/i.test(t)) standard = 'IEC_60309_2_three_32';
  else if (/^DC/i.test(t)) powerType = 'DC';
  const format = /kupplung/i.test(t) ? 'CABLE' : 'SOCKET';
  return {
    standard,
    format,
    powerType,
    maxPowerKw: Math.round(kw * 10) / 10,
    maxVoltage: null,
    maxAmperage: null,
  };
}

const PAYMENT: Array<[RegExp, PaymentMethod]> = [
  [/kredit|debit|girocard|ec-karte/i, 'AD_HOC_CARD'],
  [/rfid/i, 'RFID'],
  [/online|app|qr/i, 'QR'],
  [/plug\s*&\s*charge/i, 'PLUG_AND_CHARGE'],
];

function dePayments(raw: string): PaymentMethod[] {
  const out = new Set<PaymentMethod>();
  for (const part of raw.split(';')) for (const [re, pm] of PAYMENT) if (re.test(part)) out.add(pm);
  return [...out].sort();
}

const DAYS: Record<string, number> = {
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  sonntag: 7,
};

/** "247" → 24 h; si no, días ("Montag; Dienstag…") y franjas ("08:00-18:00; …") alineados. */
export function deHours(row: Row) {
  if ((row['Öffnungszeiten'] ?? '').trim() === '247') {
    return { twentyFourSeven: true, regularHours: [], text: null };
  }
  const days = (row['Öffnungszeiten: Wochentage'] ?? '')
    .split(';')
    .map((d) => DAYS[d.trim().toLowerCase()]);
  const times = (row['Öffnungszeiten: Tageszeiten'] ?? '').split(';').map((t) => t.trim());
  const regular: RegularHours[] = [];
  days.forEach((weekday, i) => {
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(times[i] ?? '');
    if (weekday && m)
      regular.push({
        weekday,
        periodBegin: m[1]!.padStart(5, '0'),
        periodEnd: m[2]!.padStart(5, '0'),
      });
  });
  return buildOpeningHours(regular, null);
}

/** Agrupa equipos del mismo operador en el mismo sitio (≈10 m) en una estación. */
export function groupDeRows(rows: Row[], sourceId: string): NormalizedSite[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if ((row.Status ?? '').trim() !== 'In Betrieb') continue;
    const lat = parseDecimal(row.Breitengrad);
    const lng = parseDecimal(row['Längengrad']);
    if (!validCoordinates(lat, lng)) continue;
    const key = `${lat.toFixed(4)},${lng!.toFixed(4)}|${comparableName(row.Betreiber)}`;
    const g = groups.get(key);
    if (g) g.push(row);
    else groups.set(key, [row]);
  }

  const sites: NormalizedSite[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => Number(a['Ladeeinrichtungs-ID']) - Number(b['Ladeeinrichtungs-ID']));
    const first = list[0]!;
    const evses: NormalizedEvse[] = [];
    for (const row of list) {
      for (let i = 1; i <= 6; i++) {
        const types = (row[`Steckertypen${i}`] ?? '').split(';').filter((t) => t.trim());
        if (!types.length) continue;
        const kw =
          parseDecimal(row[`Nennleistung Stecker${i}`]) ??
          parseDecimal(row['Nennleistung Ladeeinrichtung [kW]']) ??
          0;
        const connectors = types
          .map((t) => deConnector(t, kw))
          .filter((c): c is NormalizedConnector => !!c && c.maxPowerKw > 0);
        if (!connectors.length) continue;
        const rawEvse = row[`EVSE-ID${i}`]?.trim() || null;
        evses.push({
          externalId: `${row['Ladeeinrichtungs-ID']}-${i}`,
          evseId: normalizeEvseId(rawEvse),
          connectors,
          tariffs: [],
        });
      }
    }
    if (!evses.length) continue;
    const party = evses.map((e) => partyIdFromEvseId(e.evseId)).find(Boolean);
    const legal = first.Betreiber || null;
    const operatorId =
      party ?? (legal ? `DE:${comparableName(legal).replace(/\s+/g, '-').slice(0, 40)}` : null);
    const street = [first['Straße'], first.Hausnummer].filter((x) => x?.trim()).join(' ') || null;
    const display = first['Anzeigename (Karte)']?.trim();
    const name =
      first.Standortbezeichnung?.trim() ||
      (display && display !== legal ? display : null) ||
      [legal && operatorDisplayName(operatorId ?? '', legal), street].filter(Boolean).join(' · ') ||
      'Ladestation';
    sites.push({
      sourceId,
      externalId: first['Ladeeinrichtungs-ID']!,
      name: smartTitleCase(name),
      operator: operatorId
        ? {
            id: operatorId,
            legalName: legal,
            displayName: operatorDisplayName(operatorId, legal),
            countryCode: 'DE',
            website: null,
            phone: null,
          }
        : null,
      street: tidyStreet(street),
      city: first.Ort || null,
      postalCode: first.Postleitzahl || null,
      province: first['Kreis/kreisfreie Stadt'] || null,
      region: first.Bundesland || null,
      countryCode: 'DE',
      lat: parseDecimal(first.Breitengrad)!,
      lng: parseDecimal(first['Längengrad'])!,
      openingHours: deHours(first),
      siteType: null,
      paymentMethods: [...new Set(list.flatMap((r) => dePayments(r.Bezahlsysteme ?? '')))].sort(),
      acceptedProviders: [],
      facilities: [],
      evses,
      sourceUpdatedAt: null,
    });
  }
  return sites;
}

export async function readDeRows(file: string): Promise<Row[]> {
  const rows: Row[] = [];
  let header: string[] | null = null;
  for await (const cells of csvRows(file, ';')) {
    if (!header) {
      // Las primeras líneas son avisos y una fila de grupos: la cabecera empieza por el id.
      if (cells[0]?.trim() === 'Ladeeinrichtungs-ID') header = cells.map((c) => c.trim());
      continue;
    }
    const row: Row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    rows.push(row);
  }
  return rows;
}

export const deBnetza: SourceAdapter = {
  meta: {
    id: 'de-bnetza',
    name: 'Ladesäulenregister (Bundesnetzagentur)',
    attribution: 'Fuente: Bundesnetzagentur.de (Ladesäulenregister)',
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    priority: 75,
  },
  async *sites({ file, force }) {
    const path =
      file ??
      (await downloadToCache(await resolveDeCsvUrl(), 'de-bnetza.csv', {
        maxAgeMinutes: 20 * 60,
        force,
      }));
    yield* groupDeRows(await readDeRows(path), this.meta.id);
  },
};
