import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Chip, Section, T } from '../../components/ui';
import { BACKEND_MODE } from '../../lib/backend';
import { DATA_ORIGIN } from '../../lib/config';
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
