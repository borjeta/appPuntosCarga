# España — Punto de Acceso Nacional (DGT / MITECO)

| | |
|---|---|
| Dataset | [Puntos de recarga eléctrica para vehículos](https://nap.dgt.es/dataset/puntos-de-recarga-electrica-para-vehiculos) |
| URL | `https://nap.dgt.es/datex2/v3/miterd/EnergyInfrastructureTablePublication/electrolineras.xml` |
| Formato | DATEX II v3 (`EnergyInfrastructureTablePublication`), XML ≈ 84 MB, sin registro |
| Licencia | CC BY (atribución obligatoria: se muestra en la app) |
| Actualización | Diaria (la ingesta reutiliza la descarga durante 6 h) |
| Adaptador | `apps/workers/src/sources/es-nap-dgt.ts` (id `es-nap-dgt`, prioridad 80) |

## Contenido comprobado (7 nov 2026)

- 12.086 estaciones, 35.837 puntos de recarga, 43.022 conectores, 159 operadores.
- Los operadores remiten los datos al MITECO (Ley 7/2021, RD 184/2022) y la DGT los publica.
- Identificadores eMI3 en casi todos los puntos (`ES*IBD*E157215`), que usamos para deduplicar.
- Métodos de identificación/pago: app (11.322), RFID (10.719), tarjeta de crédito/débito o NFC (~3.500).

## Limitaciones

- **Sin estado en tiempo real ni precios.** No existe (todavía) una publicación de estados para
  España en el NAP. La app lo dice explícitamente ("sin datos en tiempo real") en vez de inventarlo.
- La ficha del dataset indica cobertura "excepto Cataluña y País Vasco" (texto genérico del NAP de
  tráfico); en la práctica sí aparecen estaciones de ambas (p. ej. Endolla Barcelona, Vitoria). Verificar
  la cobertura real frente a otras fuentes cuando se añada Open Charge Map.
- Muchos operadores ponen un código interno como nombre ("MA-Malaga-021"); en esos casos mostramos
  la dirección.
- El código postal pierde el cero inicial (`7011` → corregimos a `07011`).
- Provincias en formato INE invertido ("Balears, Illes") → se reordenan.
