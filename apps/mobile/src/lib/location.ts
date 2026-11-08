import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

type PermissionState = 'unknown' | 'granted' | 'denied';

/**
 * Ubicación del usuario solo mientras se usa la app. No se envía a ningún servidor salvo como
 * parámetro de búsqueda puntual (cercanía), y nunca se guarda.
 */
export function useUserLocation({ ask = false }: { ask?: boolean } = {}) {
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);

  const refresh = useCallback(async (request: boolean) => {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted' && request && perm.canAskAgain) {
      perm = await Location.requestForegroundPermissionsAsync();
    }
    setCanAskAgain(perm.canAskAgain);
    if (perm.status !== 'granted') {
      setPermission(perm.status === 'denied' ? 'denied' : 'unknown');
      return null;
    }
    setPermission('granted');
    const last = await Location.getLastKnownPositionAsync();
    if (last) setCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setCoords(next);
    return next;
  }, []);

  useEffect(() => {
    refresh(ask).catch(() => setPermission('denied'));
  }, [ask, refresh]);

  return { permission, coords, canAskAgain, request: () => refresh(true) };
}
