import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { DATA_ORIGIN } from '../lib/config';
import { radius, spacing, TOUCH, useTheme } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function T({
  children,
  variant = 'body',
  muted,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: 'title' | 'heading' | 'body' | 'small' | 'label';
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles[variant], { color: muted ? theme.textMuted : theme.text }, style]}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}
    >
      {children}
    </View>
  );
}

export function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.sectionHeader}>
        <T variant="heading">{title}</T>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const theme = useTheme();
  const fg = selected ? theme.onPrimary : theme.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const fg = primary ? theme.onPrimary : theme.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.primary : theme.surfaceAlt,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.buttonText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Botón redondo con icono y etiqueta debajo (acciones de la ficha). */
export function ActionButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.action}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.actionCircle,
              {
                backgroundColor: active ? theme.primary : theme.surfaceAlt,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name={icon} size={22} color={active ? theme.onPrimary : theme.primary} />
          </View>
          <T variant="small" style={{ textAlign: 'center', marginTop: 4 }} numberOfLines={2}>
            {label}
          </T>
        </>
      )}
    </Pressable>
  );
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.primary} size="large" />
    </View>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={theme.textMuted} />
      <T variant="heading" style={{ marginTop: spacing.md, textAlign: 'center' }}>
        {message ?? t('common.error')}
      </T>
      <T muted variant="small" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
        {t('common.errorHint', { url: DATA_ORIGIN })}
      </T>
      {onRetry ? (
        <Button label={t('common.retry')} onPress={onRetry} style={{ marginTop: spacing.lg }} />
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  message,
  children,
}: {
  icon: IconName;
  message: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={40} color={theme.textMuted} />
      <T muted style={{ marginTop: spacing.md, textAlign: 'center' }}>
        {message}
      </T>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipText: { fontSize: 14, fontWeight: '500' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  action: { width: 76, alignItems: 'center', minHeight: TOUCH },
  actionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
