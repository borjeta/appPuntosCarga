import { freeTrialDays, PREMIUM_ENTITLEMENT } from '@pc/shared';
import { Linking } from 'react-native';
import { useAppStore } from '../store';
import { NATIVE_MONETIZATION, REVENUECAT_API_KEY } from './env';
import { useMonetization, type PlanOption } from './state';

type PurchasesModule = typeof import('react-native-purchases').default;
type CustomerInfo = import('react-native-purchases').CustomerInfo;
type Package = import('react-native-purchases').PurchasesPackage;

let Purchases: PurchasesModule | null = null;

/** Carga perezosa: en Expo Go el módulo nativo no existe y requerirlo fallaría. */
function lib(): PurchasesModule | null {
  if (!NATIVE_MONETIZATION || !REVENUECAT_API_KEY) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Purchases ??= (require('react-native-purchases') as typeof import('react-native-purchases'))
    .default;
  return Purchases;
}

const isPremium = (ci: CustomerInfo) => !!ci.entitlements.active[PREMIUM_ENTITLEMENT];

export async function initPurchases(): Promise<void> {
  const P = lib();
  if (!P) return;
  P.configure({ apiKey: REVENUECAT_API_KEY! });
  P.addCustomerInfoUpdateListener((ci) => useAppStore.getState().setPremium(isPremium(ci)));
  useMonetization.getState().set({ purchasesReady: true });
  try {
    useAppStore.getState().setPremium(isPremium(await P.getCustomerInfo()));
  } catch {
    // Sin conexión: se mantiene el último estado conocido.
  }
}

export async function loadPlans(): Promise<PlanOption[]> {
  const P = lib();
  if (!P) return [];
  const offering = (await P.getOfferings()).current;
  const entries: Array<['monthly' | 'annual', Package | null | undefined]> = [
    ['monthly', offering?.monthly],
    ['annual', offering?.annual],
  ];
  return entries
    .filter((e): e is ['monthly' | 'annual', Package] => !!e[1])
    .map(([id, pkg]) => ({
      id,
      priceString: pkg.product.priceString,
      price: pkg.product.price,
      trialDays: freeTrialDays(pkg.product.introPrice),
      pkg,
    }));
}

/** Compra un plan. Devuelve true si queda Premium activo; false si el usuario cancela. */
export async function buyPlan(plan: PlanOption): Promise<boolean> {
  const P = lib();
  if (!P) return false;
  try {
    const { customerInfo } = await P.purchasePackage(plan.pkg as Package);
    const premium = isPremium(customerInfo);
    useAppStore.getState().setPremium(premium);
    return premium;
  } catch (err) {
    if ((err as { userCancelled?: boolean }).userCancelled) return false;
    throw err;
  }
}

/** Restaurar compras (obligatorio en la App Store para quien cambia de móvil). */
export async function restorePurchases(): Promise<boolean> {
  const P = lib();
  if (!P) return false;
  const premium = isPremium(await P.restorePurchases());
  useAppStore.getState().setPremium(premium);
  return premium;
}

/** Abre la gestión de suscripciones del sistema (cancelar, cambiar de plan). */
export async function manageSubscription(): Promise<void> {
  const P = lib();
  if (!P) return;
  const info = await P.getCustomerInfo();
  if (info.managementURL) await Linking.openURL(info.managementURL);
}
