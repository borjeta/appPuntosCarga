/**
 * ¿La versión instalada es anterior a la mínima exigida? Compara x.y.z parte a parte;
 * las partes que faltan cuentan como 0 ("1.1" == "1.1.0").
 */
export function isVersionBelow(installed: string, minimum: string): boolean {
  const parse = (v: string) =>
    v
      .trim()
      .split('.')
      .map((p) => Number.parseInt(p, 10) || 0);
  const a = parse(installed);
  const b = parse(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
