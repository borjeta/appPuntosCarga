import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  REPORT_TYPES,
  type CommunitySummary,
  type LocationDetail,
  type ReportType,
} from '@pc/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { backend } from '../lib/backend';
import { useAppStore } from '../lib/store';
import { radius, spacing, useTheme } from '../lib/theme';
import { Button, Card, Chip, Section, T } from './ui';

/** Con menos avisos el porcentaje engaña (un solo «funciona» daría 67 %). */
const MIN_REPORTS_FOR_SCORE = 3;

const PROBLEM_TYPES = REPORT_TYPES.filter((t) => t !== 'WORKS');

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

function reliabilityColor(theme: ReturnType<typeof useTheme>, value: number): string {
  if (value >= 70) return theme.status.AVAILABLE;
  if (value >= 40) return theme.status.OCCUPIED;
  return theme.status.OUT_OF_SERVICE;
}

/** Fiabilidad según la comunidad, últimos avisos y formulario para enviar uno. */
export function CommunitySection({ location }: { location: LocationDetail }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const deviceId = useAppStore((s) => s.deviceId);
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<ReportType>('BROKEN');
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: (v: { type: ReportType; comment?: string }) =>
      backend.report(location.id, deviceId, v.type, v.comment),
    onSuccess: (summary: CommunitySummary) => {
      queryClient.setQueryData<LocationDetail>(['location', location.id], (old) =>
        old ? { ...old, community: summary } : old,
      );
      setSent(true);
      setFormOpen(false);
      setComment('');
    },
  });

  const c = location.community;
  if (c.disabled) {
    return (
      <Section title={t('community.title')}>
        <Card>
          <T muted>{t('community.disabled')}</T>
        </Card>
      </Section>
    );
  }
  return (
    <Section title={t('community.title')}>
      <Card>
        {c.reliability !== null && c.works30d + c.problems30d >= MIN_REPORTS_FOR_SCORE ? (
          <View style={styles.row}>
            <Ionicons name="people" size={18} color={reliabilityColor(theme, c.reliability)} />
            <T
              variant="heading"
              style={{ marginLeft: spacing.sm, color: reliabilityColor(theme, c.reliability) }}
            >
              {t('community.reliability', { value: c.reliability })}
            </T>
          </View>
        ) : c.works30d + c.problems30d === 0 ? (
          <T muted>{t('community.noReliability')}</T>
        ) : null}
        {c.works30d + c.problems30d > 0 ? (
          <T muted variant="small" style={{ marginTop: 4 }}>
            {t('community.counts', { works: c.works30d, problems: c.problems30d })}
          </T>
        ) : null}

        {c.recent.map((r, i) => {
          const d = daysAgo(r.createdAt);
          return (
            <View key={i} style={[styles.report, { borderTopColor: theme.border }]}>
              <Ionicons
                name={r.type === 'WORKS' ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={r.type === 'WORKS' ? theme.status.AVAILABLE : theme.status.OUT_OF_SERVICE}
              />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <T variant="small" style={{ fontWeight: '600' }}>
                  {t(`community.types.${r.type}`)}{' '}
                  <T variant="small" muted>
                    · {d === 0 ? t('community.today') : t('community.daysAgo', { count: d })}
                  </T>
                </T>
                {r.comment ? <T variant="small">{r.comment}</T> : null}
              </View>
            </View>
          );
        })}

        {sent ? (
          <T variant="small" style={{ marginTop: spacing.md, color: theme.status.AVAILABLE }}>
            {t('community.thanks')}
          </T>
        ) : null}
        {send.isError ? (
          <T variant="small" style={{ marginTop: spacing.md, color: theme.danger }}>
            {(send.error as Error).message}
          </T>
        ) : null}

        {formOpen ? (
          <View style={{ marginTop: spacing.md }}>
            <View style={styles.wrap}>
              {PROBLEM_TYPES.map((pt) => (
                <Chip
                  key={pt}
                  label={t(`community.types.${pt}`)}
                  selected={type === pt}
                  onPress={() => setType(pt)}
                />
              ))}
            </View>
            <TextInput
              value={comment}
              onChangeText={setComment}
              maxLength={280}
              multiline
              placeholder={t('community.commentPlaceholder')}
              placeholderTextColor={theme.textMuted}
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg },
              ]}
            />
            <Button
              label={t('community.send')}
              icon="send"
              onPress={() => send.mutate({ type, comment: comment.trim() || undefined })}
              style={{ opacity: send.isPending ? 0.5 : 1 }}
            />
          </View>
        ) : (
          <View style={[styles.wrap, { marginTop: spacing.md }]}>
            <Chip
              icon="checkmark-circle-outline"
              label={t('community.worked')}
              onPress={() => send.mutate({ type: 'WORKS' })}
            />
            <Chip
              icon="alert-circle-outline"
              label={t('community.problem')}
              onPress={() => setFormOpen(true)}
            />
          </View>
        )}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  report: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  input: {
    minHeight: 72,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: 15,
    textAlignVertical: 'top',
  },
});
