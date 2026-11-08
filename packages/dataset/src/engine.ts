import {
  connectorGroupOf,
  effectiveEvseStatus,
  expandBBox,
  haversineMeters,
  indexPolyline,
  locateOnPolyline,
  STATUS_MAX_AGE_MS,
  summarizeSiteStatus,
  type BBox,
  type ConnectorGroup,
  type EvseStatus,
  type LocationDetail,
  type MapCluster,
  type MapResponse,
  type MapSite,
  type NearbyResponse,
  type NearbySite,
  type OperatorListItem,
  type OperatorSummary,
  type SearchResponse,
  type SiteFilters,
  type SourceAttribution,
} from '@pc/shared';
import type { StationRecord, StationsFile, StatusFile } from './format';

/**
 * Motor de consultas en memoria sobre el fichero de estaciones. Replica en el dispositivo lo que
 * hace la API con PostGIS (mismos tipos de respuesta), para que la app funcione sin servidor y sin
 * conexión. ~20.000 estaciones caben de sobra en memoria.
 */

export const SITES_MIN_ZOOM = 13;
export const MAX_SITES = 1500;
const GRID_DEG = 0.25;

interface Station {
  rec: StationRecord;
  maxPowerKw: number;
  hasDc: boolean;
  groups: Set<ConnectorGroup>;
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

export class StationIndex {
  private readonly stations: Station[];
  private readonly byId = new Map<string, Station>();
  private readonly grid = new Map<string, Station[]>();
  private status = new Map<string, { status: EvseStatus; at: string }>();

  constructor(
    private readonly file: StationsFile,
    private readonly sources: SourceInfo[] = [],
  ) {
    this.stations = file.stations.map((rec) => {
      const connectors = rec.e.flatMap((e) => e.c ?? []);
      const op = rec.o ? file.operators[rec.o] : undefined;
      const st: Station = {
        rec,
        maxPowerKw: Math.max(0, ...connectors.map((c) => c.w)),
        hasDc: connectors.some((c) => c.p === 'DC'),
        groups: new Set(connectors.map((c) => connectorGroupOf(c.s))),
        search: normalizeText([rec.n, rec.c, rec.a, op?.n].filter(Boolean).join(' ')),
      };
      this.byId.set(rec.i, st);
      const key = this.cellKey(rec.y, rec.x);
      const bucket = this.grid.get(key);
      if (bucket) bucket.push(st);
      else this.grid.set(key, [st]);
      return st;
    });
  }

  get size(): number {
    return this.stations.length;
  }

  get generatedAt(): string {
    return this.file.generatedAt;
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
    const cells = new Map<string, { gx: number; gy: number; list: Station[] }>();
    for (const s of inBox) {
      const gx = Math.floor(s.rec.x / cell);
      const gy = Math.floor(s.rec.y / cell);
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
        lat += s.rec.y;
        lng += s.rec.x;
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
      .map((s) => ({ s, d: haversineMeters(lat, lng, s.rec.y, s.rec.x) }))
      .filter((x) => x.d <= radiusM)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map(({ s, d }) => this.toNearby(s, d, now));
    return { items };
  }

  search(q: string, lat: number | null, lng: number | null, now = new Date()): SearchResponse {
    const words = normalizeText(q).split(/\s+/).filter(Boolean).slice(0, 6);
    if (!words.length || words.join('').length < 2) return { locations: [], operators: [] };
    const scored: Array<{ s: Station; score: number; d: number }> = [];
    for (const s of this.stations) {
      if (!words.every((w) => s.search.includes(w))) continue;
      // Prioriza coincidencias al inicio de palabra.
      const score = words.reduce(
        (acc, w) => acc + (new RegExp(`(^|\\s)${escapeRegExp(w)}`).test(s.search) ? 2 : 1),
        0,
      );
      const d = lat !== null && lng !== null ? haversineMeters(lat, lng, s.rec.y, s.rec.x) : 0;
      scored.push({ s, score, d });
    }
    scored.sort((a, b) => b.score - a.score || a.d - b.d);

    const opCounts = new Map<string, number>();
    for (const s of this.stations)
      if (s.rec.o) opCounts.set(s.rec.o, (opCounts.get(s.rec.o) ?? 0) + 1);
    const operators = Object.entries(this.file.operators)
      .filter(([, op]) => {
        const name = normalizeText(`${op.n} ${op.ln ?? ''}`);
        return words.every((w) => name.includes(w));
      })
      .map(([id, op]) => ({ id, name: op.n, siteCount: opCounts.get(id) ?? 0 }))
      .filter((o) => o.siteCount > 0)
      .sort((a, b) => b.siteCount - a.siteCount)
      .slice(0, 8);

    return {
      locations: scored.slice(0, 25).map(({ s, d }) => this.toNearby(s, d, now)),
      operators,
    };
  }

  operators(countryCode: string | null): OperatorListItem[] {
    const counts = new Map<string, number>();
    for (const s of this.stations) {
      if (!s.rec.o || (countryCode && s.rec.cc !== countryCode)) continue;
      counts.set(s.rec.o, (counts.get(s.rec.o) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, siteCount]) => ({ id, name: this.file.operators[id]?.n ?? id, siteCount }))
      .sort((a, b) => b.siteCount - a.siteCount || a.name.localeCompare(b.name));
  }

  detail(id: string, now = new Date()): Omit<LocationDetail, 'community'> | null {
    const s = this.byId.get(id);
    if (!s) return null;
    const r = s.rec;
    const op = r.o ? this.file.operators[r.o] : undefined;
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
        lastSeenAt: info?.lastSyncAt ?? this.file.generatedAt,
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
      maxPowerKw: s.maxPowerKw,
      status: summarizeSiteStatus(evses.map((e) => e.status)),
      evses,
      sources,
      lastUpdated: r.u ?? null,
    };
  }

  /**
   * Estaciones a menos de `maxDistanceM` de una ruta, con su posición a lo largo de ella.
   * Base del planificador en el dispositivo.
   */
  corridor(
    coordinates: Array<[number, number]>,
    maxDistanceM: number,
    minPowerKw: number,
    now = new Date(),
  ): Array<{ site: NearbySite; alongM: number; distanceM: number; record: StationRecord }> {
    const line = indexPolyline(coordinates);
    const box = expandBBox(line.bbox, maxDistanceM);
    const out: Array<{
      site: NearbySite;
      alongM: number;
      distanceM: number;
      record: StationRecord;
    }> = [];
    for (const s of this.inBBox(box)) {
      if (s.maxPowerKw < minPowerKw) continue;
      const { distanceM, alongM } = locateOnPolyline(line, s.rec.y, s.rec.x);
      if (distanceM > maxDistanceM) continue;
      out.push({ site: this.toNearby(s, distanceM, now), alongM, distanceM, record: s.rec });
    }
    return out;
  }

  /* ---------- Internos ---------- */

  private cellKey(lat: number, lng: number): string {
    return `${Math.floor(lng / GRID_DEG)}:${Math.floor(lat / GRID_DEG)}`;
  }

  private inBBox([w, s, e, n]: BBox): Station[] {
    const x0 = Math.floor(w / GRID_DEG);
    const x1 = Math.floor(e / GRID_DEG);
    const y0 = Math.floor(s / GRID_DEG);
    const y1 = Math.floor(n / GRID_DEG);
    const out: Station[] = [];
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.grid.size) {
      for (const st of this.stations)
        if (st.rec.x >= w && st.rec.x <= e && st.rec.y >= s && st.rec.y <= n) out.push(st);
      return out;
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (const st of this.grid.get(`${x}:${y}`) ?? []) {
          if (st.rec.x >= w && st.rec.x <= e && st.rec.y >= s && st.rec.y <= n) out.push(st);
        }
      }
    }
    return out;
  }

  private query(bbox: BBox, f: SiteFilters, now: Date): Station[] {
    return this.inBBox(bbox).filter((s) => {
      if (f.connectorGroups?.length && !f.connectorGroups.some((g) => s.groups.has(g)))
        return false;
      if (f.minPowerKw && s.maxPowerKw < f.minPowerKw) return false;
      if (f.operatorIds?.length && !(s.rec.o && f.operatorIds.includes(s.rec.o))) return false;
      if (f.paymentMethods?.length && !f.paymentMethods.some((p) => s.rec.pm?.includes(p)))
        return false;
      if (f.open24h && !s.rec.h24) return false;
      if (f.onlyAvailable && this.siteStatus(s, now).status !== 'AVAILABLE') return false;
      return true;
    });
  }

  private siteStatus(
    s: Station,
    now: Date,
  ): { status: MapSite['status']; available: number | null } {
    let anyKnown = false;
    let available = 0;
    const statuses: EvseStatus[] = s.rec.e.map((e) => {
      const st = e.k ? this.status.get(e.k) : undefined;
      if (!st) return 'UNKNOWN';
      const eff = effectiveEvseStatus(st.status, st.at, now);
      if (eff !== 'UNKNOWN') anyKnown = true;
      if (eff === 'AVAILABLE') available++;
      return eff;
    });
    if (!anyKnown) return { status: 'UNKNOWN', available: null };
    return { status: summarizeSiteStatus(statuses), available };
  }

  private toMapSite(s: Station, now: Date): MapSite {
    const st = this.siteStatus(s, now);
    return {
      kind: 'site',
      id: s.rec.i,
      lat: s.rec.y,
      lng: s.rec.x,
      name: s.rec.n,
      operatorName: s.rec.o ? (this.file.operators[s.rec.o]?.n ?? null) : null,
      maxPowerKw: s.maxPowerKw,
      hasDc: s.hasDc,
      evseCount: s.rec.e.length,
      availableCount: st.available,
      status: st.status,
    };
  }

  private toNearby(s: Station, distanceM: number, now: Date): NearbySite {
    return {
      ...this.toMapSite(s, now),
      distanceM: Math.round(distanceM),
      address: s.rec.a ?? null,
      city: s.rec.c ?? null,
    };
  }
}

const maxKw = (cs: Array<{ maxPowerKw: number }>) => Math.max(0, ...cs.map((c) => c.maxPowerKw));
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Edad máxima del estado, reexportada para la app. */
export { STATUS_MAX_AGE_MS };
