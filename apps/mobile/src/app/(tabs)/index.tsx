import { Ionicons } from '@expo/vector-icons';
import type { MapSite, NearbySite } from '@pc/shared';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChargeMap, type ChargeMapHandle, type Viewport } from '../../components/ChargeMap';
import { PowerLegend, QuickFilters, SiteListItem, StatusBadge } from '../../components/stations';
import { Button, T } from '../../components/ui';
import { kw } from '../../lib/format';
import { openDirections } from '../../lib/links';
import { useUserLocation } from '../../lib/location';
import { useMapData, useSearch } from '../../lib/queries';
import { useAppStore } from '../../lib/store';
import { radius, spacing, TOUCH, useTheme } from '../../lib/theme';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export default function MapScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ChargeMapHandle>(null);
  const filters = useAppStore((s) => s.filters);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const debouncedViewport = useDebounced(viewport, 250);
  const [selected, setSelected] = useState<MapSite | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const debouncedQuery = useDebounced(query, 300);

  const location = useUserLocation();
  const map = useMapData(debouncedViewport?.bbox ?? null, debouncedViewport?.zoom ?? 6, filters);
  const search = useSearch(searchOpen ? debouncedQuery : '', viewport?.center ?? null);

  const goToMyLocation = async () => {
    const coords = location.coords ?? (await location.request());
    if (coords) mapRef.current?.flyTo(coords.lat, coords.lng, 0.03);
  };

  const pickSearchResult = (site: NearbySite) => {
    Keyboard.dismiss();
    setSearchOpen(false);
    setQuery(site.name);
    setSelected(site);
    mapRef.current?.flyTo(site.lat, site.lng, 0.01);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ChargeMap
        ref={mapRef}
        items={map.data?.items ?? []}
        selectedId={selected?.id ?? null}
        showsUserLocation={location.permission === 'granted'}
        dark={theme.dark}
        onViewportChange={setViewport}
        onSelectSite={(s) => {
          setSelected(s);
          if (searchOpen) {
            Keyboard.dismiss();
            setSearchOpen(false);
          }
        }}
      />

      {/* Barra superior: búsqueda + filtros rápidos */}
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View
          style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="search" size={20} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder={t('map.searchPlaceholder')}
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
            accessibilityLabel={t('map.searchPlaceholder')}
          />
          {query ? (
            <Pressable
              onPress={() => {
                setQuery('');
                setSearchOpen(false);
                Keyboard.dismiss();
              }}
              hitSlop={12}
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close-circle" size={20} color={theme.textMuted} />
            </Pressable>
          ) : null}
          {map.isFetching ? (
            <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 8 }} />
          ) : null}
        </View>

        {searchOpen && query.trim().length >= 2 ? (
          <View
            style={[styles.results, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              {search.data?.locations.length ? (
                search.data.locations.map((s) => (
                  <SiteListItem key={s.id} site={s} onPress={() => pickSearchResult(s)} />
                ))
              ) : (
                <T muted style={{ padding: spacing.lg }}>
                  {search.isFetching ? t('common.loading') : t('map.noResults')}
                </T>
              )}
            </ScrollView>
          </View>
        ) : (
          <View style={{ marginTop: spacing.sm, marginHorizontal: -spacing.md }}>
            <QuickFilters onOpenAll={() => router.push('/filters')} />
          </View>
        )}

        {map.data?.truncated ? (
          <View style={[styles.notice, { backgroundColor: theme.surface }]}>
            <T variant="small">{t('map.zoomIn')}</T>
          </View>
        ) : null}
        {map.isError && !map.data ? (
          <Pressable
            onPress={() => map.refetch()}
            style={[styles.notice, { backgroundColor: theme.surface }]}
          >
            <T variant="small" style={{ color: theme.danger }}>
              {t('common.error')} {t('common.retry')} ↻
            </T>
          </Pressable>
        ) : null}
      </View>

      {/* Botón de ubicación y leyenda */}
      <View
        style={[styles.bottomControls, { bottom: selected ? 190 : 16 }]}
        pointerEvents="box-none"
      >
        <PowerLegend />
        <Pressable
          onPress={goToMyLocation}
          accessibilityRole="button"
          accessibilityLabel={t('map.myLocation')}
          style={[styles.fab, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="locate" size={24} color={theme.primary} />
        </Pressable>
      </View>

      {selected ? (
        <View
          style={[styles.preview, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T variant="heading" numberOfLines={2}>
                {selected.name}
              </T>
              <T muted variant="small" numberOfLines={1}>
                {[
                  selected.operatorName,
                  kw(selected.maxPowerKw),
                  t('common.points', { count: selected.evseCount }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </T>
              <View style={{ marginTop: 6 }}>
                <StatusBadge
                  status={selected.status}
                  available={selected.availableCount}
                  total={selected.evseCount}
                />
              </View>
            </View>
            <Pressable
              onPress={() => setSelected(null)}
              hitSlop={12}
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={22} color={theme.textMuted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
            <Button
              label={t('common.seeDetails')}
              icon="information-circle-outline"
              onPress={() => router.push(`/location/${selected.id}`)}
              style={{ flex: 1, marginRight: spacing.sm }}
            />
            <Button
              label={t('common.directions')}
              icon="navigate-outline"
              variant="secondary"
              onPress={() => openDirections(selected.lat, selected.lng, selected.name)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchInput: { flex: 1, fontSize: 16, marginLeft: spacing.sm, paddingVertical: 10 },
  results: {
    marginTop: spacing.sm,
    maxHeight: 360,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 4,
  },
  notice: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    elevation: 2,
  },
  bottomControls: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  preview: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
});
