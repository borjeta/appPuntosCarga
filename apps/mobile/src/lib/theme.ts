import type { PowerClass, SiteStatus } from '@pc/shared';
import { useColorScheme } from 'react-native';
import { useAppStore } from './store';

/** Tokens de diseño. El estado nunca se comunica solo con color: siempre va con icono y texto. */
const light = {
  dark: false,
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  text: '#14161A',
  textMuted: '#5B616B',
  border: '#DCDFE4',
  primary: '#0B6BCB',
  onPrimary: '#FFFFFF',
  danger: '#C62828',
  // Estados (paleta distinguible con daltonismo: azul/naranja/rojo-magenta/gris)
  status: {
    AVAILABLE: '#1B8A4B',
    OCCUPIED: '#C76A00',
    OUT_OF_SERVICE: '#B42357',
    UNKNOWN: '#7A808A',
  } satisfies Record<SiteStatus, string>,
  power: {
    AC: '#2F6FDB',
    FAST: '#0E8C8C',
    ULTRA: '#6B3FD1',
  } satisfies Record<PowerClass, string>,
};

const dark: typeof light = {
  dark: true,
  bg: '#0E1013',
  surface: '#181B20',
  surfaceAlt: '#22262D',
  text: '#F1F3F5',
  textMuted: '#A3A9B3',
  border: '#2E333B',
  primary: '#5AA6F0',
  onPrimary: '#06223D',
  danger: '#EF6B6B',
  status: {
    AVAILABLE: '#3CC57A',
    OCCUPIED: '#F2A33A',
    OUT_OF_SERVICE: '#F06292',
    UNKNOWN: '#8D939C',
  },
  power: {
    AC: '#5A8EF0',
    FAST: '#2BB3B3',
    ULTRA: '#9573F0',
  },
};

export type Theme = typeof light;

export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useAppStore((s) => s.theme);
  const isDark = pref === 'system' ? system === 'dark' : pref === 'dark';
  return isDark ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
/** Objetivo táctil mínimo (sección 11 del prompt). */
export const TOUCH = 48;
