/**
 * Compañías: agrupan los operadores de puntos de recarga por la empresa que hay detrás, para buscar
 * "por proveedor de luz o por petrolera" sin conocer cada código de operador ni de país (Repsol es
 * ES*REP en España y PT*REP en Portugal; IONITY tiene un código en cada país).
 *
 * Se calcula en el dispositivo (y en la API) a partir del nombre comercial y el código de cada
 * operador, así que funciona con los datos ya publicados. Solo se incluyen relaciones comprobadas.
 */

export const COMPANY_KINDS = ['ELECTRIC', 'FUEL', 'NETWORK'] as const;
/** ELECTRIC: compañía eléctrica (proveedor de luz). FUEL: petrolera / gasolineras. NETWORK: red de recarga. */
export type CompanyKind = (typeof COMPANY_KINDS)[number];

export interface CompanyDef {
  id: string;
  name: string;
  kind: CompanyKind;
  /** Se prueba contra el nombre comercial del operador normalizado (minúsculas, sin acentos). */
  match: RegExp;
  /** Códigos de operador que pertenecen a la compañía aunque su nombre no lo diga. */
  operatorIds?: readonly string[];
  /** Otros nombres con los que la gente la busca (marcas anteriores, matriz…). */
  aliases?: readonly string[];
}

/** Charging Together SL: empresa conjunta Iberdrola | bp pulse (en Portugal publica ese nombre). */
const IBERDROLA_BP = ['ES*FCT', 'PT*FCT'] as const;

export const COMPANIES: readonly CompanyDef[] = [
  // Compañías eléctricas
  {
    id: 'iberdrola',
    name: 'Iberdrola',
    kind: 'ELECTRIC',
    match: /\biberdrola\b/,
    operatorIds: IBERDROLA_BP,
  },
  {
    id: 'endesa',
    name: 'Endesa',
    kind: 'ELECTRIC',
    match: /\bendesa\b/,
    aliases: ['enel', 'endesa x way'],
  },
  { id: 'edp', name: 'EDP', kind: 'ELECTRIC', match: /^edp\b/ },
  { id: 'naturgy', name: 'Naturgy', kind: 'ELECTRIC', match: /\bnaturgy\b/ },
  {
    id: 'acciona',
    name: 'Acciona',
    kind: 'ELECTRIC',
    match: /\bacciona\b/,
    aliases: ['acciona energia', 'acciona recarga'],
  },
  { id: 'fenie', name: 'Feníe Energía', kind: 'ELECTRIC', match: /\bfenie energia\b/ },
  {
    id: 'edf',
    name: 'EDF (Izivia)',
    kind: 'ELECTRIC',
    match: /\bizivia\b/,
    aliases: ['edf', 'izivia'],
  },
  { id: 'engie', name: 'ENGIE', kind: 'ELECTRIC', match: /\bengie\b/ },
  { id: 'enbw', name: 'EnBW', kind: 'ELECTRIC', match: /\benbw\b/ },
  { id: 'eon', name: 'E.ON', kind: 'ELECTRIC', match: /(^|\s)e\.on\b/, aliases: ['eon'] },
  { id: 'vattenfall', name: 'Vattenfall', kind: 'ELECTRIC', match: /\bvattenfall\b/ },
  { id: 'ewe', name: 'EWE Go', kind: 'ELECTRIC', match: /^ewe go\b/, aliases: ['ewe'] },
  // Petroleras y gasolineras
  { id: 'repsol', name: 'Repsol', kind: 'FUEL', match: /\brepsol\b/ },
  {
    id: 'moeve',
    name: 'Moeve (Cepsa)',
    kind: 'FUEL',
    match: /\b(moeve|cepsa)\b/,
    aliases: ['cepsa'],
  },
  { id: 'galp', name: 'Galp', kind: 'FUEL', match: /^galp/ },
  {
    id: 'bp',
    name: 'bp',
    kind: 'FUEL',
    match: /\b(bp|aral)\b/,
    operatorIds: IBERDROLA_BP,
    aliases: ['bp pulse', 'aral'],
  },
  { id: 'shell', name: 'Shell', kind: 'FUEL', match: /\bshell\b/, aliases: ['shell recharge'] },
  {
    id: 'totalenergies',
    name: 'TotalEnergies',
    kind: 'FUEL',
    match: /\btotal ?energies\b/,
    aliases: ['total'],
  },
  { id: 'plenoil', name: 'Plenoil', kind: 'FUEL', match: /\bplenoil\b/ },
  { id: 'prio', name: 'Prio', kind: 'FUEL', match: /^prio\b/ },
  { id: 'jet', name: 'JET', kind: 'FUEL', match: /^jet tankstellen\b/ },
  { id: 'orlen', name: 'ORLEN', kind: 'FUEL', match: /\borlen\b/ },
  // Redes de recarga
  {
    id: 'tesla',
    name: 'Tesla',
    kind: 'NETWORK',
    match: /^tesla(?!-car)\b/,
    aliases: ['supercharger'],
  },
  { id: 'ionity', name: 'IONITY', kind: 'NETWORK', match: /^ionity\b/ },
  { id: 'zunder', name: 'Zunder', kind: 'NETWORK', match: /^zunder\b/ },
  { id: 'wenea', name: 'Wenea', kind: 'NETWORK', match: /^wenea\b/ },
  { id: 'powerdot', name: 'Powerdot', kind: 'NETWORK', match: /^powerdot\b/ },
  { id: 'atlante', name: 'Atlante', kind: 'NETWORK', match: /^atlante\b/ },
  { id: 'electra', name: 'Electra', kind: 'NETWORK', match: /^(charg-)?electra\b/ },
  { id: 'allego', name: 'Allego', kind: 'NETWORK', match: /^allego\b/ },
  { id: 'fastned', name: 'Fastned', kind: 'NETWORK', match: /^fastned\b/ },
];

export const COMPANY_IDS: readonly string[] = COMPANIES.map((c) => c.id);
const BY_ID = new Map(COMPANIES.map((c) => [c.id, c]));

export function companyById(id: string): CompanyDef | undefined {
  return BY_ID.get(id);
}

/** Minúsculas y sin acentos ("Feníe Energía" → "fenie energia"). */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Compañías a las que pertenece un operador (normalmente una; la empresa conjunta Iberdrola | bp, dos). */
export function companiesOfOperator(operatorId: string, operatorName: string | null): string[] {
  const name = foldText(operatorName ?? '').trim();
  return COMPANIES.filter(
    (c) => c.operatorIds?.includes(operatorId) || (name !== '' && c.match.test(name)),
  ).map((c) => c.id);
}

export interface CompanyListItem {
  id: string;
  name: string;
  kind: CompanyKind;
  siteCount: number;
  /** Operadores (códigos) incluidos en los datos descargados. */
  operatorIds: string[];
}

/** Agrupa una lista de operadores con su número de estaciones en compañías (sin las que no tienen). */
export function aggregateCompanies(
  operators: ReadonlyArray<{ id: string; name: string; siteCount: number }>,
): CompanyListItem[] {
  const out = new Map<string, CompanyListItem>();
  for (const op of operators) {
    for (const id of companiesOfOperator(op.id, op.name)) {
      const def = BY_ID.get(id)!;
      const item = out.get(id);
      if (item) {
        item.siteCount += op.siteCount;
        item.operatorIds.push(op.id);
      } else {
        out.set(id, {
          id,
          name: def.name,
          kind: def.kind,
          siteCount: op.siteCount,
          operatorIds: [op.id],
        });
      }
    }
  }
  return [...out.values()].sort(
    (a, b) => b.siteCount - a.siteCount || a.name.localeCompare(b.name),
  );
}

/**
 * Palabras con las que se busca un tipo de compañía ("luz", "gasolinera"…) en español, inglés y
 * portugués. Ya normalizadas (sin acentos).
 */
const KIND_KEYWORDS: Record<CompanyKind, readonly string[]> = {
  ELECTRIC: [
    'luz',
    'electrica',
    'electricas',
    'electricidad',
    'electrico',
    'comercializadora',
    'compania electrica',
    'companias electricas',
    'proveedor de luz',
    'proveedores de luz',
    'electricity',
    'utility',
    'utilities',
    'eletricidade',
  ],
  FUEL: [
    'gasolinera',
    'gasolineras',
    'gasolina',
    'petrolera',
    'petroleras',
    'combustible',
    'carburante',
    'estacion de servicio',
    'estaciones de servicio',
    'gas station',
    'petrol',
    'petrol station',
    'fuel',
    'bomba de gasolina',
    'posto de combustivel',
  ],
  NETWORK: ['redes de recarga', 'red de recarga', 'charging network', 'cargadores rapidos'],
};

function kindMatches(kind: CompanyKind, q: string): boolean {
  // "luz" exacto; con 4+ letras basta el comienzo ("gasol" → gasolinera).
  return KIND_KEYWORDS[kind].some((k) => k === q || (q.length >= 4 && k.startsWith(q)));
}

/**
 * Compañías que encajan con lo que escribe el usuario: por nombre o alias (cada palabra debe empezar
 * alguna palabra del nombre) o por tipo ("luz" → todas las eléctricas).
 */
export function matchCompanies(
  items: readonly CompanyListItem[],
  query: string,
): CompanyListItem[] {
  const q = foldText(query).trim().replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  const words = q.split(' ');
  return items.filter((item) => {
    if (kindMatches(item.kind, q)) return true;
    const def = BY_ID.get(item.id);
    const names = [item.name, ...(def?.aliases ?? [])].map(foldText);
    return names.some((n) => {
      const tokens = n.split(/[\s().|-]+/).filter(Boolean);
      return words.every((w) => tokens.some((t) => t.startsWith(w)));
    });
  });
}
