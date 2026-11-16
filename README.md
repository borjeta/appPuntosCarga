# Puntos de Carga · datos

Ingesta y publicación de los datos abiertos de puntos de recarga de vehículos eléctricos
(España, Portugal, Francia y Alemania) que usa la app **Puntos de Carga**.

- El workflow [Datos](.github/workflows/data.yml) descarga los datos oficiales de los Puntos de Acceso
  Nacionales (Reglamento UE 2023/1804), los normaliza y los publica en GitHub Pages:
  estaciones por teselas, vehículos y estado en tiempo real (cada 15 min).
- Las páginas de [privacidad](web/privacidad.html) y [soporte](web/soporte.html) de la app se sirven desde `web/`.
- No contiene secretos: las fuentes son públicas y la base de datos es un PostGIS temporal dentro de la ejecución.

El código de la app es privado.
