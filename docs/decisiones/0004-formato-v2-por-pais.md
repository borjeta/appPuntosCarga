# ADR 0004 — Datos por país: índice compacto + teselas (formato v2)

Fecha: 9 nov 2026. Motivo: añadir Francia y Alemania lleva el total a más de 150.000 estaciones; un único
fichero (~150 MB de JSON) no cabe en la memoria de un móvil ni es razonable descargarlo.

## Decisión
- **Índice por país** (`index-es.json`…): una fila-array por estación con id, nombre, posición, operador,
  potencia máxima/DC/AC, 24 h, máscaras de conectores y formas de pago, nº de puntos, ciudad, claves de
  estado en tiempo real y tarifa base. Es todo lo que necesitan mapa, filtros, cercanía, búsqueda y rutas.
- **Teselas de 0,5°** (`tiles/es/<x>_<y>.json`) con las fichas completas; la app solo baja la tesela de la
  estación que abre (y la guarda para usarla sin conexión).
- **El usuario elige países** en Ajustes (por defecto España y Portugal).
- El **planificador** usa conectores aproximados del índice (por grupo, potencia DC/AC máxima): suficiente
  para elegir paradas sin descargar fichas.
- **Publicación**: miles de ficheros. Para no volver a bajarlos de Pages cada 15 min (rozaría el límite de
  tráfico de GitHub Pages), el workflow guarda el sitio generado en la **caché de GitHub Actions** y la
  tarea de estado solo regenera `status.json`.

## Consecuencias
- Versión de datos 2: una app con v1 pide actualizar (aún no hay versiones publicadas, sin impacto).
- La búsqueda solo encuentra estaciones de los países descargados.
