# ADR 0003 — Arquitectura sin servidor propio

Fecha: 8 nov 2026. Motivo: no contratar un servidor solo para la app en esta etapa.

## Decisión

- **Datos como ficheros estáticos.** La ingesta existente (workers + PostGIS) se ejecuta en GitHub
  Actions con un PostGIS temporal y exporta `manifest.json`, `stations.json`, `vehicles.json` y
  `status.json` (≈ 2 MB comprimidos en total) a GitHub Pages. Ids de estación estables
  (`<fuente>:<id externo>`) para que favoritos y avisos sobrevivan a cada publicación.
- **Motor de consultas en el dispositivo** (`packages/dataset`): mapa con agrupación, filtros,
  cercanía, búsqueda y fichas, con los mismos contratos que la API. Con datos reales: carga en
  ~0,3 s y consultas en milisegundos (medido en PC; en móvil, varias veces más lento pero aceptable).
- **Planificador en el dispositivo** (`packages/planner`): el mismo algoritmo para app y API; la
  app pide el trazado a OSRM y busca cargadores en el corredor con su propio motor.
- **Comunidad en Supabase** con inicio de sesión anónimo y RLS: lectura pública sin `user_id`,
  escritura solo en nombre propio, límites por usuario y moderación de enlaces en un trigger.
  Verificado con `supabase/tests/rls-check.mjs` (15 comprobaciones).
- La **API NestJS** se mantiene como modo opcional (`EXPO_PUBLIC_API_URL`) y para la fase 3.

## Consecuencias

- Coste fijo 0 € y la app funciona sin conexión con los últimos datos descargados.
- Estado en tiempo real cada ~15 min (antes 2 min) y sujeto a la puntualidad de GitHub Actions.
- El planificador en modo local aún no excluye cargadores marcados como averiados por la comunidad
  (la API sí): requiere una consulta agregada a Supabase (función RPC). Pendiente.
- Escala: con toda Europa habrá que trocear los datos por país.
- Riesgo de abuso de la comunidad: un atacante puede crear muchos usuarios anónimos; Supabase limita
  30 altas anónimas por hora e IP y se recomienda activar CAPTCHA antes del lanzamiento.
