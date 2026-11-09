import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { annualSavingsPercent } from '@pc/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, T } from '../components/ui';
import { PRIVACY_URL } from '../lib/config';
import { openWebsite } from '../lib/links';
import {
  buyPlan,
  loadPlans,
  manageSubscription,
  restorePurchases,
} from '../lib/monetization/purchases';
import type { PlanOption } from '../lib/monetization/state';
import { useMonetization } from '../lib/monetization/state';
import { useAppStore } from '../lib/store';
import { radius, spacing, useTheme } from '../lib/theme';

/** Condiciones de uso estándar de Apple para apps sin EULA propio. */
const APPLE_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export default function PremiumScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const premium = useAppStore((s) => s.premium);
  const available = useMonetization((s) => s.purchasesReady);
  const [selected, setSelected] = useState<PlanOption['id']>('annual');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const plans = useQuery({ queryKey: ['plans'], queryFn: loadPlans, enabled: available });
  const monthly = plans.data?.find((p) => p.id === 'monthly');
  const annual = plans.data?.find((p) => p.id === 'annual');
  const chosen = plans.data?.find((p) => p.id === selected) ?? plans.data?.[0];

  const buy = useMutation({
    mutationFn: (plan: PlanOption) => buyPlan(plan),
    onSuccess: (ok) => {
      if (ok) {
        setMessage({ ok: true, text: t('premium.thanks') });
        setTimeout(() => router.back(), 1200);
      }
    },
    onError: (err) =>
      setMessage({ ok: false, text: t('premium.error', { message: (err as Error).message }) }),
  });
  const restore = useMutation({
    mutationFn: restorePurchases,
    onSuccess: (ok) =>
      setMessage({ ok, text: ok ? t('premium.restored') : t('premium.nothingToRestore') }),
    onError: (err) =>
      setMessage({ ok: false, text: t('premium.error', { message: (err as Error).message }) }),
  });

  const benefit = (icon: 'eye-off-outline' | 'flash-outline' | 'heart-outline', text: string) => (
    <View style={styles.benefit}>
      <Ionicons name={icon} size={22} color={theme.primary} />
      <T style={{ flex: 1, marginLeft: spacing.md }}>{text}</T>
    </View>
  );

  const planCard = (plan: PlanOption) => {
    const active = chosen?.id === plan.id;
    const savings =
      plan.id === 'annual' && monthly ? annualSavingsPercent(monthly.price, plan.price) : 0;
    return (
      <Pressable
        key={plan.id}
        onPress={() => setSelected(plan.id)}
        accessibilityRole="radio"
        accessibilityState={{ checked: active }}
        style={[
          styles.plan,
          { borderColor: active ? theme.primary : theme.border, backgroundColor: theme.surface },
        ]}
      >
        <Ionicons
          name={active ? 'radio-button-on' : 'radio-button-off'}
          size={22}
          color={active ? theme.primary : theme.textMuted}
        />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <T variant="heading">{t(plan.id === 'annual' ? 'premium.annual' : 'premium.monthly')}</T>
          <T muted variant="small">
            {t(plan.id === 'annual' ? 'premium.perYear' : 'premium.perMonth', {
              price: plan.priceString,
            })}
            {plan.trialDays ? ` · ${t('premium.trial', { days: plan.trialDays })}` : ''}
          </T>
        </View>
        {savings > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.status.AVAILABLE }]}>
            <T variant="small" style={{ color: '#fff', fontWeight: '700' }}>
              {t('premium.save', { percent: savings })}
            </T>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <Ionicons name="diamond" size={44} color={theme.primary} />
        <T variant="title" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          {t('premium.title')}
        </T>
      </View>

      <Card>
        {benefit('eye-off-outline', t('premium.benefitNoAds'))}
        {benefit('flash-outline', t('premium.benefitSame'))}
        {benefit('heart-outline', t('premium.benefitSupport'))}
      </Card>

      {premium ? (
        <Card style={{ marginTop: spacing.lg }}>
          <T variant="heading" style={{ color: theme.status.AVAILABLE }}>
            {t('premium.active')}
          </T>
          {Platform.OS !== 'web' ? (
            <Button
              label={t('premium.manage')}
              variant="secondary"
              onPress={() => void manageSubscription()}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </Card>
      ) : !available ? (
        <Card style={{ marginTop: spacing.lg }}>
          <T muted>{t('premium.unavailable')}</T>
        </Card>
      ) : plans.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={theme.primary} />
      ) : plans.data?.length ? (
        <View style={{ marginTop: spacing.lg }}>
          {[annual, monthly].filter((p): p is PlanOption => !!p).map(planCard)}
          <Button
            label={
              chosen?.trialDays
                ? t('premium.startTrial', { days: chosen.trialDays })
                : t('premium.subscribe')
            }
            onPress={() => chosen && buy.mutate(chosen)}
            style={{ marginTop: spacing.md, opacity: buy.isPending ? 0.5 : 1 }}
          />
          {chosen ? (
            <T muted variant="small" style={{ marginTop: spacing.md }}>
              {t(chosen.trialDays ? 'premium.termsTrial' : 'premium.terms', {
                days: chosen.trialDays ?? 0,
                price: chosen.priceString,
                period: t(chosen.id === 'annual' ? 'premium.year' : 'premium.month'),
              })}
            </T>
          ) : null}
        </View>
      ) : (
        <Card style={{ marginTop: spacing.lg }}>
          <T muted>{t('premium.noPlans')}</T>
        </Card>
      )}

      {message ? (
        <T
          style={{
            marginTop: spacing.md,
            color: message.ok ? theme.status.AVAILABLE : theme.danger,
          }}
        >
          {message.text}
        </T>
      ) : null}

      {available && !premium ? (
        <Button
          label={t('premium.restore')}
          variant="secondary"
          onPress={() => restore.mutate()}
          style={{ marginTop: spacing.lg, opacity: restore.isPending ? 0.5 : 1 }}
        />
      ) : null}

      <View style={styles.links}>
        <Pressable onPress={() => openWebsite(APPLE_EULA)} accessibilityRole="link">
          <T variant="small" style={{ color: theme.primary }}>
            {t('premium.termsOfUse')}
          </T>
        </Pressable>
        <T variant="small" muted>
          {' · '}
        </T>
        <Pressable onPress={() => openWebsite(PRIVACY_URL)} accessibilityRole="link">
          <T variant="small" style={{ color: theme.primary }}>
            {t('settings.privacyPolicy')}
          </T>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  benefit: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 2,
    marginBottom: spacing.sm,
  },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  links: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
});
