import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import type { SiteFilters, VehicleSpec } from '@pc/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface FavoriteSite {
  id: string;
  name: string;
  operatorName: string | null;
  city: string | null;
  lat: number;
  lng: number;
  maxPowerKw: number;
}

/** Países cuyos datos se descargan por defecto. */
export const DEFAULT_COUNTRIES = ['ES', 'PT'];

export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'es' | 'en';

interface AppState {
  filters: SiteFilters;
  setFilters: (f: SiteFilters) => void;
  patchFilters: (f: Partial<SiteFilters>) => void;
  clearFilters: () => void;

  favorites: FavoriteSite[];
  toggleFavorite: (site: FavoriteSite) => void;

  /** Garaje: se guarda la ficha completa para estimar sin conexión. */
  vehicles: VehicleSpec[];
  activeVehicleId: string | null;
  addVehicle: (v: VehicleSpec) => void;
  removeVehicle: (id: string) => void;
  setActiveVehicle: (id: string) => void;

  /** Carga que se usa en las estimaciones (de/hasta, %). */
  chargeWindow: { from: number; to: number };
  setChargeWindow: (w: { from: number; to: number }) => void;

  /** Id anónimo del dispositivo para los avisos de la comunidad (el servidor solo guarda su hash). */
  deviceId: string;

  /** Países con datos descargados en el móvil. */
  countries: string[];
  setCountries: (c: string[]) => void;

  /** Borra todo lo guardado en el dispositivo (favoritos, vehículos, filtros, preferencias). */
  resetAll: () => void;

  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
  language: LanguagePreference;
  setLanguage: (l: LanguagePreference) => void;
}

/** Estado de la app guardado en el dispositivo (filtros, favoritos y preferencias). */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      filters: {},
      setFilters: (filters) => set({ filters }),
      patchFilters: (patch) =>
        set((s) => {
          const next: SiteFilters = { ...s.filters, ...patch };
          // Quita claves vacías para que el recuento de filtros y la caché sean estables.
          for (const key of Object.keys(next) as (keyof SiteFilters)[]) {
            const v = next[key];
            if (v === undefined || v === false || (Array.isArray(v) && v.length === 0))
              delete next[key];
          }
          return { filters: next };
        }),
      clearFilters: () => set({ filters: {} }),

      favorites: [],
      toggleFavorite: (site) =>
        set((s) => ({
          favorites: s.favorites.some((f) => f.id === site.id)
            ? s.favorites.filter((f) => f.id !== site.id)
            : [site, ...s.favorites],
        })),

      vehicles: [],
      activeVehicleId: null,
      addVehicle: (v) =>
        set((s) => ({
          vehicles: s.vehicles.some((x) => x.id === v.id) ? s.vehicles : [...s.vehicles, v],
          activeVehicleId: v.id,
        })),
      removeVehicle: (id) =>
        set((s) => {
          const vehicles = s.vehicles.filter((v) => v.id !== id);
          return {
            vehicles,
            activeVehicleId:
              s.activeVehicleId === id ? (vehicles[0]?.id ?? null) : s.activeVehicleId,
          };
        }),
      setActiveVehicle: (id) => set({ activeVehicleId: id }),

      chargeWindow: { from: 20, to: 80 },
      setChargeWindow: (chargeWindow) => set({ chargeWindow }),

      deviceId: randomUUID(),
      countries: [...DEFAULT_COUNTRIES],
      setCountries: (countries) => set({ countries }),
      resetAll: () =>
        set({
          filters: {},
          favorites: [],
          vehicles: [],
          activeVehicleId: null,
          chargeWindow: { from: 20, to: 80 },
          deviceId: randomUUID(),
          theme: 'system',
          language: 'system',
          countries: [...DEFAULT_COUNTRIES],
        }),

      theme: 'system',
      setTheme: (theme) => set({ theme }),
      language: 'system',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'puntos-carga-state',
      version: 2,
      // v1 → v2: se añaden garaje y ventana de carga (los valores por defecto bastan).
      migrate: (state) => state as AppState,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export const useIsFavorite = (id: string | undefined) =>
  useAppStore((s) => !!id && s.favorites.some((f) => f.id === id));

export const useActiveVehicle = (): VehicleSpec | null =>
  useAppStore((s) => s.vehicles.find((v) => v.id === s.activeVehicleId) ?? null);

export function vehicleName(
  v: Pick<VehicleSpec, 'brand' | 'model' | 'variant' | 'releaseYear'>,
): string {
  return [v.brand, v.model, v.variant, v.releaseYear ? `(${v.releaseYear})` : null]
    .filter(Boolean)
    .join(' ');
}
