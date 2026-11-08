import { keepPreviousData, QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { filtersToQuery, type SiteFilters } from '@pc/shared';
import type { BBox } from './api';
import { BACKEND_MODE, backend } from './backend';
import { repository, STATUS_REFRESH_MS } from './data/repository';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

/** Redondea el bbox para que pequeños desplazamientos reutilicen la caché. */
function roundBBox(bbox: BBox, zoom: number): BBox {
  const step = Math.max(0.0005, 360 / 2 ** zoom / 64);
  return [
    Math.floor(bbox[0] / step) * step,
    Math.floor(bbox[1] / step) * step,
    Math.ceil(bbox[2] / step) * step,
    Math.ceil(bbox[3] / step) * step,
  ];
}

export function useMapData(bbox: BBox | null, zoom: number, filters: SiteFilters) {
  const rounded = bbox ? roundBBox(bbox, zoom) : null;
  return useQuery({
    queryKey: ['map', rounded, zoom, filtersToQuery(filters)],
    queryFn: () => backend.map(rounded!, zoom, filters),
    enabled: !!rounded,
    placeholderData: keepPreviousData,
  });
}

export function useNearby(coords: { lat: number; lng: number } | null, filters: SiteFilters) {
  return useQuery({
    queryKey: [
      'nearby',
      coords && [coords.lat.toFixed(3), coords.lng.toFixed(3)],
      filtersToQuery(filters),
    ],
    queryFn: () => backend.nearby(coords!.lat, coords!.lng, filters),
    enabled: !!coords,
  });
}

export function useLocation(id: string | undefined) {
  return useQuery({
    queryKey: ['location', id],
    queryFn: () => backend.location(id!),
    enabled: !!id,
  });
}

export function useSearch(q: string, center: { lat: number; lng: number } | null) {
  const term = q.trim();
  return useQuery({
    queryKey: ['search', term, center && [center.lat.toFixed(2), center.lng.toFixed(2)]],
    queryFn: () => backend.search(term, center?.lat, center?.lng),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
  });
}

export function useOperators() {
  return useQuery({
    queryKey: ['operators'],
    queryFn: () => backend.operators(),
    staleTime: 60 * 60_000,
  });
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => backend.sources(),
    staleTime: 60 * 60_000,
  });
}

const DATA_QUERIES = new Set(['map', 'nearby', 'location', 'search', 'operators', 'sources']);

/**
 * Modo sin servidor: comprueba periódicamente (y al volver a la app) si hay datos o estado en
 * tiempo real nuevos, y refresca las pantallas si algo cambió.
 */
export function useDataSync() {
  const qc = useQueryClient();
  useEffect(() => {
    if (BACKEND_MODE !== 'local') return;
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await repository.ready();
        if (await repository.refresh()) {
          await qc.invalidateQueries({ predicate: (q) => DATA_QUERIES.has(String(q.queryKey[0])) });
        }
      } catch {
        // Sin conexión: se siguen usando los datos guardados.
      } finally {
        running = false;
      }
    };
    void tick();
    const id = setInterval(tick, STATUS_REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [qc]);
}
