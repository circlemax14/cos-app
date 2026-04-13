import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useTrends, useTrendExplanation } from '@/hooks/use-trends';
import type { LongitudinalTrend } from '@/services/api/types';
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

// ─── Direction config ─────────────────────────────────────────────────────────

const DIRECTION_CONFIG: Record<
  LongitudinalTrend['trendDirection'],
  { label: string; indicator: string; color: string; bg: string }
> = {
  improving: { label: 'Improving', indicator: '↓', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  worsening: { label: 'Worsening', indicator: '↑', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
  stable: { label: 'Stable', indicator: '→', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  insufficient_data: { label: 'Insufficient Data', indicator: '?', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  LongitudinalTrend['category'],
  { label: string }
> = {
  lab: { label: 'Lab Results' },
  vital: { label: 'Vitals' },
  score: { label: 'Health Scores' },
};

// ─── Explanation sub-component ────────────────────────────────────────────────

function TrendExplanationPanel({
  metricCode,
  colors,
  getScaledFontSize,
}: {
  metricCode: string;
  colors: (typeof Colors)['light'];
  getScaledFontSize: (size: number) => number;
}) {
  const { data, isLoading } = useTrendExplanation(metricCode);

  if (isLoading) {
    return (
      <View style={[styles.explanationPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.explanationPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ color: '#dc2626', fontSize: getScaledFontSize(13) }}>
          Could not load explanation. Please try again.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.explanationPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: '600', marginBottom: 4 }}>
        What this means
      </Text>
      <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), marginBottom: 12, lineHeight: getScaledFontSize(20) }}>
        {data.explanation}
      </Text>

      {data.factors.length > 0 && (
        <>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: '600', marginBottom: 4 }}>
            Contributing factors
          </Text>
          {data.factors.map((factor, i) => (
            <Text
              key={i}
              style={{ color: colors.text, fontSize: getScaledFontSize(13), marginBottom: 4, lineHeight: getScaledFontSize(20) }}
            >
              • {factor}
            </Text>
          ))}
          <View style={{ marginBottom: 8 }} />
        </>
      )}

      <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: '600', marginBottom: 4 }}>
        Recommendation
      </Text>
      <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), lineHeight: getScaledFontSize(20) }}>
        {data.recommendation}
      </Text>
    </View>
  );
}

// ─── Data points list (chart replacement for RN) ──────────────────────────────

function DataPointsList({
  trend,
  colors,
  getScaledFontSize,
}: {
  trend: LongitudinalTrend;
  colors: (typeof Colors)['light'];
  getScaledFontSize: (size: number) => number;
}) {
  // Show most recent 5 data points
  const recent = useMemo(
    () => [...trend.dataPoints].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [trend.dataPoints],
  );

  if (recent.length === 0) return null;

  return (
    <View style={[styles.dataPointsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 8,
        }}
      >
        Recent values
      </Text>
      {recent.map((dp, i) => {
        const interpColor =
          dp.interpretation === 'high' || dp.interpretation === 'critical'
            ? '#dc2626'
            : dp.interpretation === 'low'
            ? '#f59e0b'
            : colors.text;

        return (
          <View key={i} style={styles.dataPointRow}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), flex: 1 }}>
              {dp.date.slice(0, 10)}
            </Text>
            <Text
              style={{
                color: interpColor,
                fontSize: getScaledFontSize(14),
                fontWeight: '600',
              }}
            >
              {dp.value} {dp.unit}
            </Text>
            {dp.referenceRange && (
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginLeft: 6 }}>
                ({dp.referenceRange.low}–{dp.referenceRange.high})
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Trend card ───────────────────────────────────────────────────────────────

function TrendCard({
  trend,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  trend: LongitudinalTrend;
  colors: (typeof Colors)['light'];
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string;
}) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const dir = DIRECTION_CONFIG[trend.trendDirection];

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityLabel={`${trend.metricName}: ${dir.label}`}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(700) as any,
              marginBottom: 2,
            }}
          >
            {trend.metricName}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>
            {trend.trendPeriod}
          </Text>
        </View>

        {/* Direction badge */}
        <View style={[styles.badge, { backgroundColor: dir.bg }]}>
          <Text style={{ color: dir.color, fontSize: getScaledFontSize(12), fontWeight: '600' }}>
            {dir.indicator} {dir.label}
            {trend.trendPercentage !== undefined
              ? `  ${trend.trendPercentage > 0 ? '+' : ''}${trend.trendPercentage}%`
              : ''}
          </Text>
        </View>
      </View>

      {/* Data points list */}
      <DataPointsList trend={trend} colors={colors} getScaledFontSize={getScaledFontSize} />

      {/* Explanation panel */}
      {explanationOpen && (
        <TrendExplanationPanel
          metricCode={trend.metricCode}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
        />
      )}

      {/* Explain button */}
      <TouchableOpacity
        onPress={() => setExplanationOpen((prev) => !prev)}
        style={[styles.explainButton, { borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={
          explanationOpen
            ? `Hide explanation for ${trend.metricName}`
            : `Explain trend for ${trend.metricName}`
        }
      >
        <Text style={{ color: colors.tint, fontSize: getScaledFontSize(13), fontWeight: '600' }}>
          {explanationOpen ? 'Hide Explanation' : 'Explain This Trend'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HealthTrendsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useTrends();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const grouped = useMemo(() => {
    const items = data ?? [];
    const groups: Partial<Record<LongitudinalTrend['category'], LongitudinalTrend[]>> = {};
    for (const trend of items) {
      if (!groups[trend.category]) groups[trend.category] = [];
      groups[trend.category]!.push(trend);
    }
    return (['lab', 'vital', 'score'] as const)
      .filter((cat) => (groups[cat]?.length ?? 0) > 0)
      .map((cat) => ({ category: cat, trends: groups[cat]! }));
  }, [data]);

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
            Loading health trends...
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
            Failed to load health trends
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryButton, { backgroundColor: colors.tint }]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading health trends"
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
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📈</Text>
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
            Health Trends
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center' }}>
            Longitudinal view of your key health metrics
          </Text>
        </View>

        {grouped.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📊</Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(600) as any,
                textAlign: 'center',
                marginBottom: 6,
              }}
            >
              No trend data available yet
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                textAlign: 'center',
                lineHeight: getScaledFontSize(20),
              }}
            >
              As more lab results come in, trends will appear here.
            </Text>
          </View>
        ) : (
          grouped.map(({ category, trends }) => (
            <View key={category} style={styles.categoryGroup}>
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(600) as any,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  paddingLeft: 4,
                }}
                accessibilityRole="header"
              >
                {CATEGORY_CONFIG[category].label}
              </Text>
              {trends.map((trend) => (
                <TrendCard
                  key={trend.id}
                  trend={trend}
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                />
              ))}
            </View>
          ))
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
  categoryGroup: {
    marginBottom: 24,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dataPointsContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  dataPointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  explanationPanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  explainButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 4,
  },
});
