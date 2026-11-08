import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Linking, RefreshControl, View } from 'react-native';
import { QuickFilters, SiteListItem } from '../../components/stations';
import { Button, EmptyState, ErrorState, Loading } from '../../components/ui';
import { useUserLocation } from '../../lib/location';
import { useNearby } from '../../lib/queries';
import { useAppStore } from '../../lib/store';
import { spacing, useTheme } from '../../lib/theme';

export default function NearbyScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const filters = useAppStore((s) => s.filters);
  const location = useUserLocation({ ask: true });
  const nearby = useNearby(location.coords, filters);

  if (location.permission !== 'granted') {
    return (
      <EmptyState icon="location-outline" message={t('nearby.needLocation')}>
        <Button
          label={location.canAskAgain ? t('nearby.allow') : t('nearby.openSettings')}
          icon="location"
          onPress={() =>
            location.canAskAgain ? void location.request() : void Linking.openSettings()
          }
          style={{ marginTop: spacing.lg }}
        />
      </EmptyState>
    );
  }
  if (!location.coords || nearby.isLoading) return <Loading />;
  if (nearby.isError) return <ErrorState onRetry={() => nearby.refetch()} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ paddingTop: spacing.sm, backgroundColor: theme.surface }}>
        <QuickFilters onOpenAll={() => router.push('/filters')} />
      </View>
      <FlatList
        data={nearby.data?.items ?? []}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <SiteListItem site={item} onPress={() => router.push(`/location/${item.id}`)} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={nearby.isRefetching}
            onRefresh={() => void location.request().then(() => nearby.refetch())}
          />
        }
        ListEmptyComponent={<EmptyState icon="flash-off-outline" message={t('nearby.empty')} />}
        contentContainerStyle={{ flexGrow: 1 }}
      />
    </View>
  );
}
