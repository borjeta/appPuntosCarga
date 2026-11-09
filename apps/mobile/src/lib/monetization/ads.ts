import { Platform } from 'react-native';
import { useAppStore } from '../store';
import { NATIVE_MONETIZATION } from './env';
import { useMonetization } from './state';

type AdsModule = typeof import('react-native-google-mobile-ads');

let started = false;

function lib(): AdsModule | null {
  if (!NATIVE_MONETIZATION) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-google-mobile-ads') as AdsModule;
}

/**
 * Prepara los anuncios para quien no es Premium, en el orden que exige Google:
 * 1) consentimiento europeo (UMP), 2) permiso de seguimiento de Apple (ATT), 3) inicializar el SDK.
 */
export async function initAds(): Promise<void> {
  const m = lib();
  if (!m || started || useAppStore.getState().premium) return;
  started = true;
  try {
    const { canRequestAds } = await m.AdsConsent.gatherConsent();
    if (Platform.OS === 'ios') {
      const att = await import('expo-tracking-transparency');
      const { status } = await att.getTrackingPermissionsAsync();
      if (status === att.PermissionStatus.UNDETERMINED) await att.requestTrackingPermissionsAsync();
    }
    if (canRequestAds) {
      await m.default().initialize();
      useMonetization.getState().set({ adsReady: true });
    }
  } catch {
    started = false; // se reintentará en el próximo arranque
  }
}

/** ¿Hay que ofrecer "Privacidad de los anuncios" (cambiar el consentimiento)? */
export async function adsPrivacyOptionsRequired(): Promise<boolean> {
  const m = lib();
  if (!m) return false;
  try {
    const info = await m.AdsConsent.getConsentInfo();
    return (
      info.privacyOptionsRequirementStatus === m.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
    );
  } catch {
    return false;
  }
}

export async function showAdsPrivacyOptions(): Promise<void> {
  const m = lib();
  if (!m) return;
  await m.AdsConsent.showPrivacyOptionsForm();
}
