# ADR 0001 — Decisiones técnicas de la fase 1 (y en qué se apartan del prompt)

Fecha: 8 nov 2026. Regla aplicada (prompt §17): ante dos opciones razonables, la más simple, documentada.

## 1. npm workspaces en lugar de pnpm + Turborepo
- **Motivo:** pnpm no estaba instalado y Expo + pnpm en Windows da problemas con los enlaces simbólicos de Metro. npm workspaces viene con Node y Expo lo detecta solo.
- **Revisar si:** el monorepo crece y los tiempos de build importan (Turborepo se puede añadir encima sin cambiar de gestor).

## 2. SQL directo con `pg` en lugar de Drizzle
- **Motivo:** casi todas las consultas son geoespaciales (PostGIS) o masivas (`unnest`), donde un ORM aporta poco. Migraciones como ficheros `.sql` numerados con un runner de 40 líneas (`packages/db`).
- **Coste:** sin tipos generados desde el esquema; los tipos de fila se declaran en cada consulta.

## 3. `react-native-maps` + agrupación en el servidor, en lugar de MapLibre + Martin
- **Motivo:** `react-native-maps` va incluido en Expo Go (SDK 58), así que la app se prueba en un móvil escaneando un QR, sin compilar. MapLibre exige una build nativa propia.
- **Cómo escala:** el servidor agrupa por celdas (`/v1/map`, SQL con rejilla según el zoom) y solo envía estaciones sueltas a partir del zoom 13 (máx. 1.500). Con ~21.000 estaciones la respuesta es instantánea.
- **Revisar si:** pasamos a toda Europa (≈1 M de puntos) o se necesita mapa offline → MapLibre + teselas vectoriales (Martin) con una development build.

## 4. Sin Redis ni BullMQ todavía
- **Motivo:** la ingesta es un CLI idempotente (`npm run ingest`) y el estado de Portugal un bucle (`watch-status`). No hay colas que justificar.
- **Revisar si:** hay varias fuentes dinámicas o se despliega en varios nodos.

## 5. PostgreSQL + PostGIS portables cuando no hay Docker
- **Motivo:** en el equipo de desarrollo Docker no arranca (`hasNoVirtualization: true`: WSL2/Hyper-V no disponibles). `scripts/local-db.ps1` descarga los binarios oficiales (EDB PostgreSQL 17.11 + OSGeo PostGIS 3.6.2) a `.local/` sin permisos de administrador, con la misma URL de conexión que la opción Docker.

## 6. TypeScript 5.9 en backend
- **Motivo:** npm ya sirve TypeScript 7 (el compilador nativo nuevo); NestJS depende de decoradores "legacy" y metadatos, así que se fija 5.9.3 hasta validar la compatibilidad. La app móvil usa la versión que trae su SDK de Expo.

## 7. Deduplicación: una fuente "principal" por estación
- Cuando dos fuentes describen la misma estación (mismo EVSE ID, o puntuación ≥ 0,8 por distancia ≤ 75 m + operador + conectores + potencia), los puntos de carga los aporta solo la fuente de mayor prioridad; las demás completan huecos y suman métodos de pago. Así no se cuentan dos veces.
- Dentro de una misma fuente **no** se fusiona: si la fuente dice que son dos estaciones, lo son.
- La zona gris (0,6–0,8) se guarda en `dedup_candidates` para revisión manual (panel admin, fase 2).
