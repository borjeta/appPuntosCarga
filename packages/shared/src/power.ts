/** Clase de potencia para el icono del pin: AC, DC rápido (<150 kW) o DC ultrarrápido (≥150 kW). */
export type PowerClass = 'AC' | 'FAST' | 'ULTRA';

export const ULTRA_FAST_KW = 150;
export const FAST_KW = 50;

export function powerClass(maxPowerKw: number, hasDc: boolean): PowerClass {
  if (maxPowerKw >= ULTRA_FAST_KW) return 'ULTRA';
  if (hasDc || maxPowerKw >= FAST_KW) return 'FAST';
  return 'AC';
}

/** "7,4", "22", "150" — sin decimales innecesarios. */
export function formatKw(kw: number, locale = 'es-ES'): string {
  const rounded = kw >= 10 ? Math.round(kw) : Math.round(kw * 10) / 10;
  return rounded.toLocaleString(locale, { maximumFractionDigits: 1 });
}
