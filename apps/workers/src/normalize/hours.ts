import type { OpeningHours, RegularHours } from '@pc/shared';
import type { DatexHoursPeriod } from '../datex2/site';
import { mapWeekday } from '../datex2/mapping';

const ES_DAYS: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  domingo: 7,
};

const deaccent = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** "8:30" | "08:30:00.000" → "08:30". "24:00" se trata como fin del día "23:59". */
function hhmm(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  if (h === 24) return '23:59';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const isFullDay = (p: RegularHours) =>
  p.periodBegin === '00:00' && (p.periodEnd === '23:59' || p.periodEnd === '00:00');

export function buildOpeningHours(regular: RegularHours[], text: string | null): OpeningHours {
  const sorted = [...regular].sort(
    (a, b) => a.weekday - b.weekday || a.periodBegin.localeCompare(b.periodBegin),
  );
  const fullDays = new Set(sorted.filter(isFullDay).map((p) => p.weekday));
  const twentyFourSeven = fullDays.size === 7;
  return { twentyFourSeven, regularHours: twentyFourSeven ? [] : sorted, text };
}

/**
 * Horario del NAP español, publicado como texto:
 * "Miercoles (08:30 - 17:30) Lunes (00:00 - 23:59) Jueves (08:30 - 17:30) ..."
 */
export function parseSpanishHoursLabel(label: string | null): OpeningHours {
  if (!label?.trim()) return { twentyFourSeven: false, regularHours: [], text: null };
  const regular: RegularHours[] = [];
  const re = /([A-Za-zÁÉÍÓÚáéíóú]+)\s*\(\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*\)/g;
  for (const m of label.matchAll(re)) {
    const weekday = ES_DAYS[deaccent(m[1] ?? '')];
    const begin = hhmm(m[2] ?? '');
    const end = hhmm(m[3] ?? '');
    if (weekday && begin && end) regular.push({ weekday, periodBegin: begin, periodEnd: end });
  }
  if (!regular.length) return { twentyFourSeven: false, regularHours: [], text: label.trim() };
  return buildOpeningHours(regular, label.trim());
}

/** Horario estructurado DATEX II (validPeriod/applicableDay), como el de MOBI.E. */
export function parseDatexPeriods(type: string | null, periods: DatexHoursPeriod[]): OpeningHours {
  if (type && /OpenAllHours/i.test(type)) {
    return { twentyFourSeven: true, regularHours: [], text: null };
  }
  const regular: RegularHours[] = [];
  for (const p of periods) {
    const weekday = mapWeekday(p.day);
    const begin = hhmm(p.start);
    const end = hhmm(p.end);
    if (weekday && begin && end) regular.push({ weekday, periodBegin: begin, periodEnd: end });
  }
  return buildOpeningHours(regular, null);
}
