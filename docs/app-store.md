# Publicar en la App Store

Todo lo técnico está preparado en el repositorio. Esta guía recoge lo que hay que hacer con tus cuentas
y los textos de la ficha, listos para copiar.

## Ya preparado

| Requisito | Dónde |
|---|---|
| Identificador `com.borjeta.puntoscarga`, versión 1.0.0, solo iPhone (sin capturas de iPad) | `apps/mobile/app.json` |
| Icono 1024 px sin transparencia, iconos de Android y pantalla de arranque (claro/oscuro) | `apps/mobile/assets/` (fuente: `assets/source/icon.svg`, regenerar con `node scripts/render-icons.mjs`) |
| Permiso de ubicación solo "mientras se usa", explicado en español e inglés; sin permisos que no se usan | `app.json` + `apps/mobile/locales/` |
| Manifiesto de privacidad (APIs de "motivo obligatorio" de todas las librerías nativas) | `app.json → ios.privacyManifests` |
| Cifrado: solo HTTPS → sin trámites de exportación (`ITSAppUsesNonExemptEncryption = false`) | `app.json → ios.config` |
| Borrado de cuenta y datos dentro de la app (norma 5.1.1(v)) | Ajustes → Privacidad → Borrar mis datos |
| Política de privacidad y soporte publicados | https://borjeta.github.io/appPuntosCarga/privacidad.html · /soporte.html |
| Sin contenido libre de usuarios (norma 1.2): los avisos son solo de tipos predefinidos | `components/community.tsx` |
| Compilación en la nube (no hace falta Mac) con número de compilación automático | `apps/mobile/eas.json` |

Verificado generando el proyecto iOS en Linux (Docker): Info.plist, traducciones, manifiesto de privacidad e
icono correctos.

## Lo que tienes que hacer

### 1. Cuentas
1. **Apple Developer Program** (99 $/año): https://developer.apple.com/programs/enroll/ — como particular
   aparecerá tu nombre como vendedor en la tienda. Tarda de horas a un par de días en aprobarse.
2. **Expo** (gratis): https://expo.dev/signup

### 2. Supabase: función de borrado de cuenta
En el [SQL Editor](https://supabase.com/dashboard/project/mfbauxiyuqpfvmydedhk/sql/new) ejecuta
`supabase/migrations/20261108100000_delete_account.sql`. Sin ella, "Borrar mis datos" no puede borrar la
cuenta anónima del servidor (Apple lo comprueba).

### 3. Compilar y enviar (desde `apps/mobile`, en tu terminal)
```bash
npx eas-cli@latest login
npx eas-cli@latest init                          # vincula el proyecto (añade projectId a app.json)
npx eas-cli@latest build -p ios --profile production
```
EAS te pedirá iniciar sesión con tu Apple ID y creará los certificados y perfiles por ti.
Cuando termine (~15-25 min):
```bash
npx eas-cli@latest submit -p ios --latest
```
Si la app aún no existe en App Store Connect, el asistente la crea. Después copia su **Apple ID**
(App Store Connect → la app → Información general) en `eas.json → submit.production.ios.ascAppId`.

### 4. Probar en TestFlight
La compilación aparece en App Store Connect → TestFlight a los pocos minutos. Instálala en tu iPhone con
la app TestFlight y prueba: mapa, "Cerca", una ruta, un aviso de comunidad y "Borrar mis datos".
**Haz ahí las capturas de pantalla** (botones lateral + subir volumen).

### 5. Ficha de la tienda (App Store Connect)

**Categoría**: Navegación (principal), Viajes (secundaria). **Precio**: gratis.
**URL de soporte**: https://borjeta.github.io/appPuntosCarga/soporte.html
**URL de privacidad**: https://borjeta.github.io/appPuntosCarga/privacidad.html
**Derechos de contenido**: "Sí, tengo los derechos": los datos son abiertos (NAP de la DGT, CC BY; MOBI.E;
data.gouv.fr, Licence Ouverte; Bundesnetzagentur, CC BY 4.0; Open EV Data, MIT con atribución) y la app los atribuye en Ajustes → Fuentes de datos.

#### Español (España)
- **Nombre** (máx. 30): `Puntos de Carga` *(si está cogido, prueba otro; el nombre de la tienda puede
  diferir del que se ve bajo el icono)*
- **Subtítulo** (máx. 30): `Mapa de cargadores eléctricos`
- **Palabras clave** (máx. 100): `cargador,recarga,coche eléctrico,electrolinera,punto de carga,ruta,CCS,tipo 2,mapa,EV,enchufe`
- **Texto promocional** (máx. 170): `Todos los puntos de recarga públicos de España, Portugal, Francia y Alemania en un mapa, con estado en tiempo real, coste para tu coche y rutas con paradas.`
- **Descripción**:

```
Todos los puntos de recarga públicos de España, Portugal, Francia y Alemania en una sola app, sean de la compañía que sean: Iberdrola, Endesa X Way, Repsol, Tesla, Ionity, Zunder, Wenea, EDP, Galp, TotalEnergies, EnBW y cientos de operadores más.

MAPA UNIFICADO
• Más de 130.000 estaciones con sus conectores (CCS2, Tipo 2, CHAdeMO…) y potencia.
• Elige qué países descargar: funciona sin conexión con los datos guardados.
• Estado en tiempo real (libre, cargando, averiado) donde el operador lo publica.
• Filtros por conector, potencia, operador, pago con tarjeta y 24 horas.

TU COCHE, TU PRECIO
• Elige tu vehículo entre más de 1.200 modelos.
• Calcula cuánto tardarás y cuánto te costará cargar del 20 % al 80 % (o lo que elijas).
• Ve de un vistazo qué conectores son compatibles con tu coche.

RUTAS CON PARADAS DE CARGA
• Indica destino y batería de salida y la app propone dónde parar, cuánto cargar y cuánto tardarás.

COMUNIDAD
• Avisa si un cargador funciona o está averiado y consulta los avisos de otros conductores.

PRIVACIDAD
• Sin registro, sin publicidad y sin seguimiento. Tu ubicación se usa solo en el móvil.
• Funciona sin conexión con los últimos datos descargados.

Los datos proceden de los registros oficiales donde los operadores están obligados a publicar sus puntos de recarga (Reglamento UE 2023/1804): DGT (España), MOBI.E (Portugal), data.gouv.fr (Francia) y Bundesnetzagentur (Alemania).
```

#### English (U.K. / U.S.)
- **Name**: `Charging Points EV` · **Subtitle**: `EV charger map & trip planner`
- **Keywords**: `EV charger,charging station,electric car,charge map,route planner,CCS,type 2,Europe,Spain`
- **Promotional text**: `Every public charging point in Spain, Portugal, France and Germany on one map, with live availability, cost for your car and trips with charging stops.`
- **Description**:

```
Every public EV charging point in Spain, Portugal, France and Germany in one app, whatever the operator: Iberdrola, Endesa X Way, Repsol, Tesla, Ionity, TotalEnergies, EnBW and hundreds more.

• 130,000+ stations with connectors (CCS2, Type 2, CHAdeMO…) and power. Choose which countries to download.
• Live availability where the operator publishes it.
• Filters by connector, power, operator, card payment and 24 h access.
• Pick your car from 1,200+ models and see charging time and cost.
• Trip planner with charging stops.
• Community reports: tell others whether a charger works.
• No sign-up, no ads, no tracking. Works offline with the last downloaded data.

Data comes from the official National Access Points where operators must publish their charging points (EU Regulation 2023/1804).
```

#### Capturas (obligatorias: iPhone 6,9")
Hazlas en TestFlight con un iPhone grande (o se aceptan las de 6,5"). Sugeridas, 5:
1. Mapa con grupos de estaciones (Madrid o Lisboa).
2. Ficha de una estación de Lisboa con estado en tiempo real y precio.
3. Tarjeta "Estimación para tu coche".
4. Ruta Madrid → Málaga con paradas.
5. Filtros.

### 6. Privacidad de la app ("App Privacy" en App Store Connect)
Respuestas recomendadas (revísalas: eres el responsable de lo que declares):
- **¿Recoges datos?** Sí.
- **Ubicación → Ubicación precisa**: Funcionalidad de la app · No vinculada a la identidad · No usada para
  seguimiento. *(La posición se envía a OSRM/Photon al planificar rutas o buscar lugares.)*
- **Contenido del usuario → Otro contenido del usuario** (avisos de la comunidad): Funcionalidad de la
  app · No vinculado a la identidad · No usado para seguimiento.
- **Identificadores → ID de usuario** (cuenta anónima de Supabase): Funcionalidad de la app · No vinculado
  a la identidad · No usado para seguimiento.
- **Seguimiento (App Tracking Transparency)**: No.

### 7. Clasificación por edades y notas para la revisión
- Cuestionario de edad: todo "Ninguno" → **4+**. Contenido generado por usuarios: no (solo avisos predefinidos).
- **Notas para el revisor** (pegar):
```
No account or login is required. Location permission is optional (only "while using the app").
To see live availability and prices, search "Lisboa" on the map or open any station in Lisbon.
To try the trip planner: Trips tab → add a vehicle (e.g. "Tesla Model 3") → destination "Málaga".
Community reports are anonymous and limited to predefined types (no free text).
Settings → Privacy → Delete my data deletes the anonymous account and all its data.
Data source: official EU National Access Points for EV charging (Regulation 2023/1804).
```

## Riesgos conocidos antes de lanzar
- **Servicios públicos de rutas y lugares** (OSRM y Photon de demostración): con muchos usuarios conviene
  usar instancias propias o un proveedor con clave (ver `docs/integraciones.md`).
- **CAPTCHA** en los inicios de sesión anónimos de Supabase, contra abusos.
- **Android / Google Play**: para el mapa hace falta una clave de Google Maps (iOS usa Apple Maps y no la necesita).
