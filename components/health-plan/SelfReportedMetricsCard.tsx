/**
 * Self-reported metrics history — patient-submitted values captured
 * via daily-task RECORD pills, summarised on the Health Plan →
 * Progress tab.
 *
 * Build 49 (SCRUM-279). Ken: "we need to maintain this chart in
 * plan progress".
 *
 * Approach (MVP): one card per metric type the patient has logged.
 * Each card shows:
 *   - Metric label + unit
 *   - Latest reading (large) and timestamp
 *   - Mini sparkline of up to last 14 readings
 *   - Tap → expanded modal with full history list (out of scope for
 *     v1 — placeholder for follow-up)
 *
 * Pure RN — no chart library dependency to keep the bundle lean.
 * The sparkline is hand-rolled using <View> rectangles, which is
 * good enough for 8–14 datapoints. If we need higher fidelity we
 * can swap in react-native-svg later without changing the API.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  listSelfReportedMetrics,
  type SelfReportedMetric,
  type SelfReportedMetricType,
} from '@/services/api/self-reported-metrics';

/** Human-friendly labels keyed by canonical metric type. */
const METRIC_LABELS: Record<SelfReportedMetricType, string> = {
  blood_glucose: 'Blood glucose',
  blood_pressure_systolic: 'BP (systolic)',
  blood_pressure_diastolic: 'BP (diastolic)',
  weight: 'Weight',
  water_intake: 'Water intake',
  temperature: 'Temperature',
  heart_rate: 'Heart rate',
  oxygen_saturation: 'Oxygen saturation',
  pain_level: 'Pain level',
  mood: 'Mood',
  sleep_hours: 'Sleep',
  steps: 'Steps',
};

/** Default per-type units (used as fallback if the row doesn't carry one). */
const METRIC_UNITS: Record<SelfReportedMetricType, string> = {
  blood_glucose: 'mg/dL',
  blood_pressure_systolic: 'mmHg',
  blood_pressure_diastolic: 'mmHg',
  weight: 'lb',
  water_intake: 'oz',
  temperature: '°F',
  heart_rate: 'bpm',
  oxygen_saturation: '%',
  pain_level: '/10',
  mood: '/10',
  sleep_hours: 'hr',
  steps: 'steps',
};

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 1000) return 'just now';
  if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / 60000)} min ago`;
  if (diffMs < day) return `${Math.floor(diffMs / 3600000)} h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} d ago`;
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

interface SparklineProps {
  values: number[];
  color: string;
  bg: string;
  height: number;
  width: number;
}

/**
 * Lean inline sparkline — no chart library. Renders a row of thin
 * bars whose heights map to each value's position in the
 * (min … max) range. Good enough for a quick "trending up/down"
 * read at the Progress-tab card density.
 */
function Sparkline({ values, color, bg, height, width }: SparklineProps): React.JSX.Element {
  if (values.length === 0) {
    return <View style={{ height, width, backgroundColor: bg, borderRadius: 4 }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const barCount = values.length;
  const gap = 2;
  const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, width, gap }}>
      {values.map((v, i) => {
        const h = Math.max(2, ((v - min) / span) * height);
        return (
          <View
            key={i}
            style={{ width: barWidth, height: h, backgroundColor: color, borderRadius: 2, opacity: 0.6 + (i / barCount) * 0.4 }}
          />
        );
      })}
    </View>
  );
}

interface MetricBucket {
  type: SelfReportedMetricType;
  latest: SelfReportedMetric;
  history: SelfReportedMetric[];
}

function bucketMetrics(rows: SelfReportedMetric[]): MetricBucket[] {
  const byType = new Map<SelfReportedMetricType, SelfReportedMetric[]>();
  for (const r of rows) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }
  const buckets: MetricBucket[] = [];
  for (const [type, list] of byType.entries()) {
    list.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    buckets.push({ type, latest: list[list.length - 1], history: list.slice(-14) });
  }
  // Sort buckets by most-recent reading first.
  buckets.sort((a, b) => b.latest.recordedAt.localeCompare(a.latest.recordedAt));
  return buckets;
}

export function SelfReportedMetricsCard(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const query = useQuery<SelfReportedMetric[]>({
    queryKey: ['self-reported-metrics-progress'],
    queryFn: () => listSelfReportedMetrics({ limit: 500 }),
    staleTime: 5 * 60 * 1000,
  });

  if (query.isLoading) {
    return (
      <Card style={[styles.card, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} style={{ margin: 20 }} />
      </Card>
    );
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    // Empty state — hint Ken/patient that this card populates from
    // the daily-task RECORD pill flow.
    return (
      <Card style={[styles.card, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }]}>
            Your readings
          </Text>
        </View>
        <Text style={[styles.empty, { color: colors.text + '88', fontSize: getScaledFontSize(13) }]}>
          When a daily task asks you to measure something (blood pressure, weight, glucose…), tap RECORD on the task to log your reading. Your history will appear here.
        </Text>
      </Card>
    );
  }

  const buckets = bucketMetrics(rows);

  return (
    <Card style={[styles.card, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }]}>
          Your readings
        </Text>
        <Text style={[styles.headerSub, { color: colors.text + '88', fontSize: getScaledFontSize(11) }]}>
          {rows.length} total
        </Text>
      </View>
      {buckets.map((b) => {
        const label = METRIC_LABELS[b.type] ?? b.type;
        const unit = b.latest.unit || METRIC_UNITS[b.type] || '';
        const sparkValues = b.history.map((h) => h.value);
        return (
          <View key={b.type} style={[styles.row, { borderTopColor: colors.text + '10' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.metricLabel, { color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }]}>
                {label}
              </Text>
              <Text style={[styles.metricMeta, { color: colors.text + '80', fontSize: getScaledFontSize(11) }]}>
                {fmtRelative(b.latest.recordedAt)} · {b.history.length} reading{b.history.length === 1 ? '' : 's'}
              </Text>
            </View>
            <Sparkline
              values={sparkValues}
              color={colors.tint ?? '#008080'}
              bg={(colors.tint ?? '#008080') + '15'}
              height={32}
              width={90}
            />
            <View style={styles.latestCol}>
              <Text style={[styles.latestValue, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                {Number.isInteger(b.latest.value) ? b.latest.value : b.latest.value.toFixed(1)}
              </Text>
              <Text style={[styles.latestUnit, { color: colors.text + '88', fontSize: getScaledFontSize(10) }]}>
                {unit}
              </Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerSub: { letterSpacing: 0.3 },
  title: { letterSpacing: 0.2 },
  empty: { lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metricLabel: { marginBottom: 2 },
  metricMeta: {},
  latestCol: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  latestValue: { letterSpacing: 0.2 },
  latestUnit: { letterSpacing: 0.5, textTransform: 'lowercase' },
});
