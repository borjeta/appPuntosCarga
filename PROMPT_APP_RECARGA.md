# PROMPT MAESTRO — App unificada de recarga de vehículos eléctricos (España + Europa)

> Nombre provisional de la app: **[NOMBRE_APP]** (sustituir cuando se decida; comprobar marca registrada en OEPM/EUIPO antes de usarlo).

---

## 0. Tu rol y cómo debes trabajar

Eres un equipo senior de producto e ingeniería (arquitecto de software, desarrollador móvil, desarrollador backend, ingeniero de datos, diseñador UX y experto en e-movilidad europea). Vas a construir, **por fases**, una aplicación móvil (iOS y Android) que unifica en un solo sitio **todos los puntos de recarga públicos de vehículos eléctricos** de España y, después, de Europa, sean de compañías eléctricas, petroleras/gasolineras, operadores especializados, supermercados o ayuntamientos.

Reglas de trabajo:

1. **Trabaja por fases** (sección 16). Al terminar cada fase: ejecuta lint, typecheck y tests; actualiza `README.md`, `CHANGELOG.md` y `docs/`; resume lo hecho y **detente para que yo lo valide** antes de empezar la siguiente.
2. **No inventes APIs, endpoints, formatos ni credenciales.** Si una integración necesita un contrato, una clave o una documentación que no tienes, crea la interfaz del adaptador, una implementación *mock* con datos de ejemplo realistas y una entrada en `docs/integraciones.md` explicando qué hace falta (contacto, contrato, coste, documentación).
3. **Prohibido hacer scraping o ingeniería inversa** de las apps o APIs privadas de los operadores. Solo fuentes abiertas, oficiales o con licencia/contrato.
4. **Respeta las licencias de datos** (atribución de Open Charge Map, OpenStreetMap, datos públicos, etc.) y muéstralas en la app.
5. Antes de usar cualquier servicio **de pago**, pregúntame y propón alternativa gratuita/autoalojada.
6. Si una decisión técnica de este documento te parece mala, dilo, justifica la alternativa y espera mi confirmación. No cambies el stack en silencio.
7. Código en inglés (nombres, comentarios); textos de la app y documentación de producto en español (con i18n).

---

## 1. Contexto y problema

- En España y Europa cada operador de recarga (Iberdrola | bp pulse, Endesa X Way, Repsol, Moeve, Zunder, Wenea, Tesla, Ionity, Powerdot, Atlante, etc.) tiene **su propia app**, su propia cuenta, su propio método de pago y sus propias tarifas.
- El conductor acaba con 5–10 apps instaladas, sin saber de antemano **qué cargador está libre, cuánto le va a costar ni con qué app/tarjeta puede activarlo**.
- Existen agregadores parciales (Electromaps, Chargemap, Plugsurfing, Shell Recharge…), pero ninguno combina bien: **cobertura total + estado en tiempo real + precio real para MI coche y MIS tarjetas + activar la carga desde una sola app**. Ese es nuestro hueco.

## 2. Visión y propuesta de valor

> "Una sola app para encontrar, comparar, activar y pagar cualquier punto de recarga público de Europa."

Pilares:

1. **Cobertura total**: todos los puntos públicos, de todos los operadores, en un único mapa.
2. **Verdad en tiempo real**: disponibilidad, averías y frescura del dato visibles ("actualizado hace 3 min").
3. **Precio transparente y personalizado**: coste estimado de la carga para el vehículo del usuario, comparando cada forma de pago posible (pago directo con tarjeta bancaria, app del operador, tarjetas/apps de roaming que el usuario ya tiene, y nuestra propia cuenta).
4. **Activación unificada**: iniciar y parar la carga desde nuestra app allí donde haya acuerdo de roaming; donde no, llevar al usuario al método correcto en 1 toque (deep link a la app del operador o instrucciones de pago con tarjeta).
5. **Planificación de viajes** con paradas de carga óptimas.

---

## 3. Realidad del ecosistema (debes entenderlo antes de diseñar)

### 3.1 Roles del mercado
- **CPO** (*Charge Point Operator*): opera físicamente el cargador (p. ej. Iberdrola, Zunder, Ionity).
- **eMSP** (*e-Mobility Service Provider*): proveedor que da al conductor una app/tarjeta para cargar en redes de varios CPO (p. ej. Plugsurfing, Electromaps, Shell Recharge).
- **Hub de roaming**: plataforma que conecta muchos CPO con muchos eMSP con un solo contrato técnico (Hubject — protocolo OICP; Gireve — OCPI; e-clearing.net — OCHP/OCPI).
- **NAP** (*National Access Point*): punto de acceso nacional de datos de movilidad de cada Estado miembro.

### 3.2 Protocolos y estándares
- **OCPI 2.2.1** (Open Charge Point Interface): estándar abierto CPO ↔ eMSP. Módulos clave: `Versions`, `Credentials`, `Locations`, `Tariffs`, `Tokens`, `Sessions`, `CDRs`, `Commands` (START_SESSION, STOP_SESSION, RESERVE_NOW, UNLOCK_CONNECTOR), `HubClientInfo`. **Usa su modelo de datos (Location → EVSE → Connector, Tariff) como modelo interno.**
- **OICP** (Hubject) y **OCHP**: protocolos alternativos de roaming.
- **DATEX II**: formato en el que muchos NAP publican datos de recarga.
- **ISO 15118 (Plug & Charge)**: el coche se autentica solo al enchufarlo (fase avanzada).
- **Identificadores eMI3**: `EVSE ID` tipo `ES*IBE*E12345*1` y `Party ID` tipo `ES*IBE`. Úsalos como clave principal de deduplicación.

### 3.3 Marco regulatorio que nos favorece
- **Reglamento (UE) 2023/1804 — AFIR** (aplicable desde el 13/04/2024):
  - Los operadores deben publicar **datos estáticos y dinámicos** (ubicación, conectores, potencia, disponibilidad, precio ad hoc) de forma gratuita a través de los **NAP** (art. 20; verificar fechas exactas de exigibilidad y actos delegados vigentes).
  - **Pago ad hoc** obligatorio (sin registro ni app) y, en puntos nuevos ≥ 50 kW, con lector de tarjeta bancaria/contactless; los existentes en la red TEN-T deben adaptarse según el calendario del reglamento.
  - **Transparencia de precios**: precio ad hoc por kWh como componente principal, visible antes de cargar.
- **España**: Real Decreto 184/2022 (actividad de recarga y obligaciones de información de los operadores). Verifica qué organismo y endpoint publica hoy los datos de puntos de recarga españoles.

### 3.4 Consecuencia para el diseño: tres niveles de integración
No vamos a integrar "compañía por compañía". Vamos a conseguir la cobertura total por capas:

| Nivel | Qué ofrece | Cómo se consigue | Fase |
|---|---|---|---|
| **N1 – Información** | Todos los puntos, conectores, potencia, precio publicado, estado | Datos abiertos AFIR/NAP + Open Charge Map + fuentes nacionales + comunidad | 1 |
| **N2 – Redirección** | "Cargar con…" → abre la app del operador en la ficha correcta o explica cómo pagar con tarjeta en el poste | Deep links / enlaces a tiendas + datos de métodos de pago | 1–2 |
| **N3 – Activación y pago propios** | Iniciar/parar carga, ver kWh en vivo y pagar desde nuestra app, con una cuenta y una tarjeta RFID propia | Ser **eMSP** con conexión **OCPI** directa y/o vía hub de roaming (Hubject, Gireve…) | 3 |

El N3 requiere contratos comerciales; el código debe estar listo (módulo OCPI eMSP + mocks + tests contra un simulador), pero **el MVP debe aportar valor sin ningún contrato**.

---

## 4. Usuarios y casos de uso

**Personas:**
1. **Laura, conductora urbana (Madrid)**: carga en la calle 1–2 veces/semana. Quiere saber qué punto cercano está libre y cuál es más barato.
2. **Javier, viajero de largo recorrido (Bilbao → Málaga)**: necesita planificar paradas en cargadores rápidos fiables y con buena disponibilidad.
3. **Turista europeo en España (o español en Francia/Portugal)**: no quiere instalar 6 apps locales.
4. **Gestora de flota de empresa**: necesita facturas unificadas por vehículo/conductor.

**Casos de uso principales:**
- CU1. Ver puntos de recarga cercanos con estado en tiempo real.
- CU2. Filtrar por conector compatible con mi coche, potencia, precio, operador, método de pago, 24 h, gratuito.
- CU3. Ver la ficha de una estación: conectores, precios, horario, fotos, valoraciones, incidencias.
- CU4. Saber cuánto me costará cargar del 20 % al 80 % en ese punto, con cada método de pago.
- CU5. Ir al cargador (navegación con Google Maps / Apple Maps / Waze).
- CU6. Activar la carga (N3) o abrir la app correcta (N2).
- CU7. Planificar una ruta con paradas de carga.
- CU8. Reportar un cargador averiado / añadir foto / valorar.
- CU9. Recibir aviso cuando un cargador ocupado quede libre o cuando termine mi carga.
- CU10. Consultar historial y descargar facturas.

---

## 5. Alcance funcional detallado

### 5.1 Mapa unificado (pantalla principal)
- Mapa vectorial (MapLibre) con **clusters** que muestran el número de puntos; al acercarse, pines individuales.
- **Pin** = forma según tipo (AC / DC rápido / DC ultrarrápido ≥ 150 kW) + color según estado + etiqueta con potencia máxima (p. ej. "150"). Estados: Disponible, Ocupado, Fuera de servicio, Desconocido. Colores **aptos para daltónicos** y acompañados de icono (nunca solo color).
- Barra de búsqueda: direcciones, ciudades, nombre de estación, operador.
- Chips de filtros rápidos: "Mi coche", "Rápida (≥50 kW)", "Disponible ahora", "Pago con tarjeta", "Gratis".
- Botón "Cerca de mí" y vista **lista** alternativa ordenada por distancia/precio/potencia.
- Atribución de mapas y datos visible.
- **Criterios de aceptación**: primer render del mapa con puntos < 1,5 s en 4G sobre la zona del usuario; desplazamiento fluido (60 fps) con > 1 millón de puntos en base de datos (gracias a teselas vectoriales y clustering en servidor).

### 5.2 Filtros avanzados
- Conector: Tipo 2, CCS2 (Combo 2), CHAdeMO, Schuko, Tipo 1, CCS1, otros.
- Potencia mínima/máxima (slider), tipo de corriente (AC 1F, AC 3F, DC).
- Operador(es) (multi-selección, con logo).
- Métodos de pago aceptados: tarjeta bancaria/contactless, app del operador, RFID, QR, Plug & Charge, **"compatible con mis tarjetas/apps"**.
- Disponibilidad: solo disponibles ahora / mostrar desconocidos.
- Precio máximo €/kWh, gratuito.
- Acceso: 24 h, público/restringido (clientes, hotel, parking de pago), aparcamiento cubierto, accesible PMR.
- Servicios cercanos: baños, restauración, tienda, wifi, zona infantil.
- Valoración mínima.
- Los filtros se guardan como **perfil** (p. ej. "Viaje largo", "Ciudad").

### 5.3 Ficha de estación
- Cabecera: nombre, operador (logo), dirección, distancia, valoración, estado global, "dato actualizado hace X min" y fuente del dato.
- Lista de **EVSE / conectores**: tipo, potencia, cable/enchufe, estado individual.
- **Precios**: componentes (€/kWh, €/min, tarifa fija por sesión, penalización por ocupación tras carga — *idle fee*), por método de pago. Si no hay precio publicado: "Precio no publicado" (nunca inventar).
- **Estimador de coste** para mi vehículo (sección 5.6).
- Horario, tipo de acceso, aparcamiento, altura máxima, servicios.
- Fotos (operador + comunidad), comentarios, incidencias recientes.
- Botones de acción: **Navegar**, **Cargar con [NOMBRE_APP]** (si N3 disponible), **Abrir app de [Operador]** (N2), **Pagar con tarjeta en el poste** (instrucciones), **Favorito**, **Avisarme cuando quede libre**, **Reportar problema**, **Compartir**.

### 5.4 Activación de carga (N2 y N3)
- **N2 (redirección)**: por cada operador guardar `ios_app_store_url`, `android_package`, `universal_link`/`deeplink_scheme` (solo si están documentados), y web. Orden: deep link a la estación → abrir app → tienda → web. Mostrar instrucciones si el operador requiere QR en el poste.
- **N3 (eMSP propio vía OCPI)**:
  - Flujo: seleccionar EVSE → confirmar tarifa y preautorización de pago → `Commands.START_SESSION` → pantalla de **sesión en curso** (kWh, potencia, tiempo, coste acumulado vía `Sessions`) → STOP desde la app o desenchufando → CDR → cobro final → factura.
  - Gestión de **tokens** (cuenta de la app y tarjeta RFID física opcional).
  - Manejo robusto de errores: timeouts de comandos, respuestas asíncronas por callback, EVSE ocupado, rechazo del operador. Nunca dejar al usuario sin feedback > 10 s.
- **Plug & Charge** (fase 4): preparar el modelo para contratos ISO 15118.

### 5.5 Cuentas, vehículos y "mis tarjetas"
- Registro/login: Apple, Google, email con enlace mágico. Uso anónimo permitido para el mapa.
- **Garaje**: uno o varios vehículos elegidos de una base de datos de modelos (marca, modelo, versión, batería útil, conectores, potencia máx. AC/DC, curva de carga si existe). Fuente: *open-ev-data* (Chargeprice) u otra con licencia compatible.
- **Mis tarjetas/apps**: el usuario marca qué cuentas tiene (p. ej. app de Zunder, tarjeta de Electromaps, suscripción de Ionity…) para personalizar precios y filtros de compatibilidad. **No** pedimos ni guardamos sus credenciales de otras apps.

### 5.6 Comparador y estimador de precios
- Entrada: vehículo, % batería actual y objetivo (por defecto 20 → 80 %), EVSE elegido.
- Cálculo:
  1. Energía = capacidad útil × (objetivo − actual) / eficiencia de carga (≈ 0,90 AC; ≈ 0,95 DC; configurable).
  2. Potencia efectiva = mín(potencia EVSE, potencia máx. del vehículo según corriente), ajustada por curva de carga si existe; tiempo estimado.
  3. Aplicar los componentes de la tarifa (energía, tiempo, tarifa fija, restricciones horarias, idle fee si se pasa del tiempo).
  4. Repetir para cada método de pago disponible (ad hoc, app del operador, tarjetas del usuario, nuestra cuenta).
- Salida: rango ("≈ 11–13 €"), tiempo estimado, coste por 100 km, método más barato destacado y aviso legal "estimación orientativa".
- Fuente opcional de tarifas de terceros eMSP: API comercial de Chargeprice (de pago → preguntar antes).
- **Tests unitarios exhaustivos** del motor de precios (tarifas por kWh, por minuto, mixtas, con tramos horarios, con IVA, redondeos).

### 5.7 Planificador de rutas
- Origen, destino, paradas intermedias, vehículo, batería al salir, mínimo a la llegada (p. ej. 10 %), preferencias (solo ≥ 150 kW, operadores preferidos/excluidos, evitar peajes).
- Motor de rutas autoalojado (**Valhalla**, con elevación) + modelo de consumo (velocidad, pendiente, temperatura si está disponible).
- Algoritmo: selección de paradas minimizando tiempo total (conducción + carga) con penalización por fiabilidad baja del cargador y estado no disponible.
- Salida: mapa con ruta, lista de paradas (cargador, llegada con X %, cargar hasta Y %, tiempo, coste), alternativas por cada parada, envío a Google Maps/Apple Maps/Waze.
- Recalcular en marcha si cambia la disponibilidad.

### 5.8 Comunidad y calidad del dato
- Reportes: "no funciona", "conector roto", "bloqueado por coche de combustión", "precio distinto", "no existe". Con foto opcional.
- Check-in tras cargar ("cargó bien a 120 kW"), valoraciones 1–5 y comentarios moderados.
- **Puntuación de fiabilidad** por estación (frescura del dato, reportes recientes, check-ins exitosos).
- Cola de moderación interna y panel admin básico.

### 5.9 Notificaciones
- "Cargador libre" (suscripción temporal a un EVSE).
- Sesión: iniciada, 80 %, finalizada, aviso antes de que empiece la idle fee.
- Avisos de ruta (cargador planificado pasó a fuera de servicio → alternativa).
- Todas configurables y con consentimiento explícito.

### 5.10 Historial, pagos y facturas (N3)
- Lista de sesiones: fecha, estación, kWh, duración, coste, factura PDF.
- Exportación CSV/PDF por periodo y por vehículo (útil para flotas y autónomos).
- Métodos de pago: tarjeta, Apple Pay, Google Pay, SEPA (vía Stripe). Al ser un **servicio físico**, se cobra fuera de las compras in-app de Apple/Google (cumple sus normas).
- Facturación conforme a normativa española (IVA, factura simplificada/completa con NIF).

### 5.11 Otros
- **Favoritos** y "estaciones recientes".
- **Modo offline**: caché de teselas y puntos de la zona/ruta descargada.
- **Android Auto y Apple CarPlay** (fase 4).
- **Widget** de cargadores favoritos con estado.
- Opcional (fase 4): precios de carburantes para híbridos enchufables usando la API pública del Ministerio (Geoportal de Gasolineras / ServiciosRESTCarburantes).

---

## 6. Fuentes de datos (estrategia de integración)

Cada fuente se implementa como un **adaptador** con la interfaz común:

```ts
interface ChargingDataSource {
  id: string;                    // "ocm", "es-nap", "fr-irve", ...
  license: { name: string; url: string; attribution: string };
  priority: number;              // mayor = más fiable
  countries: string[];           // ISO 3166-1 alpha-2
  fetchStatic(since?: Date): AsyncIterable<RawLocation>;
  fetchDynamic?(): AsyncIterable<RawStatusUpdate>;   // disponibilidad
  fetchTariffs?(): AsyncIterable<RawTariff>;
}
```

| Fuente | Tipo | Cobertura | Datos | Notas |
|---|---|---|---|---|
| **NAP de España** (datos AFIR / RD 184/2022) | Oficial, gratuita | ES | Estáticos + dinámicos + precio ad hoc | Localiza el endpoint vigente (candidatos: nap.dgt.es, nap.transportes.gob.es, datos.gob.es). Probablemente DATEX II. **Prioridad máxima en España.** |
| **NAP de otros países UE** | Oficial | UE | Igual | Francia: Base nationale IRVE (transport.data.gouv.fr). Alemania: Mobilithek + Ladesäulenregister (BNetzA). Países Bajos: NDW. Portugal: MOBI.E. Documenta cada uno en `docs/fuentes/`. |
| **Open Charge Map API** | Abierta (requiere API key gratuita) | Mundial | Estáticos, comunidad | Revisar licencia por registro; atribución obligatoria. Útil como relleno. |
| **OpenStreetMap** (`amenity=charging_station`) | Abierta (ODbL) | Mundial | Estáticos | Cuidado con las obligaciones ODbL si se mezcla en una base derivada. |
| **OCPI directo con CPO / hubs** | Contrato | UE | Estáticos, dinámicos, tarifas, sesiones | Fase 3. La mejor calidad. |
| **Proveedores comerciales** (Eco-Movement, Chargeprice) | De pago | UE | Datos consolidados / tarifas | Preguntar antes. |
| **Comunidad** | Propia | — | Reportes, fotos, check-ins | Moderación. |

**Orden de prioridad para resolver conflictos**: OCPI directo del CPO > NAP oficial > proveedor comercial > OCM/OSM > comunidad. Guardar siempre el **linaje** (de qué fuente sale cada campo y cuándo).

---

## 7. Arquitectura técnica

### 7.1 Stack

**App móvil**
- React Native + **Expo** (última SDK estable), TypeScript estricto, **Expo Router**.
- Mapa: `@maplibre/maplibre-react-native` con teselas vectoriales (MapTiler/OpenFreeMap o autoalojadas).
- Estado/datos: TanStack Query (servidor) + Zustand (UI).
- Formularios/validación: react-hook-form + zod (esquemas compartidos con backend).
- i18n: i18next. Almacenamiento seguro: expo-secure-store. Ubicación, notificaciones: expo-location, expo-notifications.
- Pagos: Stripe React Native SDK.
- Tests: Jest + React Native Testing Library; E2E con **Maestro**.
- Builds: EAS Build/Submit.

**Backend**
- Node.js LTS + **NestJS** + TypeScript.
- **PostgreSQL + PostGIS** (consultas geoespaciales). ORM: Drizzle (con SQL crudo para PostGIS).
- **Redis** (caché, rate limiting, estado dinámico caliente) + **BullMQ** (jobs de ingesta).
- **Martin** (servidor de teselas vectoriales desde PostGIS) para el mapa a escala europea.
- **Valhalla** autoalojado para rutas. Geocodificación: Photon/Nominatim autoalojado o proveedor (preguntar).
- Módulo **OCPI 2.2.1 rol eMSP** (sender/receiver) dentro del backend, con su propio prefijo de rutas.
- Auth: JWT de corta duración + refresh tokens; OAuth Apple/Google.
- Observabilidad: OpenTelemetry, Sentry (app + backend), Prometheus/Grafana.
- Infra: Docker Compose en local; despliegue en **región de la UE** (RGPD). CI/CD con GitHub Actions.

### 7.2 Diagrama

```
                 ┌───────────────────────── App móvil (Expo) ─────────────────────────┐
                 │ Mapa · Ficha · Filtros · Rutas · Sesión · Perfil · Pagos (Stripe)  │
                 └───────────────┬─────────────────────────────┬──────────────────────┘
                                 │ REST/JSON (v1)              │ Teselas .pbf
                        ┌────────▼─────────┐            ┌──────▼──────┐
                        │  API (NestJS)    │            │   Martin    │
                        │  auth · search   │            └──────┬──────┘
                        │  pricing · route │                   │
                        │  OCPI eMSP ◄─────┼──► CPOs / Hubs (Hubject, Gireve…)
                        └───┬────────┬─────┘                   │
                            │        │                         │
                     ┌──────▼──┐ ┌───▼────┐   ┌────────────────▼───┐
                     │  Redis  │ │Valhalla│   │ PostgreSQL+PostGIS │
                     └──────▲──┘ └────────┘   └────────▲───────────┘
                            │                          │
                     ┌──────┴──────────────────────────┴──────┐
                     │ Workers de ingesta (BullMQ)            │
                     │ NAP-ES · NAP-UE · OCM · OSM · OCPI     │
                     │ normalizar → deduplicar → puntuar      │
                     └────────────────────────────────────────┘
```

### 7.3 Estructura del monorepo (pnpm + Turborepo)

```
/apps
  /mobile          # Expo app
  /api             # NestJS (REST + OCPI)
  /workers         # ingesta y jobs programados
  /admin           # panel web mínimo (moderación, operadores, fuentes) — fase 2
/packages
  /shared          # tipos, esquemas zod, enums OCPI, utilidades
  /pricing         # motor de precios (puro, 100 % testeado)
  /ocpi            # cliente/servidor OCPI 2.2.1 reutilizable
  /ui              # componentes de diseño compartidos
/infra
  docker-compose.yml   # postgis, redis, martin, valhalla
  /migrations
/docs
  arquitectura.md · integraciones.md · fuentes/*.md · decisiones/ (ADRs)
```

---

## 8. Modelo de datos (basado en OCPI)

- `operators`: id, name, party_id (`ES*IBE`), country_code, website, logo_url, support_phone, app_ios_url, app_android_package, deeplink_template, universal_link_template, aliases[] (para deduplicar nombres).
- `locations`: id, operator_id, name, address, city, postal_code, country, `geom geography(Point,4326)`, opening_times (jsonb OCPI), facilities[], parking_type, access_type (público/restringido/clientes), payment_methods[] (`AD_HOC_CARD`, `OPERATOR_APP`, `RFID`, `QR`, `PLUG_AND_CHARGE`), images[], reliability_score, data_lineage (jsonb), last_static_update.
- `evses`: id, location_id, evse_id (eMI3), status (`AVAILABLE`, `CHARGING`, `BLOCKED`, `OUTOFORDER`, `INOPERATIVE`, `UNKNOWN`…), status_updated_at, status_source, capabilities[], physical_reference.
- `connectors`: id, evse_id, standard (enum OCPI: `IEC_62196_T2`, `IEC_62196_T2_COMBO`, `CHADEMO`, `DOMESTIC_F`…), format (`SOCKET`/`CABLE`), power_type (`AC_1_PHASE`, `AC_3_PHASE`, `DC`), max_voltage, max_amperage, max_electric_power, tariff_ids[].
- `tariffs`: id, operator_id, type (`AD_HOC_PAYMENT`, `REGULAR`, `PROFILE_*`), currency, elements (jsonb OCPI: price_components ENERGY/TIME/FLAT/PARKING_TIME + restrictions), vat_included, valid_from/to, source.
- `payment_options`: relación "con qué tarjeta/app/eMSP se puede cargar en qué operador y a qué precio".
- `vehicle_models`, `user_vehicles`, `users`, `user_memberships`, `favorites`, `reviews`, `reports`, `photos`, `status_subscriptions`.
- N3: `tokens`, `sessions`, `cdrs`, `payments`, `invoices`, `ocpi_partners` (credenciales por socio, cifradas).
- `data_sources`, `raw_records` (staging con hash para detectar cambios), `dedup_candidates` (cola de revisión).
- Índices: GiST en `geom`, índices por `evse_id`, `operator_id`, `status`.

---

## 9. Ingesta, normalización y deduplicación

1. **Ingesta** programada por fuente (estáticos: cada 6–24 h; dinámicos: cada 1–5 min o push OCPI). Idempotente, con reintentos y backoff.
2. **Normalización** al modelo OCPI: unidades (W/kW), enums de conectores, horarios, direcciones, nombres de operador (tabla de alias: "Iberdrola", "IBERDROLA CLIENTES", "Iberdrola | bp pulse" → mismo operador si procede).
3. **Deduplicación**:
   - Coincidencia exacta de `EVSE ID` → mismo EVSE.
   - Si no hay ID: candidatos en radio ≤ 50 m + similitud de operador (fuzzy) + nº y tipo de conectores + potencias → puntuación; ≥ umbral alto se fusiona; zona gris → `dedup_candidates` para revisión manual.
   - Fusión campo a campo según prioridad de fuente, guardando linaje.
4. **Frescura**: si el estado dinámico tiene > 30 min, mostrar "Desconocido" o "Último dato hace X".
5. **Calidad**: métricas por fuente (nº puntos, % con precio, % con estado dinámico, latencia) en un dashboard interno.
6. **Tests** con ficheros reales anonimizados/recortados de cada fuente (fixtures).

---

## 10. API del backend (v1)

```
GET  /v1/locations?bbox=…&filters…          # lista paginada (vista lista)
GET  /v1/locations/nearby?lat&lng&radius
GET  /v1/locations/:id                      # ficha completa
GET  /v1/locations/:id/price-estimate?vehicleId&fromSoc&toSoc
GET  /tiles/{z}/{x}/{y}.pbf                 # Martin, con filtros como parámetros
GET  /v1/search?q=…                         # estaciones, operadores, lugares
GET  /v1/operators · /v1/operators/:id
POST /v1/routes/plan
GET  /v1/vehicle-models?q=…
Auth: /v1/auth/apple · /v1/auth/google · /v1/auth/magic-link · /v1/auth/refresh
Usuario: /v1/me · /v1/me/vehicles · /v1/me/memberships · /v1/me/favorites
         /v1/me/data-export · DELETE /v1/me (RGPD)
Comunidad: POST /v1/reports · POST /v1/reviews · POST /v1/photos/upload-url
Avisos:   POST /v1/subscriptions/evse/:evseId
N3:       POST /v1/sessions (start) · POST /v1/sessions/:id/stop · GET /v1/sessions/:id
          GET /v1/me/sessions · GET /v1/me/invoices/:id.pdf
OCPI:     /ocpi/versions · /ocpi/2.2.1/{credentials,locations,tariffs,sessions,cdrs,tokens,commands}
Webhooks: POST /webhooks/stripe
```

- OpenAPI generado automáticamente; cliente tipado para la app generado desde él.
- Paginación por cursor, rate limiting, ETags y caché HTTP en endpoints públicos.

---

## 11. Diseño UX/UI

- **Principios**: uso con una mano, objetivos táctiles ≥ 48 dp, legible al sol, **modo oscuro**, mínimo texto, información crítica (estado, potencia, precio) siempre visible sin tocar.
- **Navegación inferior**: Mapa · Rutas · Favoritos · Actividad (sesiones) · Perfil.
- **Ficha** como *bottom sheet* sobre el mapa (medio/expandido).
- **Onboarding** de 3 pasos máximo: idioma → permiso de ubicación (explicando para qué) → "¿Qué coche tienes?" (saltable) → "¿Qué apps/tarjetas usas?" (saltable).
- Estados vacíos, de carga (skeletons) y de error diseñados para cada pantalla.
- Sistema de diseño en `packages/ui` con tokens (color, tipografía, espaciado) y componentes: PinMarker, StatusBadge, ConnectorIcon, PriceTag, PowerBadge, OperatorLogo, FilterChip, BottomSheet.
- Iconografía propia para conectores (Tipo 2, CCS2, CHAdeMO, Schuko…).
- **Accesibilidad**: WCAG 2.2 AA, lectores de pantalla (VoiceOver/TalkBack), escalado de fuentes dinámico, contraste, no depender solo del color.
- Entrega primero wireframes de baja fidelidad (en `docs/ux/`) antes de pulir la UI.

---

## 12. Pagos y modelo de negocio

- Stripe (Payment Intents con preautorización y captura al recibir el CDR; SCA/PSD2; Apple Pay, Google Pay, SEPA).
- Modelo de ingresos a validar: comisión por sesión en N3, suscripción premium (descuentos, planificador avanzado, sin publicidad), plan B2B para flotas (facturación centralizada, panel web), afiliación con operadores.
- La app **nunca** oculta el método más barato aunque no sea el nuestro: la transparencia es la propuesta de valor.

---

## 13. Seguridad, privacidad y cumplimiento

- **RGPD + LOPDGDD**: minimización de datos, base legal por tratamiento, consentimiento granular (ubicación, notificaciones, analítica), exportación y borrado de cuenta desde la app, registro de actividades de tratamiento, DPA con proveedores, alojamiento en la UE.
- Ubicación: solo "mientras se usa la app" salvo funciones que lo justifiquen; nunca almacenar trazas de ubicación sin consentimiento explícito.
- **OWASP MASVS** para la app y **OWASP ASVS/API Top 10** para el backend.
- Tokens en almacenamiento seguro; credenciales OCPI de socios cifradas en reposo; secretos solo por variables de entorno (`.env.example` sin valores reales); rotación de claves.
- Rate limiting, validación con zod en todas las entradas, logs sin datos personales.
- Cumplir **AFIR** (mostrar precio ad hoc), normativa de consumidores (precio final con IVA antes de cargar), normas de App Store/Google Play.
- Textos legales: Términos de uso, Política de privacidad, Política de cookies/SDKs, Aviso de atribución de datos.

---

## 14. Calidad, rendimiento y observabilidad

- Objetivos: arranque en frío < 2,5 s en gama media; mapa interactivo < 1,5 s; p95 de API < 300 ms; disponibilidad 99,9 %.
- Cobertura de tests: ≥ 90 % en `packages/pricing` y normalizadores; ≥ 70 % global backend; flujos críticos E2E en Maestro (buscar → filtrar → abrir ficha → navegar; login; añadir vehículo; [N3] iniciar/parar sesión con simulador OCPI).
- **Simulador OCPI** (CPO falso) en `infra/` para probar el módulo eMSP sin contratos.
- Lint (ESLint), formato (Prettier), typecheck estricto, commits convencionales, CI que bloquea merges con fallos.
- Crash reporting y métricas de negocio (búsquedas, aperturas de ficha, clics en "cargar", sesiones N3) con analítica respetuosa con la privacidad y solo con consentimiento.

---

## 15. Internacionalización

- Idiomas iniciales: español y inglés. Después: catalán, euskera, gallego, portugués, francés, alemán, italiano, neerlandés.
- Formatos locales de número, moneda (EUR y monedas no euro de Europa: CHF, GBP, NOK, SEK, DKK, PLN…), distancia (km/mi) y fecha.
- Ningún texto hardcodeado en componentes.

---

## 16. Roadmap por fases y criterios de aceptación

### Fase 0 — Cimientos
- Monorepo, CI, Docker Compose (PostGIS, Redis, Martin), esqueleto Expo y NestJS, sistema de diseño base, ADRs de las decisiones principales.
- **Hecho cuando**: `pnpm dev` levanta todo en local; la app abre en simulador iOS y emulador Android mostrando un mapa vacío; CI en verde.

### Fase 1 — MVP "Encuentra y compara" (N1 + N2, España y Portugal)
- Adaptadores: NAP de España (o documentar el bloqueo y usar mock), Open Charge Map, MOBI.E/Portugal si es viable.
- Normalización, deduplicación, teselas vectoriales, API pública.
- App: mapa con clusters y pines, filtros, búsqueda, ficha completa, navegación externa, "Abrir app del operador" (deep links), favoritos locales, modo oscuro, i18n es/en, atribuciones.
- **Hecho cuando**: se muestran los puntos públicos de España con su operador; los filtros funcionan; la ficha enseña conectores, potencia, precio publicado (si existe) y estado con su frescura; tests en verde; métricas de rendimiento cumplidas.

### Fase 2 — "Personaliza y planifica"
- Cuentas, garaje de vehículos, "mis tarjetas/apps", estimador de precios, comparador por método de pago, planificador de rutas, comunidad (reportes, fotos, valoraciones, fiabilidad), notificaciones "cargador libre", panel admin de moderación.
- Ampliar fuentes a Francia, Alemania, Italia, Países Bajos.

### Fase 3 — "Carga con una sola app" (N3)
- Módulo OCPI 2.2.1 eMSP completo, simulador OCPI, Stripe (preautorización/captura), sesiones en vivo, CDRs, facturas, tarjeta RFID propia (gestión de tokens), soporte al usuario.
- Preparar la integración con un hub (Hubject vía OICP y/o Gireve vía OCPI) — conexión real cuando existan contratos.

### Fase 4 — Europa completa y extras
- Resto de NAP europeos, Android Auto/CarPlay, Plug & Charge, modo offline avanzado, widgets, plan flotas B2B, precios de carburantes para PHEV.

---

## 17. Reglas finales para ti (agente)

- **SÍ**: interfaces antes que implementaciones; mocks realistas; tests primero en lógica crítica (precios, normalización, deduplicación, OCPI); documentar cada fuente y cada decisión; pedir confirmación en decisiones con coste o irreversibles.
- **NO**: scraping de apps/webs de operadores; inventar precios, estados o endpoints; guardar credenciales de terceros del usuario; enviar datos personales fuera de la UE; dejar claves en el código; ocultar que un dato es una estimación o está desactualizado.
- Cuando dudes entre dos opciones razonables, elige la más simple, documenta la alternativa en un ADR y sigue.

## 18. Primera tarea concreta

1. Investiga y documenta en `docs/fuentes/` el estado actual de: NAP de España (endpoint, formato, licencia, frecuencia, si exige registro), Open Charge Map API v3 y MOBI.E (Portugal). Indica cobertura estimada y problemas.
2. Propón (sin implementar aún) el esquema de base de datos final y la estructura del monorepo, con cualquier ajuste razonado a este documento.
3. Espera mi aprobación y luego ejecuta la **Fase 0** y la **Fase 1**.

---

## Anexo A — Operadores de referencia (lista orientativa, verificar y ampliar)

**España**: Iberdrola | bp pulse, Endesa X Way, Repsol (Waylet), Moeve (antes Cepsa), Zunder, Wenea, Tesla Supercharger, Ionity, Powerdot, Atlante, Electra, Easycharger, Etecnic, Galp, TotalEnergies, Shell Recharge, Plenitude (Be Charge), Naturgy, EDP, Endolla Barcelona (BSM) y otras redes municipales, supermercados y centros comerciales (Lidl, IKEA, Carrefour…), hoteles y concesionarios.

**Europa**: Ionity, Tesla, Fastned, Allego, EnBW, Aral pulse / bp pulse, Shell Recharge, TotalEnergies, Electra, Atlante, Powerdot, Enel X Way, Ewiva, Plenitude/Be Charge, Izivia (EDF), Freshmile, Vattenfall InCharge, E.ON Drive, Mer, Recharge, Circle K, Clever, Gridserve, InstaVolt, Pod Point, Osprey, y cientos de operadores regionales.

> Objetivo: la cobertura total llega por las fuentes agregadas (NAP/AFIR, OCM, hubs), **no** integrando cada operador a mano. La tabla `operators` se enriquece con logos, deep links y métodos de pago progresivamente.

## Anexo B — Glosario

- **AFIR**: Reglamento europeo de infraestructura de combustibles alternativos (UE 2023/1804).
- **CDR** (*Charge Detail Record*): registro final de una sesión con kWh, tiempo y coste.
- **CPO / eMSP / Hub / NAP**: ver sección 3.1.
- **DATEX II**: estándar europeo de intercambio de datos de tráfico y movilidad.
- **EVSE**: cada punto de carga que puede cargar un vehículo a la vez; contiene uno o varios conectores.
- **Idle fee**: penalización por dejar el coche conectado tras terminar la carga.
- **OCPI / OICP / OCHP**: protocolos de roaming de recarga.
- **Pago ad hoc**: pagar sin contrato ni registro previo (tarjeta bancaria, QR).
- **Plug & Charge (ISO 15118)**: autenticación y facturación automáticas al enchufar.
