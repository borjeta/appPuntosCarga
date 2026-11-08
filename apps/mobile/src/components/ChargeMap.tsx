import type { MapCluster, MapSite } from '@pc/shared';
import { useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import type { BBox } from '../lib/api';
import { ClusterPin, SitePin } from './stations';

export interface ChargeMapHandle {
  flyTo: (lat: number, lng: number, delta?: number) => void;
}

export interface Viewport {
  bbox: BBox;
  zoom: number;
  center: { lat: number; lng: number };
}

export const INITIAL_REGION: Region = {
  latitude: 40.2,
  longitude: -3.7,
  latitudeDelta: 9,
  longitudeDelta: 9,
};

export function regionToViewport(r: Region): Viewport {
  const zoom = Math.max(
    0,
    Math.min(20, Math.round(Math.log2(360 / Math.max(r.longitudeDelta, 1e-6)))),
  );
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  return {
    zoom,
    center: { lat: r.latitude, lng: r.longitude },
    bbox: [
      clamp(r.longitude - r.longitudeDelta / 2, -180, 179.999),
      clamp(r.latitude - r.latitudeDelta / 2, -90, 89.999),
      clamp(r.longitude + r.longitudeDelta / 2, -179.999, 180),
      clamp(r.latitude + r.latitudeDelta / 2, -89.999, 90),
    ],
  };
}

interface Props {
  items: Array<MapCluster | MapSite>;
  selectedId: string | null;
  showsUserLocation: boolean;
  dark: boolean;
  onViewportChange: (v: Viewport) => void;
  onSelectSite: (site: MapSite | null) => void;
  ref?: Ref<ChargeMapHandle>;
}

export function ChargeMap({
  items,
  selectedId,
  showsUserLocation,
  dark,
  onViewportChange,
  onSelectSite,
  ref,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef<Region>(INITIAL_REGION);

  const flyTo = (lat: number, lng: number, delta = 0.02) => {
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta },
      450,
    );
  };
  useImperativeHandle(ref, () => ({ flyTo }));

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={INITIAL_REGION}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
      userInterfaceStyle={dark ? 'dark' : 'light'}
      onPress={() => onSelectSite(null)}
      onMapReady={() => onViewportChange(regionToViewport(INITIAL_REGION))}
      onRegionChangeComplete={(r) => {
        regionRef.current = r;
        onViewportChange(regionToViewport(r));
      }}
    >
      {items.map((item) =>
        item.kind === 'cluster' ? (
          <Marker
            key={item.id}
            coordinate={{ latitude: item.lat, longitude: item.lng }}
            tracksViewChanges={false}
            onPress={(e) => {
              e.stopPropagation();
              // Acercar centrando en el grupo: 1/4 de la extensión actual.
              flyTo(item.lat, item.lng, Math.max(0.005, regionRef.current.longitudeDelta / 4));
            }}
          >
            <ClusterPin cluster={item} />
          </Marker>
        ) : (
          <Marker
            key={`${item.id}:${item.id === selectedId ? 's' : 'n'}:${item.status}`}
            coordinate={{ latitude: item.lat, longitude: item.lng }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            zIndex={item.id === selectedId ? 1000 : Math.round(item.maxPowerKw)}
            onPress={(e) => {
              e.stopPropagation();
              onSelectSite(item);
            }}
          >
            <SitePin site={item} selected={item.id === selectedId} />
          </Marker>
        ),
      )}
    </MapView>
  );
}
