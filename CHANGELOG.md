# Changelog

## 0.5.0 — 9 nov 2026 · Premium y anuncios

- Modelo: gratis con banners de Google AdMob; **Premium** (3 €/mes o 19,99 €/año, 2 semanas gratis) quita
  los anuncios. Compras con RevenueCat (sin servidor propio).
- Banner adaptativo encima de las pestañas; consentimiento europeo (UMP) y permiso de seguimiento de Apple
  (ATT) antes de cargar anuncios; "Privacidad de los anuncios" en Ajustes.
- Pantalla Premium con planes, prueba gratis, condiciones de renovación, restaurar compras y enlaces legales.
- Política de privacidad y guía de la App Store actualizadas (configuración de App Store Connect,
  RevenueCat y AdMob, y respuestas de privacidad).

## 0.4.0 — 9 nov 2026 · Francia, Alemania y preparación para la App Store

### Datos: escala europea
- Nuevas fuentes oficiales: **Francia** (Base nationale des IRVE, data.gouv.fr: 38.966 estaciones) y
  **Alemania** (Ladesäulenregister de la Bundesnetzagentur: 70.561). Total: 130.401 estaciones y 395.973 puntos.
- Francia: unión de duplicados entre publicadores por id de punto (union-find) y solo acceso público.
- Formato de datos v2: índice compacto por país + teselas de 0,5° con las fichas, descargadas bajo
  demanda. España+Portugal pasan de 1,8 a 0,74 MB de descarga inicial; las 130.401 estaciones cargan en
  0,6 s (PC).
- Ajustes → Países en el mapa (por defecto España y Portugal).
- Workflow: datos generados guardados en la caché de Actions (la tarea de 15 min solo regenera el estado);
  concurrencia solo en el despliegue, para que un despliegue atascado no bloquee los siguientes.

### App Store
- Icono, pantalla de arranque, permisos, manifiesto de privacidad, cifrado, `eas.json`, identificador
  `com.borjeta.puntoscarga`; proyecto iOS verificado generándolo en Linux.
- Ajustes → Privacidad: política, ayuda y borrar mis datos (cuenta anónima y avisos incluidos).
- Páginas de privacidad y soporte publicadas; guía y textos de la ficha en `docs/app-store.md`.
- Comunidad sin comentarios libres en la v1 (norma 1.2).

## 0.3.0 — 8 nov 2026 · Sin servidor propio

- La app ya no necesita la API: descarga ficheros estáticos (≈ 2 MB comprimidos) publicados en GitHub
  Pages y resuelve mapa, filtros, búsqueda, fichas, coste y rutas en el dispositivo. Funciona sin conexión
  con los últimos datos.
- `packages/dataset`: formato de datos con ids de estación estables y motor de consultas en memoria
  (20.874 estaciones: carga ~0,3 s, consultas en ms).
- `packages/planner`: planificador y clientes OSRM/Photon compartidos entre app y API.
- Exportación: `npm run data:export` (completa) y `export-status` (solo estado, sin base de datos).
- Workflow `.github/workflows/data.yml`: estado cada 15 min e ingesta completa diaria con PostGIS temporal.
- Comunidad en Supabase: inicio de sesión anónimo, RLS (lectura sin `user_id`, escritura en nombre
  propio), límites anti-abuso y moderación en trigger. 15 comprobaciones de seguridad superadas.
- Prueba E2E de la app con la API apagada: cero llamadas a la API, sin errores.
- Corregido: 19 puntos sin conectores en los datos de origen rompían el motor.
- 90 tests.

## 0.2.0 — 8 nov 2026 · Fase 2 (parcial): "Personaliza y planifica"

### Vehículos y estimación de carga
- Catálogo de 1.321 modelos (Open EV Data) con curva de carga DC: `npm run ingest -- vehicles`, `GET /v1/vehicle-models`.
- Paquete `@pc/pricing`: simula la carga de 1 % en 1 % (curva del coche, límite del punto, fases AC) y aplica tarifas por energía, tiempo y sesión.
- App: garaje "Mis vehículos" en el dispositivo, chip "Mi coche" en el mapa, tarjeta de estimación en la ficha
  (tiempo, energía, coste, ventana de carga ajustable) y conectores marcados como compatibles o no.

### Planificador de rutas
- `POST /v1/routes/plan`: ruta por carretera (OSRM), cargadores a menos de ~3 km del trazado (PostGIS),
  algoritmo de paradas con curva real, tiempos y coste. `GET /v1/geocode` (Photon, limitado a Europa).
- App: pestaña "Rutas" con origen (mi ubicación o lugar), destino con autocompletado, batería de salida y de
  llegada, resumen, mapa con trazado y lista de paradas.
- Ejemplo real: Madrid → Málaga con un Tesla Model 3 (57,5 kWh) al 80 %: 537 km, 2 paradas, 56 min de carga.

### Comunidad
- Avisos "funciona", "no funciona", "conector dañado", "bloqueado por coche", "precio distinto", "no existe".
- Id anónimo por dispositivo (solo se guarda su hash), límites anti-abuso, comentarios con enlaces retenidos.
- Puntuación de fiabilidad con decaimiento temporal; el planificador evita cargadores reportados como averiados.

### Calidad
- 79 tests (shared 15, pricing 9, workers 32, API 23 con e2e contra PostGIS) y prueba E2E de la app web con
  Playwright (añadir coche → estimación → ruta → aviso → modo oscuro).
- Corregido: avisos recién creados ignorados por desfase de reloj entre la base de datos y la API.

### Pendiente de la fase 2
Cuentas de usuario, notificaciones "cargador libre", fotos, panel de moderación, "mis tarjetas/apps" y nuevas
fuentes (Francia, Alemania, Italia, Países Bajos). Ver docs/integraciones.md.

## 0.1.0 — 8 nov 2026 · Fases 0 y 1 (MVP "Encuentra y compara")

### Datos
- Ingesta del NAP de España (DGT, DATEX II v3): 12.086 estaciones de 159 operadores.
- Ingesta de MOBI.E Portugal: 8.811 estaciones, estado en tiempo real y tarifas base del operador.
- Parser DATEX II en streaming independiente del publicador (memoria constante con ficheros de 180 MB).
- Normalización: conectores y estados al modelo OCPI, horarios, direcciones, nombres de operador, EVSE ID eMI3.
- Deduplicación entre fuentes con linaje por registro y salvaguarda ante descargas incompletas.
- Reingesta incremental por hash: una pasada sin cambios tarda ~2 s.

### API (NestJS)
- `/v1/map` (grupos o estaciones según zoom), `/v1/locations/nearby`, `/v1/locations/:id`, `/v1/search`,
  `/v1/operators`, `/v1/sources`, `/v1/health`. Swagger en `/docs`.
- El estado caduca a los 30 min: nunca se muestra una disponibilidad desactualizada como cierta.

### App (Expo SDK 58)
- Mapa con agrupación, pines por clase de potencia y estado, búsqueda, filtros rápidos y completos.
- Ficha de estación: puntos y conectores, estado, precio, cómo pagar, proveedores aceptados, horario,
  servicios y origen de los datos. Cómo llegar (Google Maps / Waze / Apple Maps) y abrir app del operador.
- Cerca de mí, favoritos en el dispositivo, ajustes de tema e idioma (es/en), fuentes y licencias.
- Modo oscuro, objetivos táctiles de 48 dp, estados con icono además de color.

### Infra
- Monorepo npm workspaces; PostGIS con Docker o portable (`scripts/local-db.ps1`) para Windows sin virtualización.
- 48 tests (shared 10, workers 28 con ficheros reales, API 10 entre unitarios y e2e).
