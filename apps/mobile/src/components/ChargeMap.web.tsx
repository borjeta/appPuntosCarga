import type { MapCluster, MapSite } from '@pc/shared';
import { useEffect, useImperativeHandle, type Ref } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { BBox } from '../lib/api';
import { useTheme } from '../lib/theme';
import { SiteListItem } from './stations';
import { T } from './ui';

/**
 * En web no hay `react-native-maps`. Esta versión de desarrollo muestra como lista las
 * estaciones de la vista inicial (zoom alto sobre Madrid) para poder probar la app en el navegador.
 */
export interface ChargeMapHandle {
  flyTo: (lat: number, lng: number, delta?: number) => void;
}
export interface Viewport {
  bbox: BBox;
  zoom: number;
  center: { lat: number; lng: number };
}

const MADRID: Viewport = {
  bbox: [-3.74, 40.38, -3.66, 40.46],
  zoom: 13,
  center: { lat: 40.42, lng: -3.7 },
};

interface Props {
  items: Array<MapCluster | MapSite>;
  selectedId: string | null;
  showsUserLocation: boolean;
  dark: boolean;
  onViewportChange: (v: Viewport) => void;
  onSelectSite: (site: MapSite | null) => void;
  ref?: Ref<ChargeMapHandle>;
}

export function ChargeMap({ items, onViewportChange, onSelectSite, ref }: Props) {
  const theme = useTheme();
  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng) =>
      onViewportChange({
        bbox: [lng - 0.04, lat - 0.04, lng + 0.04, lat + 0.04],
        zoom: 14,
        center: { lat, lng },
      }),
  }));
  useEffect(() => onViewportChange(MADRID), []); // eslint-disable-line react-hooks/exhaustive-deps
  const sites = items.filter((i): i is MapSite => i.kind === 'site');
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, paddingTop: 150 }]}>
      <T muted variant="small" style={{ textAlign: 'center', marginBottom: 8 }}>
        Vista web de desarrollo: el mapa interactivo está en la app (Expo Go).
      </T>
      <ScrollView>
        {sites.map((s) => (
          <SiteListItem key={s.id} site={s} onPress={() => onSelectSite(s)} />
        ))}
      </ScrollView>
    </View>
  );
}

export const INITIAL_REGION = null;
