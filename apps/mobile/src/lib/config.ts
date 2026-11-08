import Constants from 'expo-constants';

/**
 * Configuración de la app. Por defecto funciona SIN servidor propio:
 *  - Datos de estaciones/vehículos/estado: ficheros estáticos en GitHub Pages (EXPO_PUBLIC_DATA_URL)
 *  - Comunidad: Supabase → EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *  - Rutas y lugares: servicios públicos (OSRM, Photon) → EXPO_PUBLIC_ROUTING_URL / _GEOCODER_URL
 * Si se define EXPO_PUBLIC_API_URL, la app usa en su lugar la API NestJS (modo servidor).
 */

/** Host del ordenador que sirve Metro en desarrollo (Expo Go en la misma red). */
function devHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri; // "192.168.1.20:8081"
  return hostUri?.split(':')[0] ?? null;
}

const trim = (u: string) => u.replace(/\/$/, '');

export const SERVER_API_URL: string | null = process.env.EXPO_PUBLIC_API_URL
  ? trim(process.env.EXPO_PUBLIC_API_URL)
  : null;

/** Datos publicados por el workflow "Datos" en GitHub Pages. */
export const PUBLISHED_DATA_URL = 'https://borjeta.github.io/appPuntosCarga';

/**
 * Origen de los datos: GitHub Pages por defecto. Para probar datos generados en local
 * (`npm run data:serve`), EXPO_PUBLIC_DATA_URL=local usa el puerto 8090 de este ordenador.
 */
export const DATA_URL: string = trim(
  process.env.EXPO_PUBLIC_DATA_URL === 'local'
    ? `http://${devHost() ?? 'localhost'}:8090`
    : process.env.EXPO_PUBLIC_DATA_URL || PUBLISHED_DATA_URL,
);

/**
 * Proyecto Supabase de la comunidad. La clave "publishable" es pública por diseño (va dentro de la
 * app): lo que protege los datos son las reglas RLS de supabase/migrations.
 */
const DEFAULT_SUPABASE_URL = 'https://mfbauxiyuqpfvmydedhk.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_aXl9VYcVy9ET-StWncIvnA_Ugoo6ttv';

/** Páginas legales publicadas junto a los datos (carpeta web/ del repositorio). */
export const PRIVACY_URL = `${PUBLISHED_DATA_URL}/privacidad.html`;
export const SUPPORT_URL = `${PUBLISHED_DATA_URL}/soporte.html`;

export const SUPABASE_URL: string | null =
  process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_KEY: string | null =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY;

export const ROUTING_URL: string | undefined = process.env.EXPO_PUBLIC_ROUTING_URL || undefined;
export const GEOCODER_URL: string | undefined = process.env.EXPO_PUBLIC_GEOCODER_URL || undefined;

/** Dónde busca la app sus datos (se muestra en mensajes de error y en Ajustes). */
export const DATA_ORIGIN = SERVER_API_URL ?? DATA_URL;
