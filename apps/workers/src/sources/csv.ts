import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';

/** Recorre un CSV grande en streaming, fila a fila, como arrays de texto. */
export async function* csvRows(file: string, delimiter: string): AsyncGenerator<string[]> {
  const parser = createReadStream(file).pipe(
    parse({
      delimiter,
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
