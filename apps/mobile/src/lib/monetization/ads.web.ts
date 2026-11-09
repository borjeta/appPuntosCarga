// En web no hay anuncios.
export async function initAds(): Promise<void> {}
export async function adsPrivacyOptionsRequired(): Promise<boolean> {
  return false;
}
export async function showAdsPrivacyOptions(): Promise<void> {}
