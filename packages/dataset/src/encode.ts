import {
  CONNECTOR_GROUP_KEYS,
  connectorGroupOf,
  PAYMENT_METHODS,
  type ConnectorGroup,
  type PaymentMethod,
} from '@pc/shared';
import {
  DATASET_VERSION,
  FLAG_24H,
  tileKey,
  type CountryIndexFile,
  type IndexRow,
  type StationRecord,
  type StationsFile,
  type TileFile,
} from './format';

export function groupMask(groups: Iterable<ConnectorGroup>): number {
  let m = 0;
  for (const g of groups) m |= 1 << CONNECTOR_GROUP_KEYS.indexOf(g);
  return m;
}

export function maskGroups(mask: number): ConnectorGroup[] {
  return CONNECTOR_GROUP_KEYS.filter((_, i) => mask & (1 << i));
}

export function paymentMask(pm: Iterable<PaymentMethod>): number {
  let m = 0;
  for (const p of pm) m |= 1 << PAYMENT_METHODS.indexOf(p);
  return m;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Fila del índice a partir de la ficha completa. */
export function toIndexRow(s: StationRecord, opIndex: Map<string, number>): IndexRow {
  const connectors = s.e.flatMap((e) => e.c ?? []);
  const dc = connectors.filter((c) => c.p === 'DC').map((c) => c.w);
  const ac = connectors.filter((c) => c.p !== 'DC').map((c) => c.w);
  const keys = s.e.map((e) => e.k).filter((k): k is string => !!k);
  const tariff = s.e.flatMap((e) => e.t ?? [])[0];
  const price = (type: 'ENERGY' | 'TIME' | 'FLAT') =>
    tariff?.components.find((c) => c.type === type)?.price ?? 0;
  return [
    s.i,
    s.n,
    s.y,
    s.x,
    s.o ? (opIndex.get(s.o) ?? -1) : -1,
    round1(Math.max(0, ...connectors.map((c) => c.w))),
    round1(Math.max(0, ...dc)),
    round1(Math.max(0, ...ac)),
    s.h24 ? FLAG_24H : 0,
    groupMask(new Set(connectors.map((c) => connectorGroupOf(c.s)))),
    paymentMask(s.pm ?? []),
    s.e.length,
    s.c ?? 0,
    keys.length ? keys.join('|') : 0,
    tariff ? [price('ENERGY'), price('TIME'), price('FLAT')] : 0,
  ];
}

/** Separa el conjunto completo en índice + teselas por país. */
export function splitByCountry(
  file: StationsFile,
): Array<{ index: CountryIndexFile; tiles: TileFile[] }> {
  const byCountry = new Map<string, StationRecord[]>();
  for (const s of file.stations) {
    const list = byCountry.get(s.cc);
    if (list) list.push(s);
    else byCountry.set(s.cc, [s]);
  }
  return [...byCountry.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cc, stations]) => {
      const opIds = [...new Set(stations.map((s) => s.o).filter((o): o is string => !!o))].sort();
      const opIndex = new Map(opIds.map((id, i) => [id, i]));
      const index: CountryIndexFile = {
        version: DATASET_VERSION,
        cc,
        generatedAt: file.generatedAt,
        operators: opIds.map((id) => [id, file.operators[id]?.n ?? id]),
        rows: stations.map((s) => toIndexRow(s, opIndex)),
      };
      const byTile = new Map<string, StationRecord[]>();
      for (const s of stations) {
        const key = tileKey(s.y, s.x);
        const list = byTile.get(key);
        if (list) list.push(s);
        else byTile.set(key, [s]);
      }
      const tiles: TileFile[] = [...byTile.entries()].map(([key, list]) => ({
        version: DATASET_VERSION,
        cc,
        key,
        generatedAt: file.generatedAt,
        operators: Object.fromEntries(
          [...new Set(list.map((s) => s.o).filter((o): o is string => !!o))].map((id) => [
            id,
            file.operators[id] ?? { n: id },
          ]),
        ),
        stations: list,
      }));
      return { index, tiles };
    });
}
