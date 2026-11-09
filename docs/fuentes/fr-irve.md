# Francia — Base nationale des IRVE (data.gouv.fr)

| | |
|---|---|
| Dataset | [Fichier consolidé des bornes de recharge](https://www.data.gouv.fr/fr/datasets/fichier-consolide-des-bornes-de-recharge-pour-vehicules-electriques/) |
| Formato | CSV (~110 MB), esquema IRVE estático v2.3, una fila por punto de carga (PDC) |
| URL | Cambia a diario: se resuelve con la API de data.gouv.fr (recurso "Consolidation de la dernière version") |
| Licencia | Licence Ouverte / Etalab 2.0 (atribución) |
| Adaptador | `apps/workers/src/sources/fr-irve.ts` (id `fr-irve`, prioridad 75) |

## Tratamiento
- La consolidación junta varios publicadores y el mismo punto aparece repetido con ids de estación
  distintos (p. ej. ChargePoint y RAIDEN publican el PDC `ATHTBE1012062`): se agrupan las filas que
  comparten id de PDC (*union-find*) y se cuenta cada PDC una vez.
- Id de estación: `id_station_itinerance` si es válido (`FR*XXX*P…`); si no ("Non concerné", vacío),
  posición redondeada (~10 m) + operador.
- Se descartan los puntos con `condition_acces = "Accès réservé"` (la app es de recarga pública).
- Potencia: en cargadores rápidos la toma Tipo 2 se limita a 22 kW (la potencia nominal es la DC);
  valores en vatios (>1000) se convierten a kW.
- Pago: `paiement_cb` → tarjeta; `paiement_acte` (pago puntual sin contrato) → QR/web; `paiement_autre` → RFID.
- Sin estado en tiempo real por ahora (existe un IRVE dinámico consolidado: pendiente).
