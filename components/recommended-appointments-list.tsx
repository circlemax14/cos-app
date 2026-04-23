import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  useRecommendedAppointments,
  useUpdateRecommendedAppointmentStatus,
} from '@/hooks/use-recommended-appointments';
import type { RecommendedAppointment } from '@/services/api/types';
import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const SOURCE_LABELS: Record<RecommendedAppointment['sourceType'], string> = {
  service_request: "Doctor's order",
  care_plan: 'Care plan',
  encounter_pattern: 'Visit pattern detected',
  nlp_extraction: 'Visit notes',
};

const URGENCY_CONFIG: Record<
  RecommendedAppointment['urgency'],
  { label: string; indicator: string; bg: string; text: string; order: number }
> = {
  urgent: { label: 'Urgent', indicator: '🔴', bg: '#FFEBEE', text: '#C62828', order: 0 },
  soon: { label: 'Soon', indicator: '🟡', bg: '#FFF8E1', text: '#E65100', order: 1 },
  routine: { label: 'Routine', indicator: '⚪', bg: '#F5F5F5', text: '#616161', order: 2 },
};

function formatDate(dateStr: string | null | undefined): string {
  // Backend stores full ISO timestamps (e.g. "2026-05-07T08:10:35.694Z").
  // Older data may still be a plain "YYYY-MM-DD". Strip any time portion
  // first so both shapes parse reliably, then treat the remainder as a
  // local calendar date.
  if (!dateStr || typeof dateStr !== 'string') return '';
  const dateOnly = dateStr.slice(0, 10);
  const d = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Renders the list of AI-recommended appointments grouped by urgency.
 * Used inline inside the Appointments screen's "Recommended" tab so the
 * user never leaves the Appointments context. Also used standalone by
 * the legacy /Home/recommended-appointments route.
 *
 * Does NOT include any page header, refresh control, or ScrollView —
 * the caller wraps this content as needed.
 */
export function RecommendedAppointmentsList() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data, isLoading, isError, refetch } = useRecommendedAppointments({ status: 'pending' });
  const { mutate: updateStatus } = useUpdateRecommendedAppointmentStatus();

  const grouped = useMemo(() => {
    const items = data ?? [];
    const groups: Partial<Record<RecommendedAppointment['urgency'], RecommendedAppointment[]>> = {};
    for (const item of items) {
      if (!groups[item.urgency]) groups[item.urgency] = [];
      groups[item.urgency]!.push(item);
    }
    return (['urgent', 'soon', 'routine'] as const)
      .filter((u) => (groups[u]?.length ?? 0) > 0)
      .map((u) => ({ urgency: u, items: groups[u]! }));
  }, [data]);

  const handleScheduled = useCallback(
    (item: RecommendedAppointment) => {
      Alert.alert('Mark as Scheduled', `Have you scheduled "${item.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, I scheduled it',
          onPress: () => updateStatus({ id: item.id, status: 'scheduled' }),
        },
      ]);
    },
    [updateStatus],
  );

  const handleDismiss = useCallback(
    (item: RecommendedAppointment) => {
      Alert.alert(
        'Dismiss Recommendation',
        `Dismiss "${item.title}"? You can optionally note a reason.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Dismiss',
            style: 'destructive',
            onPress: () => updateStatus({ id: item.id, status: 'dismissed' }),
          },
          {
            text: 'Already have one',
            onPress: () =>
              updateStatus({
                id: item.id,
                status: 'dismissed',
                reason: 'Already have an appointment scheduled',
              }),
          },
        ],
      );
    },
    [updateStatus],
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
          Loading recommendations…
        </Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>😔</Text>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(16),
            fontWeight: getScaledFontWeight(600) as any,
            marginBottom: 8,
          }}
        >
          Failed to load recommendations
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={[styles.retryButton, { backgroundColor: colors.tint }]}
          accessibilityRole="button"
        >
          <Text style={{ color: '#fff', fontSize: getScaledFontSize(16) }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (grouped.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(16),
            fontWeight: getScaledFontWeight(600) as any,
            textAlign: 'center',
            marginBottom: 6,
          }}
        >
          {"You're all caught up!"}
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(14),
            textAlign: 'center',
            lineHeight: getScaledFontSize(20),
          }}
        >
          No pending appointment recommendations at this time.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {grouped.map(({ urgency, items }) => {
        const urgencyConfig = URGENCY_CONFIG[urgency];
        return (
          <View key={urgency} style={styles.urgencyGroup}>
            <View style={styles.urgencyHeader}>
              <Text style={{ fontSize: getScaledFontSize(14) }}>{urgencyConfig.indicator}</Text>
              <Text
                style={{
                  color: urgencyConfig.text,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(600) as any,
                  marginLeft: 6,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
                accessibilityRole="header"
              >
                {urgencyConfig.label}
              </Text>
            </View>

            {items.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderLeftColor: urgencyConfig.text,
                  },
                ]}
                accessibilityLabel={`${item.title}, ${urgencyConfig.label} urgency, recommended by ${formatDate(item.recommendedByDate)}`}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(600) as any,
                    marginBottom: 4,
                  }}
                >
                  {item.title}
                </Text>

                {item.specialty ? (
                  <Text
                    style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 2 }}
                  >
                    {item.specialty}
                  </Text>
                ) : null}

                <Text
                  style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 8 }}
                  numberOfLines={2}
                >
                  {item.reason}
                </Text>

                <View style={styles.metaRow}>
                  {(() => {
                    const formatted = formatDate(item.recommendedByDate);
                    if (!formatted) return null;
                    return (
                      <View style={[styles.badge, { backgroundColor: urgencyConfig.bg }]}>
                        <Text
                          style={{
                            color: urgencyConfig.text,
                            fontSize: getScaledFontSize(11),
                            fontWeight: '600',
                          }}
                        >
                          By {formatted}
                        </Text>
                      </View>
                    );
                  })()}
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                    ]}
                  >
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11) }}>
                      {SOURCE_LABELS[item.sourceType]}
                    </Text>
                  </View>
                </View>

                {item.relatedCondition ? (
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(12),
                      fontStyle: 'italic',
                      marginTop: 4,
                      marginBottom: 4,
                    }}
                  >
                    Related: {item.relatedCondition}
                  </Text>
                ) : null}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => handleScheduled(item)}
                    style={[styles.actionButton, { backgroundColor: colors.tint }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${item.title} as scheduled`}
                  >
                    <Text
                      style={{ color: '#fff', fontSize: getScaledFontSize(13), fontWeight: '600' }}
                    >
                      I Scheduled This
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDismiss(item)}
                    style={[
                      styles.actionButton,
                      { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Dismiss ${item.title} recommendation`}
                  >
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
                      Dismiss
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { paddingVertical: 48, paddingHorizontal: 24, alignItems: 'center' },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  emptyContainer: { alignItems: 'center', padding: 32, borderRadius: 16 },
  urgencyGroup: { marginBottom: 20 },
  urgencyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingLeft: 4 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
});
