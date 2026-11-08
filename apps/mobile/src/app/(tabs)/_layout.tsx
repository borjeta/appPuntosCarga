import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// En RN 0.88 el color de la pestaña puede ser null; Ionicons necesita string.
function TabIcon({ name, color, size }: { name: IconName; color: unknown; size: number }) {
  return <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.surface },
        headerTitleStyle: { color: theme.text },
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.map'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <TabIcon name="map" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="route"
        options={{
          title: t('tabs.route'),
          tabBarIcon: ({ color, size }) => <TabIcon name="git-branch" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          title: t('tabs.nearby'),
          tabBarIcon: ({ color, size }) => <TabIcon name="navigate" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t('tabs.favorites'),
          tabBarIcon: ({ color, size }) => <TabIcon name="star" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => <TabIcon name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
