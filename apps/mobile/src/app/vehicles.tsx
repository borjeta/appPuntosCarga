import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Card, Chip, T } from '../components/ui';
import { VehicleSummary } from '../components/vehicle';
import { backend } from '../lib/backend';
import { useAppStore, vehicleName } from '../lib/store';
import { radius, spacing, TOUCH, useTheme } from '../lib/theme';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function VehiclesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { vehicles, activeVehicleId, addVehicle, removeVehicle, setActiveVehicle } = useAppStore();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 300);
  const results = useQuery({
    queryKey: ['vehicle-models', q],
    queryFn: () => backend.vehicleModels(q),
    enabled: q.length >= 2,
  });

  return (
    <FlatList
      data={q.length >= 2 ? (results.data ?? []) : []}
      keyExtractor={(v) => v.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
      ListHeaderComponent={
        <View>
          {vehicles.length === 0 ? (
            <T muted style={{ marginBottom: spacing.lg }}>
              {t('vehicles.empty')}
            </T>
          ) : (
            vehicles.map((v) => {
              const active = v.id === activeVehicleId;
              return (
                <Card
                  key={v.id}
                  style={{
                    marginBottom: spacing.sm,
                    borderColor: active ? theme.primary : theme.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons
                      name="car-sport"
                      size={22}
                      color={active ? theme.primary : theme.textMuted}
                    />
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <T variant="heading">{vehicleName(v)}</T>
                      <VehicleSummary v={v} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                    <Chip
                      label={active ? t('vehicles.active') : t('vehicles.use')}
                      selected={active}
                      icon={active ? 'checkmark' : undefined}
                      onPress={() => setActiveVehicle(v.id)}
                    />
                    <Chip
                      label={t('vehicles.remove')}
                      icon="trash-outline"
                      onPress={() => removeVehicle(v.id)}
                    />
                  </View>
                </Card>
              );
            })
          )}
          <T variant="heading" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
            {t('vehicles.add')}
          </T>
          <View
            style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Ionicons name="search" size={18} color={theme.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('vehicles.searchPlaceholder')}
              placeholderTextColor={theme.textMuted}
              style={[styles.input, { color: theme.text }]}
              autoCorrect={false}
              accessibilityLabel={t('vehicles.add')}
            />
            {results.isFetching ? <ActivityIndicator size="small" color={theme.primary} /> : null}
          </View>
          {q.length >= 2 && results.data?.length === 0 ? (
            <T muted style={{ marginTop: spacing.md }}>
              {t('vehicles.noResults')}
            </T>
          ) : null}
        </View>
      }
      renderItem={({ item }) => {
        const owned = vehicles.some((v) => v.id === item.id);
        return (
          <Pressable
            onPress={() => {
              addVehicle(item);
              setQuery('');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.result,
              {
                borderColor: theme.border,
                backgroundColor: pressed ? theme.surfaceAlt : 'transparent',
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <T>{vehicleName(item)}</T>
              <VehicleSummary v={item} />
            </View>
            <Ionicons
              name={owned ? 'checkmark-circle' : 'add-circle-outline'}
              size={24}
              color={theme.primary}
            />
          </Pressable>
        );
      }}
      ListFooterComponent={
        <T muted variant="small" style={{ marginTop: spacing.xl }}>
          {t('vehicles.attribution')}
        </T>
      }
    />
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 15, marginLeft: spacing.sm, paddingVertical: 10 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: TOUCH + 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
  },
});
