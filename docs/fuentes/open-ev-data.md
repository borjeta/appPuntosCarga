# Open EV Data — catálogo de vehículos

| | |
|---|---|
| Repositorio | [KilowattApp/open-ev-data](https://github.com/KilowattApp/open-ev-data) |
| Fichero | `data/ev-data.json` (formato v1, ≈1,5 MB) |
| Licencia | **MIT con atribución obligatoria y visible** ("Open EV Data (https://github.com/KilowattApp/open-ev-data)") en una página "Acerca de", documentación o similar. La app la muestra en *Mis vehículos* y en *Fuentes de datos*. |
| Importador | `apps/workers/src/vehicles/open-ev-data.ts` → `npm run ingest -- vehicles` |

## Contenido (8 nov 2026)

- 1.321 modelos (1.282 turismos, 7 microcoches, 32 motos; la app solo ofrece turismos y microcoches).
- Batería útil, consumo medio, cargador AC (potencia y fases), DC (potencia y **curva de carga**), puertos.
- **Última actualización del dataset: 12 abr 2025.** Los modelos lanzados después no están; hay que
  vigilar el repositorio o complementar con otra fuente.

## Mapeo de puertos a conectores

`type2` → Tipo 2 · `type1` → Tipo 1 · `ccs` (o `tesla_ccs`) → CCS2, o CCS1 si la toma AC es Tipo 1 ·
`chademo` → CHAdeMO. `tesla_suc` (Supercharger antiguo) no se mapea: en los datos públicos los
Supercharger aparecen como CCS2.
