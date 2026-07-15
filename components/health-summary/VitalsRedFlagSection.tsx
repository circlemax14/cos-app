import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, type TextStyle } from 'react-native';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends';
import type { LongitudinalTrend, TrendDataPoint } from '@/services/api/types';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

type TrafficLight = 'green' | 'amber' | 'red' | 'gray';

const LIGHT_COLOR: Record<TrafficLight, string> = {
  green: '#16A34A',
  amber: '#D97706',
  red: '#DC2626',
  gray: '#9CA3AF',
};

// HealthKit trend metricCodes emitted by services/health.ts VITAL_SPECS.
// We key off metricCode (not metricName) so a rename of the display label
// upstream doesn't silently break the mapping here.
const METRIC_CODE = {
  bpSystolic: 'hk-bp-systolic',
  bpDiastolic: 'hk-bp-diastolic',
  glucose: 'hk-glucose',
  steps: 'hk-steps',
} as const;

// Adult-general thresholds. NOT personalised — footer disclaimer required.
// AHA staging, highest-severity-first so overlapping ranges resolve correctly.
function bpLight(sys?: number, dia?: number): TrafficLight {
  if (sys == null || dia == null) return 'gray';
  if (sys >= 140 || dia >= 90) return 'red'; // stage 2 hypertension
  if (sys >= 130 || dia >= 80) return 'amber'; // stage 1
  if (sys >= 120) return 'amber'; // elevated (dia < 80)
  return 'green'; // normal
}

// HealthKit does NOT distinguish fasting vs postprandial glucose, so we use
// non-fasting-safe thresholds here (≥140 amber = postprandial-normal upper
// edge, ≥180 red = any-time worrying). Tile label + subtitle make this
// explicit to the user.
function glucoseLight(v?: number): TrafficLight {
  if (v == null) return 'gray';
  if (v >= 180) return 'red';
  if (v >= 140) return 'amber';
  if (v < 70) return 'amber';
  return 'green';
}

function stepsLight(v?: number): TrafficLight {
  if (v == null) return 'gray';
  if (v < 5000) return 'amber';
  return 'green';
}

function latest(trend?: LongitudinalTrend): TrendDataPoint | undefined {
  if (!trend?.dataPoints?.length) return undefined;
  // ISO 8601 dates sort correctly with localeCompare; missing dates fall to
  // insertion order (defensive — HealthKit points always carry a date).
  return [...trend.dataPoints].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
}

function fmtWhen(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type ColorPalette = (typeof Colors)['light'];

interface TileProps {
  label: string;
  value?: string;
  unit: string;
  light: TrafficLight;
  when: string;
  colors: ColorPalette;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  /** Optional caveat/date rendered directly beneath the value. */
  subtitle?: string;
  /** When true, render a muted skeleton bar in place of the value. */
  loading?: boolean;
}

function Tile({
  label,
  value,
  unit,
  light,
  when,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  subtitle,
  loading,
}: TileProps) {
  const missing = !value;
  const dotAccessibilityLabel =
    light === 'red' ? 'red flag' : light === 'amber' ? 'watch' : light === 'green' ? 'in range' : 'no data';
  const accessibilityLabel = loading
    ? `${label}: loading`
    : `${label}: ${missing ? 'no recent data' : `${value} ${unit}`.trim()}, ${dotAccessibilityLabel}${missing ? '' : `, last ${when}`}${subtitle ? `, ${subtitle}` : ''}`;
  return (
    <View
      style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.card }]}
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.tileHeader}>
        <View
          style={[styles.dot, { backgroundColor: LIGHT_COLOR[loading ? 'gray' : light] }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {loading ? (
        <View style={[styles.skeleton, { backgroundColor: colors.border }]} accessibilityElementsHidden importantForAccessibility="no" />
      ) : missing ? (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            fontStyle: 'italic',
            marginTop: 6,
          }}
        >
          No recent data
        </Text>
      ) : (
        <>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
              marginTop: 4,
            }}
          >
            {value}
            {unit ? (
              <Text
                style={{
                  fontSize: getScaledFontSize(12),
                  color: colors.subtext,
                  fontWeight: '400',
                }}
              >
                {' '}
                {unit}
              </Text>
            ) : null}
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              marginTop: 2,
            }}
          >
            {when}
          </Text>
          {subtitle ? (
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(10),
                fontStyle: 'italic',
                marginTop: 2,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

function VitalsRedFlagSection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data: trends, disabled, isLoading } = useHealthKitTrends(90);

  const byMetric = useMemo(() => {
    const m = new Map<string, LongitudinalTrend>();
    (trends ?? []).forEach((t) => m.set(t.metricCode, t));
    return m;
  }, [trends]);

  const sys = latest(byMetric.get(METRIC_CODE.bpSystolic));
  const dia = latest(byMetric.get(METRIC_CODE.bpDiastolic));
  const glu = latest(byMetric.get(METRIC_CODE.glucose));
  const steps = latest(byMetric.get(METRIC_CODE.steps));

  // iOS-only surface. On Android or when the user has switched Apple Health
  // OFF in the app preference, render the platform-appropriate empty state.
  const iosDisabled = Platform.OS !== 'ios' || disabled;
  // While the HK trend query is still loading we keep the shell visible and
  // render skeleton tiles instead of the "No recent data" empty text — the
  // isEmpty gate would have swallowed the whole section otherwise.
  const showLoading = isLoading && !iosDisabled;
  const emptyText =
    Platform.OS === 'android'
      ? 'Health Connect for Android coming soon.'
      : 'Turn on Apple Health in Settings to see your vitals here.';

  return (
    <SummaryCardShell
      sectionNumber={6}
      title="Vitals & red flags"
      icon="monitor-heart"
      accentColor="#DC2626"
      isEmpty={iosDisabled}
      emptyState={<EmptyStateHint text={emptyText} />}
    >
      <View style={styles.row}>
        <Tile
          label="Blood pressure"
          value={sys && dia ? `${Math.round(sys.value)}/${Math.round(dia.value)}` : undefined}
          unit="mmHg"
          light={bpLight(sys?.value, dia?.value)}
          when={fmtWhen(sys?.date ?? dia?.date)}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          loading={showLoading}
        />
        <Tile
          label="Glucose (latest)"
          value={glu ? `${Math.round(glu.value)}` : undefined}
          unit={glu?.unit ?? 'mg/dL'}
          light={glucoseLight(glu?.value)}
          when={fmtWhen(glu?.date)}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          subtitle={glu ? 'Non-fasting ranges applied' : undefined}
          loading={showLoading}
        />
        <Tile
          label="Steps (last recorded)"
          value={steps ? `${Math.round(steps.value).toLocaleString()}` : undefined}
          unit=""
          light={stepsLight(steps?.value)}
          when={fmtWhen(steps?.date)}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          loading={showLoading}
        />
      </View>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(12),
          fontStyle: 'italic',
          marginTop: Spacing.sm,
        }}
      >
        Thresholds are general adult ranges, not personalized.
      </Text>
    </SummaryCardShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm + 2,
    minHeight: 92,
  },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  skeleton: {
    marginTop: 8,
    height: 22,
    width: '70%',
    borderRadius: 4,
    opacity: 0.6,
  },
});

export default VitalsRedFlagSection;
