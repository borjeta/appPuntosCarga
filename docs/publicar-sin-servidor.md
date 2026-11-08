# Publicar la app sin servidor propio (coste fijo: 0 €)

La app no necesita un servidor contratado. Estas son las tres piezas, todas con plan gratuito:

| Pieza | Servicio | Qué hace |
|---|---|---|
| Datos (estaciones, vehículos, estado) | **GitHub Actions + GitHub Pages** | El workflow `.github/workflows/data.yml` ejecuta la ingesta y publica ficheros estáticos (≈ 2 MB comprimidos). La app los descarga y trabaja con ellos en el móvil, también sin conexión. |
| Comunidad (avisos, fiabilidad) | **Supabase** | Base de datos con inicio de sesión anónimo y reglas de seguridad (RLS). |
| Rutas y lugares | **OSRM y Photon públicos** | La app los llama directamente. Válidos para empezar; ver "Límites". |

La API NestJS (`apps/api`) sigue en el repositorio como opción, pero la app no la usa salvo que se defina
`EXPO_PUBLIC_API_URL`.

---

## 1. GitHub: publicar los datos

1. Crea un repositorio **público** en GitHub y sube el proyecto (`git push`).
   - Público porque GitHub Pages y los minutos de Actions son gratis e ilimitados en repos públicos.
     Los datos ya son abiertos (registros oficiales), y el código no contiene secretos.
   - Si lo prefieres privado: GitHub Pages en repos privados requiere un plan de pago, y el plan
     gratuito da 2.000 minutos/mes de Actions (cambia el cron a cada hora o menos).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Datos → Run workflow** (con "Ingesta completa" marcado). Tarda unos 5-8 minutos.
4. Tus datos quedan en `https://<usuario>.github.io/<repositorio>/manifest.json`.

A partir de ahí se actualizan solos: estado en tiempo real cada 15 min e ingesta completa una vez al día.

> GitHub **desactiva los workflows programados tras 60 días sin actividad** en el repositorio. Si
> ocurre, basta con reactivarlo en la pestaña Actions (o hacer cualquier commit).

## 2. Supabase: comunidad

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com) (región UE, p. ej. Frankfurt o París).
2. **Authentication → Sign In / Providers → Allow anonymous sign-ins**: activar.
   - Recomendado más adelante: CAPTCHA (Turnstile o hCaptcha) para los inicios de sesión anónimos.
3. Crea la tabla y sus reglas, de una de estas dos formas:
   - **SQL Editor**: pega y ejecuta `supabase/migrations/20261108000000_community.sql`, o
   - **CLI**: `npx supabase link --project-ref <ref>` y `npx supabase db push`.
4. **Project Settings → API**: copia la *Project URL* y la *publishable key*.
5. Comprueba las reglas de seguridad contra tu proyecto (deben salir 15 ✔):
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=<clave> node supabase/tests/rls-check.mjs
   ```
   (El script crea avisos de prueba con ids `es:TEST-…`; puedes borrarlos desde el SQL Editor.)

> El plan gratuito **pausa los proyectos tras una semana sin uso**. Con la app en uso no ocurre; si se
> pausa, se reactiva desde el panel.

## 3. Configurar la app

En `apps/mobile/.env.local` (ver `apps/mobile/.env.example`):

```bash
EXPO_PUBLIC_DATA_URL=https://<usuario>.github.io/<repositorio>
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clave publishable>
```

Para builds de tienda (EAS), las mismas variables con `eas env:create`.

## Desarrollo local (todo en tu PC)

```bash
npm run db:up && npm run db:migrate
npm run ingest -- sites all && npm run ingest -- vehicles
npm run data:export        # genera data/public
npm run data:serve         # sirve data/public en :8090 (la app lo encuentra sola)
npx supabase start         # Supabase local en Docker (opcional, para la comunidad)
npm run dev:mobile
```

## Límites y cuándo habrá que pagar

| Límite | Valor aproximado (comprueba los actuales) | Qué hacer al superarlo |
|---|---|---|
| OSRM público | Servidor de demostración, uso moderado | OSRM/Valhalla propio u openrouteservice (clave gratuita, ~2.000 rutas/día) |
| Photon público | Uso razonable | Photon propio o un geocodificador de pago |
| Supabase gratuito | 500 MB de base de datos, 50.000 usuarios activos/mes | Plan Pro |
| GitHub Pages | 100 GB de tráfico/mes (≈ 50.000 descargas completas de datos) | Cloudflare Pages/R2 (gratis con más tráfico) |
| Datos de toda Europa | Un solo fichero dejaría de ser práctico (~1 M de puntos) | Ficheros por país; la app descarga los que use |

La **fase 3 (cargar y pagar desde la app)** sí necesitará un backend siempre disponible: los
operadores envían las sesiones de carga a tus direcciones OCPI y hay pagos de por medio.
