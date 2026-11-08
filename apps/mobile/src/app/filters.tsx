import {
  CONNECTOR_GROUP_KEYS,
  PAYMENT_METHODS,
  type ConnectorGroup,
  type PaymentMethod,
} from '@pc/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Section, T } from '../components/ui';
import { useOperators } from '../lib/queries';
import { useAppStore } from '../lib/store';
import { radius, spacing, useTheme } from '../lib/theme';

const POWER_STEPS = [0, 7, 22, 50, 100, 150, 250];

function toggle<T>(list: T[] | undefined, value: T): T[] {
  return list?.includes(value) ? list.filter((x) => x !== value) : [...(list ?? []), value];
}

export default function FiltersScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const filters = useAppStore((s) => s.filters);
  const patch = useAppStore((s) => s.patchFilters);
  const clear = useAppStore((s) => s.clearFilters);
  const operators = useOperators();
  const [opQuery, setOpQuery] = useState('');

  const visibleOperators = useMemo(() => {
    const all = operators.data ?? [];
    const q = opQuery.trim().toLowerCase();
    const selected = new Set(filters.operatorIds ?? []);
    const list = q ? all.filter((o) => o.name.toLowerCase().includes(q)) : all.slice(0, 24);
    // Los seleccionados siempre visibles aunque no estén en el top.
    const extra = all.filter((o) => selected.has(o.id) && !list.includes(o));
    return [...extra, ...list];
  }, [operators.data, opQuery, filters.operatorIds]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <Section title={t('filters.connectors')}>
          <View style={styles.wrap}>
            {CONNECTOR_GROUP_KEYS.map((g: ConnectorGroup) => (
              <Chip
                key={g}
                label={t(`connector.${g}`)}
                selected={!!filters.connectorGroups?.includes(g)}
                onPress={() => patch({ connectorGroups: toggle(filters.connectorGroups, g) })}
              />
            ))}
          </View>
        </Section>

        <Section title={t('filters.minPower')}>
          <View style={styles.wrap}>
            {POWER_STEPS.map((kw) => (
              <Chip
                key={kw}
                label={kw === 0 ? t('filters.any') : `≥ ${kw} kW`}
                selected={(filters.minPowerKw ?? 0) === kw}
                onPress={() => patch({ minPowerKw: kw || undefined })}
              />
            ))}
          </View>
        </Section>

        <Section title={t('filters.payment')}>
          <View style={styles.wrap}>
            {PAYMENT_METHODS.map((p: PaymentMethod) => (
              <Chip
                key={p}
                label={t(`payment.${p}`)}
                selected={!!filters.paymentMethods?.includes(p)}
                onPress={() => patch({ paymentMethods: toggle(filters.paymentMethods, p) })}
              />
            ))}
          </View>
        </Section>

        <Section title={t('filters.availability')}>
          <SwitchRow
            label={t('filters.onlyAvailable')}
            hint={t('filters.onlyAvailableHint')}
            value={!!filters.onlyAvailable}
            onChange={(v) => patch({ onlyAvailable: v })}
          />
          <SwitchRow
            label={t('filters.open24h')}
            value={!!filters.open24h}
            onChange={(v) => patch({ open24h: v })}
          />
        </Section>

        <Section title={t('filters.operators')}>
          <TextInput
            value={opQuery}
            onChangeText={setOpQuery}
            placeholder={t('filters.operatorsSearch')}
            placeholderTextColor={theme.textMuted}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          />
          <View style={styles.wrap}>
            {visibleOperators.map((o) => (
              <Chip
                key={o.id}
                label={`${o.name} (${o.siteCount})`}
                selected={!!filters.operatorIds?.includes(o.id)}
                onPress={() => patch({ operatorIds: toggle(filters.operatorIds, o.id) })}
              />
            ))}
          </View>
        </Section>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + spacing.md,
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <Button
          label={t('filters.clear')}
          variant="secondary"
          onPress={clear}
          style={{ flex: 1, marginRight: spacing.sm }}
        />
        <Button label={t('filters.apply')} onPress={() => router.back()} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <T>{label}</T>
        {hint ? (
          <T muted variant="small">
            {hint}
          </T>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.primary }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  input: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    fontSize: 15,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
