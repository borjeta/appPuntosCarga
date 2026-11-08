# Portugal — MOBI.E (Punto de Acceso Nacional)

| | |
|---|---|
| Infraestructura | `https://pgm.mobie.pt/integration/nap/evChargingInfra` (DATEX II v3, ≈ 180 MB) |
| Estado y tarifas | `https://pgm.mobie.pt/integration/nap/evActualStatus` (DATEX II v3, ≈ 40 MB) |
| Licencia | Datos abiertos del NAP de Portugal. **Pendiente verificar las condiciones exactas de reutilización** en [nap-portugal.imt-ip.pt](https://nap-portugal.imt-ip.pt) antes de publicar la app |
| Atribución | "MOBI.E / NAP Portugal" |
| Adaptador | `apps/workers/src/sources/pt-mobie.ts` (id `pt-mobie`, prioridad 80) |

## Contenido comprobado (7–8 nov 2026)

- 8.811 estaciones y 19.537 puntos; casi toda la red pública portuguesa pasa por MOBI.E.
- **Estado en tiempo real** por punto (disponible, cargando, averiado…): 19.508 de 19.537 estados
  casan con su punto. Se actualiza con `npm run status:watch` (cada 2 min).
- **Tarifas base del operador (OPC)**: €/kWh, €/min y € por sesión. No incluyen el margen del
  comercializador (CEME) ni impuestos; la app lo advierte junto al precio.
- **Proveedores aceptados** (`brandsAccepted`): códigos de los comercializadores con los que se puede
  cargar en cada punto. Base para el filtro "compatible con mis tarjetas" (fase 2).
- Horarios estructurados (`validPeriod` + días) o `OpenAllHours`.

## Notas

- Los nombres de sitio suelen ser códigos ("GMR-00022"): se usa la línea de dirección.
- El Party ID del operador se obtiene del EVSE ID (`PT*SGM*E*GMR*00022*01` → `PT*SGM`).
