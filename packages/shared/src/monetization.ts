/** Suscripción Premium: quita los anuncios. Ids y precios se configuran en App Store Connect. */

export const PREMIUM_ENTITLEMENT = 'premium';
export const PREMIUM_PRODUCT_IDS = {
  monthly: 'puntoscarga_premium_monthly',
  annual: 'puntoscarga_premium_annual',
} as const;

/** Periodo introductorio de una tienda (formato de RevenueCat: unidades + DAY/WEEK/MONTH/YEAR). */
export interface IntroPeriod {
  price: number;
  periodNumberOfUnits: number;
  periodUnit: string;
}

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** Días de prueba gratis (precio 0) o null si la oferta no es una prueba gratuita. */
export function freeTrialDays(intro: IntroPeriod | null | undefined): number | null {
  if (!intro || intro.price > 0 || intro.periodNumberOfUnits <= 0) return null;
  const perUnit = UNIT_DAYS[intro.periodUnit.toUpperCase()];
  return perUnit ? perUnit * intro.periodNumberOfUnits : null;
}

/** Ahorro (%) del plan anual frente a pagar 12 meses. */
export function annualSavingsPercent(monthlyPrice: number, annualPrice: number): number {
  if (monthlyPrice <= 0 || annualPrice <= 0) return 0;
  return Math.max(0, Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100));
}
