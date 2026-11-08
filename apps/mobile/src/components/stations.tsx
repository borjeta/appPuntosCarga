import { Ionicons } from '@expo/vector-icons';
import {
  formatDistance,
  formatKw,
  powerClass,
  type MapCluster,
  type MapSite,
  type NearbySite,
  type SiteStatus,
} from '@pc/shared';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useActiveVehicle, useAppStore } from '../lib/store';
import { radius, spacing, TOUCH, useTheme } from '../lib/theme';
import { Chip, T, type IconName } from './ui';

export const STATUS_ICON: Record<SiteStatus, IconName> = {
  AVAILABLE: 'checkmark-circle',
  OCCUPIED: 'time',
  OUT_OF_SERVICE: 'close-circle',
  UNKNOWN: 'help-circle',
};

export function StatusBadge({
  status,
  available,
  total,
}: {
  status: SiteStatus;
  available?: number | null;
  total?: number;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const color = theme.status[status];
  const label =
    status !== 'UNKNOWN' && available != null && total
      ? t('status.availableCount', { available, total })
      : t(`status.${status}`);
  return (
    <View style={styles.badge} accessibilityLabel={label}>
      <Ionicons name={STATUS_ICON[status]} size={16} color={color} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

/**
 * Pin de estación: el color de fondo indica la clase de potencia (AC / rápida / ultrarrápida)
 * y el punto de la esquina, el estado (con icono, no solo color).
 */
export function SitePin({ site, selected }: { site: MapSite; selected?: boolean }) {
  const theme = useTheme();
  const cls = powerClass(site.maxPowerKw, site.hasDc);
  const bg = theme.power[cls];
  return (
    <View style={styles.pinWrap}>
      <View
        style={[
          styles.pin,
          { backgroundColor: bg, borderColor: selected ? theme.text : '#FFFFFF' },
          selected && styles.pinSelected,
        ]}
      >
        <Ionicons name={cls === 'AC' ? 'flash-outline' : 'flash'} size={11} color="#FFFFFF" />
        <Text style={styles.pinText}>{formatKw(site.maxPowerKw)}</Text>
      </View>
      {site.status !== 'UNKNOWN' ? (
        <View style={[styles.pinStatus, { backgroundColor: theme.status[site.status] }]}>
          <Ionicons name={STATUS_ICON[site.status]} size={10} color="#FFFFFF" />
        </View>
      ) : null}
      <View style={[styles.pinTail, { borderTopColor: bg }]} />
    </View>
  );
}

export function ClusterPin({ cluster }: { cluster: MapCluster }) {
  const theme = useTheme();
  const size =
    cluster.count >= 1000 ? 54 : cluster.count >= 100 ? 46 : cluster.count >= 10 ? 40 : 34;
  const cls = powerClass(cluster.maxPowerKw, cluster.maxPowerKw >= 50);
  return (
    <View
      style={[
        styles.cluster,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.power[cls] },
      ]}
    >
      <Text style={styles.clusterText}>
        {cluster.count >= 1000 ? `${(cluster.count / 1000).toFixed(1)}k` : cluster.count}
      </Text>
    </View>
  );
}

export function SiteListItem({
  site,
  onPress,
}: {
  site: MapSite | NearbySite;
  onPress: () => void;
}) {
  const theme = useTheme();
  const cls = powerClass(site.maxPowerKw, site.hasDc);
  const distance = 'distanceM' in site ? site.distanceM : null;
  const city = 'city' in site ? site.city : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.surfaceAlt : theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[styles.rowPower, { backgroundColor: theme.power[cls] }]}>
        <Ionicons name="flash" size={14} color="#FFFFFF" />
        <Text style={styles.rowPowerText}>{formatKw(site.maxPowerKw)}</Text>
        <Text style={styles.rowPowerUnit}>kW</Text>
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <T variant="heading" numberOfLines={1}>
          {site.name}
        </T>
        <T muted variant="small" numberOfLines={1}>
          {[site.operatorName, city].filter(Boolean).join(' · ')}
        </T>
        <View style={{ marginTop: 4 }}>
          <StatusBadge
            status={site.status}
            available={site.availableCount}
            total={site.evseCount}
          />
        </View>
      </View>
      {distance !== null ? (
        <T variant="small" muted style={{ marginLeft: spacing.sm }}>
          {formatDistance(distance)}
        </T>
      ) : null}
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.textMuted}
        style={{ marginLeft: 4 }}
      />
    </Pressable>
  );
}

/** Filtros rápidos sobre el mapa + acceso a todos los filtros. */
export function QuickFilters({ onOpenAll }: { onOpenAll: () => void }) {
  const { t } = useTranslation();
  const filters = useAppStore((s) => s.filters);
  const patch = useAppStore((s) => s.patchFilters);
  const vehicle = useActiveVehicle();
  const sameSet = (a: readonly string[] = [], b: readonly string[] = []) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const myCarOn = !!vehicle && sameSet(filters.connectorGroups, vehicle.connectorGroups);
  const toggleList = <T extends string>(list: T[] | undefined, value: T): T[] =>
    list?.includes(value) ? list.filter((x) => x !== value) : [...(list ?? []), value];
  const active =
    (filters.connectorGroups?.length && !myCarOn ? 1 : 0) +
    (filters.operatorIds?.length ? 1 : 0) +
    (filters.minPowerKw && filters.minPowerKw !== 50 ? 1 : 0) +
    (filters.paymentMethods?.some((p) => p !== 'AD_HOC_CARD') ? 1 : 0);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.md }}
    >
      <Chip
        icon="options-outline"
        label={active ? `${t('map.filters')} · ${active}` : t('map.filters')}
        selected={active > 0}
        onPress={onOpenAll}
      />
      {vehicle ? (
        <Chip
          icon="car-sport-outline"
          label={t('chips.myCar')}
          selected={myCarOn}
          onPress={() => patch({ connectorGroups: myCarOn ? [] : [...vehicle.connectorGroups] })}
        />
      ) : null}
      <Chip
        icon="flash"
        label={t('chips.fast')}
        selected={filters.minPowerKw === 50}
        onPress={() => patch({ minPowerKw: filters.minPowerKw === 50 ? undefined : 50 })}
      />
      <Chip
        icon="checkmark-circle-outline"
        label={t('chips.available')}
        selected={!!filters.onlyAvailable}
        onPress={() => patch({ onlyAvailable: !filters.onlyAvailable })}
      />
      <Chip
        icon="card-outline"
        label={t('chips.card')}
        selected={!!filters.paymentMethods?.includes('AD_HOC_CARD')}
        onPress={() => patch({ paymentMethods: toggleList(filters.paymentMethods, 'AD_HOC_CARD') })}
      />
      <Chip
        icon="moon-outline"
        label={t('chips.h24')}
        selected={!!filters.open24h}
        onPress={() => patch({ open24h: !filters.open24h })}
      />
    </ScrollView>
  );
}

export function PowerLegend() {
  const theme = useTheme();
  const items: Array<[keyof typeof theme.power, string]> = [
    ['AC', '≤22'],
    ['FAST', '50+'],
    ['ULTRA', '150+'],
  ];
  return (
    <View style={[styles.legend, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {items.map(([k, label]) => (
        <View key={k} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.power[k] }]} />
          <T variant="small">{label}</T>
        </View>
      ))}
      <T variant="small" muted>
        kW
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center' },
  badgeText: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  pinWrap: { alignItems: 'center' },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  pinSelected: { transform: [{ scale: 1.25 }] },
  pinText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', marginLeft: 2 },
  pinStatus: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  cluster: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  clusterText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    minHeight: TOUCH + 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowPower: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowPowerText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, lineHeight: 17 },
  rowPowerUnit: { color: '#FFFFFF', fontSize: 10, opacity: 0.9 },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
});
