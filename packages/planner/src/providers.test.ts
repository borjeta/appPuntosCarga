import { describe, expect, it } from 'vitest';
import { rankFeatures, toGeocodeResult } from './providers';

const f = (name: string, osm_value: string, osm_key = 'place') => ({
  geometry: { coordinates: [-0.37, 39.47] as [number, number] },
  properties: { name, osm_key, osm_value, state: 'Comunitat Valenciana', country: 'España' },
});

describe('geocodificador', () => {
  it('pone las ciudades antes que aldeas y tiendas', () => {
    const ranked = rankFeatures([
      f('Valencia', 'hamlet'),
      f('Valencia Guitar', 'shop', 'shop'),
      f('València', 'city'),
    ]);
    expect(ranked.map((x) => x.properties.name)).toEqual([
      'València',
      'Valencia',
      'Valencia Guitar',
    ]);
  });

  it('construye etiqueta y detalle', () => {
    expect(toGeocodeResult(f('València', 'city'))).toEqual({
      label: 'València',
      detail: 'Comunitat Valenciana, España',
      lat: 39.47,
      lng: -0.37,
    });
  });
});
