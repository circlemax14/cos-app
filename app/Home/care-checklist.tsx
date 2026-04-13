import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useCareGaps, useCareGapExplanation, useUpdateCareGapStatus } from '@/hooks/use-care-gaps';
import type { CareGap } from '@/services/api/types';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const PRIORITY_CONFIG: Record<
  CareGap['priority'],
  { label: string; indicator: string; bg: string; text: string; borderColor: string; order: number }
> = {
  high: { label: 'High Priority', indicator: '🔴', bg: '#FFEBEE', text: '#C62828', borderColor: '#C62828', order: 0 },
  medium: { label: 'Medium Priority', indicator: '🟡', bg: '#FFF8E1', text: '#E65100', borderColor: '#E65100', order: 1 },
  low: { label: 'Low Priority', indicator: '⚪', bg: '#F5F5F5', text: '#616161', borderColor: '#9E9E9E', order: 2 },
};

// Sub-component to isolate explanation fetching per card
function CareGapCard({
  item,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onAddressed,
}: {
  item: CareGap;
  colors: (typeof Colors)['light'];
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string;
  onAddressed: (item: CareGap) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const priorityConfig = PRIORITY_CONFIG[item.priority];

  // Only fetch explanation when the card is expanded
  const { data: explanation, isLoading: loadingExplanation } = useCareGapExplanation(
    expanded ? item.id : undefined,
  );

  const handleLearnMore = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderLeftColor: priorityConfig.borderColor,
        },
      ]}
      accessibilityLabel={`${item.title}, ${priorityConfig.label}`}
    >
      {/* Title */}
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

      {/* Description */}
      <Text
        style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 8, lineHeight: getScaledFontSize(20) }}
      >
        {item.description}
      </Text>

      {/* Overdue badge */}
      {item.overdueDays != null && item.overdueDays > 0 ? (
        <Text
          style={{
            color: '#C62828',
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(600) as any,
            marginBottom: 6,
          }}
          accessibilityLabel={`${item.overdueDays} days overdue`}
        >
          {item.overdueDays} days overdue
        </Text>
      ) : null}

      {/* Guideline source */}
      {item.guidelineSource ? (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            fontStyle: 'italic',
            marginBottom: 8,
          }}
        >
          Source: {item.guidelineSource}
        </Text>
      ) : null}

      {/* Explanation panel */}
      {expanded ? (
        <View
          style={[styles.explanationPanel, { backgroundColor: priorityConfig.bg, borderColor: priorityConfig.borderColor }]}
        >
          {loadingExplanation ? (
            <ActivityIndicator size="small" color={priorityConfig.text} />
          ) : explanation ? (
            <>
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(600) as any,
                  marginBottom: 4,
                }}
              >
                Why this matters
              </Text>
              <Text
                style={{ color: colors.text, fontSize: getScaledFontSize(13), marginBottom: 10, lineHeight: getScaledFontSize(20) }}
              >
                {explanation.explanation}
              </Text>

              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(600) as any,
                  marginBottom: 4,
                }}
              >
                Risk if unaddressed
              </Text>
              <Text
                style={{ color: colors.text, fontSize: getScaledFontSize(13), marginBottom: 10, lineHeight: getScaledFontSize(20) }}
              >
                {explanation.risk}
              </Text>

              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(600) as any,
                  marginBottom: 4,
                }}
              >
                Recommended action
              </Text>
              <Text
                style={{ color: colors.text, fontSize: getScaledFontSize(13), lineHeight: getScaledFontSize(20) }}
              >
                {explanation.action}
              </Text>
            </>
          ) : (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
              Unable to load explanation. Please try again.
            </Text>
          )}
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={handleLearnMore}
          style={[
            styles.actionButton,
            { backgroundColor: colors.card, borderWidth: 1, borderColor: priorityConfig.borderColor },
          ]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? `Collapse explanation for ${item.title}` : `Learn more about ${item.title}`}
        >
          <Text style={{ color: priorityConfig.text, fontSize: getScaledFontSize(13), fontWeight: '600' }}>
            {expanded ? 'Show Less' : 'Learn More'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onAddressed(item)}
          style={[styles.actionButton, { backgroundColor: colors.tint }]}
          accessibilityRole="button"
          accessibilityLabel={`Mark ${item.title} as scheduled`}
        >
          <Text style={{ color: '#fff', fontSize: getScaledFontSize(13), fontWeight: '600' }}>
            {"I've Scheduled This"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CareChecklistScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useCareGaps({ status: 'open' });
  const { mutate: updateStatus } = useUpdateCareGapStatus();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const grouped = useMemo(() => {
    const items = data ?? [];
    const groups: Partial<Record<CareGap['priority'], CareGap[]>> = {};
    for (const item of items) {
      if (!groups[item.priority]) groups[item.priority] = [];
      groups[item.priority]!.push(item);
    }
    return (['high', 'medium', 'low'] as const)
      .filter((p) => (groups[p]?.length ?? 0) > 0)
      .map((p) => ({ priority: p, items: groups[p]! }));
  }, [data]);

  const handleAddressed = useCallback(
    (item: CareGap) => {
      updateStatus({ id: item.id, status: 'addressed' });
    },
    [updateStatus],
  );

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
            Loading care checklist...
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
            Failed to load care checklist
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryButton, { backgroundColor: colors.tint }]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading care checklist"
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
          <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
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
            Care Checklist
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center' }}>
            Gaps in your care detected from your health records
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
              {"You're all caught up"}
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                textAlign: 'center',
                lineHeight: getScaledFontSize(20),
              }}
            >
              No care gaps detected.
            </Text>
          </View>
        ) : (
          grouped.map(({ priority, items }) => {
            const priorityConfig = PRIORITY_CONFIG[priority];
            return (
              <View key={priority} style={styles.priorityGroup}>
                {/* Priority heading */}
                <View style={styles.priorityHeader}>
                  <Text style={{ fontSize: getScaledFontSize(14) }}>{priorityConfig.indicator}</Text>
                  <Text
                    style={{
                      color: priorityConfig.text,
                      fontSize: getScaledFontSize(13),
                      fontWeight: getScaledFontWeight(600) as any,
                      marginLeft: 6,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}
                    accessibilityRole="header"
                  >
                    {priorityConfig.label}
                  </Text>
                </View>

                {items.map((item) => (
                  <CareGapCard
                    key={item.id}
                    item={item}
                    colors={colors}
                    getScaledFontSize={getScaledFontSize}
                    getScaledFontWeight={getScaledFontWeight}
                    onAddressed={handleAddressed}
                  />
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
  priorityGroup: {
    marginBottom: 20,
  },
  priorityHeader: {
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
  explanationPanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
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
