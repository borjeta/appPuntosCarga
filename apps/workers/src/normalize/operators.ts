import { smartTitleCase } from './text';

/**
 * Catálogo curado de operadores: nombre comercial y enlaces verificados.
 * Solo se rellena lo que se ha comprobado; los enlaces a apps (deep links) se añadirán
 * cuando cada operador los documente (ver docs/integraciones.md). Si falta la app, la
 * app móvil abre una búsqueda en la tienda con el nombre comercial.
 */
export interface CuratedOperator {
  name: string;
  website?: string;
  appIosUrl?: string;
  appAndroidPackage?: string;
  deeplinkTemplate?: string;
}

export const OPERATOR_CATALOG: Record<string, CuratedOperator> = {
  'ES*ESX': { name: 'Endesa X Way' },
  'ES*IBD': { name: 'Iberdrola', website: 'https://www.iberdrola.es' },
  'ES*REP': { name: 'Repsol', website: 'https://www.repsol.es' },
  'ES*ETE': { name: 'Etecnic' },
  'ES*EDP': { name: 'EDP' },
  'ES*TCB': { name: 'TotalEnergies' },
  'ES*WEN': { name: 'Wenea', website: 'https://wenea.com' },
  'ES*FEN': { name: 'Feníe Energía' },
  'ES*PLE': { name: 'Plenoil' },
  'ES*PLC': { name: 'Plenoil' },
  'ES*BSM': { name: 'Endolla Barcelona (BSM)' },
  'ES*ARE': { name: 'Acciona' },
  'ES*EMA': { name: 'EMAYA' },
  'ES*DLP': { name: 'Galp' },
  'ES*ZUN': { name: 'Zunder', website: 'https://zunder.com' },
  'ES*TSL': { name: 'Tesla', website: 'https://www.tesla.com' },
  'ES*AEQ': { name: 'Qwello' },
  'ES*BEM': { name: 'Bonpreu' },
  'ES*MOE': { name: 'Moeve' },
  'ES*CRF': { name: 'Carrefour' },
  'ES*IOY': { name: 'IONITY', website: 'https://ionity.eu' },
  'ES*ALL': { name: 'Allego', website: 'https://www.allego.eu' },
  'ES*PRR': { name: 'Prio' },
  'ES*ATE': { name: 'Atlante' },
};

const LEGAL_SUFFIX =
  /[,\s]+(S\.?\s?L\.?\s?U\.?|S\.?\s?A\.?\s?U\.?|S\.?\s?L\.?\s?L\.?|S\.?\s?L\.?|S\.?\s?A\.?|S\.?\s?C\.?|SRL|SLU|SAU|LDA\.?|Lda\.?|GmbH(?: Sucursal en Espa[ñn]a)?|Sucursal en Espa[ñn]a|Unipessoal)\s*$/i;

/** "IBERDROLA CLIENTES S.A.U" → "Iberdrola Clientes"; "Superguimarães - Supermercados,lda" → "Superguimarães - Supermercados". */
export function prettifyOperatorName(legalName: string): string {
  let s = legalName.replace(/&amp;/g, '&').trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(LEGAL_SUFFIX, '').trim();
    if (next === s) break;
    s = next;
  }
  s = s.replace(/[,.\s]+$/, '');
  // Una sola palabra en mayúsculas suele ser la marca o unas siglas (IONITY, EMAYA): se respeta.
  if (/^[A-ZÀ-Þ0-9&-]+$/.test(s)) return s;
  return smartTitleCase(s || legalName.trim());
}

export function operatorDisplayName(partyId: string, legalName: string | null): string {
  return OPERATOR_CATALOG[partyId]?.name ?? (legalName ? prettifyOperatorName(legalName) : partyId);
}
