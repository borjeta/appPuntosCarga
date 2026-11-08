/** Normalizaciones de texto genéricas usadas por todos los adaptadores. */

const LOWERCASE_WORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'el',
  'y',
  'e',
  'i',
  'en',
  'a',
  'al',
  'da',
  'das',
  'do',
  'dos',
  "d'",
  "l'",
  'per',
  'por',
  'para',
  'con',
]);

const KEEP_UPPER = new Set([
  'bp',
  'edp',
  'bsm',
  'emaya',
  'sl',
  'sa',
  'ev',
  'gmbh',
  'ii',
  'iii',
  'iv',
  'cc',
  'n',
  'nº',
]);

/** "CENTRO COMERCIAL LA VAGUADA" → "Centro Comercial la Vaguada" (respeta texto ya mixto). */
export function smartTitleCase(input: string): string {
  const s = input.trim().replace(/\s+/g, ' ');
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
  // Solo tocar textos en MAYÚSCULAS (más del 70 % de letras en mayúscula).
  if (!letters.length || upper / letters.length < 0.7) return s;
  return s
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i > 0 && LOWERCASE_WORDS.has(word)) return word;
      if (KEEP_UPPER.has(word.replace(/[.,]/g, ''))) return word.toUpperCase();
      return word.replace(
        /(^|[-/(])(\p{L})/gu,
        (_m, sep: string, ch: string) => sep + ch.toUpperCase(),
      );
    })
    .join(' ');
}

const ARTICLE_SUFFIX =
  /^(.+),\s*((?:Illes|Les|Las|Los|La|El|L'|A|O|As|Os|Es|Sa|Ses|Comunidad(?: Foral)? de|Principado de|Región de|Regi[oó]n de|Comunitat)\b.*)$/i;

/** Formato INE invertido → natural: "Palmas, Las" → "Las Palmas"; "Balears, Illes" → "Illes Balears". */
export function reorderInverted(input: string | null): string | null {
  if (!input) return input;
  const m = ARTICLE_SUFFIX.exec(input.trim());
  if (!m) return input.trim();
  const [, base, prefix] = m as unknown as [string, string, string];
  const joiner = prefix.endsWith("'") ? '' : ' ';
  return `${prefix.trim()}${joiner}${base.trim()}`;
}

/** Un nombre sin espacios y con dígitos ("MA-Malaga-021", "GMR-00022") es un código interno, no un nombre. */
export function looksLikeCode(name: string | null | undefined): boolean {
  if (!name) return true;
  const s = name.trim();
  return !/\s/.test(s) && /\d/.test(s);
}

/** "De La Marina,S/N" → "De La Marina, S/N". */
export function tidyStreet(street: string | null): string | null {
  if (!street) return null;
  const s = smartTitleCase(street)
    .replace(/\s*,\s*/g, ', ')
    .replace(/,\s*$/, '');
  return s || null;
}

/** Normaliza un EVSE ID eMI3 ("es*ibd*e157215 " → "ES*IBD*E157215"). Devuelve null si no lo parece. */
export function normalizeEvseId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  // País (2 letras) * operador (3 alfanum.) * E... ; se admite sin separadores "ESIBDE157215".
  return /^[A-Z]{2}\*?[A-Z0-9]{3}\*?E[A-Z0-9*]+$/.test(s) ? s : null;
}

/** Normaliza un Party ID ("es*ibd" → "ES*IBD"). */
export function normalizePartyId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  return /^[A-Z]{2}\*[A-Z0-9]{3}$/.test(s) ? s : null;
}

/** Clave para comparar nombres: sin acentos, minúsculas, sin formas jurídicas ni signos. */
export function comparableName(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(
      /\b(s\.?\s?l\.?\s?u?|s\.?\s?a\.?\s?u?|s\.?\s?l\.?|lda|gmbh|sucursal en espana|spain|espana|iberia|clientes|services?|servicios|soluciones energeticas|energia|energy|e-?mobility|movilidad electrica)\b\.?/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
