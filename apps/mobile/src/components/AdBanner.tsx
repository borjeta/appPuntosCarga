import { router } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { ADMOB_BANNER_ID } from '../lib/monetization/env';
import { useMonetization } from '../lib/monetization/state';
import { useAppStore } from '../lib/store';
import { spacing, useTheme } from '../lib/theme';
import { T } from './ui';

type AdsModule = typeof import('react-native-google-mobile-ads');

/**
 * Banner adaptativo encima de la barra de pestañas. No aparece para usuarios Premium, ni hasta que
 * hay consentimiento y el SDK está inicializado, ni en Expo Go / web.
 */
export function AdBanner() {
  const premium = useAppStore((s) => s.premium);
  const ready = useMonetization((s) => s.adsReady);
  if (premium || !ready) return null;
  return <Banner />;
}

function Banner() {
  const { t } = useTranslation();
  const theme = useTheme();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ads = require('react-native-google-mobile-ads') as AdsModule;
  const ref = useRef<InstanceType<AdsModule['BannerAd']>>(null);
  // iOS: el banner puede quedarse vacío al volver a primer plano; se recarga.
  ads.useForeground(() => {
    if (Platform.OS === 'ios') ref.current?.load();
  });
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      <ads.BannerAd
        ref={ref}
        unitId={ADMOB_BANNER_ID ?? ads.TestIds.ADAPTIVE_BANNER}
        size={ads.BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
      />
      <Pressable onPress={() => router.push('/premium')} hitSlop={8} accessibilityRole="button">
        <T variant="small" style={{ color: theme.primary, paddingVertical: 2 }}>
          {t('premium.removeAds')}
        </T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xs },
});
