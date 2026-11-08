import type { RoutePlan } from '@pc/shared';

/** En web (solo desarrollo) no hay react-native-maps: la ruta se muestra como lista de paradas. */
export function RouteMap(_props: { plan: RoutePlan; onStopPress: (siteId: string) => void }) {
  return null;
}
