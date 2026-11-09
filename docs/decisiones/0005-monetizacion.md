# ADR 0005 — Monetización: gratis con banners y suscripción Premium

Fecha: 9 nov 2026. Decisión del propietario: gratis con banners; Premium (3 €/mes o 19,99 €/año, 2 semanas
de prueba gratis) quita los anuncios. Las funciones son las mismas para todos.

## Decisión técnica
- **Suscripciones con RevenueCat** (`react-native-purchases`): la opción que recomienda Expo; valida las
  compras con Apple/Google sin servidor propio. Entitlement `premium`, offering `default`.
  Productos `puntoscarga_premium_monthly` y `puntoscarga_premium_annual` (ver `@pc/shared/monetization`).
- **Prueba gratis = oferta introductoria de Apple** (norma 3.1.2): el usuario se suscribe y Apple cobra al
  terminar las 2 semanas si no cancela.
- **Anuncios con Google AdMob** (`react-native-google-mobile-ads` v17): un banner adaptativo encima de la
  barra de pestañas (no tapa el mapa). Orden obligatorio: consentimiento UMP (RGPD) → permiso de
  seguimiento de Apple (ATT) → inicializar el SDK. Los suscriptores nunca cargan el SDK de anuncios.
- **Expo Go y web** no tienen esos módulos nativos: se cargan de forma perezosa y, si no están, la app
  funciona sin anuncios ni compras. Para probarlos hace falta una compilación de desarrollo o TestFlight.
- Sin claves configuradas se usan los **IDs de prueba de Google** (nunca facturan) y no se ofrecen compras.

## Consecuencias
- Cambian la política de privacidad y las respuestas de "App Privacy" (hay seguimiento si el usuario lo
  permite) — ver `docs/app-store.md`.
- AdMob exige `app-ads.txt` en la raíz de un dominio del desarrollador.
- Apple se queda un 15 % (Small Business Program) de cada suscripción.
