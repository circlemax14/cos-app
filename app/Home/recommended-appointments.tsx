import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useRecommendedAppointments, useUpdateRecommendedAppointmentStatus } from '@/hooks/use-recommended-appointments';
import type { RecommendedAppointment } from '@/services/api/types';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RecommendedAppointmentsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useRecommendedAppointments({ status: 'pending' });
  const { mutate: updateStatus } = useUpdateRecommendedAppointmentStatus();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const grouped = useMemo(() => {
    const items = data ?? [];
    const groups: Partial<Record<RecommendedAppointment['urgency'], RecommendedAppointment[]>> = {};
    for (const item of items) {
      if (!groups[item.urgency]) groups[item.urgency] = [];
      groups[item.urgency]!.push(item);
    }
    return (['urgent', 'soon', 'routine'] as const).filter((u) => (groups[u]?.length ?? 0) > 0).map((u) => ({
      urgency: u,
      items: groups[u]!,
    }));
  }, [data]);

  const handleScheduled = useCallback(
    (item: RecommendedAppointment) => {
      Alert.alert(
        'Mark as Scheduled',
        `Have you scheduled "${item.title}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, I scheduled it',
            onPress: () => updateStatus({ id: item.id, status: 'scheduled' }),
          },
        ],
      );
    },
    [updateStatus],
  );

  const handleDismiss = useCallback(
    (item: RecommendedAppointment) => {
      // Alert.prompt is iOS-only, use a 3-button pattern for cross-platform dismiss
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
              updateStatus({ id: item.id, status: 'dismissed', reason: 'Already have an appointment scheduled' }),
          },
        ],
      );
    },
    [updateStatus],
  );

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
            Loading recommendations...
          </Text>
        </View>
      </AppWrapper>
    );
  }

  if (isError) {
    return (
      <AppWrapper>
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
            accessibilityLabel="Retry loading recommended appointments"
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(16) }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              textAlign: 'center',
              marginBottom: 4,
            }}
            accessibilityRole="header"
          >
            Recommended Appointments
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center' }}>
            Based on your health records and care plan
          </Text>
        </View>

        {grouped.length === 0 ? (
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
              You're all caught up!
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
        ) : (
          grouped.map(({ urgency, items }) => {
            const urgencyConfig = URGENCY_CONFIG[urgency];
            return (
              <View key={urgency} style={styles.urgencyGroup}>
                {/* Urgency heading */}
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
                      { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: urgencyConfig.text },
                    ]}
                    accessibilityLabel={`${item.title}, ${urgencyConfig.label} urgency, recommended by ${formatDate(item.recommendedByDate)}`}
                  >
                    {/* Title + specialty */}
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
                      <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 2 }}>
                        {item.specialty}
                      </Text>
                    ) : null}

                    <Text
                      style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 8 }}
                      numberOfLines={2}
                    >
                      {item.reason}
                    </Text>

                    {/* Meta row */}
                    <View style={styles.metaRow}>
                      <View style={[styles.badge, { backgroundColor: urgencyConfig.bg }]}>
                        <Text style={{ color: urgencyConfig.text, fontSize: getScaledFontSize(11), fontWeight: '600' }}>
                          By {formatDate(item.recommendedByDate)}
                        </Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
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

                    {/* Action buttons */}
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        onPress={() => handleScheduled(item)}
                        style={[styles.actionButton, { backgroundColor: colors.tint }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark ${item.title} as scheduled`}
                      >
                        <Text style={{ color: '#fff', fontSize: getScaledFontSize(13), fontWeight: '600' }}>
                          I Scheduled This
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDismiss(item)}
                        style={[styles.actionButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Dismiss ${item.title} recommendation`}
                      >
                        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: 16,
    marginBottom: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
  },
  urgencyGroup: {
    marginBottom: 20,
  },
  urgencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingLeft: 4,
  },
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
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
});
