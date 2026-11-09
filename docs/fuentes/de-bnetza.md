# Alemania — Ladesäulenregister (Bundesnetzagentur)

| | |
|---|---|
| Página | [bundesnetzagentur.de/ladeinfrastruktur](https://www.bundesnetzagentur.de/ladeinfrastruktur) |
| Formato | CSV (~55 MB, `;`, coma decimal, UTF-8 con BOM), una fila por equipo con hasta 6 puntos |
| URL | Cambia en cada actualización (`Ladesaeulenregister_BNetzA_AAAA-MM-DD.csv`): se toma de la página oficial |
| Licencia | CC BY 4.0 — atribución "Bundesnetzagentur.de" |
| Adaptador | `apps/workers/src/sources/de-bnetza.ts` (id `de-bnetza`, prioridad 75) |

## Tratamiento
- Solo equipos `Status = In Betrieb` (116.423 de 116.443 el 1 sep 2026).
- Equipos del mismo operador en el mismo punto (~10 m) se agrupan en una estación; id estable = el
  menor `Ladeeinrichtungs-ID` del grupo.
- EVSE ID oficiales (`DEAEWE002501`) y Party ID del operador derivado de ellos (`DE*AEW`).
- Conectores: Typ 2 (toma/cable), CCS, CHAdeMO, Schuko, CEE; el resto, "otros".
- Pago: tarjeta (NFC o lector) → tarjeta bancaria; RFID; pago online → QR/web; Plug & Charge.
- Horario: "247" → 24 h; si no, días y franjas del registro.
- Advertencia oficial: el registro solo incluye a los operadores que completaron el procedimiento de
  notificación, así que no es exhaustivo.
