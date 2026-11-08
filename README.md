# Puntos de Carga — app unificada de recarga de vehículos eléctricos

Una sola app para **encontrar, comparar y llegar** a cualquier punto de recarga público, sea de la
compañía que sea. Especificación completa: [PROMPT_APP_RECARGA.md](PROMPT_APP_RECARGA.md).

**Estado:** fases 0 y 1 completas, fase 2 en curso y arquitectura **sin servidor propio** (vehículos, estimación de carga, planificador de rutas y
comunidad) para **España y Portugal**.

| Qué | Dato real (8 nov 2026) |
|---|---|
| Estaciones | 20.897 (12.086 ES + 8.811 PT) |
| Puntos de recarga (EVSE) | 55.344 |
| Operadores | 159 en España + los de Portugal |
| Estado en tiempo real | Portugal (MOBI.E), cada 2 min. España: el NAP aún no lo publica |
| Precios | Precio base del operador en Portugal. España: no publicado en el NAP |

## Cómo funciona (sin servidor propio)

```
NAP España (DGT) ──┐   GitHub Actions (cada 15 min / diario)     GitHub Pages            Móvil (Expo)
MOBI.E Portugal ───┼─► ingesta + PostGIS temporal ─► export ─► manifest/stations/ ─► motor local: mapa,
Open EV Data ──────┘                                            status/vehicles.json    filtros, fichas,
                                                                (≈ 2 MB gzip)           coste, rutas
                                                   Supabase (avisos, sesión anónima) ◄─► comunidad
                                                   OSRM / Photon (trazado y lugares) ◄─► planificador
```

No se integra compañía por compañía: los operadores están obligados (Reglamento UE 2023/1804,
AFIR) a publicar sus puntos en el **Punto de Acceso Nacional** de cada país. Leyendo esos NAP
obtenemos todas las compañías a la vez.

**Coste fijo: 0 €.** Ver [docs/publicar-sin-servidor.md](docs/publicar-sin-servidor.md) para ponerlo
en marcha con tus cuentas de GitHub y Supabase. La API NestJS sigue disponible como modo opcional.

## Estructura

```
apps/
  api/       API pública v1 (NestJS): mapa, fichas, vehículos, rutas, comunidad — Swagger en /docs
  workers/   Ingesta: descarga, parser DATEX II en streaming, normalización, deduplicación
  mobile/    App Expo (React Native) con Expo Router
packages/
  shared/    Tipos de dominio (modelo OCPI), filtros, fiabilidad, geometría
  dataset/   Formato de los ficheros estáticos y motor de consultas en el dispositivo
  planner/   Planificador de rutas y clientes de OSRM/Photon (app y API)
  pricing/   Motor de estimación de cargas: tiempo, energía y coste según coche, punto y tarifa
  db/        Conexión y migraciones SQL (PostGIS)
infra/       docker-compose (PostGIS)
supabase/    Migración de la comunidad (RLS) y script de comprobación de seguridad
.github/     Workflow que publica los datos en GitHub Pages
scripts/     local-db.ps1: PostgreSQL + PostGIS portables para Windows sin Docker
docs/        Fuentes de datos, decisiones (ADR) e integraciones pendientes
```

## Puesta en marcha

Requisitos: Node 20+ y una base PostgreSQL con PostGIS en `localhost:5433`.

```bash
npm install
cp .env.example .env

# Base de datos — elige una opción
npm run db:up            # con Docker (necesita virtualización activada)
npm run db:local:setup   # Windows sin Docker: descarga PostgreSQL 17 + PostGIS a .local/ (1.ª vez)
npm run db:local:start   # Windows sin Docker: arranques siguientes

npm run db:migrate
npm run ingest -- sites all       # España + Portugal (~3 min la primera vez; luego segundos)
npm run ingest -- vehicles        # catálogo de modelos de vehículo (Open EV Data)
npm run status:watch              # opcional: estado en tiempo real de Portugal cada 2 min

npm run data:export               # genera los ficheros estáticos en data/public
npm run data:serve                # los sirve en :8090 (la app los encuentra sola)
npx supabase start                # opcional: Supabase local para la comunidad (Docker)
npm run dev:mobile                # escanea el QR con Expo Go (móvil en la misma wifi)

npm run dev:api                   # opcional: API NestJS (http://localhost:3000/docs)
```

Configuración de la app en `apps/mobile/.env.local` (ver `.env.example`): URL de los datos, Supabase
y, opcionalmente, `EXPO_PUBLIC_API_URL` para usar la API en vez del modo sin servidor.

## Calidad

```bash
npm test          # shared + workers + api (los e2e de la API se saltan si no hay base de datos)
npm run typecheck
```

Los tests de ingesta usan recortes reales de los ficheros oficiales (`apps/workers/src/__fixtures__`).

## Documentación

- [docs/fuentes/](docs/fuentes/): qué publica cada fuente, formato, licencia y limitaciones.
- [docs/decisiones/](docs/decisiones/): decisiones técnicas y en qué se apartan del prompt.
- [docs/integraciones.md](docs/integraciones.md): lo que falta y qué hace falta para conseguirlo.
- [CHANGELOG.md](CHANGELOG.md)
