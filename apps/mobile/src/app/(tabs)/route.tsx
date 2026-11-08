import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { GeocodeResult, LatLng, RoutePlan } from '@pc/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { RouteMap } from '../../components/RouteMap';
import { StatusBadge } from '../../components/stations';
import { Button, Card, Chip, T } from '../../components/ui';
import { SocStepper } from '../../components/vehicle';
import { ApiError } from '../../lib/api';
import { backend } from '../../lib/backend';
import { formatMinutes, price } from '../../lib/format';
import { useUserLocation } from '../../lib/location';
import { useActiveVehicle, vehicleName } from '../../lib/store';
import { radius, spacing, TOUCH, useTheme } from '../../lib/theme';

type Place = { label: string; point: LatLng } | { label: 'MY_LOCATION'; point: null };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Campo de lugar con autocompletado (geocodificador de la API). */
function PlaceField({
  label,
  value,
  onChange,
  near,
  allowMyLocation,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  near: LatLng | null;
  allowMyLocation?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const q = useDebounced(text.trim(), 350);
  const results = useQuery({
    queryKey: ['geocode', q, near && [near.lat.toFixed(1), near.lng.toFixed(1)]],
    queryFn: () => backend.geocode(q, near?.lat, near?.lng),
    enabled: editing && q.length >= 2,
  });
  const shown = value ? (value.label === 'MY_LOCATION' ? t('route.myLocation') : value.label) : '';

  const pick = (r: GeocodeResult) => {
    onChange({ label: r.label, point: { lat: r.lat, lng: r.lng } });
    setEditing(false);
    setText('');
    Keyboard.dismiss();
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <T variant="small" muted style={{ marginBottom: 4 }}>
        {label}
      </T>
      <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons
          name={value?.label === 'MY_LOCATION' ? 'locate' : 'location-outline'}
          size={18}
          color={theme.primary}
        />
        <TextInput
          value={editing ? text : shown}
          onFocus={() => {
            setEditing(true);
            setText('');
          }}
          onChangeText={setText}
          placeholder={t('route.searchPlace')}
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text }]}
          accessibilityLabel={label}
        />
        {results.isFetching ? <ActivityIndicator size="small" color={theme.primary} /> : null}
      </View>
      {editing ? (
        <View
          style={[styles.results, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          {allowMyLocation ? (
            <Pressable
              onPress={() => {
                onChange({ label: 'MY_LOCATION', point: null });
                setEditing(false);
                Keyboard.dismiss();
              }}
              style={styles.resultRow}
            >
              <Ionicons name="locate" size={18} color={theme.primary} />
              <T style={{ marginLeft: spacing.sm }}>{t('route.myLocation')}</T>
            </Pressable>
          ) : null}
          {(results.data ?? []).map((r, i) => (
            <Pressable
              key={`${r.lat},${r.lng},${i}`}
              onPress={() => pick(r)}
              style={styles.resultRow}
            >
              <Ionicons name="location-outline" size={18} color={theme.textMuted} />
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <T numberOfLines={1}>{r.label}</T>
                {r.detail ? (
                  <T variant="small" muted numberOfLines={1}>
                    {r.detail}
                  </T>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function RouteScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const vehicle = useActiveVehicle();
  const location = useUserLocation();
  const [origin, setOrigin] = useState<Place | null>({ label: 'MY_LOCATION', point: null });
  const [destination, setDestination] = useState<Place | null>(null);
  const [startSoc, setStartSoc] = useState(80);
  const [arrivalSoc, setArrivalSoc] = useState(10);

  const plan = useMutation({
    mutationFn: async (): Promise<RoutePlan> => {
      let from = origin?.point ?? null;
      if (origin?.label === 'MY_LOCATION') from = location.coords ?? (await location.request());
      if (!from) throw new Error(t('route.needLocation'));
      if (!destination?.point || !vehicle) throw new Error(t('route.infeasible'));
      return backend.planRoute({
        origin: from,
        destination: destination.point,
        vehicleId: vehicle.id,
        startSoc,
        arrivalMinSoc: arrivalSoc,
      });
    },
  });

  const canPlan = !!vehicle && !!destination?.point && !!origin;
  const result = plan.data;
  const errorMessage =
    plan.error instanceof ApiError || plan.error instanceof Error ? plan.error.message : null;

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <PlaceField
        label={t('route.from')}
        value={origin}
        onChange={setOrigin}
        near={location.coords}
        allowMyLocation
      />
      <PlaceField
        label={t('route.to')}
        value={destination}
        onChange={setDestination}
        near={location.coords}
      />

      <T variant="small" muted style={{ marginBottom: 4 }}>
        {t('route.vehicle')}
      </T>
      <Pressable
        onPress={() => router.push('/vehicles')}
        accessibilityRole="button"
        style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Ionicons name="car-sport" size={18} color={theme.primary} />
        <T style={{ flex: 1, marginLeft: spacing.sm }} numberOfLines={1}>
          {vehicle ? vehicleName(vehicle) : t('route.chooseVehicle')}
        </T>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </Pressable>

      <View style={styles.steppers}>
        <SocStepper
          label={t('route.startSoc')}
          value={startSoc}
          onChange={setStartSoc}
          min={10}
          max={100}
        />
        <SocStepper
          label={t('route.arrivalSoc')}
          value={arrivalSoc}
          onChange={setArrivalSoc}
          min={5}
          max={50}
        />
      </View>

      <Button
        label={plan.isPending ? t('route.planning') : t('route.plan')}
        icon="git-branch-outline"
        onPress={() => plan.mutate()}
        style={{ opacity: canPlan && !plan.isPending ? 1 : 0.5 }}
      />

      {plan.isError && errorMessage ? (
        <Card style={{ marginTop: spacing.lg }}>
          <T style={{ color: theme.danger }}>{errorMessage}</T>
        </Card>
      ) : null}

      {result ? (
        <View style={{ marginTop: spacing.lg }}>
          {!result.feasible ? (
            <Card style={{ marginBottom: spacing.md }}>
              <T variant="heading" style={{ color: theme.danger }}>
                {t('route.infeasible')}
              </T>
              <T muted>{result.reason}</T>
            </Card>
          ) : null}
          <Card>
            <View style={styles.metrics}>
              <Metric label={t('route.distance')} value={`${result.distanceKm} km`} />
              <Metric label={t('route.driving')} value={formatMinutes(result.driveMinutes)} />
              <Metric label={t('route.charging')} value={formatMinutes(result.chargeMinutes)} />
              <Metric label={t('route.arrival')} value={`${Math.round(result.arrivalSoc)} %`} />
            </View>
          </Card>
          <RouteMap plan={result} onStopPress={(id) => router.push(`/location/${id}`)} />

          <T variant="heading" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
            {result.stops.length
              ? t('route.stops', { count: result.stops.length })
              : t('route.noStops')}
          </T>
          {result.stops.map((s, i) => (
            <Pressable
              key={s.site.id}
              onPress={() => router.push(`/location/${s.site.id}`)}
              accessibilityRole="button"
            >
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.stopNum, { backgroundColor: theme.power.ULTRA }]}>
                    <T style={{ color: '#fff', fontWeight: '700' }}>{i + 1}</T>
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <T variant="heading" numberOfLines={1}>
                      {s.site.name}
                    </T>
                    <T muted variant="small" numberOfLines={1}>
                      {[
                        t('route.stopKm', { km: Math.round(s.kmFromStart) }),
                        s.site.operatorName,
                        `${Math.round(s.chargerPowerKw)} kW`,
                        s.detourKm >= 0.5 ? t('route.detour', { km: s.detourKm }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </T>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                </View>
                <T style={{ marginTop: spacing.sm }}>
                  {t('route.stopDetail', {
                    arrival: Math.round(s.arrivalSoc),
                    departure: Math.round(s.departureSoc),
                    minutes: s.chargeMinutes,
                  })}
                  {s.cost ? ` · ≈ ${price(s.cost.total)} €` : ''}
                </T>
                <View style={{ marginTop: 4 }}>
                  <StatusBadge
                    status={s.site.status}
                    available={s.site.availableCount}
                    total={s.site.evseCount}
                  />
                </View>
              </Card>
            </Pressable>
          ))}
          <T muted variant="small" style={{ marginTop: spacing.md }}>
            {result.attribution} · {t('route.attribution')}
          </T>
          <T muted variant="small">
            {t('estimate.disclaimer')}
          </T>
        </View>
      ) : null}
      {!vehicle ? (
        <View style={{ marginTop: spacing.lg }}>
          <Chip
            icon="car-sport-outline"
            label={t('vehicles.add')}
            onPress={() => router.push('/vehicles')}
          />
        </View>
      ) : null}
    </ScrollView>
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

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 15, marginLeft: spacing.sm, paddingVertical: 10 },
  results: {
    marginTop: 4,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: TOUCH,
  },
  steppers: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: spacing.lg },
  metrics: { flexDirection: 'row' },
  stopNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
