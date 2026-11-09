import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deConnector, groupDeRows, readDeRows } from './de-bnetza';
import { frConnectors, frStationKey, groupFrRows, readFrRows } from './fr-irve';

const fixture = (name: string) => join(__dirname, '..', '__fixtures__', name);

describe('Francia (IRVE consolidado)', async () => {
  const rows = await readFrRows(fixture('fr-irve-sample.csv'));
  const sites = groupFrRows(rows, 'fr-irve');

  it('lee las filas del CSV real', () => {
    expect(rows.length).toBe(14);
    expect(rows[0]!.nom_operateur).toBe('ChargePoint');
  });

  it('agrupa puntos duplicados entre publicadores y descarta los de acceso reservado', () => {
    const pdcs = sites.flatMap((s) => s.evses.map((e) => e.externalId));
    expect(new Set(pdcs).size).toBe(pdcs.length); // ningún PDC repetido
    for (const s of sites) expect(s.countryCode).toBe('FR');
    // Los ChargePoint de Longueau son "Accès réservé": no deben aparecer
    expect(
      sites.some((s) => s.operator?.legalName === 'ChargePoint' && /Longueau/.test(s.street ?? '')),
    ).toBe(false);
  });

  it('normaliza conectores y potencias', () => {
    const fast = sites.find((s) =>
      s.evses.some((e) => e.connectors.some((c) => c.powerType === 'DC')),
    );
    expect(fast).toBeDefined();
    const ccs = fast!.evses
      .flatMap((e) => e.connectors)
      .find((c) => c.standard === 'IEC_62196_T2_COMBO')!;
    expect(ccs.maxPowerKw).toBeGreaterThan(20); // hay cargadores DC de 24-36 kW
    expect(ccs.powerType).toBe('DC');
  });

  it('una toma Tipo 2 de un cargador rápido no hereda la potencia DC', () => {
    const c = frConnectors({
      puissance_nominale: '150',
      prise_type_2: 'true',
      prise_type_combo_ccs: 'true',
    });
    expect(c.find((x) => x.standard === 'IEC_62196_T2')!.maxPowerKw).toBe(22);
    expect(c.find((x) => x.standard === 'IEC_62196_T2_COMBO')!.maxPowerKw).toBe(150);
    expect(frConnectors({ puissance_nominale: '22000', prise_type_2: 'TRUE' })[0]!.maxPowerKw).toBe(
      22,
    );
  });

  it('usa el id de estación oficial si es válido y si no, la posición', () => {
    expect(frStationKey({ id_station_itinerance: 'FRTCBP0001' }, 48, 2)).toBe('FRTCBP0001');
    expect(
      frStationKey(
        { id_station_itinerance: 'Non concerné', nom_operateur: 'Raiden' },
        49.87623,
        2.36734,
      ),
    ).toBe('geo:49.8762,2.3673|raiden');
  });
});

describe('Alemania (Ladesäulenregister)', async () => {
  const rows = await readDeRows(fixture('de-bnetza-sample.csv'));
  const sites = groupDeRows(rows, 'de-bnetza');

  it('salta las líneas de aviso y lee la cabecera real', () => {
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(rows[0]!['Ladeeinrichtungs-ID']).toBe('1010338');
  });

  it('normaliza la primera estación', () => {
    const s = sites.find((x) => x.externalId === '1010338')!;
    expect(s.countryCode).toBe('DE');
    expect(s.city).toBe('Heroldstatt');
    expect(s.lat).toBeCloseTo(48.442398, 5);
    expect(s.openingHours.twentyFourSeven).toBe(true);
    expect(s.paymentMethods).toEqual(['QR', 'RFID']);
    expect(s.evses.map((e) => e.evseId)).toEqual(['DEAEWE002501', 'DEAEWE002502']);
    expect(s.operator?.id).toBe('DE*AEW');
    expect(s.evses[0]!.connectors[0]).toMatchObject({
      standard: 'IEC_62196_T2',
      maxPowerKw: 22,
      format: 'SOCKET',
    });
  });

  it('solo incluye equipos en servicio', () => {
    const ids = new Set(sites.map((s) => s.externalId));
    for (const r of rows.filter((r) => r.Status !== 'In Betrieb'))
      expect(ids.has(r['Ladeeinrichtungs-ID']!)).toBe(false);
  });

  it('reconoce los tipos de conector', () => {
    expect(deConnector('DC Fahrzeugkupplung Typ Combo 2 (CCS)', 150)).toMatchObject({
      standard: 'IEC_62196_T2_COMBO',
      powerType: 'DC',
      format: 'CABLE',
    });
    expect(deConnector('DC CHAdeMO', 50)?.standard).toBe('CHADEMO');
    expect(deConnector('AC Schuko', 3.7)).toMatchObject({
      standard: 'DOMESTIC_F',
      powerType: 'AC_1_PHASE',
    });
  });
});
