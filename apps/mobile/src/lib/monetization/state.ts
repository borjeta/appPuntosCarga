import { create } from 'zustand';

export interface PlanOption {
  id: 'monthly' | 'annual';
  /** Precio localizado de la tienda ("2,99 €"). */
  priceString: string;
  price: number;
  /** Días de prueba gratis, si la oferta la incluye. */
  trialDays: number | null;
  /** Paquete de RevenueCat (opaco para la interfaz). */
  pkg: unknown;
}

interface MonetizationState {
  /** Anuncios inicializados y con consentimiento: ya se pueden mostrar banners. */
  adsReady: boolean;
  /** Compras disponibles (build nativa con claves de RevenueCat). */
  purchasesReady: boolean;
  set: (patch: Partial<Omit<MonetizationState, 'set'>>) => void;
}

/** Estado de sesión (no se guarda): si es Premium se guarda en el store principal. */
export const useMonetization = create<MonetizationState>()((set) => ({
  adsReady: false,
  purchasesReady: false,
  set: (patch) => set(patch),
}));
