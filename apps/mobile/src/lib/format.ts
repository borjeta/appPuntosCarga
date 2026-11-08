import { formatKw, type PriceComponent } from '@pc/shared';
import i18n from './i18n';

const locale = () => (i18n.language === 'en' ? 'en-GB' : 'es-ES');

/** Número con decimales según el idioma ("50,5" en español). */
export const decimal = (v: number, digits = 1) =>
  v.toLocaleString(locale(), { maximumFractionDigits: digits });

export const kw = (value: number) => i18n.t('common.kw', { value: formatKw(value, locale()) });

export function price(value: number): string {
  return value.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function priceComponent(c: PriceComponent): string {
  const p = price(c.price);
  if (c.type === 'ENERGY') return i18n.t('detail.perKwh', { price: p });
  if (c.type === 'TIME') return i18n.t('detail.perMin', { price: p });
  return i18n.t('detail.perSession', { price: p });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export function minutesAgo(iso: string, now = Date.now()): number {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
}

/** "35 min" o "1 h 12 min". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  return m >= 60
    ? i18n.t('estimate.hoursMinutes', { h: Math.floor(m / 60), m: m % 60 })
    : i18n.t('estimate.minutes', { value: m });
}
