# Integraciones pendientes y qué hace falta para cada una

| Integración | Estado | Qué hace falta |
|---|---|---|
| **Estado en tiempo real en España** | No publicado en el NAP | Seguir el NAP de la DGT (AFIR exige datos dinámicos). Alternativa: acuerdos OCPI directos con operadores (fase 3). |
| **Precios en España** | No publicados en el NAP | Igual que el anterior. Mientras tanto la app muestra "Precio no publicado". |
| **Open Charge Map** | Sin implementar | Clave de API gratuita (`OCM_API_KEY`). El 7 nov 2026 `api.openchargemap.io` no respondía desde este equipo; reintentar. Útil para rellenar huecos y otros países. Revisar licencia por registro. |
| **Otros NAP europeos** (Francia IRVE, Alemania Mobilithek, Países Bajos NDW…) | Sin implementar | Muchos usan DATEX II v3 como España y Portugal: el parser (`apps/workers/src/datex2`) ya es genérico; cada país necesita un adaptador pequeño y sus fixtures. |
| **Deep links a apps de operadores** | Fallback: búsqueda en la tienda por nombre comercial | Que cada operador documente su esquema/enlace universal. Rellenar `deeplinkTemplate`, `appIosUrl` y `appAndroidPackage` en `apps/workers/src/normalize/operators.ts`. **No inventar paquetes ni enlaces.** |
| **Nombres comerciales de operadores** | 24 curados; el resto, razón social limpiada | Ampliar el catálogo curado (por ejemplo "Charging Together" → marca comercial real, si la hay). |
| **Mapas en producción** | Expo Go no necesita clave | Para publicar en Google Play hace falta una API key de Google Maps (ver docs de `react-native-maps` en Expo). |
| **Activación y pago (OCPI eMSP)** | Fase 3 | Contrato con un hub (Hubject, Gireve) u operadores; alta como eMSP; Stripe. |
| **Rutas y geocodificación en producción** | Servidores públicos de OSRM y Photon (desarrollo) | Desplegar OSRM o Valhalla y Photon/Nominatim propios con el extracto de OSM de Europa; configurar `ROUTING_URL` y `GEOCODER_URL`. |
| **Cuentas de usuario** | Sin implementar (garaje local + id anónimo) | Decidir proveedor: Apple/Google (cuentas de desarrollador) y/o enlace mágico por correo (servicio de envío). Ver ADR 0002. |
| **Notificaciones "cargador libre"** | Sin implementar | Notificaciones push de Expo: requieren un proyecto en Expo (EAS `projectId`) y una build de desarrollo; además, estado en tiempo real (hoy solo Portugal). |
| **Fotos de la comunidad** | Sin implementar | Almacenamiento de ficheros (S3 o similar) y moderación de imágenes. |
| **Panel de moderación** | Sin implementar | Los comentarios con enlaces quedan ocultos (`community_reports.hidden`); falta la interfaz para revisarlos. |
| **Precios de comercializadores (eMSP)** | Solo precio base del operador (Portugal) | API de pago de Chargeprice u acuerdos con eMSP para comparar por tarjeta/app. |
| **Catálogo de vehículos actualizado** | Open EV Data (abr 2025) | Vigilar el repositorio; valorar una fuente complementaria para modelos 2025-2026. |
| **Planificador local + comunidad** | En modo sin servidor no se excluyen aún los cargadores marcados como averiados | Función RPC en Supabase que devuelva, para una lista de estaciones, las que tienen ≥2 averías recientes. |
| **CAPTCHA en Supabase** | Sin activar | Turnstile o hCaptcha para los inicios de sesión anónimos antes del lanzamiento público. |

