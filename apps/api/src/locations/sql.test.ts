import { describe, expect, it } from 'vitest';
import { toMapSite, type MapSiteRow } from './mappers';
import { clusterCellDegrees, escapeLike, filterConditions } from './sql';

describe('filterConditions', () => {
  it('sin filtros solo exige estaciones activas', () => {
    const params: unknown[] = [];
    expect(filterConditions({}, params)).toEqual(['l.is_active']);
    expect(params).toEqual([]);
  });

  it('parametriza todos los filtros (sin interpolar valores del usuario)', () => {
    const params: unknown[] = ['bbox'];
    const where = filterConditions(
      {
        connectorGroups: ['CCS2'],
        minPowerKw: 50,
        operatorIds: ["ES*IBD'; DROP TABLE locations;--"],
        paymentMethods: ['AD_HOC_CARD'],
        onlyAvailable: true,
        open24h: true,
      },
      params,
    );
    expect(where).toContain('l.connector_groups && $2::text[]');
    expect(where).toContain('l.max_power_kw >= $3');
    expect(where).toContain('l.operator_id = ANY($4::text[])');
    expect(where.join(' ')).not.toContain('DROP');
    expect(where).toContain('l.is_24_7');
    // bbox + conectores + potencia + operadores + pago + caducidad del estado
    expect(params).toHaveLength(6);
  });
});

describe('utilidades', () => {
  it('reduce el tamaño de celda al acercar el zoom', () => {
    expect(clusterCellDegrees(5)).toBeGreaterThan(clusterCellDegrees(10));
    expect(clusterCellDegrees(0)).toBe(90);
  });

  it('escapa comodines de LIKE', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('no muestra disponibilidad con datos caducados', () => {
    const row: MapSiteRow = {
      id: 'x',
      lat: 0,
      lng: 0,
      name: 'n',
      operator_name: null,
      max_power_kw: 22,
      has_dc: false,
      evse_count: 2,
      available_count: 1,
      status_summary: 'AVAILABLE',
      status_updated_at: new Date('2026-01-01T10:00:00Z'),
    };
    expect(toMapSite(row, new Date('2026-01-01T10:10:00Z'))).toMatchObject({
      status: 'AVAILABLE',
      availableCount: 1,
    });
    expect(toMapSite(row, new Date('2026-01-01T12:00:00Z'))).toMatchObject({
      status: 'UNKNOWN',
      availableCount: null,
    });
  });
});
