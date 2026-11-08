import { describe, expect, it } from 'vitest';
import {
  connectorGroupOf,
  countActiveFilters,
  expandBBox,
  indexPolyline,
  locateOnPolyline,
  effectiveEvseStatus,
  filtersToQuery,
  formatDistance,
  haversineMeters,
  parseBBox,
  parseFilters,
  powerClass,
  reliabilityScore,
  summarizeSiteStatus,
} from './index';

describe('parseFilters / filtersToQuery', () => {
  it('ida y vuelta conserva los filtros', () => {
    const filters = {
      connectorGroups: ['TYPE2', 'CCS2'] as const,
      minPowerKw: 50,
      operatorIds: ['ES*IBD'],
      paymentMethods: ['AD_HOC_CARD'] as const,
      onlyAvailable: true,
      open24h: true,
    };
    const query = filtersToQuery({
      ...filters,
      connectorGroups: [...filters.connectorGroups],
      paymentMethods: [...filters.paymentMethods],
    });
    expect(query.connectors).toBe('CCS2,TYPE2');
    const parsed = parseFilters(query);
    expect(parsed.connectorGroups?.sort()).toEqual(['CCS2', 'TYPE2']);
    expect(parsed.minPowerKw).toBe(50);
    expect(parsed.operatorIds).toEqual(['ES*IBD']);
    expect(parsed.paymentMethods).toEqual(['AD_HOC_CARD']);
    expect(parsed.onlyAvailable).toBe(true);
    expect(parsed.open24h).toBe(true);
    expect(countActiveFilters(parsed)).toBe(6);
  });

  it('ignora valores desconocidos y potencias inválidas', () => {
    const parsed = parseFilters({ connectors: 'CCS2,NOPE', minPowerKw: '-3', payment: 'BITCOIN' });
    expect(parsed).toEqual({ connectorGroups: ['CCS2'] });
  });

  it('acepta arrays (query repetida)', () => {
    expect(parseFilters({ connectors: ['CCS2', 'CHADEMO'] }).connectorGroups).toEqual([
      'CCS2',
      'CHADEMO',
    ]);
  });
});

describe('estado', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('degrada a UNKNOWN un estado caducado', () => {
    expect(effectiveEvseStatus('AVAILABLE', '2026-01-01T11:00:00Z', now)).toBe('UNKNOWN');
    expect(effectiveEvseStatus('AVAILABLE', '2026-01-01T11:45:00Z', now)).toBe('AVAILABLE');
    expect(effectiveEvseStatus('CHARGING', null, now)).toBe('UNKNOWN');
  });

  it('resume el estado de la estación', () => {
    expect(summarizeSiteStatus([])).toBe('UNKNOWN');
    expect(summarizeSiteStatus(['CHARGING', 'AVAILABLE'])).toBe('AVAILABLE');
    expect(summarizeSiteStatus(['CHARGING', 'OUTOFORDER'])).toBe('OCCUPIED');
    expect(summarizeSiteStatus(['OUTOFORDER', 'INOPERATIVE'])).toBe('OUT_OF_SERVICE');
    expect(summarizeSiteStatus(['OUTOFORDER', 'UNKNOWN'])).toBe('UNKNOWN');
  });
});

describe('potencia y conectores', () => {
  it('clasifica la potencia', () => {
    expect(powerClass(22, false)).toBe('AC');
    expect(powerClass(50, true)).toBe('FAST');
    expect(powerClass(25, true)).toBe('FAST');
    expect(powerClass(350, true)).toBe('ULTRA');
  });

  it('agrupa estándares de conector', () => {
    expect(connectorGroupOf('IEC_62196_T2_COMBO')).toBe('CCS2');
    expect(connectorGroupOf('DOMESTIC_E')).toBe('SCHUKO');
    expect(connectorGroupOf('IEC_62196_T3A')).toBe('OTHER');
  });
});

describe('geo', () => {
  it('calcula distancias razonables', () => {
    // Puerta del Sol → Plaza de Cibeles ≈ 1,1 km
    const d = haversineMeters(40.4168, -3.7038, 40.4193, -3.6931);
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(1100);
  });

  it('valida bbox', () => {
    expect(parseBBox('-4,40,-3,41')).toEqual([-4, 40, -3, 41]);
    expect(parseBBox('-3,40,-4,41')).toBeNull();
    expect(parseBBox('a,b,c,d')).toBeNull();
    expect(parseBBox(undefined)).toBeNull();
  });

  it('formatea distancias', () => {
    expect(formatDistance(234)).toBe('230 m');
    expect(formatDistance(2345)).toBe('2,3 km');
  });
});

describe('fiabilidad (comunidad)', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it('sin avisos relevantes no hay puntuación', () => {
    expect(reliabilityScore([], now).reliability).toBeNull();
    expect(
      reliabilityScore([{ type: 'PRICE_DIFFERENT', createdAt: ago(1) }], now).reliability,
    ).toBeNull();
  });

  it('avisos recientes de avería bajan la puntuación', () => {
    const r = reliabilityScore(
      [
        { type: 'BROKEN', createdAt: ago(1) },
        { type: 'BROKEN', createdAt: ago(2) },
        { type: 'WORKS', createdAt: ago(60) },
      ],
      now,
    );
    expect(r.reliability).toBeLessThan(40);
    expect(r.problems30d).toBe(2);
    expect(r.works30d).toBe(0);
  });

  it('un "funciona" reciente pesa más que averías antiguas', () => {
    const r = reliabilityScore(
      [
        { type: 'WORKS', createdAt: ago(0) },
        { type: 'WORKS', createdAt: ago(3) },
        { type: 'BROKEN', createdAt: ago(80) },
      ],
      now,
    );
    expect(r.reliability).toBeGreaterThan(70);
  });

  it('tolera desfases de reloj de unos segundos', () => {
    const future = new Date(now.getTime() + 2000).toISOString();
    expect(reliabilityScore([{ type: 'WORKS', createdAt: future }], now).works30d).toBe(1);
  });

  it('ignora avisos fuera de la ventana de 90 días', () => {
    expect(reliabilityScore([{ type: 'BROKEN', createdAt: ago(120) }], now).reliability).toBeNull();
  });
});

describe('polilíneas', () => {
  // Tramo recto Madrid (Sol) → Getafe aprox., ~12 km hacia el sur
  const line = indexPolyline([
    [-3.7038, 40.4168],
    [-3.7038, 40.3],
  ]);
  it('mide la longitud total', () => {
    expect(line.totalM / 1000).toBeCloseTo(12.9, 0);
  });
  it('localiza un punto junto al trazado', () => {
    const r = locateOnPolyline(line, 40.35, -3.69); // ~1,1 km al este, a mitad
    expect(r.distanceM).toBeGreaterThan(1000);
    expect(r.distanceM).toBeLessThan(1300);
    expect(r.alongM / 1000).toBeCloseTo(7.4, 0);
  });
  it('amplía bbox en metros', () => {
    const [w, s, e, n] = expandBBox([-3.71, 40.3, -3.7, 40.42], 1000);
    expect(n - 40.42).toBeCloseTo(0.009, 3);
    expect(w).toBeLessThan(-3.71);
    expect(e).toBeGreaterThan(-3.7);
    expect(s).toBeLessThan(40.3);
  });
});
