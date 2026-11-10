import { isVersionBelow } from '@pc/shared';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { PUBLISHED_DATA_URL } from './config';

/** Ficha de la app en la App Store (ID de Apple 6832573777). */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6832573777';

const INSTALLED = Constants.expoConfig?.version ?? '0.0.0';

/**
 * Lee la versión mínima publicada (web/version.json) y dice si esta instalación debe actualizarse.
 * Sin conexión o si el fichero falla, NO bloquea: se puede seguir usando la app.
 */
export function useUpdateRequired(): boolean {
  const [required, setRequired] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    fetch(`${PUBLISHED_DATA_URL}/version.json?t=${Date.now()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        const min = (json as { minVersion?: unknown } | null)?.minVersion;
        if (!cancelled && typeof min === 'string') setRequired(isVersionBelow(INSTALLED, min));
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);
  return required;
}
