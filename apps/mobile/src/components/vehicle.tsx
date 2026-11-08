import { Ionicons } from '@expo/vector-icons';
import { estimateCharge, isCompatible, powerAt, type ChargeConnector } from '@pc/pricing';
import type { LocationDetail, VehicleSpec } from '@pc/shared';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { decimal, formatMinutes, price } from '../lib/format';
import { useActiveVehicle, useAppStore, vehicleName } from '../lib/store';
import { radius, spacing, useTheme } from '../lib/theme';
import { Button, Card, T } from './ui';

export function VehicleSummary({ v }: { v: VehicleSpec }) {
  const { t } = useTranslation();
  return (
    <T muted variant="small">
      {t('vehicles.battery', { kwh: v.usableBatteryKwh })} ·{' '}
      {t('vehicles.acdc', {
        ac: v.ac.maxPowerKw,
        dc: v.dc ? `${v.dc.maxPowerKw} kW` : t('vehicles.noDc'),
      })}{' '}
      · {v.connectorGroups.map((g) => t(`connector.${g}`)).join(', ')}
    </T>
  );
}

/** Selector de porcentaje con botones − / + (táctil y accesible, sin dependencias nativas). */
export function SocStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 5,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const theme = useTheme();
  const btn = (icon: 'remove' | 'add', next: number, disabled: boolean) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${icon === 'add' ? '+' : '−'}${step} %`}
      hitSlop={6}
      style={[styles.stepBtn, { backgroundColor: theme.surfaceAlt, opacity: disabled ? 0.4 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={theme.primary} />
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessibilityLabel={`${label}: ${value} %`}>
      <T variant="small" muted>
        {label}
      </T>
      <View style={styles.stepRow}>
        {btn('remove', Math.max(min, value - step), value <= min)}
        <T variant="heading" style={styles.stepValue}>
          {value} %
        </T>
        {btn('add', Math.min(max, value + step), value >= max)}
      </View>
    </View>
  );
}

/** Conectores de la estación con sus tarifas, en el formato del motor de precios. */
function stationConnectors(
  l: LocationDetail,
): Array<ChargeConnector & { tariffs: LocationDetail['evses'][number]['tariffs'] }> {
  return l.evses.flatMap((e) =>
    e.connectors.map((c) => ({
      standard: c.standard,
      powerType: c.powerType,
      maxPowerKw: c.maxPowerKw,
      tariffs: e.tariffs,
    })),
  );
}

/** Tarjeta de la ficha: cuánto tardará y costará cargar el coche activo en esta estación. */
export function EstimateCard({ location }: { location: LocationDetail }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const vehicle = useActiveVehicle();
  const window = useAppStore((s) => s.chargeWindow);
  const setWindow = useAppStore((s) => s.setChargeWindow);

  const estimate = useMemo(() => {
    if (!vehicle) return null;
    const connectors = stationConnectors(location).filter((c) => isCompatible(vehicle, c));
    if (!connectors.length) return { compatible: false as const };
    const best = connectors.reduce((a, b) =>
      powerAt(vehicle, b, 50) > powerAt(vehicle, a, 50) ? b : a,
    );
    return estimateCharge({
      vehicle,
      connector: best,
      fromSoc: window.from,
      toSoc: window.to,
      tariffs: best.tariffs,
    });
  }, [vehicle, location, window]);

  if (!vehicle) {
    return (
      <Card style={{ marginTop: spacing.lg }}>
        <T muted>{t('estimate.addVehicle')}</T>
        <Button
          label={t('vehicles.add')}
          icon="car-sport-outline"
          variant="secondary"
          onPress={() => router.push('/vehicles')}
          style={{ marginTop: spacing.md }}
        />
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: spacing.lg }}>
      <Pressable
        onPress={() => router.push('/vehicles')}
        accessibilityRole="button"
        style={styles.header}
      >
        <Ionicons name="car-sport" size={18} color={theme.primary} />
        <T variant="heading" style={{ flex: 1, marginLeft: spacing.sm }} numberOfLines={1}>
          {vehicleName(vehicle)}
        </T>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </Pressable>

      {!estimate || !estimate.compatible ? (
        <View style={[styles.warning, { backgroundColor: theme.surfaceAlt }]}>
          <Ionicons name="alert-circle" size={18} color={theme.status.OUT_OF_SERVICE} />
          <T style={{ marginLeft: spacing.sm, flex: 1 }}>{t('estimate.incompatible')}</T>
        </View>
      ) : (
        <>
          <View style={styles.steppers}>
            <SocStepper
              label={t('estimate.from')}
              value={window.from}
              max={window.to - 5}
              onChange={(from) => setWindow({ ...window, from })}
            />
            <SocStepper
              label={t('estimate.to')}
              value={window.to}
              min={window.from + 5}
              onChange={(to) => setWindow({ ...window, to })}
            />
          </View>
          <View style={styles.metrics}>
            <Metric label={t('estimate.time')} value={formatMinutes(estimate.minutes)} />
            <Metric
              label={t('estimate.energy')}
              value={t('estimate.kwh', { value: Math.round(estimate.gridKwh) })}
            />
            <Metric
              label={t('estimate.cost')}
              value={estimate.costs[0] ? `${price(estimate.costs[0].total)} €` : '—'}
            />
          </View>
          <T muted variant="small">
            {t('estimate.avgPower', {
              value: decimal(estimate.avgPowerKw),
              peak: decimal(estimate.peakPowerKw),
            })}
            {estimate.costs[0] ? '' : ` · ${t('estimate.noPrice')}`}
          </T>
          <T muted variant="small" style={{ marginTop: 4 }}>
            {t('estimate.disclaimer')}
          </T>
        </>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <T variant="small" muted>
        {label}
      </T>
      <T variant="heading">{value}</T>
    </View>
  );
}

/** Indica si un conector concreto sirve para el coche activo (para marcarlo en la ficha). */
export function useConnectorCompatibility() {
  const vehicle = useActiveVehicle();
  return (c: ChargeConnector): boolean | null => (vehicle ? isCompatible(vehicle, c) : null);
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.md,
  },
  steppers: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  stepper: { alignItems: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 64, textAlign: 'center' },
  metrics: { flexDirection: 'row', marginVertical: spacing.md },
});
