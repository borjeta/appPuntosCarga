import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { parse } from 'csv-parse';

export type CsvEncoding = 'utf8' | 'latin1';

/**
 * Codificación de un CSV mirando su principio: UTF-8 si lleva BOM o si los primeros 256 KB son UTF-8
 * válido; si no, Latin-1 (ISO-8859-1). La Bundesnetzagentur pasó de UTF-8 a Latin-1 en nov. de 2026 y,
 * leído como UTF-8, las columnas con diéresis ("Längengrad") no casaban y salían 0 estaciones.
 */
export async function detectCsvEncoding(file: string): Promise<CsvEncoding> {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(256 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const head = buf.subarray(0, bytesRead);
    if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return 'utf8';
    // Se quitan los últimos bytes por si el corte parte un carácter multibyte.
    const sample = bytesRead === buf.length ? head.subarray(0, bytesRead - 4) : head;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample);
      return 'utf8';
    } catch {
      return 'latin1';
    }
  } finally {
    await fh.close();
  }
}

/** Recorre un CSV grande en streaming, fila a fila, como arrays de texto. */
export async function* csvRows(
  file: string,
  delimiter: string,
  encoding: CsvEncoding = 'utf8',
): AsyncGenerator<string[]> {
  const parser = createReadStream(file).pipe(
    parse({
      delimiter,
      encoding,
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
    }),
  );
  for await (const row of parser) yield row as string[];
}

/** "48,442398" o "48.44" → número; null si no es válido. */
export function parseDecimal(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "true", "TRUE", "True", "1" → true. */
export function parseBool(raw: string | undefined): boolean {
  return /^(true|1|oui|yes)$/i.test((raw ?? '').trim());
}

/** Unión de conjuntos (union-find) para agrupar filas que describen la misma estación. */
export class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    // Raíz = clave menor: el id resultante no depende del orden de las filas.
    if (ra !== rb) {
      if (ra < rb) this.parent.set(rb, ra);
      else this.parent.set(ra, rb);
    }
  }
}
