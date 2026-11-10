import '../lib/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n, { deviceLanguage } from '../lib/i18n';
import { queryClient, useDataSync } from '../lib/queries';
import { useAppStore } from '../lib/store';
import { initAds } from '../lib/monetization/ads';
import { useTheme } from '../lib/theme';
import { useUpdateRequired } from '../lib/update';
import { UpdateRequired } from '../components/UpdateRequired';

function useLanguageSync() {
  const language = useAppStore((s) => s.language);
  useEffect(() => {
    void i18n.changeLanguage(language === 'system' ? deviceLanguage() : language);
  }, [language]);
}

/** App gratuita con publicidad: los anuncios se inicializan al arrancar. */
function Monetization() {
  useEffect(() => {
    void initAds();
  }, []);
  return null;
}

function DataSync() {
  useDataSync();
  return null;
}

export default function RootLayout() {
  useLanguageSync();
  const theme = useTheme();
  const { t } = useTranslation();
  const updateRequired = useUpdateRequired();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <DataSync />
        <Monetization />
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        {updateRequired ? (
          <UpdateRequired />
        ) : (
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.surface },
              headerTintColor: theme.primary,
              headerTitleStyle: { color: theme.text },
              contentStyle: { backgroundColor: theme.bg },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="location/[id]" options={{ title: t('detail.title') }} />
            <Stack.Screen
              name="filters"
              options={{ title: t('filters.title'), presentation: 'modal' }}
            />
            <Stack.Screen name="vehicles" options={{ title: t('vehicles.title') }} />
            <Stack.Screen name="sources" options={{ title: t('sources.title') }} />
          </Stack>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
