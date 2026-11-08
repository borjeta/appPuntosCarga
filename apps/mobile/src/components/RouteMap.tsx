import type { RoutePlan } from '@pc/shared';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useTheme } from '../lib/theme';

/** Mapa con el trazado de la ruta, origen, destino y paradas de carga numeradas. */
export function RouteMap({
  plan,
  onStopPress,
}: {
  plan: RoutePlan;
  onStopPress: (siteId: string) => void;
}) {
  const theme = useTheme();
  const ref = useRef<MapView>(null);
  const coords = plan.geometry.map(([latitude, longitude]) => ({ latitude, longitude }));

  useEffect(() => {
    if (coords.length > 1) {
      const id = setTimeout(
        () =>
          ref.current?.fitToCoordinates(coords, {
            edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
            animated: false,
          }),
        300,
      );
      return () => clearTimeout(id);
    }
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = coords[0];
  const last = coords[coords.length - 1];
  return (
    <View style={styles.wrap}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={theme.dark ? 'dark' : 'light'}
        toolbarEnabled={false}
      >
        <Polyline coordinates={coords} strokeColor={theme.primary} strokeWidth={4} />
        {first ? <Marker coordinate={first} pinColor="green" tracksViewChanges={false} /> : null}
        {last ? <Marker coordinate={last} pinColor="red" tracksViewChanges={false} /> : null}
        {plan.stops.map((s, i) => (
          <Marker
            key={s.site.id}
            coordinate={{ latitude: s.site.lat, longitude: s.site.lng }}
            title={`${i + 1}. ${s.site.name}`}
            onCalloutPress={() => onStopPress(s.site.id)}
            pinColor={theme.power.ULTRA}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 260, borderRadius: 14, overflow: 'hidden', marginTop: 12 },
});
