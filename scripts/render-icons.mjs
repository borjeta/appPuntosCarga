// Genera los iconos y la imagen de arranque de la app a partir de un único diseño vectorial.
// Usa el Chrome instalado en el sistema (playwright-core, sin descargar navegadores).
// Uso: node scripts/render-icons.mjs  [CHROME_PATH=ruta a chrome]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const out = fileURLToPath(new URL('../apps/mobile/assets/', import.meta.url));
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/usr/bin/google-chrome');

const BLUE = '#0B6BCB';
const TEAL = '#0E8C8C';
const PIN = 'M512 868 C 430 768 262 610 262 432 A 250 250 0 1 1 762 432 C 762 610 594 768 512 868 Z';
const BOLT = 'M552 262 L 424 460 L 502 460 L 470 602 L 600 398 L 520 398 Z';

const gradient = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${BLUE}"/><stop offset="1" stop-color="${TEAL}"/></linearGradient></defs>`;

/** Marcador con rayo. `cut` = rayo recortado (transparente), para iconos monocromo. */
function mark({ pin, bolt, scale = 1, cut = false }) {
  const t = `translate(${512 * (1 - scale)} ${512 * (1 - scale)}) scale(${scale})`;
  if (cut) {
    return `<defs><mask id="m"><rect width="1024" height="1024" fill="#fff"/><path d="${BOLT}" fill="#000"/></mask></defs>
      <g transform="${t}"><path d="${PIN}" fill="${pin}" mask="url(#m)"/></g>`;
  }
  return `<g transform="${t}"><path d="${PIN}" fill="${pin}"/><path d="${BOLT}" fill="${bolt}"/></g>`;
}

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${body}</svg>`;
const background = `${gradient}<rect width="1024" height="1024" fill="url(#bg)"/>`;

const variants = [
  // iOS y tiendas: opaco, sin transparencia (Apple lo exige).
  { file: 'icon.png', size: 1024, opaque: true, body: background + mark({ pin: '#fff', bolt: BLUE, scale: 0.86 }) },
  // Android (icono adaptativo): capas separadas; el primer plano dentro de la zona segura (≈66 %).
  { file: 'android-icon-background.png', size: 1024, opaque: true, body: background },
  { file: 'android-icon-foreground.png', size: 1024, body: mark({ pin: '#fff', bolt: BLUE, scale: 0.58 }) },
  { file: 'android-icon-monochrome.png', size: 1024, body: mark({ pin: '#fff', scale: 0.58, cut: true }) },
  // Pantalla de arranque (fondo transparente; el color lo pone la configuración).
  { file: 'splash-icon.png', size: 1024, body: mark({ pin: BLUE, bolt: '#fff' }) },
  { file: 'splash-icon-dark.png', size: 1024, body: mark({ pin: '#fff', bolt: BLUE }) },
  { file: 'favicon.png', size: 48, opaque: true, body: background + mark({ pin: '#fff', bolt: BLUE, scale: 0.9 }) },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath });
for (const v of variants) {
  const page = await browser.newPage({ viewport: { width: v.size, height: v.size }, deviceScaleFactor: 1 });
  const html = `<html><body style="margin:0;background:transparent">
    <div style="width:${v.size}px;height:${v.size}px">${svg(v.body).replace('width="1024" height="1024"', `width="${v.size}" height="${v.size}"`)}</div></body></html>`;
  await page.setContent(html);
  await page.locator('div').screenshot({ path: join(out, v.file), omitBackground: !v.opaque });
  await page.close();
  console.log(`✔ ${v.file} (${v.size}×${v.size}${v.opaque ? ', opaco' : ', transparente'})`);
}
await browser.close();
