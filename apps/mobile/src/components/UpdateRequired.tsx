import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { openWebsite } from '../lib/links';
import { APP_STORE_URL } from '../lib/update';
import { spacing, useTheme } from '../lib/theme';
import { Button, T } from './ui';

/** Pantalla que bloquea la app hasta que el usuario instala la versión nueva. */
export function UpdateRequired() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <Ionicons name="cloud-download-outline" size={56} color={theme.primary} />
      <T variant="title" style={styles.center}>
        {t('update.title')}
      </T>
      <T muted style={styles.center}>
        {t('update.body')}
      </T>
      <Button
        label={t('update.button')}
        onPress={() => openWebsite(APP_STORE_URL)}
        style={{ marginTop: spacing.xl }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  center: { textAlign: 'center', marginTop: spacing.md },
});
