import {
  CONNECTOR_GROUP_KEYS,
  effectiveEvseStatus,
  expandBBox,
  haversineMeters,
  indexPolyline,
  locateOnPolyline,
  PAYMENT_METHODS,
  STATUS_MAX_AGE_MS,
  summarizeSiteStatus,
  type BBox,
  type ConnectorStandard,
  type EvseStatus,
  type LocationDetail,
  type MapCluster,
  type MapResponse,
  type MapSite,
  type NearbyResponse,
  type NearbySite,
  type OperatorListItem,
  type OperatorSummary,
  type PowerType,
  type SearchResponse,
  type SiteFilters,
  type SourceAttribution,
  type Tariff,
} from '@pc/shared';
import {
  FLAG_24H,
  tileKey,
  type CountryIndexFile,
  type OperatorRecord,
  type StationRecord,
  type StatusFile,
} from './format';

/**
 * Motor de consultas en el dispositivo sobre los índices compactos de los países descargados.
 * Mismos contratos que la API (mapa, cercanía, búsqueda, operadores, corredor de rutas). La ficha
 * completa se construye a partir de la tesela de la estación (`detail`).
 */

export const SITES_MIN_ZOOM = 13;
export const MAX_SITES = 1500;
const GRID_DEG = 0.25;

/** Estación resumida (una fila del índice ya interpretada). */
export interface StationSummary {
  id: string;
  name: string;
  lat: number;
  lng: number;
  cc: string;
  operatorId: string | null;
  operatorName: string | null;
  maxPowerKw: number;
  dcKw: number;
  acKw: number;
  h24: boolean;
  groups: number;
  payments: number;
  evseCount: number;
  city: string | null;
  keys: string[];
  tariff: [number, number, number] | null;
  search: string;
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export interface SourceInfo {
  id: string;
  name: string;
  attribution: string;
  licenseName: string | null;
  licenseUrl: string | null;
  lastSyncAt: string | null;
}

const GROUP_BIT = new Map(CONNECTOR_GROUP_KEYS.map((g, i) => [g, 1 << i]));
const PAYMENT_BIT = new Map(PAYMENT_METHODS.map((p, i) => [p, 1 << i]));

/** Conector representativo de cada grupo para el planificador (a partir del índice). */
const GROUP_CONNECTOR: Record<
  string,
  { standard: ConnectorStandard; powerType: PowerType; dc: boolean }
> = {
  CCS2: { standard: 'IEC_62196_T2_COMBO', powerType: 'DC', dc: true },
  CCS1: { standard: 'IEC_62196_T1_COMBO', powerType: 'DC', dc: true },
  CHADEMO: { standard: 'CHADEMO', powerType: 'DC', dc: true },
  TYPE2: { standard: 'IEC_62196_T2', powerType: 'AC_3_PHASE', dc: false },
  TYPE1: { standard: 'IEC_62196_T1', powerType: 'AC_1_PHASE', dc: false },
  SCHUKO: { standard: 'DOMESTIC_F', powerType: 'AC_1_PHASE', dc: false },
  OTHER: { standard: 'OTHER', powerType: 'AC_3_PHASE', dc: false },
};

/** Conectores y tarifa aproximados de una estación, suficientes para planificar paradas. */
export function summaryConnectors(s: StationSummary): Array<{
  standard: ConnectorStandard;
  powerType: PowerType;
  maxPowerKw: number;
  tariffs: Tariff[];
}> {
  const tariffs: Tariff[] = s.tariff
    ? [
        {
          currency: 'EUR',
          components: [
            ...(s.tariff[0] ? [{ type: 'ENERGY' as const, price: s.tariff[0] }] : []),
            ...(s.tariff[1] ? [{ type: 'TIME' as const, price: s.tariff[1] }] : []),
            ...(s.tariff[2] ? [{ type: 'FLAT' as const, price: s.tariff[2] }] : []),
          ],
          scope: 'CPO_BASE',
          vatIncluded: null,
          validFrom: null,
          validTo: null,
          sourceId: 'index',
        },
      ]
    : [];
  return CONNECTOR_GROUP_KEYS.filter((g) => s.groups & GROUP_BIT.get(g)!).map((g) => {
    const rep = GROUP_CONNECTOR[g]!;
    const kw = rep.dc ? s.dcKw : g === 'SCHUKO' ? Math.min(s.acKw, 3.7) : s.acKw;
    return {
      standard: rep.standard,
      powerType: rep.powerType,
      maxPowerKw: kw || s.maxPowerKw,
      tariffs,
    };
  });
}

export class StationIndex {
  private readonly stations: StationSummary[] = [];
  private readonly byId = new Map<string, StationSummary>();
  private readonly grid = new Map<string, StationSummary[]>();
  private readonly operatorCounts = new Map<
    string,
    { name: string; count: number; cc: Set<string> }
  >();
  private status = new Map<string, { status: EvseStatus; at: string }>();

  constructor(
    indexes: CountryIndexFile[],
    private readonly sources: SourceInfo[] = [],
  ) {
    for (const idx of indexes) {
      for (const row of idx.rows) {
        const [
          id,
          name,
          lat,
          lng,
          op,
          maxKw,
          dcKw,
          acKw,
          flags,
          groups,
          payments,
          evses,
          city,
          keys,
          tariff,
        ] = row;
        const opEntry = op >= 0 ? idx.operators[op] : undefined;
        const s: StationSummary = {
          id,
          name,
          lat,
          lng,
          cc: idx.cc,
          operatorId: opEntry?.[0] ?? null,
          operatorName: opEntry?.[1] ?? null,
          maxPowerKw: maxKw,
          dcKw,
          acKw,
          h24: (flags & FLAG_24H) !== 0,
          groups,
          payments,
          evseCount: evses,
          city: city || null,
          keys: keys ? keys.split('|') : [],
          tariff: tariff || null,
          search: normalizeText([name, city || '', opEntry?.[1] ?? ''].join(' ')),
        };
        this.stations.push(s);
        this.byId.set(id, s);
        const key = this.cellKey(lat, lng);
        const bucket = this.grid.get(key);
        if (bucket) bucket.push(s);
        else this.grid.set(key, [s]);
        if (s.operatorId) {
          const c = this.operatorCounts.get(s.operatorId);
          if (c) {
            c.count++;
            c.cc.add(s.cc);
          } else
            this.operatorCounts.set(s.operatorId, {
              name: s.operatorName ?? s.operatorId,
              count: 1,
              cc: new Set([s.cc]),
            });
        }
      }
    }
  }

  get size(): number {
    return this.stations.length;
  }

  summary(id: string): StationSummary | null {
    return this.byId.get(id) ?? null;
  }

  /** País y tesela donde está la ficha completa de una estación. */
  tileOf(id: string): { cc: string; key: string } | null {
    const s = this.byId.get(id);
    return s ? { cc: s.cc, key: tileKey(s.lat, s.lng) } : null;
  }

  /** Sustituye el estado en tiempo real (fichero status.json). */
  applyStatus(file: StatusFile): void {
    const next = new Map<string, { status: EvseStatus; at: string }>();
    for (const [sourceId, src] of Object.entries(file.sources)) {
      for (const [ext, status] of Object.entries(src.evses)) {
        next.set(`${sourceId}:${ext}`, { status, at: src.observedAt });
      }
    }
    this.status = next;
  }

  /* ---------- Consultas (mismos contratos que la API v1) ---------- */

  map(bbox: BBox, zoom: number, filters: SiteFilters, now = new Date()): MapResponse {
    const inBox = this.query(bbox, filters, now);
    if (zoom >= SITES_MIN_ZOOM) {
      const sorted = inBox.sort((a, b) => b.maxPowerKw - a.maxPowerKw);
      return {
        items: sorted.slice(0, MAX_SITES).map((s) => this.toMapSite(s, now)),
        truncated: sorted.length > MAX_SITES,
      };
    }
    const cell = (360 / 2 ** zoom) * (64 / 256);
    const cells = new Map<string, { gx: number; gy: number; list: StationSummary[] }>();
    for (const s of inBox) {
      const gx = Math.floor(s.lng / cell);
      const gy = Math.floor(s.lat / cell);
      const key = `${gx}:${gy}`;
      const c = cells.get(key);
      if (c) c.list.push(s);
      else cells.set(key, { gx, gy, list: [s] });
    }
    const items: Array<MapCluster | MapSite> = [];
    for (const { gx, gy, list } of cells.values()) {
      if (list.length === 1) {
        items.push(this.toMapSite(list[0]!, now));
        continue;
      }
      let lat = 0;
      let lng = 0;
      let maxKw = 0;
      for (const s of list) {
        lat += s.lat;
        lng += s.lng;
        maxKw = Math.max(maxKw, s.maxPowerKw);
      }
      items.push({
        kind: 'cluster',
        id: `${zoom}:${gx}:${gy}`,
        lat: lat / list.length,
        lng: lng / list.length,
        count: list.length,
        maxPowerKw: maxKw,
      });
    }
    return { items, truncated: false };
  }

  nearby(
    lat: number,
    lng: number,
    radiusM: number,
    limit: number,
    filters: SiteFilters,
    now = new Date(),
  ): NearbyResponse {
    const box = expandBBox([lng, lat, lng, lat], radiusM);
    const items = this.query(box, filters, now)
      .map((s) => ({ s, d: haversineMeters(lat, lng, s.lat, s.lng) }))
      .filter((x) => x.d <= radiusM)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map(({ s, d }) => this.toNearby(s, d, now));
    return { items };
  }

  search(q: string, lat: number | null, lng: number | null, now = new Date()): SearchResponse {
    const words = normalizeText(q).split(/\s+/).filter(Boolean).slice(0, 6);
    if (!words.length || words.join('').length < 2) return { locations: [], operators: [] };
    const res = words.map((w) => new RegExp(`(^|\\s)${escapeRegExp(w)}`));
    const scored: Array<{ s: StationSummary; score: number; d: number }> = [];
    for (const s of this.stations) {
      if (!words.every((w) => s.search.includes(w))) continue;
      const score = res.reduce((acc, re) => acc + (re.test(s.search) ? 2 : 1), 0);
      const d = lat !== null && lng !== null ? haversineMeters(lat, lng, s.lat, s.lng) : 0;
      scored.push({ s, score, d });
    }
    scored.sort((a, b) => b.score - a.score || a.d - b.d);
    const operators = [...this.operatorCounts.entries()]
      .filter(([, o]) => {
        const name = normalizeText(o.name);
        return words.every((w) => name.includes(w));
      })
      .map(([id, o]) => ({ id, name: o.name, siteCount: o.count }))
      .sort((a, b) => b.siteCount - a.siteCount)
      .slice(0, 8);
    return {
      locations: scored.slice(0, 25).map(({ s, d }) => this.toNearby(s, d, now)),
      operators,
    };
  }

  operators(countryCode: string | null): OperatorListItem[] {
    if (!countryCode) {
      return [...this.operatorCounts.entries()]
        .map(([id, o]) => ({ id, name: o.name, siteCount: o.count }))
        .sort((a, b) => b.siteCount - a.siteCount || a.name.localeCompare(b.name));
    }
    const counts = new Map<string, number>();
    for (const s of this.stations) {
      if (s.operatorId && s.cc === countryCode)
        counts.set(s.operatorId, (counts.get(s.operatorId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, siteCount]) => ({ id, name: this.operatorCounts.get(id)?.name ?? id, siteCount }))
      .sort((a, b) => b.siteCount - a.siteCount || a.name.localeCompare(b.name));
  }

  /** Ficha completa a partir del registro de su tesela. */
  detail(
    record: StationRecord,
    operators: Record<string, OperatorRecord>,
    now = new Date(),
  ): Omit<LocationDetail, 'community'> {
    const r = record;
    const op = r.o ? operators[r.o] : undefined;
    const operator: OperatorSummary | null = r.o
      ? {
          id: r.o,
          name: op?.n ?? r.o,
          legalName: op?.ln ?? null,
          website: op?.w ?? null,
          phone: op?.p ?? null,
          appIosUrl: op?.ios ?? null,
          appAndroidPackage: op?.and ?? null,
          deeplinkTemplate: op?.dl ?? null,
        }
      : null;
    const evses = r.e
      .map((e, idx) => {
        const st = e.k ? this.status.get(e.k) : undefined;
        return {
          id: `${r.i}#${idx}`,
          evseId: e.id ?? null,
          status: st ? effectiveEvseStatus(st.status, st.at, now) : ('UNKNOWN' as EvseStatus),
          statusUpdatedAt: st?.at ?? null,
          connectors: (e.c ?? []).map((c) => ({
            standard: c.s,
            format: c.f ?? null,
            powerType: c.p ?? null,
            maxPowerKw: c.w,
            maxVoltage: c.v ?? null,
            maxAmperage: c.a ?? null,
          })),
          tariffs: e.t ?? [],
        };
      })
      .sort((a, b) => maxKw(b.connectors) - maxKw(a.connectors));
    const sources: SourceAttribution[] = r.src.map((sid) => {
      const info = this.sources.find((x) => x.id === sid);
      return {
        sourceId: sid,
        name: info?.name ?? sid,
        attribution: info?.attribution ?? sid,
        licenseName: info?.licenseName ?? null,
        licenseUrl: info?.licenseUrl ?? null,
        lastSeenAt: info?.lastSyncAt ?? now.toISOString(),
      };
    });
    return {
      id: r.i,
      name: r.n,
      operator,
      address: {
        street: r.a ?? null,
        city: r.c ?? null,
        postalCode: r.z ?? null,
        province: r.pr ?? null,
        region: r.r ?? null,
        countryCode: r.cc,
      },
      lat: r.y,
      lng: r.x,
      openingHours: r.h24
        ? { twentyFourSeven: true, regularHours: [], text: null }
        : (r.h ?? { twentyFourSeven: false, regularHours: [], text: null }),
      siteType: r.st ?? null,
      paymentMethods: r.pm ?? [],
      acceptedProviders: r.ap ?? [],
      facilities: r.f ?? [],
      maxPowerKw: maxKw(evses.flatMap((e) => e.connectors)),
      status: summarizeSiteStatus(evses.map((e) => e.status)),
      evses,
      sources,
      lastUpdated: r.u ?? null,
    };
  }

  /** Estaciones a menos de `maxDistanceM` de una ruta, con su posición a lo largo de ella. */
  corridor(
    coordinates: Array<[number, number]>,
    maxDistanceM: number,
    minPowerKw: number,
    now = new Date(),
  ): Array<{ site: NearbySite; alongM: number; distanceM: number; summary: StationSummary }> {
    const line = indexPolyline(coordinates);
    const box = expandBBox(line.bbox, maxDistanceM);
    const out: Array<{
      site: NearbySite;
      alongM: number;
      distanceM: number;
      summary: StationSummary;
    }> = [];
    for (const s of this.inBBox(box)) {
      if (s.maxPowerKw < minPowerKw) continue;
      const { distanceM, alongM } = locateOnPolyline(line, s.lat, s.lng);
      if (distanceM > maxDistanceM) continue;
      out.push({ site: this.toNearby(s, distanceM, now), alongM, distanceM, summary: s });
    }
    return out;
  }

  /* ---------- Internos ---------- */

  private cellKey(lat: number, lng: number): string {
    return `${Math.floor(lng / GRID_DEG)}:${Math.floor(lat / GRID_DEG)}`;
  }

  private inBBox([w, s, e, n]: BBox): StationSummary[] {
    const x0 = Math.floor(w / GRID_DEG);
    const x1 = Math.floor(e / GRID_DEG);
    const y0 = Math.floor(s / GRID_DEG);
    const y1 = Math.floor(n / GRID_DEG);
    const out: StationSummary[] = [];
    const inside = (st: StationSummary) => st.lng >= w && st.lng <= e && st.lat >= s && st.lat <= n;
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.grid.size) {
      for (const st of this.stations) if (inside(st)) out.push(st);
      return out;
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (const st of this.grid.get(`${x}:${y}`) ?? []) if (inside(st)) out.push(st);
      }
    }
    return out;
  }

  private query(bbox: BBox, f: SiteFilters, now: Date): StationSummary[] {
    const groupBits = (f.connectorGroups ?? []).reduce((m, g) => m | (GROUP_BIT.get(g) ?? 0), 0);
    const payBits = (f.paymentMethods ?? []).reduce((m, p) => m | (PAYMENT_BIT.get(p) ?? 0), 0);
    return this.inBBox(bbox).filter((s) => {
      if (groupBits && !(s.groups & groupBits)) return false;
      if (f.minPowerKw && s.maxPowerKw < f.minPowerKw) return false;
      if (f.operatorIds?.length && !(s.operatorId && f.operatorIds.includes(s.operatorId)))
        return false;
      if (payBits && !(s.payments & payBits)) return false;
      if (f.open24h && !s.h24) return false;
      if (f.onlyAvailable && this.siteStatus(s, now).status !== 'AVAILABLE') return false;
      return true;
    });
  }

  private siteStatus(
    s: StationSummary,
    now: Date,
  ): { status: MapSite['status']; available: number | null } {
    if (!s.keys.length) return { status: 'UNKNOWN', available: null };
    let anyKnown = false;
    let available = 0;
    const statuses: EvseStatus[] = s.keys.map((k) => {
      const st = this.status.get(k);
      if (!st) return 'UNKNOWN';
      const eff = effectiveEvseStatus(st.status, st.at, now);
      if (eff !== 'UNKNOWN') anyKnown = true;
      if (eff === 'AVAILABLE') available++;
      return eff;
    });
    if (!anyKnown) return { status: 'UNKNOWN', available: null };
    return { status: summarizeSiteStatus(statuses), available };
  }

  private toMapSite(s: StationSummary, now: Date): MapSite {
    const st = this.siteStatus(s, now);
    return {
      kind: 'site',
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      name: s.name,
      operatorName: s.operatorName,
      maxPowerKw: s.maxPowerKw,
      hasDc: s.dcKw > 0,
      evseCount: s.evseCount,
      availableCount: st.available,
      status: st.status,
    };
  }

  private toNearby(s: StationSummary, distanceM: number, now: Date): NearbySite {
    return {
      ...this.toMapSite(s, now),
      distanceM: Math.round(distanceM),
      address: null,
      city: s.city,
    };
  }
}

const maxKw = (cs: Array<{ maxPowerKw: number }>) => Math.max(0, ...cs.map((c) => c.maxPowerKw));
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export { STATUS_MAX_AGE_MS };
