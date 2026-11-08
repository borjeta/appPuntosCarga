import { describe, expect, it } from 'vitest';
import { powerToKw, mapAuthMethods, mapStatus } from '../datex2/mapping';
import { parseSpanishHoursLabel } from './hours';
import { prettifyOperatorName, operatorDisplayName } from './operators';
import {
  comparableName,
  looksLikeCode,
  normalizeEvseId,
  reorderInverted,
  smartTitleCase,
} from './text';

describe('texto', () => {
  it('pasa a formato título solo los textos en mayúsculas', () => {
    expect(smartTitleCase('CENTRO COMERCIAL LA VAGUADA')).toBe('Centro Comercial la Vaguada');
    expect(smartTitleCase('Centro Porsche Baleares CP2')).toBe('Centro Porsche Baleares CP2');
    expect(smartTitleCase('AVDA. DE LA ILUSTRACIÓN')).toBe('Avda. de la Ilustración');
  });

  it('reordena nombres invertidos del INE', () => {
    expect(reorderInverted('Balears, Illes')).toBe('Illes Balears');
    expect(reorderInverted('Palmas, Las')).toBe('Las Palmas');
    expect(reorderInverted('Coruña, A')).toBe('A Coruña');
    expect(reorderInverted('Madrid, Comunidad de')).toBe('Comunidad de Madrid');
    expect(reorderInverted('Málaga')).toBe('Málaga');
  });

  it('normaliza EVSE IDs', () => {
    expect(normalizeEvseId(' es*ibd*e157215 ')).toBe('ES*IBD*E157215');
    expect(normalizeEvseId('PT*SGM*E*GMR*00022*01')).toBe('PT*SGM*E*GMR*00022*01');
    expect(normalizeEvseId('COD20230000010507PR00000269')).toBeNull();
    expect(normalizeEvseId(null)).toBeNull();
  });

  it('detecta nombres que son códigos', () => {
    expect(looksLikeCode('MA-Malaga-021')).toBe(true);
    expect(looksLikeCode('GMR-00022')).toBe(true);
    expect(looksLikeCode('Centro Porsche Baleares CP2')).toBe(false);
  });

  it('compara nombres de operador ignorando formas jurídicas', () => {
    expect(comparableName('IBERDROLA CLIENTES S.A.U')).toBe('iberdrola');
    expect(comparableName('Wenea Services Spain, S.L.')).toBe('wenea');
  });
});

describe('operadores', () => {
  it('limpia la razón social', () => {
    expect(prettifyOperatorName('IBERDROLA CLIENTES S.A.U')).toBe('Iberdrola Clientes');
    expect(prettifyOperatorName('Motor Box Mallorca SL')).toBe('Motor Box Mallorca');
    expect(prettifyOperatorName('Superguimarães - Supermercados,lda')).toBe(
      'Superguimarães - Supermercados',
    );
    expect(prettifyOperatorName('IONITY GmbH Sucursal en España')).toBe('IONITY');
  });

  it('prefiere el catálogo curado', () => {
    expect(operatorDisplayName('ES*IBD', 'IBERDROLA CLIENTES S.A.U')).toBe('Iberdrola');
    expect(operatorDisplayName('ES*XXX', null)).toBe('ES*XXX');
  });
});

describe('horarios (texto del NAP español)', () => {
  it('detecta 24/7', () => {
    const label =
      'Sabado (00:00 - 23:59) Martes (00:00 - 23:59) Lunes (00:00 - 23:59) Viernes (00:00 - 23:59) Miercoles (00:00 - 23:59) Jueves (00:00 - 23:59) Domingo (00:00 - 23:59) ';
    expect(parseSpanishHoursLabel(label)).toMatchObject({
      twentyFourSeven: true,
      regularHours: [],
    });
  });

  it('ordena por día de la semana', () => {
    const h = parseSpanishHoursLabel('Miércoles (08:30 - 17:30) Lunes (9:00 - 14:00)');
    expect(h.twentyFourSeven).toBe(false);
    expect(h.regularHours).toEqual([
      { weekday: 1, periodBegin: '09:00', periodEnd: '14:00' },
      { weekday: 3, periodBegin: '08:30', periodEnd: '17:30' },
    ]);
  });

  it('conserva el texto si no se puede interpretar', () => {
    expect(parseSpanishHoursLabel('Horario del centro comercial')).toEqual({
      twentyFourSeven: false,
      regularHours: [],
      text: 'Horario del centro comercial',
    });
  });
});

describe('mapeos DATEX II', () => {
  it('convierte potencias (W → kW, tolera kW)', () => {
    expect(powerToKw(22000)).toBe(22);
    expect(powerToKw(7360)).toBe(7.4);
    expect(powerToKw(50)).toBe(50);
    expect(powerToKw(null)).toBe(0);
  });

  it('agrupa métodos de autenticación en métodos de pago', () => {
    expect(mapAuthMethods(['debitCard', 'rfid', 'creditCard', 'apps', 'nfc'])).toEqual([
      'AD_HOC_CARD',
      'OPERATOR_APP',
      'RFID',
    ]);
  });

  it('traduce estados', () => {
    expect(mapStatus('outOfOrder')).toBe('OUTOFORDER');
    expect(mapStatus('available')).toBe('AVAILABLE');
    expect(mapStatus('raro')).toBe('UNKNOWN');
  });
});
