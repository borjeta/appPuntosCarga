import { Ionicons } from '@expo/vector-icons';
import { formatKw } from '@pc/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { EmptyState, T } from '../../components/ui';
import { useAppStore } from '../../lib/store';
import { spacing, TOUCH, useTheme } from '../../lib/theme';

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const favorites = useAppStore((s) => s.favorites);
  const toggle = useAppStore((s) => s.toggleFavorite);

  return (
    <FlatList
      data={favorites}
      keyExtractor={(f) => f.id}
      contentContainerStyle={{ flexGrow: 1 }}
      ListEmptyComponent={<EmptyState icon="star-outline" message={t('favorites.empty')} />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/location/${item.id}`)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? theme.surfaceAlt : theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <T variant="heading" numberOfLines={1}>
              {item.name}
            </T>
            <T muted variant="small" numberOfLines={1}>
              {[item.operatorName, item.city, `${formatKw(item.maxPowerKw)} kW`]
                .filter(Boolean)
                .join(' · ')}
            </T>
          </View>
          <Pressable
            onPress={() => toggle(item)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('detail.favorite')}
            style={styles.star}
          >
            <Ionicons name="star" size={22} color={theme.primary} />
          </Pressable>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    minHeight: TOUCH + 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  star: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
});
