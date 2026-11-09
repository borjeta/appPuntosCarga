import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuración dinámica sobre app.json: identificadores de AdMob desde variables de entorno
 * (EAS: `eas env:create`). Sin ellas se usan los IDs de aplicación de prueba de Google, que
 * muestran anuncios de prueba y nunca facturan.
 */
const GOOGLE_TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const GOOGLE_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';

const ADMOB_PLUGIN = 'react-native-google-mobile-ads';

export default ({ config }: ConfigContext): ExpoConfig => {
  const admob: [string, Record<string, unknown>] = [
    ADMOB_PLUGIN,
    {
      iosAppId: process.env.ADMOB_IOS_APP_ID || GOOGLE_TEST_IOS_APP_ID,
      androidAppId: process.env.ADMOB_ANDROID_APP_ID || GOOGLE_TEST_ANDROID_APP_ID,
      // No medir nada hasta que el SDK se inicialice tras el consentimiento.
      delayAppMeasurementInit: true,
      // Identificador SKAdNetwork de Google (atribución de campañas en iOS sin seguimiento).
      skAdNetworkItems: ['cstr6suwn9.skadnetwork'],
    },
  ];
  const plugins = (config.plugins ?? []).filter(
    (p) => (Array.isArray(p) ? p[0] : p) !== ADMOB_PLUGIN,
  );
  return {
    ...config,
    name: config.name ?? 'Puntos de Carga',
    slug: config.slug ?? 'puntos-carga',
    plugins: [...plugins, admob],
  };
};
