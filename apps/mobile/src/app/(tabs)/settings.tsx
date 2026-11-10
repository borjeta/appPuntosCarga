import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Chip, Section, T, type IconName } from '../../components/ui';
import { BACKEND_MODE } from '../../lib/backend';
import { DATA_ORIGIN, PRIVACY_URL, SUPPORT_URL } from '../../lib/config';
import { repository } from '../../lib/data/repository';
import { openWebsite } from '../../lib/links';
import { adsPrivacyOptionsRequired, showAdsPrivacyOptions } from '../../lib/monetization/ads';
import { deleteMyCommunityData } from '../../lib/supabase';
import {
  useActiveVehicle,
  useAppStore,
  vehicleName,
  type LanguagePreference,
  type ThemePreference,
} from '../../lib/store';
import { spacing, TOUCH, useTheme } from '../../lib/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { theme: themePref, setTheme, language, setLanguage } = useAppStore();
  const vehicle = useActiveVehicle();
  const resetAll = useAppStore((s) => s.resetAll);
  const premium = useAppStore((s) => s.premium);
  const adsPrivacy = useQuery({ queryKey: ['ads-privacy'], queryFn: adsPrivacyOptionsRequired });
  const queryClient = useQueryClient();
  const countries = useAppStore((s) => s.countries);
  const setCountries = useAppStore((s) => s.setCountries);
  const available = useQuery({
    queryKey: ['countries'],
    queryFn: async () => (await repository.ready()).availableCountries(),
    enabled: BACKEND_MODE === 'local',
  });
  const toggleCountry = async (cc: string) => {
    const next = countries.includes(cc) ? countries.filter((c) => c !== cc) : [...countries, cc];
    if (!next.length) return; // al menos un país
    setCountries(next);
    await repository.setCountries(next);
    await queryClient.invalidateQueries({
      predicate: (q) =>
        ['map', 'nearby', 'location', 'search', 'operators'].includes(String(q.queryKey[0])),
    });
  };
  const [deleteState, setDeleteState] = useState<{ ok: boolean; text: string } | null>(null);

  const doDelete = async () => {
    try {
      await deleteMyCommunityData();
      resetAll();
      queryClient.clear();
      setDeleteState({ ok: true, text: t('settings.deleted') });
    } catch (err) {
      setDeleteState({
        ok: false,
        text: t('settings.deleteError', { message: (err as Error).message }),
      });
    }
  };

  const confirmDelete = () => {
    if (Platform.OS === 'web') {
      void doDelete();
      return;
    }
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      { text: t('settings.deleteConfirm'), style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  const row = (icon: IconName, label: string, onPress: () => void, danger = false) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.link,
        { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: spacing.sm },
      ]}
    >
      <Ionicons name={icon} size={20} color={danger ? theme.danger : theme.primary} />
      <T style={{ flex: 1, marginLeft: spacing.md, color: danger ? theme.danger : theme.text }}>
        {label}
      </T>
      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      <Section title={t('settings.appearance')}>
        <View style={styles.wrap}>
          {(['system', 'light', 'dark'] as ThemePreference[]).map((v) => (
            <Chip
              key={v}
              label={t(`settings.theme.${v}`)}
              selected={themePref === v}
              onPress={() => setTheme(v)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('settings.language')}>
        <View style={styles.wrap}>
          {(['system', 'es', 'en'] as LanguagePreference[]).map((v) => (
            <Chip
              key={v}
              label={t(`settings.languages.${v}`)}
              selected={language === v}
              onPress={() => setLanguage(v)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('settings.vehicles')}>
        <Pressable
          onPress={() => router.push('/vehicles')}
          accessibilityRole="button"
          style={[styles.link, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="car-sport-outline" size={20} color={theme.primary} />
          <T style={{ flex: 1, marginLeft: spacing.md }} numberOfLines={1}>
            {vehicle ? vehicleName(vehicle) : t('vehicles.add')}
          </T>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
      </Section>

      {BACKEND_MODE === 'local' && available.data?.length ? (
        <Section title={t('settings.countries')}>
          <View style={styles.wrap}>
            {available.data.map((c) => (
              <Chip
                key={c.cc}
                label={`${t(`country.${c.cc}`, { defaultValue: c.cc })} · ${c.count.toLocaleString()}`}
                selected={countries.includes(c.cc)}
                icon={countries.includes(c.cc) ? 'checkmark' : 'add'}
                onPress={() => void toggleCountry(c.cc)}
              />
            ))}
          </View>
          <T muted variant="small">
            {t('settings.countriesHint')}
          </T>
        </Section>
      ) : null}

      <Section title={t('settings.data')}>
        <Pressable
          onPress={() => router.push('/sources')}
          accessibilityRole="button"
          style={[styles.link, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="library-outline" size={20} color={theme.primary} />
          <T style={{ flex: 1, marginLeft: spacing.md }}>{t('settings.sources')}</T>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
        <T muted variant="small" style={{ marginTop: spacing.sm }}>
          {t('settings.server')}: {DATA_ORIGIN}
          {BACKEND_MODE === 'local' ? ` · ${t('settings.localMode')}` : ''}
        </T>
      </Section>

      <Section title={t('settings.privacyTitle')}>
        {row('shield-checkmark-outline', t('settings.privacyPolicy'), () =>
          openWebsite(PRIVACY_URL),
        )}
        {row('help-buoy-outline', t('settings.support'), () => openWebsite(SUPPORT_URL))}
        {adsPrivacy.data
          ? row('megaphone-outline', t('premium.adsPrivacy'), () => void showAdsPrivacyOptions())
          : null}
        {row('trash-outline', t('settings.deleteData'), confirmDelete, true)}
        <T muted variant="small">
          {t('settings.deleteDataHint')}
        </T>
        {deleteState ? (
          <T
            variant="small"
            style={{
              marginTop: spacing.sm,
              color: deleteState.ok ? theme.status.AVAILABLE : theme.danger,
            }}
          >
            {deleteState.text}
          </T>
        ) : null}
      </Section>

      <Section title={t('settings.about')}>
        <Card>
          <T>{t('settings.version', { version: Constants.expoConfig?.version ?? '0.1.0' })}</T>
          <T muted variant="small" style={{ marginTop: spacing.sm }}>
            {t('settings.privacy')}
          </T>
        </Card>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH + 8,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
