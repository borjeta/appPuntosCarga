import { Ionicons } from '@expo/vector-icons';
import {
  connectorGroupOf,
  type EvseDetail,
  type EvseStatus,
  type LocationDetail,
  type SiteStatus,
} from '@pc/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { StatusBadge } from '../../components/stations';
import { ActionButton, Card, Chip, ErrorState, Loading, Section, T } from '../../components/ui';
import { CommunitySection } from '../../components/community';
import { EstimateCard, useConnectorCompatibility } from '../../components/vehicle';
import { ApiError } from '../../lib/api';
import { dateTime, kw, minutesAgo, priceComponent } from '../../lib/format';
import { callPhone, openDirections, openOperatorApp, openWebsite } from '../../lib/links';
import { useLocation } from '../../lib/queries';
import { useAppStore, useIsFavorite } from '../../lib/store';
import { radius, spacing, useTheme } from '../../lib/theme';

const EVSE_TO_SITE: Record<EvseStatus, SiteStatus> = {
  AVAILABLE: 'AVAILABLE',
  CHARGING: 'OCCUPIED',
  BLOCKED: 'OCCUPIED',
  RESERVED: 'OCCUPIED',
  OUTOFORDER: 'OUT_OF_SERVICE',
  INOPERATIVE: 'OUT_OF_SERVICE',
  PLANNED: 'OUT_OF_SERVICE',
  REMOVED: 'OUT_OF_SERVICE',
  UNKNOWN: 'UNKNOWN',
};

export default function LocationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const query = useLocation(id);

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <ErrorState
        message={notFound ? t('detail.notFound') : undefined}
        onRetry={notFound ? undefined : () => query.refetch()}
      />
    );
  }
  return <LocationView location={query.data} />;
}

function LocationView({ location: l }: { location: LocationDetail }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isFavorite = useIsFavorite(l.id);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  const address = [
    l.address.street,
    [l.address.postalCode, l.address.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  const available = l.evses.filter((e) => e.status === 'AVAILABLE').length;
  const latestStatus = l.evses
    .map((e) => e.statusUpdatedAt)
    .filter((x): x is string => !!x)
    .sort()
    .pop();

  return (
    <>
      <Stack.Screen options={{ title: l.operator?.name ?? t('detail.title') }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
        <T variant="title">{l.name}</T>
        {l.operator ? (
          <T muted style={{ marginTop: 2 }}>
            {l.operator.name}
          </T>
        ) : null}
        <T muted variant="small" style={{ marginTop: 2 }}>
          {address}
        </T>

        <Card style={{ marginTop: spacing.lg }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <StatusBadge
              status={l.status}
              available={l.status === 'UNKNOWN' ? null : available}
              total={l.evses.length}
            />
            <T variant="heading">{kw(l.maxPowerKw)}</T>
          </View>
          <T muted variant="small" style={{ marginTop: 6 }}>
            {l.status === 'UNKNOWN' || !latestStatus
              ? t('detail.noRealtime')
              : t('detail.statusUpdated', { minutes: minutesAgo(latestStatus) })}
          </T>
        </Card>

        <EstimateCard location={l} />

        <View style={styles.actions}>
          <ActionButton
            icon="navigate"
            label={t('common.directions')}
            onPress={() => openDirections(l.lat, l.lng, l.name)}
          />
          {l.operator ? (
            <ActionButton
              icon="phone-portrait-outline"
              label={t('detail.openOperatorApp', { name: l.operator.name })}
              onPress={() => openOperatorApp(l.operator!, l.evses[0]?.evseId)}
            />
          ) : null}
          <ActionButton
            icon={isFavorite ? 'star' : 'star-outline'}
            label={t('detail.favorite')}
            active={isFavorite}
            onPress={() =>
              toggleFavorite({
                id: l.id,
                name: l.name,
                operatorName: l.operator?.name ?? null,
                city: l.address.city,
                lat: l.lat,
                lng: l.lng,
                maxPowerKw: l.maxPowerKw,
              })
            }
          />
          <ActionButton
            icon="share-outline"
            label={t('detail.share')}
            onPress={() =>
              void Share.share({
                message: `${t('detail.shareText', { name: l.name, address })}\nhttps://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`,
              })
            }
          />
        </View>

        <Section title={t('detail.chargePoints')}>
          {l.evses.map((e, i) => (
            <EvseCard key={e.id} evse={e} index={i + 1} />
          ))}
        </Section>

        <Section title={t('detail.howToPay')}>
          <View style={styles.wrap}>
            {l.paymentMethods.length ? (
              l.paymentMethods.map((p) => (
                <Chip key={p} label={t(`payment.${p}`)} icon={PAYMENT_ICON[p]} />
              ))
            ) : (
              <T muted>{t('common.unknown')}</T>
            )}
          </View>
          {l.acceptedProviders.length ? <AcceptedProviders codes={l.acceptedProviders} /> : null}
        </Section>

        <Section title={t('detail.hours')}>
          {l.openingHours.twentyFourSeven ? (
            <T>{t('detail.open24h')}</T>
          ) : l.openingHours.regularHours.length ? (
            l.openingHours.regularHours.map((h, i) => (
              <View key={i} style={styles.hoursRow}>
                <T>{t(`weekday.${h.weekday}`)}</T>
                <T muted>
                  {h.periodBegin} – {h.periodEnd}
                </T>
              </View>
            ))
          ) : (
            <T muted>{l.openingHours.text ?? t('detail.hoursUnknown')}</T>
          )}
        </Section>

        {l.facilities.length ? (
          <Section title={t('detail.services')}>
            <View style={styles.wrap}>
              {l.facilities.map((f) => (
                <Chip key={f} label={t(`facility.${f}`)} />
              ))}
            </View>
          </Section>
        ) : null}

        {l.operator?.website || l.operator?.phone ? (
          <View style={[styles.wrap, { marginTop: spacing.lg }]}>
            {l.operator.website ? (
              <Chip
                icon="globe-outline"
                label={t('detail.operatorWebsite')}
                onPress={() => openWebsite(l.operator!.website!)}
              />
            ) : null}
            {l.operator.phone ? (
              <Chip
                icon="call-outline"
                label={`${t('detail.call')} ${l.operator.phone}`}
                onPress={() => callPhone(l.operator!.phone!)}
              />
            ) : null}
          </View>
        ) : null}

        <CommunitySection location={l} />

        <Section title={t('detail.sources')}>
          {l.sources.map((s) => (
            <T key={s.sourceId} muted variant="small">
              {s.attribution}
              {s.licenseName ? ` · ${s.licenseName}` : ''}
            </T>
          ))}
          {l.lastUpdated ? (
            <T muted variant="small" style={{ marginTop: 4 }}>
              {t('detail.updated', { date: dateTime(l.lastUpdated) })}
            </T>
          ) : null}
        </Section>
      </ScrollView>
    </>
  );
}

function EvseCard({ evse, index }: { evse: EvseDetail; index: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const compatible = useConnectorCompatibility();
  const siteStatus = EVSE_TO_SITE[evse.status];
  const color = theme.status[siteStatus];
  return (
    <Card style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T variant="label" muted>
          #{index} {evse.evseId ?? ''}
        </T>
        <View style={[styles.evseStatus, { borderColor: color }]}>
          <T variant="small" style={{ color, fontWeight: '600' }}>
            {t(`evseStatus.${evse.status}`)}
          </T>
        </View>
      </View>
      {evse.connectors.map((c, i) => {
        const fits = compatible(c);
        return (
          <View key={i} style={[styles.connector, fits === false && { opacity: 0.45 }]}>
            <Ionicons
              name={c.powerType === 'DC' ? 'flash' : 'flash-outline'}
              size={18}
              color={theme.primary}
            />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <T variant="heading">
                {t(`connector.${connectorGroupOf(c.standard)}`)} · {kw(c.maxPowerKw)}
              </T>
              <T muted variant="small">
                {[
                  c.powerType ? t(`powerType.${c.powerType}`) : null,
                  c.format ? t(`format.${c.format}`) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </T>
            </View>
            {fits !== null ? (
              <Ionicons
                name={fits ? 'checkmark-circle' : 'close-circle-outline'}
                size={20}
                color={fits ? theme.status.AVAILABLE : theme.textMuted}
                accessibilityLabel={fits ? t('estimate.compatible') : t('estimate.notCompatible')}
              />
            ) : null}
          </View>
        );
      })}
      {evse.tariffs.length ? (
        <View style={[styles.price, { backgroundColor: theme.surfaceAlt }]}>
          <T variant="small" style={{ fontWeight: '600' }}>
            {t('detail.price')}: {evse.tariffs[0]!.components.map(priceComponent).join(' + ')}
          </T>
          <T muted variant="small">
            {t('detail.priceBaseHint')}
          </T>
        </View>
      ) : null}
    </Card>
  );
}

function AcceptedProviders({ codes }: { codes: string[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <T variant="small" style={{ fontWeight: '600' }}>
          {t('detail.acceptedProviders', { count: codes.length })}
        </T>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          style={{ marginLeft: 4 }}
          color="#888"
        />
      </Pressable>
      {open ? (
        <>
          <T muted variant="small" style={{ marginVertical: 4 }}>
            {t('detail.acceptedProvidersHint')}
          </T>
          <T variant="small">{codes.join(' · ')}</T>
        </>
      ) : null}
    </View>
  );
}

const PAYMENT_ICON = {
  AD_HOC_CARD: 'card-outline',
  OPERATOR_APP: 'phone-portrait-outline',
  RFID: 'wifi-outline',
  QR: 'qr-code-outline',
  PLUG_AND_CHARGE: 'car-outline',
} as const;

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  connector: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  evseStatus: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  price: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.sm },
});
