/**
 * Vitals & Red Flags section (HS-3b, SCRUM-{fe}).
 *
 * Renders one tile per tracked vital (BP, Glucose, Steps, Resting HR, HRV,
 * SpO2) from Apple HealthKit longitudinal trends, with a colour band per
 * severity verdict computed in `lib/vitals-red-flag-rules.ts`. The rules
 * module is shared VERBATIM with the backend twin at
 * `cos-backend/src/services/vitals-red-flag-rules.ts`, so client and
 * server always agree on a verdict for the same input.
 *
 * Design contract:
 *   - iOS-only surface. Android + web short-circuit to `null` at the top.
 *   - `useHealthKitTrends(90).disabled` is the master gate. When the user
 *     has turned Apple Health OFF in the app preference (COS-397 /
 *     SCRUM-535) we render nothing — no tiles, no aggregate pill, no
 *     "recheck" callouts.
 *   - Aggregate pill above the tile grid counts flags whose severity is
 *     `amber` or `red` — `green` / `info` are neutral and never counted.
 *   - Under EACH tile, we render a trend-direction callout using
 *     `trend.trendDirection` (already computed by the healthkit trend
 *     builder). Previously the section dropped this via a `latest(...)`
 *     reader; the callout gives patients a directional read even when
 *     the current sample is green.
 *
 * Threshold helpers used to live inline in this file (lines 23-56 in the
 * pre-HS-3b version — the METRIC_CODE map + `bpLight` / `glucoseLight` /
 * `stepsLight` locals). They now live in `lib/vitals-red-flag-rules.ts`
 * so the observer hook, the notifications scheduler, and this UI all
 * evaluate the exact same numbers.
 */

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends';
import type { LongitudinalTrend, TrendDataPoint } from '@/services/api/types';
import {
  evaluateBP,
  evaluateGlucose,
  evaluateStepsDaily,
  evaluateRestingHR,
  evaluateHRVTrend,
  evaluateSpO2,
  severityRank,
  splitHRVTrend,
  type RuleVerdict,
  type Severity,
} from '../../lib/vitals-red-flag-rules';

// ── Metric code map ────────────────────────────────────────────────────────
// Source of truth for these codes: `services/health.ts` VITAL_SPECS. HRV is
// emitted as `hk-hrv` (not the SDNN-suffixed variant the spec draft
// mentions) — using the code that actually appears in the trend payload so
// the finder never misses. If services/health.ts ever renames one of these,
// update this map in lockstep.
const METRIC_CODE = {
  bpSystolic: 'hk-bp-systolic',
  bpDiastolic: 'hk-bp-diastolic',
  glucose: 'hk-glucose',
  steps: 'hk-steps',
  restingHr: 'hk-resting-hr',
  hrv: 'hk-hrv',
  spo2: 'hk-spo2',
} as const;

// ── Types ──────────────────────────────────────────────────────────────────

interface LatestReading {
  value: number;
  unit: string;
  observedAt: string;
}

interface TileModel {
  key: string;
  label: string;
  icon: string;
  verdict: RuleVerdict;
  reading: LatestReading | null;
  displayValue: string;
  trendDirection: LongitudinalTrend['trendDirection'];
  /** e.g. 'last 7d' / 'last 30d' — pulled from `trend.trendPeriod`. */
  trendPeriodLabel: string;
}

// ── Small helpers ──────────────────────────────────────────────────────────

function findTrend(trends: LongitudinalTrend[] | undefined, code: string): LongitudinalTrend | undefined {
  if (!trends) return undefined;
  return trends.find((t) => t.metricCode === code);
}

function latestPoint(trend: LongitudinalTrend | undefined): TrendDataPoint | null {
  if (!trend || trend.dataPoints.length === 0) return null;
  // dataPoints are ordered oldest → newest by the healthkit builder.
  return trend.dataPoints[trend.dataPoints.length - 1];
}

function formatObservedAt(iso: string | undefined): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function severityToTint(severity: Severity, isDark: boolean): { bg: string; border: string; text: string } {
  // Slightly muted in dark mode so the tile borders don't glare.
  const palette = {
    red: isDark
      ? { bg: '#3f1214', border: '#7f1d1d', text: '#fca5a5' }
      : { bg: '#fee2e2', border: '#dc2626', text: '#b91c1c' },
    amber: isDark
      ? { bg: '#3a2a10', border: '#b45309', text: '#fcd34d' }
      : { bg: '#fef3c7', border: '#d97706', text: '#b45309' },
    green: isDark
      ? { bg: '#0e2a1c', border: '#15803d', text: '#86efac' }
      : { bg: '#dcfce7', border: '#16a34a', text: '#166534' },
    info: isDark
      ? { bg: '#1e293b', border: '#475569', text: '#cbd5e1' }
      : { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' },
  } as const;
  return palette[severity];
}

function verdictLabel(severity: Severity): string {
  switch (severity) {
    case 'red':
      return 'Needs attention';
    case 'amber':
      return 'Watch';
    case 'green':
      return 'On track';
    case 'info':
    default:
      return 'Not enough data';
  }
}

/**
 * Direction callout copy — metric-neutral so the same wording is safe for
 * both higher-is-better (steps, HRV, SpO2) and lower-is-better (BP, glucose,
 * resting HR) metrics. Previously the "worsening" branch said "trending up",
 * which inverted for higher-is-better vitals (a DROP in HRV/SpO2/steps is
 * the worsening case). Framing the callout as "moving out of range" /
 * "moving toward range" removes the direction ambiguity entirely.
 */
function trendDirectionCopy(
  label: string,
  direction: LongitudinalTrend['trendDirection'],
  periodLabel: string,
): string | null {
  if (direction === 'insufficient_data') return null;
  if (direction === 'stable') return `${label} steady over ${periodLabel}`;
  if (direction === 'improving') return `${label} moving toward range over ${periodLabel}`;
  if (direction === 'worsening') return `${label} moving out of range over ${periodLabel}`;
  return null;
}

// ── Tile-model builders (one per metric) ───────────────────────────────────

function buildBpTile(trends: LongitudinalTrend[] | undefined): TileModel {
  const sysTrend = findTrend(trends, METRIC_CODE.bpSystolic);
  const diaTrend = findTrend(trends, METRIC_CODE.bpDiastolic);
  const sys = latestPoint(sysTrend);
  const dia = latestPoint(diaTrend);
  const systolic = sys?.value ?? NaN;
  const diastolic = dia?.value ?? NaN;
  const verdict = evaluateBP(systolic, diastolic);
  const displayValue =
    Number.isFinite(systolic) && Number.isFinite(diastolic)
      ? `${Math.round(systolic)}/${Math.round(diastolic)} mmHg`
      : '—';
  // Use whichever side has a longer / more recent trend for the direction
  // callout; systolic is the clinical anchor so it wins ties.
  const dirTrend = sysTrend ?? diaTrend;
  return {
    key: 'bp',
    label: 'Blood Pressure',
    icon: 'monitor-heart',
    verdict,
    reading:
      sys && dia
        ? { value: systolic, unit: 'mmHg', observedAt: sys.date }
        : null,
    displayValue,
    trendDirection: dirTrend?.trendDirection ?? 'insufficient_data',
    trendPeriodLabel: dirTrend?.trendPeriod ?? 'last 7d',
  };
}

function buildGlucoseTile(trends: LongitudinalTrend[] | undefined): TileModel {
  const trend = findTrend(trends, METRIC_CODE.glucose);
  const point = latestPoint(trend);
  const value = point?.value ?? NaN;
  const verdict = evaluateGlucose(value);
  return {
    key: 'glucose',
    label: 'Blood Glucose',
    icon: 'bloodtype',
    verdict,
    reading: point ? { value, unit: 'mg/dL', observedAt: point.date } : null,
    displayValue: Number.isFinite(value) ? `${Math.round(value)} mg/dL` : '—',
    trendDirection: trend?.trendDirection ?? 'insufficient_data',
    trendPeriodLabel: trend?.trendPeriod ?? 'last 7d',
  };
}

function buildStepsTile(trends: LongitudinalTrend[] | undefined): TileModel {
  const trend = findTrend(trends, METRIC_CODE.steps);
  const point = latestPoint(trend);
  const value = point?.value ?? NaN;
  const verdict = evaluateStepsDaily(value);
  return {
    key: 'steps',
    label: 'Steps',
    icon: 'directions-walk',
    verdict,
    reading: point ? { value, unit: 'steps', observedAt: point.date } : null,
    displayValue: Number.isFinite(value) ? `${Math.round(value).toLocaleString('en-US')} steps` : '—',
    trendDirection: trend?.trendDirection ?? 'insufficient_data',
    trendPeriodLabel: trend?.trendPeriod ?? 'last 7d',
  };
}

function buildRestingHrTile(trends: LongitudinalTrend[] | undefined): TileModel {
  const trend = findTrend(trends, METRIC_CODE.restingHr);
  const point = latestPoint(trend);
  const value = point?.value ?? NaN;
  const verdict = evaluateRestingHR(value);
  return {
    key: 'resting-hr',
    label: 'Resting Heart Rate',
    icon: 'favorite-border',
    verdict,
    reading: point ? { value, unit: 'bpm', observedAt: point.date } : null,
    displayValue: Number.isFinite(value) ? `${Math.round(value)} bpm` : '—',
    trendDirection: trend?.trendDirection ?? 'insufficient_data',
    trendPeriodLabel: trend?.trendPeriod ?? 'last 7d',
  };
}

function buildHrvTile(trends: LongitudinalTrend[] | undefined): TileModel {
  const trend = findTrend(trends, METRIC_CODE.hrv);
  const point = latestPoint(trend);
  const value = point?.value ?? NaN;
  // Use the shared time-based HRV split so this tile evaluates on the exact
  // same recent/prior window as `use-vitals-red-flag-notifications.ts`.
  const { recent, prior, sampleCount } = splitHRVTrend(trend?.dataPoints ?? []);
  const mean = (arr: number[]): number =>
    arr.length === 0 ? NaN : arr.reduce((s, v) => s + v, 0) / arr.length;
  const verdict = evaluateHRVTrend(mean(recent), mean(prior), sampleCount);
  return {
    key: 'hrv',
    label: 'Heart Rate Variability',
    icon: 'show-chart',
    verdict,
    reading: point ? { value, unit: 'ms', observedAt: point.date } : null,
    displayValue: Number.isFinite(value) ? `${Math.round(value)} ms` : '—',
    trendDirection: trend?.trendDirection ?? 'insufficient_data',
    trendPeriodLabel: trend?.trendPeriod ?? 'last 30d',
  };
}

function buildSpo2Tile(trends: LongitudinalTrend[] | undefined): TileModel {
  const trend = findTrend(trends, METRIC_CODE.spo2);
  const point = latestPoint(trend);
  const value = point?.value ?? NaN;
  const verdict = evaluateSpO2(value);
  return {
    key: 'spo2',
    label: 'Blood Oxygen',
    icon: 'air',
    verdict,
    reading: point ? { value, unit: '%', observedAt: point.date } : null,
    displayValue: Number.isFinite(value) ? `${value.toFixed(0)}%` : '—',
    trendDirection: trend?.trendDirection ?? 'insufficient_data',
    trendPeriodLabel: trend?.trendPeriod ?? 'last 7d',
  };
}

// ── Aggregate pill ─────────────────────────────────────────────────────────

interface AggregatePillProps {
  count: number;
}

function AggregatePill({ count }: AggregatePillProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const isDark = settings.isDarkTheme;

  // Zero-flag pill reads "All clear" in green so patients get a positive
  // signal instead of an empty header.
  const active = count > 0;
  const tint = active
    ? severityToTint('amber', isDark)
    : severityToTint('green', isDark);
  const label = active ? `${count} ${count === 1 ? 'flag needs attention' : 'flags need attention'}` : 'All clear';

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: tint.bg,
          borderColor: tint.border,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={active ? `${count} vitals need attention` : 'All vitals on track'}
    >
      <MaterialIcons
        name={active ? 'warning-amber' : 'check-circle'}
        size={getScaledFontSize(16)}
        color={tint.text}
      />
      <Text
        style={{
          color: tint.text,
          fontSize: getScaledFontSize(13),
          fontWeight: getScaledFontWeight(600) as any,
          marginLeft: 6,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          marginLeft: 8,
        }}
      >
        Non-fasting ranges applied
      </Text>
    </View>
  );
}

// ── Tile component ─────────────────────────────────────────────────────────

interface VitalTileProps {
  tile: TileModel;
}

function VitalTile({ tile }: VitalTileProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const isDark = settings.isDarkTheme;
  const tint = severityToTint(tile.verdict.severity, isDark);
  const observedLabel = formatObservedAt(tile.reading?.observedAt);
  const directionCopy = trendDirectionCopy(tile.label, tile.trendDirection, tile.trendPeriodLabel);

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: colors.card,
          borderColor: tint.border,
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`${tile.label}: ${tile.displayValue}, ${verdictLabel(tile.verdict.severity)}`}
    >
      <View style={styles.tileHeader}>
        <View style={[styles.tileIconCircle, { backgroundColor: tint.bg }]}>
          <MaterialIcons name={tile.icon as any} size={getScaledFontSize(18)} color={tint.text} />
        </View>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(14),
            fontWeight: getScaledFontWeight(600) as any,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {tile.label}
        </Text>
      </View>

      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(20),
          fontWeight: getScaledFontWeight(700) as any,
          marginTop: 8,
        }}
      >
        {tile.displayValue}
      </Text>

      <View style={[styles.verdictRow, { backgroundColor: tint.bg }]}>
        <Text
          style={{
            color: tint.text,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(600) as any,
          }}
        >
          {verdictLabel(tile.verdict.severity)}
        </Text>
        {observedLabel ? (
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
            }}
          >
            {observedLabel}
          </Text>
        ) : null}
      </View>

      {tile.verdict.caveat ? (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            marginTop: 6,
            fontStyle: 'italic',
          }}
        >
          {tile.verdict.caveat}
        </Text>
      ) : null}

      {directionCopy ? (
        <View style={styles.trendCallout}>
          <MaterialIcons
            // Direction-agnostic reading: 'trending-down' means "getting
            // worse" as a metaphor regardless of whether the underlying
            // value went up (BP, glucose) or down (HRV, steps, SpO2).
            // Improving + stable both use 'trending-flat' — no arrow
            // direction, no misleading up/down cue.
            name={tile.trendDirection === 'worsening' ? 'trending-down' : 'trending-flat'}
            size={getScaledFontSize(14)}
            color={colors.subtext}
          />
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              marginLeft: 4,
              flex: 1,
            }}
            numberOfLines={2}
          >
            {directionCopy}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Main section ───────────────────────────────────────────────────────────

export function VitalsRedFlagSection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // Master gate — iOS-only surface. On Android + web there's no HealthKit,
  // so the section is invisible entirely.
  const iosDisabled = Platform.OS !== 'ios';

  // Second gate — Apple Health app preference (COS-397 / SCRUM-535). When
  // the user has turned Apple Health OFF, `useHealthKitTrends` exposes
  // `disabled: true` and serves an empty array. We render nothing so the
  // patient never sees stale/absent HK data implying we're still watching.
  const { data: trends, disabled } = useHealthKitTrends(90);

  if (iosDisabled) return null;
  if (disabled) return null;

  const tiles: TileModel[] = [
    buildBpTile(trends),
    buildGlucoseTile(trends),
    buildStepsTile(trends),
    buildRestingHrTile(trends),
    buildHrvTile(trends),
    buildSpo2Tile(trends),
  ];

  // Aggregate: count only tiles whose severity is amber or red. `green` and
  // `info` are neutral (info = insufficient data, green = normal).
  const activeCount = tiles.filter(
    (t) => t.verdict.severity !== 'green' && t.verdict.severity !== 'info',
  ).length;

  // If nothing rendered at all (no trends yet), collapse the section — an
  // empty grid with an "All clear" pill would be misleading before the user
  // has synced any HealthKit data.
  const hasAnyReading = tiles.some((t) => t.reading !== null);
  if (!hasAnyReading) return null;

  // Order tiles worst-first so a red BP tile appears before a green Steps.
  const orderedTiles = [...tiles].sort(
    (a, b) => severityRank(b.verdict.severity) - severityRank(a.verdict.severity),
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: '#DC2626' + '15' }]}>
          <MaterialIcons
            name="health-and-safety"
            size={getScaledFontSize(22)}
            color="#DC2626"
          />
        </View>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(17),
            fontWeight: getScaledFontWeight(600) as any,
            flex: 1,
          }}
          accessibilityRole="header"
        >
          Vitals & Red Flags
        </Text>
      </View>

      <AggregatePill count={activeCount} />

      <View style={styles.grid}>
        {orderedTiles.map((tile) => (
          <VitalTile key={tile.key} tile={tile} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  tile: {
    width: '46%',
    flexGrow: 1,
    minWidth: 150,
    marginHorizontal: '2%',
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  trendCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
});

export default VitalsRedFlagSection;
