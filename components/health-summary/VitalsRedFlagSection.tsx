import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends';
import type { LongitudinalTrend, TrendDataPoint } from '@/services/api/types';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  evaluateHRVTrend,
  evaluateRestingHR,
  evaluateSpO2,
  splitHRVTrend,
  HRV_MIN_SAMPLES,
  type Severity,
} from '@/lib/vitals-red-flag-rules';

type TrafficLight = 'green' | 'amber' | 'red' | 'gray';

/**
 * Map the rules-module Severity (which includes `info` for insufficient
 * data / non-actionable) into v5's TrafficLight (which has `gray` instead).
 * Keeping this bridge here — not in the rules module — because `gray` is a
 * UI-only affordance and the rules module is deliberately React-free.
 */
function toLight(severity: Severity): TrafficLight {
  switch (severity) {
    case 'red':
      return 'red';
    case 'amber':
      return 'amber';
    case 'green':
      return 'green';
    case 'info':
    default:
      return 'gray';
  }
}

function mean(xs: number[]): number {
  const finite = xs.filter(Number.isFinite);
  if (finite.length === 0) return NaN;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

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
  restingHR: 'hk-resting-hr',
  hrv: 'hk-hrv',
  spo2: 'hk-spo2',
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
  // Filter out non-finite `.value` so downstream tiles + rules never see
  // null/undefined/NaN emitted by HealthKit for gaps in the series.
  return [...trend.dataPoints]
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
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
  const hrTrend = byMetric.get(METRIC_CODE.restingHR);
  const hrvTrend = byMetric.get(METRIC_CODE.hrv);
  const spo2Trend = byMetric.get(METRIC_CODE.spo2);
  const restingHR = latest(hrTrend);
  const hrvLatest = latest(hrvTrend);
  const spo2 = latest(spo2Trend);

  // Row 1 lights — kept as v5 inline helpers (mirror the rules module).
  const bpLightVal = bpLight(sys?.value, dia?.value);
  const glucoseLightVal = glucoseLight(glu?.value);
  const stepsLightVal = stepsLight(steps?.value);

  // Row 2 lights — sourced from the shared rules module (single source of
  // truth with the observer hook + backend evaluator).
  const hrLightVal: TrafficLight = restingHR
    ? toLight(evaluateRestingHR(restingHR.value).severity)
    : 'gray';
  const spo2LightVal: TrafficLight = spo2
    ? toLight(evaluateSpO2(spo2.value).severity)
    : 'gray';

  // HRV tile light: reuse the trend verdict when we have enough samples,
  // otherwise fall back to gray (matches other tiles' missing-data affordance).
  const hrvSplit = useMemo(
    () => splitHRVTrend(hrvTrend?.dataPoints ?? []),
    [hrvTrend?.dataPoints],
  );
  const hrvRecentAvg = useMemo(() => mean(hrvSplit.recent), [hrvSplit.recent]);
  const hrvPriorAvg = useMemo(() => mean(hrvSplit.prior), [hrvSplit.prior]);
  const hrvVerdict = useMemo(
    () => evaluateHRVTrend(hrvRecentAvg, hrvPriorAvg, hrvSplit.sampleCount),
    [hrvRecentAvg, hrvPriorAvg, hrvSplit.sampleCount],
  );
  // Gate the tile light on the SAME per-window rule the callout uses. When
  // either window is short we fall to gray so the tile can't be amber/red
  // with no callout to explain it (would strand the user).
  const hrvHasBothWindows =
    hrvSplit.recent.length >= HRV_MIN_SAMPLES && hrvSplit.prior.length >= HRV_MIN_SAMPLES;
  const hrvLightVal: TrafficLight = hrvHasBothWindows ? toLight(hrvVerdict.severity) : 'gray';
  const hrvSubtitle =
    hrvLatest && !hrvHasBothWindows
      ? hrvSplit.sampleCount < HRV_MIN_SAMPLES
        ? `Need ${HRV_MIN_SAMPLES}+ days for a trend`
        : `Need ${HRV_MIN_SAMPLES} recent + ${HRV_MIN_SAMPLES} prior days for a trend`
      : undefined;

  // Aggregate counts across all six tiles (gray excluded).
  const aggregate = useMemo(() => {
    const lights: TrafficLight[] = [
      bpLightVal,
      glucoseLightVal,
      stepsLightVal,
      hrLightVal,
      hrvLightVal,
      spo2LightVal,
    ];
    let green = 0;
    let amber = 0;
    let red = 0;
    for (const l of lights) {
      if (l === 'green') green += 1;
      else if (l === 'amber') amber += 1;
      else if (l === 'red') red += 1;
    }
    return { green, amber, red, allGray: green + amber + red === 0 };
  }, [bpLightVal, glucoseLightVal, stepsLightVal, hrLightVal, hrvLightVal, spo2LightVal]);

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

  // Hide the aggregate pill entirely when Apple Health is off/non-iOS or all
  // tiles are gray (no meaningful signal to summarise).
  const showAggregate = !iosDisabled && !aggregate.allGray;
  const aggregateBadge = showAggregate ? (
    <View
      style={[styles.aggregatePill, { borderColor: colors.border, backgroundColor: colors.card }]}
      accessibilityRole="text"
      accessibilityLabel={`Aggregate: ${aggregate.green} in range, ${aggregate.amber} watch, ${aggregate.red} red`}
    >
      <View style={styles.aggregateCell}>
        <View
          style={[styles.aggregateDot, { backgroundColor: LIGHT_COLOR.green }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
        >
          {aggregate.green}
        </Text>
      </View>
      <View style={styles.aggregateCell}>
        <View
          style={[styles.aggregateDot, { backgroundColor: LIGHT_COLOR.amber }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
        >
          {aggregate.amber}
        </Text>
      </View>
      <View style={styles.aggregateCell}>
        <View
          style={[styles.aggregateDot, { backgroundColor: LIGHT_COLOR.red }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
        >
          {aggregate.red}
        </Text>
      </View>
    </View>
  ) : undefined;

  // HRV trend callout: only render when BOTH windows are full (recent +
  // prior each have ≥ HRV_MIN_SAMPLES finite samples) AND the resulting
  // averages are finite AND the verdict is actionable. Guarding on the
  // window lengths (rather than the union sampleCount) avoids the
  // "vs Y ms the HRV_MIN_SAMPLES days before" copy going NaN when the
  // prior window is short, and the finite checks defend against gaps that
  // survive splitHRVTrend upstream.
  const showHRVCallout =
    !iosDisabled &&
    hrvHasBothWindows &&
    Number.isFinite(hrvRecentAvg) &&
    Number.isFinite(hrvPriorAvg) &&
    hrvVerdict.severity !== 'info';
  const hrvCalloutTitle =
    hrvVerdict.severity === 'green'
      ? 'HRV steady'
      : hrvVerdict.severity === 'amber' || hrvVerdict.severity === 'red'
        ? 'HRV trending down'
        : null;

  return (
    <SummaryCardShell
      title="Vitals & red flags"
      icon="monitor-heart"
      accentColor="#DC2626"
      isEmpty={iosDisabled}
      emptyState={<EmptyStateHint text={emptyText} />}
      titleBadge={aggregateBadge}
      badgeAccessibilityLabel={
        showAggregate
          ? `Aggregate: ${aggregate.green} in range, ${aggregate.amber} watch, ${aggregate.red} red`
          : undefined
      }
    >
      <View style={styles.grid}>
        <View style={styles.row}>
          <Tile
            label="Blood pressure"
            value={sys && dia ? `${Math.round(sys.value)}/${Math.round(dia.value)}` : undefined}
            unit="mmHg"
            light={bpLightVal}
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
            light={glucoseLightVal}
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
            light={stepsLightVal}
            when={fmtWhen(steps?.date)}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            loading={showLoading}
          />
        </View>
        <View style={styles.row}>
          <Tile
            label="Resting HR"
            value={restingHR ? `${Math.round(restingHR.value)}` : undefined}
            unit="bpm"
            light={hrLightVal}
            when={fmtWhen(restingHR?.date)}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            loading={showLoading}
          />
          <Tile
            label="HRV (SDNN)"
            value={hrvLatest ? `${Math.round(hrvLatest.value)}` : undefined}
            unit="ms"
            light={hrvLightVal}
            when={fmtWhen(hrvLatest?.date)}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            subtitle={hrvSubtitle}
            loading={showLoading}
          />
          <Tile
            label="SpO2"
            value={spo2 ? `${Math.round(spo2.value)}` : undefined}
            unit="%"
            light={spo2LightVal}
            when={fmtWhen(spo2?.date)}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            loading={showLoading}
          />
        </View>
      </View>
      {showHRVCallout && hrvCalloutTitle ? (
        <View
          style={styles.hrvCallout}
          accessibilityRole="text"
          accessibilityLabel={`${hrvCalloutTitle}. Last ${HRV_MIN_SAMPLES} days averaged ${hrvRecentAvg.toFixed(0)} milliseconds versus ${hrvPriorAvg.toFixed(0)} milliseconds the ${HRV_MIN_SAMPLES} days before.`}
        >
          <MaterialIcons
            name={hrvVerdict.severity === 'green' ? 'trending-flat' : 'trending-down'}
            size={getScaledFontSize(18)}
            color={LIGHT_COLOR[hrvLightVal]}
            style={styles.hrvCalloutIcon}
          />
          <View style={styles.hrvCalloutText}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              {hrvCalloutTitle}
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                marginTop: 2,
              }}
            >
              Last {HRV_MIN_SAMPLES} days averaged {hrvRecentAvg.toFixed(0)} ms vs {hrvPriorAvg.toFixed(0)} ms the {HRV_MIN_SAMPLES} days before.
            </Text>
          </View>
        </View>
      ) : null}
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
  grid: { flexDirection: 'column', gap: Spacing.sm },
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
  aggregatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  aggregateCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aggregateDot: { width: 8, height: 8, borderRadius: 4 },
  hrvCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  hrvCalloutIcon: { marginTop: 1 },
  hrvCalloutText: { flex: 1 },
});

export default VitalsRedFlagSection;
