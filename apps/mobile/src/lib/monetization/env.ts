import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Compras y anuncios usan módulos nativos: no existen en Expo Go ni en web. Ahí la app funciona igual,
 * sin anuncios y sin opción de compra.
 */
export const NATIVE_MONETIZATION =
  Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Claves públicas de RevenueCat (Project settings → API keys). Sin ellas no se ofrecen compras. */
export const REVENUECAT_API_KEY: string | null =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }) || null;

/** Unidad de banner de AdMob. Sin definir → anuncios de prueba de Google (nunca facturan). */
export const ADMOB_BANNER_ID: string | null =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS,
    android: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID,
  }) || null;
