import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';
import { Card, ErrorState, Loading, T } from '../components/ui';
import { dateTime } from '../lib/format';
import { openWebsite } from '../lib/links';
import { useSources } from '../lib/queries';
import { spacing, useTheme } from '../lib/theme';

export default function SourcesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const sources = useSources();
  if (sources.isLoading) return <Loading />;
  if (sources.isError) return <ErrorState onRetry={() => sources.refetch()} />;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      <T muted>{t('sources.intro')}</T>
      {sources.data?.map((s) => (
        <Card key={s.id} style={{ marginTop: spacing.lg }}>
          <T variant="heading">{s.name}</T>
          <T muted variant="small" style={{ marginTop: 4 }}>
            {s.attribution}
          </T>
          <T variant="small" style={{ marginTop: 8 }}>
            {s.kind === 'vehicles'
              ? t('sources.models', { count: s.siteCount })
              : t('sources.stations', { count: s.siteCount })}
          </T>
          {s.lastSyncAt ? (
            <T muted variant="small">
              {t('sources.lastSync', { date: dateTime(s.lastSyncAt) })}
            </T>
          ) : null}
          {s.licenseName || s.licenseUrl ? (
            <Pressable
              disabled={!s.licenseUrl}
              onPress={() => s.licenseUrl && openWebsite(s.licenseUrl)}
              accessibilityRole={s.licenseUrl ? 'link' : 'text'}
              style={{ marginTop: 4 }}
            >
              <T
                variant="small"
                style={
                  s.licenseUrl
                    ? { color: theme.primary, textDecorationLine: 'underline' }
                    : undefined
                }
              >
                {t('sources.license', { name: s.licenseName ?? s.licenseUrl })}
              </T>
            </Pressable>
          ) : null}
        </Card>
      ))}
      <T muted variant="small" style={{ marginTop: spacing.xl }}>
        {t('sources.mapAttribution')}
      </T>
    </ScrollView>
  );
}
