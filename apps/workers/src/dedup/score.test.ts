import { describe, expect, it } from 'vitest';
import { decide, scoreCandidate, type DedupCandidate, type DedupSubject } from './score';

const base: DedupSubject = {
  lat: 40.4168,
  lng: -3.7038,
  operatorId: 'ES*IBD',
  operatorName: 'IBERDROLA CLIENTES S.A.U',
  evseIds: [],
  connectorGroups: ['TYPE2', 'CCS2'],
  maxPowerKw: 50,
};

const candidate = (over: Partial<DedupCandidate>): DedupCandidate => ({
  ...base,
  locationId: 'loc-1',
  ...over,
});

describe('deduplicación', () => {
  it('un EVSE ID compartido es coincidencia segura aunque esté lejos', () => {
    const r = scoreCandidate(
      { ...base, evseIds: ['ES*IBD*E1'] },
      candidate({ lat: 41, lng: -3, evseIds: ['ES*IBD*E1'] }),
    );
    expect(r.score).toBe(1);
  });

  it('fusiona misma estación descrita por dos fuentes con nombres distintos', () => {
    const d = decide(base, [
      candidate({ lat: 40.41685, operatorId: null, operatorName: 'Iberdrola' }),
    ]);
    expect(d.action).toBe('merge');
  });

  it('no fusiona operadores distintos en la misma gasolinera', () => {
    const d = decide(base, [
      candidate({
        operatorId: 'ES*TSL',
        operatorName: 'Tesla Spain SLU',
        connectorGroups: ['CCS2'],
        maxPowerKw: 250,
      }),
    ]);
    expect(d.action).not.toBe('merge');
  });

  it('a más de 75 m con otro operador es una estación nueva', () => {
    const d = decide(base, [
      candidate({
        lat: 40.4176,
        operatorId: 'ES*REP',
        operatorName: 'Repsol',
        connectorGroups: ['TYPE2'],
      }),
    ]);
    expect(d.action).toBe('new');
  });

  it('elige el mejor candidato', () => {
    const d = decide(base, [
      candidate({ locationId: 'lejos', lat: 40.4173 }),
      candidate({ locationId: 'cerca', lat: 40.41681 }),
    ]);
    expect(d).toMatchObject({ action: 'merge', locationId: 'cerca' });
  });

  it('sin candidatos crea estación nueva', () => {
    expect(decide(base, [])).toEqual({ action: 'new' });
  });
});
