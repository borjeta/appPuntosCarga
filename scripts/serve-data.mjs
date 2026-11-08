// Sirve data/public (ficheros generados por `npm run ingest -- export`) como lo hará GitHub Pages:
// estático, comprimido con gzip y con CORS. Solo para desarrollo.
// Uso: npm run data:serve  (puerto 8090, o DATA_PORT)
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('../data/public', import.meta.url)));
const port = Number(process.env.DATA_PORT ?? 8090);
const types = { '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8' };

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = normalize(join(root, urlPath));
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  let info;
  try {
    info = statSync(file);
  } catch {
    res.writeHead(404).end('No encontrado');
    return;
  }
  if (!info.isFile()) {
    res.writeHead(404).end('No encontrado');
    return;
  }
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  if (/\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    res.writeHead(200, { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    createReadStream(file).pipe(createGzip()).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': info.size });
    createReadStream(file).pipe(res);
  }
}).listen(port, '0.0.0.0', () => {
  console.log(
    `Sirviendo ${root} en http://localhost:${port} (y en la IP del ordenador para Expo Go)`,
  );
});
