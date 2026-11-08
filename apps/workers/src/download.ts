import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const USER_AGENT = 'PuntosCargaIngest/0.1 (+https://github.com/)';

export function cacheDir(): string {
  return resolve(
    process.env.INGEST_CACHE_DIR || join(__dirname, '..', '..', '..', 'data', 'cache'),
  );
}

/**
 * Descarga `url` a la caché local (escritura atómica) y devuelve la ruta.
 * Reutiliza el fichero si es más reciente que `maxAgeMinutes`, salvo `force`.
 */
export async function downloadToCache(
  url: string,
  fileName: string,
  { maxAgeMinutes, force = false }: { maxAgeMinutes: number; force?: boolean },
): Promise<string> {
  const target = join(cacheDir(), fileName);
  if (!force) {
    const info = await stat(target).catch(() => null);
    if (info && Date.now() - info.mtimeMs < maxAgeMinutes * 60_000) return target;
  }
  await mkdir(dirname(target), { recursive: true });
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' },
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!res.ok || !res.body) throw new Error(`Descarga fallida ${url}: HTTP ${res.status}`);
  const tmp = `${target}.part`;
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
  await rename(tmp, target);
  return target;
}

export function readText(file: string): AsyncIterable<string> {
  return createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
}
