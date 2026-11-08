# ADR 0002 — Decisiones de la fase 2

Fecha: 8 nov 2026.

## 1. Motor de precios como paquete puro (`packages/pricing`)
Simula la carga de 1 % en 1 % con la curva DC del vehículo, el límite del punto y las fases AC
(un coche monofásico en un punto trifásico de 22 kW carga a ~7,4 kW). Se usa igual en la app (sin
conexión) y en la API (planificador). Eficiencias por defecto: 90 % AC, 95 % DC.

## 2. Garaje en el dispositivo, sin cuentas todavía
El prompt pedía cuentas en esta fase. Las cuentas exigen decidir proveedor (Apple/Google necesitan
cuentas de desarrollador; el enlace mágico, un servicio de correo) y aceptar datos personales en el
servidor. Mientras tanto:
- los vehículos se guardan en el móvil (con la ficha completa, para estimar sin conexión);
- la comunidad usa un **id anónimo por dispositivo** (`expo-crypto`) que el servidor solo guarda como
  hash SHA-256 con sal. Límites: 3 avisos por estación y 20 por dispositivo al día.
Cuando haya cuentas, el id de dispositivo se vincula a la cuenta.

## 3. Rutas con OSRM y lugares con Photon, tras interfaces
`RoutingProvider` y `Geocoder` (en `apps/api/src/routes/providers.ts`). Por defecto, los servidores
públicos de OSRM y Photon (komoot): **sirven para desarrollo, no para producción** (uso moderado según
sus normas). En producción, instancias propias (OSRM o Valhalla con el extracto de OSM de Europa) vía
`ROUTING_URL` / `GEOCODER_URL`. El geocodificador se limita a Europa y prioriza ciudades y municipios.

## 4. Algoritmo del planificador
Voraz y explicable: desde cada posición, de los cargadores alcanzables sin bajar del mínimo se
toman los del último 30 % del tramo y se elige el de más potencia efectiva para ese coche; se carga
lo justo para llegar (+3 % de margen) sin pasar del 80 % (configurable). Se descartan cargadores
fuera de servicio con dato fresco y los que la comunidad marca como averiados (≥2 avisos en 14 días
sin ningún «funciona»). Mejora futura: optimización global (Dijkstra sobre el grafo de cargadores)
cuando haya más datos de fiabilidad.

## 5. Fiabilidad
`score = 100·(W+1)/(W+P+2)` con decaimiento exponencial (vida media 14 días, ventana 90). La app
solo muestra el porcentaje con ≥3 avisos en 30 días; con menos enseña el recuento. Los avisos con
fecha ligeramente futura (desfase de reloj entre servidores) cuentan como recientes.
