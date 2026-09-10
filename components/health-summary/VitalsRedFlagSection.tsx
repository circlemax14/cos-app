import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends';
import type { LongitudinalTrend, TrendDataPoint } from '@/services/api/types';
import { Colors } from '@/constants/theme';
import { Spacing, Radii, TouchTargets } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  evaluateHRVTrend,
  evaluateRestingHR,
  evaluateSpO2,
  splitHRVTrend,
  HRV_MIN_SAMPLES,
  type Severity,
} from '@/lib/vitals-red-flag-rules';
import { healthSourceLabel } from '@/services/health-source';

/**
 * COS-966 — Ken's dropdown, and the honesty rule that governs it.
 *
 * Ken (2026-09-10): "vitals and red flags... kind of like your drop down
 * format" — seven categories, each opening onto the individual measures.
 * The six-tile grid this replaces showed one flat row of whatever HealthKit
 * happened to return; it could not say what a category even contained, let
 * alone what we are not yet collecting.
 *
 * ─── THE ONE RULE THAT MATTERS ───────────────────────────────────────
 *
 * Ken accepted placeholders as a vision: "It doesn't mean that all the data
 * can be filled in yet... these are kind of placeholders."
 *
 * That is a licence to show a LABEL. It is not a licence to show a STATE.
 *
 * The old card mapped `Severity.info` → gray via toLight(), and a gray dot
 * next to a measure reads to a patient as "measured, and fine". A patient
 * with an arrhythmia diagnosis must never read a gray dot beside "Heart
 * rhythm (ECG)" as reassurance about a reading we have never taken.
 *
 * So: A DOT IS DRAWN ONLY WHERE A VALUE EXISTS. Three row states, no others.
 *
 *   measured      value + unit + coloured dot + when. Counts in the pill.
 *   no reading    label + "No recent reading". No dot. Excluded from pill.
 *   not collected label + "We're not collecting this yet." No dot, no
 *                 chevron, muted. Excluded from the pill and from the count.
 *
 * A category whose measures are ALL placeholders gets a "Not tracked yet"
 * pill — never a neutral one, because a neutral pill is indistinguishable
 * from "measured and normal". The wording promises no date: we do not know
 * one, and a patient waiting on their ECG deserves the true sentence.
 *
 * ─── WHAT IS ACTUALLY REAL HERE ──────────────────────────────────────
 *
 * Everything not marked `notCollected` comes from `useHealthKitTrends(90)`,
 * which already fetches all 18 VITAL_SPECS (services/health.ts:1060). The
 * old card rendered six of them. Temperature, breathing rate, weight, BMI,
 * sleep, active calories, distance, flights and exercise time were already
 * being fetched on this screen and thrown away — adding them costs a row
 * each and no new request.
 *
 * The five "you told us" measures Ken lists (falls, steadiness, appetite,
 * anxiety, mood) live in assessment responses, not in the trends hook, and
 * are marked `notCollected` rather than faked. That is honest and it is also
 * true for the pilot cohort: falls-12 is an ADVANCED_PLUS instrument, so a
 * `basic`-plan tester is never asked those questions at all.
 *
 * ECG is `notCollected` because HealthKit's ElectrocardiogramType is not in
 * VITAL_SPECS and no permission for it is requested anywhere in the app.
 *
 * Walking heart rate and BMI are deliberately ABSENT even though HealthKit
 * supplies both: they are the only two of the 18 VITAL_SPECS with no Health
 * Connect source (health-connect.ts TREND_SOURCES), so on Android they would
 * be permanently blank rows. `health-source.test.mjs` guards exactly this.
 *
 * Hypertension is deliberately NOT a row: no `hasHypertension` datum exists
 * in any repo. What we DO have is the AHA stage computed from readings we
 * actually took, so it is surfaced honestly as "Blood pressure category".
 */

type TrafficLight = 'green' | 'amber' | 'red';

function toLight(severity: Severity): TrafficLight | undefined {
  switch (severity) {
    case 'red':
      return 'red';
    case 'amber':
      return 'amber';
    case 'green':
      return 'green';
    // `info` means "not enough data to judge" — deliberately NOT a colour.
    // Returning undefined removes the dot rather than greying it.
    default:
      return undefined;
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
};

const LIGHT_WORD: Record<TrafficLight, string> = {
  green: 'in range',
  amber: 'worth watching',
  red: 'needs attention',
};

// HealthKit trend metricCodes emitted by services/health.ts VITAL_SPECS.
// We key off metricCode (not metricName) so a rename of the display label
// upstream doesn't silently break the mapping here.
const METRIC_CODE = {
  bpSystolic: 'hk-bp-systolic',
  bpDiastolic: 'hk-bp-diastolic',
  glucose: 'hk-glucose',
  bodyTemp: 'hk-body-temp',
  steps: 'hk-steps',
  activeEnergy: 'hk-active-energy',
  distance: 'hk-distance-walking',
  flights: 'hk-flights',
  exerciseTime: 'hk-exercise-time',
  restingHR: 'hk-resting-hr',
  hrv: 'hk-hrv',
  spo2: 'hk-spo2',
  respRate: 'hk-resp-rate',
  weight: 'hk-weight',
  sleep: 'hk-sleep',
} as const;

// Adult-general thresholds. NOT personalised — footer disclaimer required.
// AHA staging, highest-severity-first so overlapping ranges resolve correctly.
function bpLight(sys?: number, dia?: number): TrafficLight | undefined {
  if (sys == null || dia == null) return undefined;
  if (sys >= 140 || dia >= 90) return 'red'; // stage 2 hypertension
  if (sys >= 130 || dia >= 80) return 'amber'; // stage 1
  if (sys >= 120) return 'amber'; // elevated (dia < 80)
  return 'green'; // normal
}

/**
 * The AHA stage as a WORD. This is the honest answer to Ken's "hypertension"
 * row: we cannot say whether someone has been diagnosed, but we can say what
 * category their own readings fall in, which is what the tile already
 * computed and then threw away.
 */
function bpCategory(sys?: number, dia?: number): string | undefined {
  if (sys == null || dia == null) return undefined;
  if (sys >= 180 || dia >= 120) return 'Crisis range';
  if (sys >= 140 || dia >= 90) return 'High (stage 2)';
  if (sys >= 130 || dia >= 80) return 'High (stage 1)';
  if (sys >= 120) return 'Elevated';
  return 'Normal';
}

// HealthKit does NOT distinguish fasting vs postprandial glucose, so we use
// non-fasting-safe thresholds here (≥140 amber = postprandial-normal upper
// edge, ≥180 red = any-time worrying).
function glucoseLight(v?: number): TrafficLight | undefined {
  if (v == null) return undefined;
  if (v >= 180) return 'red';
  if (v >= 140) return 'amber';
  if (v < 70) return 'amber';
  return 'green';
}

function stepsLight(v?: number): TrafficLight | undefined {
  if (v == null) return undefined;
  if (v < 5000) return 'amber';
  return 'green';
}

/**
 * Generic light from the spec's own reference range, for the measures that
 * have no bespoke clinical rule. Deliberately never returns red: a value
 * outside a general adult range is "worth a look", not a red flag, and only
 * the rules module (resting HR, SpO2, HRV) is entitled to say red here.
 */
function rangeLight(v: number | undefined, low: number, high: number): TrafficLight | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  return v < low || v > high ? 'amber' : 'green';
}

function latest(trend?: LongitudinalTrend): TrendDataPoint | undefined {
  if (!trend?.dataPoints?.length) return undefined;
  // ISO 8601 dates sort correctly with localeCompare; missing dates fall to
  // insertion order (defensive — HealthKit points always carry a date).
  // Filter out non-finite `.value` so downstream rows + rules never see
  // null/undefined/NaN emitted by HealthKit for gaps in the series.
  return [...trend.dataPoints]
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
}

/**
 * Min/max across the fetched window. Ken asked for blood-pressure and
 * glucose RANGE, not a single reading — and a range is a reduce over points
 * this component already has in hand, so it costs nothing to answer him.
 */
function spread(trend?: LongitudinalTrend): { min: number; max: number; n: number } | undefined {
  const vals = (trend?.dataPoints ?? []).map((p) => p.value).filter(Number.isFinite);
  if (vals.length < 2) return undefined;
  return { min: Math.min(...vals), max: Math.max(...vals), n: vals.length };
}

function fmtWhen(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? undefined
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function round(v: number, dp = 0): string {
  return dp === 0 ? `${Math.round(v)}` : v.toFixed(dp);
}

// ── Row + category model ─────────────────────────────────────────────

interface Row {
  label: string;
  /** Present ⇒ we measured this. Absent ⇒ no reading, or not collected. */
  value?: string;
  unit?: string;
  light?: TrafficLight;
  when?: string;
  /** A caveat printed under the value. Never a substitute for a value. */
  note?: string;
  /**
   * True ⇒ this measure is not being collected at all yet. Renders muted
   * with an explicit sentence and is excluded from every count.
   */
  notCollected?: boolean;
}

interface Category {
  key: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  rows: Row[];
}

// ── One measure row ──────────────────────────────────────────────────

function MeasureRow({
  row,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  row: Row;
  colors: (typeof Colors)['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}) {
  const measured = row.value != null;
  const detail = row.notCollected
    ? "We're not collecting this yet."
    : measured
      ? [row.when, row.note].filter(Boolean).join(' · ')
      : 'No recent reading';

  const a11y = row.notCollected
    ? `${row.label}. We're not collecting this yet.`
    : measured
      ? `${row.label}: ${row.value}${row.unit ? ` ${row.unit}` : ''}${
          row.light ? `, ${LIGHT_WORD[row.light]}` : ''
        }${row.when ? `, last reading ${row.when}` : ''}${row.note ? `, ${row.note}` : ''}`
      : `${row.label}: no recent reading`;

  return (
    <View style={styles.measureRow} accessibilityRole="text" accessibilityLabel={a11y}>
      {/* A dot is drawn ONLY where a value exists. A grey dot on an
          unmeasured row reads as "measured and fine" — see the header note. */}
      <View style={styles.dotColumn} accessibilityElementsHidden importantForAccessibility="no">
        {row.light ? (
          <View style={[styles.dot, { backgroundColor: LIGHT_COLOR[row.light] }]} />
        ) : null}
      </View>
      <View style={styles.measureText}>
        <Text
          style={{
            color: row.notCollected ? colors.subtext : colors.text,
            fontSize: getScaledFontSize(16),
            fontWeight: getScaledFontWeight(measured ? 600 : 400) as TextStyle['fontWeight'],
          }}
        >
          {row.label}
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(14),
            marginTop: 2,
            fontStyle: row.notCollected ? 'italic' : 'normal',
          }}
        >
          {detail}
        </Text>
      </View>
      {measured ? (
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(17),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            textAlign: 'right',
          }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {row.value}
          {row.unit ? (
            <Text
              style={{
                fontSize: getScaledFontSize(13),
                color: colors.subtext,
                fontWeight: '400',
              }}
            >
              {' '}
              {row.unit}
            </Text>
          ) : null}
        </Text>
      ) : null}
    </View>
  );
}

// ── The section ──────────────────────────────────────────────────────

function VitalsRedFlagSection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data: trends, disabled, isLoading } = useHealthKitTrends(90);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const byMetric = useMemo(() => {
    const m = new Map<string, LongitudinalTrend>();
    (trends ?? []).forEach((t) => m.set(t.metricCode, t));
    return m;
  }, [trends]);

  // HRV needs its two-window trend verdict, which the rules module owns.
  const hrvTrend = byMetric.get(METRIC_CODE.hrv);
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
  // Gate the HRV colour on the SAME per-window rule the callout uses, so the
  // row can't be amber with no callout to explain it (would strand the user).
  const hrvHasBothWindows =
    hrvSplit.recent.length >= HRV_MIN_SAMPLES && hrvSplit.prior.length >= HRV_MIN_SAMPLES;

  const categories: Category[] = useMemo(() => {
    const g = (code: string) => byMetric.get(code);
    const l = (code: string) => latest(byMetric.get(code));

    const sys = l(METRIC_CODE.bpSystolic);
    const dia = l(METRIC_CODE.bpDiastolic);
    const glu = l(METRIC_CODE.glucose);
    const temp = l(METRIC_CODE.bodyTemp);
    const restingHR = l(METRIC_CODE.restingHR);
    const hrvLatest = l(METRIC_CODE.hrv);
    const spo2 = l(METRIC_CODE.spo2);
    const resp = l(METRIC_CODE.respRate);
    const steps = l(METRIC_CODE.steps);
    const energy = l(METRIC_CODE.activeEnergy);
    const distance = l(METRIC_CODE.distance);
    const flights = l(METRIC_CODE.flights);
    const exercise = l(METRIC_CODE.exerciseTime);
    const weight = l(METRIC_CODE.weight);
    const sleep = l(METRIC_CODE.sleep);

    const sysSpread = spread(g(METRIC_CODE.bpSystolic));
    const diaSpread = spread(g(METRIC_CODE.bpDiastolic));
    const gluSpread = spread(g(METRIC_CODE.glucose));
    const weightSpread = spread(g(METRIC_CODE.weight));

    const bpValue = sys && dia ? `${Math.round(sys.value)}/${Math.round(dia.value)}` : undefined;

    return [
      {
        key: 'vitals',
        label: 'Vitals',
        icon: 'favorite-border',
        rows: [
          {
            label: 'Blood pressure',
            value: bpValue,
            unit: 'mmHg',
            light: bpLight(sys?.value, dia?.value),
            when: fmtWhen(sys?.date ?? dia?.date),
          },
          {
            label: 'Blood pressure range',
            value:
              sysSpread && diaSpread
                ? `${round(sysSpread.min)}–${round(sysSpread.max)} / ${round(diaSpread.min)}–${round(diaSpread.max)}`
                : undefined,
            unit: 'mmHg',
            // A range is a description, not a judgement. No colour.
            note: sysSpread ? `Across ${sysSpread.n} readings` : undefined,
          },
          {
            label: 'Blood pressure category',
            value: bpCategory(sys?.value, dia?.value),
            light: bpLight(sys?.value, dia?.value),
            note: 'American Heart Association stage, from your own readings',
          },
          {
            label: 'Blood sugar',
            value: glu ? round(glu.value) : undefined,
            unit: glu?.unit ?? 'mg/dL',
            light: glucoseLight(glu?.value),
            when: fmtWhen(glu?.date),
            note: glu ? 'Non-fasting ranges applied' : undefined,
          },
          {
            label: 'Blood sugar range',
            value: gluSpread ? `${round(gluSpread.min)}–${round(gluSpread.max)}` : undefined,
            unit: glu?.unit ?? 'mg/dL',
            note: gluSpread ? `Across ${gluSpread.n} readings` : undefined,
          },
          {
            label: 'Temperature',
            value: temp ? round(temp.value, 1) : undefined,
            unit: '°C',
            light: rangeLight(temp?.value, 36.1, 37.2),
            when: fmtWhen(temp?.date),
          },
        ],
      },
      {
        key: 'heart',
        label: 'Heart',
        icon: 'monitor-heart',
        rows: [
          {
            label: 'Resting heart rate',
            value: restingHR ? round(restingHR.value) : undefined,
            unit: 'bpm',
            light: restingHR ? toLight(evaluateRestingHR(restingHR.value).severity) : undefined,
            when: fmtWhen(restingHR?.date),
          },
          {
            label: 'Heart rate variability',
            value: hrvLatest ? round(hrvLatest.value) : undefined,
            unit: 'ms',
            light: hrvHasBothWindows ? toLight(hrvVerdict.severity) : undefined,
            when: fmtWhen(hrvLatest?.date),
            note:
              hrvLatest && !hrvHasBothWindows
                ? `Need ${HRV_MIN_SAMPLES} recent and ${HRV_MIN_SAMPLES} earlier days before we can call a trend`
                : undefined,
          },
          {
            label: 'Heart rhythm (ECG)',
            notCollected: true,
          },
        ],
      },
      {
        key: 'breathing',
        label: 'Breathing',
        icon: 'air',
        rows: [
          {
            label: 'Blood oxygen',
            value: spo2 ? round(spo2.value) : undefined,
            unit: '%',
            light: spo2 ? toLight(evaluateSpO2(spo2.value).severity) : undefined,
            when: fmtWhen(spo2?.date),
          },
          {
            label: 'Breaths per minute',
            value: resp ? round(resp.value) : undefined,
            unit: 'breaths/min',
            light: rangeLight(resp?.value, 12, 20),
            when: fmtWhen(resp?.date),
          },
        ],
      },
      {
        key: 'movement',
        label: 'Movement',
        icon: 'directions-walk',
        rows: [
          {
            label: 'Steps',
            value: steps ? Math.round(steps.value).toLocaleString() : undefined,
            light: stepsLight(steps?.value),
            when: fmtWhen(steps?.date),
          },
          {
            label: 'Exercise time',
            value: exercise ? round(exercise.value) : undefined,
            unit: 'min',
            light: rangeLight(exercise?.value, 30, 600),
            when: fmtWhen(exercise?.date),
          },
          {
            label: 'Distance walked',
            value: distance ? round(distance.value, 1) : undefined,
            unit: 'km',
            when: fmtWhen(distance?.date),
          },
          {
            label: 'Calories burned moving',
            value: energy ? round(energy.value) : undefined,
            unit: 'kcal',
            when: fmtWhen(energy?.date),
          },
          {
            label: 'Floors climbed',
            value: flights ? round(flights.value) : undefined,
            unit: 'floors',
            when: fmtWhen(flights?.date),
          },
          { label: 'Falls', notCollected: true },
          { label: 'Changes in steadiness', notCollected: true },
        ],
      },
      {
        key: 'nutrition',
        label: 'Weight & nutrition',
        icon: 'restaurant',
        rows: [
          {
            label: 'Weight',
            value: weight ? round(weight.value, 1) : undefined,
            unit: 'kg',
            when: fmtWhen(weight?.date),
          },
          {
            label: 'Weight change',
            value:
              weightSpread && weightSpread.max - weightSpread.min >= 0.1
                ? `${round(weightSpread.max - weightSpread.min, 1)}`
                : undefined,
            unit: 'kg',
            note: weightSpread ? `Between ${round(weightSpread.min, 1)} and ${round(weightSpread.max, 1)} kg` : undefined,
          },
          { label: 'Changes in appetite', notCollected: true },
        ],
      },
      {
        key: 'sleep',
        label: 'Sleep',
        icon: 'bedtime',
        rows: [
          {
            label: 'Hours slept',
            value: sleep ? round(sleep.value, 1) : undefined,
            unit: 'hours',
            light: rangeLight(sleep?.value, 7, 9),
            when: fmtWhen(sleep?.date),
          },
          { label: 'How rested you feel', notCollected: true },
        ],
      },
      {
        key: 'mood',
        label: 'Mood & stress',
        icon: 'sentiment-satisfied-alt',
        rows: [
          { label: 'Changes in mood', notCollected: true },
          { label: 'Feeling more anxious', notCollected: true },
        ],
      },
    ];
  }, [byMetric, hrvHasBothWindows, hrvVerdict.severity]);

  // Aggregate across every MEASURED row. Placeholders and unmeasured rows are
  // excluded by construction: they carry no `light`.
  const aggregate = useMemo(() => {
    let green = 0;
    let amber = 0;
    let red = 0;
    for (const c of categories) {
      for (const r of c.rows) {
        if (r.light === 'green') green += 1;
        else if (r.light === 'amber') amber += 1;
        else if (r.light === 'red') red += 1;
      }
    }
    return { green, amber, red, none: green + amber + red === 0 };
  }, [categories]);

  /*
   * COS-932 — a source, not a platform.
   *
   * `Platform.OS !== 'ios'` hid this whole section on Android and printed
   * "Health Connect for Android coming soon" — which stopped being true the
   * moment Health Connect shipped. `disabled` already carries the real answer:
   * the trends hook resolves it from whichever source is active.
   *
   * The whole-card empty state is CORRECT here even under seven categories:
   * every measure we actually collect on this card comes from the device
   * source, so with sync off there is genuinely nothing to show but the
   * placeholders — and a card of nothing but "we're not collecting this yet"
   * is worse than one honest sentence telling the patient how to fix it.
   */
  const deviceSyncOff = disabled;
  const showLoading = isLoading && !deviceSyncOff;
  // Names the source on THIS device rather than Apple's product everywhere.
  const emptyText = `Turn on ${healthSourceLabel()} in Health Sync to see your vitals here.`;

  const showAggregate = !deviceSyncOff && !aggregate.none;
  const aggregateLabel = `${aggregate.green} in range, ${aggregate.amber} worth watching, ${aggregate.red} needing attention`;
  const aggregateBadge = showAggregate ? (
    <View
      style={[styles.aggregatePill, { borderColor: colors.border, backgroundColor: colors.card }]}
      accessibilityRole="text"
      accessibilityLabel={aggregateLabel}
    >
      {(['green', 'amber', 'red'] as const).map((k) => (
        <View key={k} style={styles.aggregateCell}>
          <View
            style={[styles.aggregateDot, { backgroundColor: LIGHT_COLOR[k] }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            }}
          >
            {aggregate[k]}
          </Text>
        </View>
      ))}
    </View>
  ) : undefined;

  // HRV trend callout: only when BOTH windows are full AND the averages are
  // finite AND the verdict is actionable. Guarding on window lengths (rather
  // than the union sampleCount) keeps the "vs Y ms" copy from going NaN.
  const showHRVCallout =
    !deviceSyncOff &&
    hrvHasBothWindows &&
    Number.isFinite(hrvRecentAvg) &&
    Number.isFinite(hrvPriorAvg) &&
    hrvVerdict.severity !== 'info';
  const hrvCalloutTitle =
    hrvVerdict.severity === 'green'
      ? 'Heart rate variability is steady'
      : hrvVerdict.severity === 'amber' || hrvVerdict.severity === 'red'
        ? 'Heart rate variability is trending down'
        : null;
  const hrvCalloutLight = hrvHasBothWindows ? toLight(hrvVerdict.severity) : undefined;

  return (
    <SummaryCardShell
      title="Vitals & red flags"
      icon="monitor-heart"
      accentColor="#DC2626"
      isEmpty={deviceSyncOff}
      emptyState={<EmptyStateHint text={emptyText} />}
      titleBadge={aggregateBadge}
      badgeAccessibilityLabel={showAggregate ? aggregateLabel : undefined}
    >
      {showLoading ? (
        <View style={styles.skeletonStack} accessibilityLabel="Loading your vitals">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[styles.skeleton, { backgroundColor: colors.border }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          {categories.map((cat) => {
            const measured = cat.rows.filter((r) => r.value != null);
            const collected = cat.rows.filter((r) => !r.notCollected);
            const allPlaceholders = collected.length === 0;
            const isOpen = open.has(cat.key);

            // Worst severity present, and ONLY from measured rows.
            const worst: TrafficLight | undefined = measured.some((r) => r.light === 'red')
              ? 'red'
              : measured.some((r) => r.light === 'amber')
                ? 'amber'
                : measured.some((r) => r.light === 'green')
                  ? 'green'
                  : undefined;

            const summary = allPlaceholders
              ? 'Not tracked yet'
              : measured.length === 0
                ? 'No readings yet'
                : `${measured.length} of ${collected.length} measured`;

            return (
              <View key={cat.key}>
                <Pressable
                  onPress={() => toggle(cat.key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${cat.label}. ${summary}${
                    worst ? `, ${LIGHT_WORD[worst]}` : ''
                  }. Tap to ${isOpen ? 'collapse' : 'expand'}.`}
                  accessibilityHint="Shows the individual measures in this group."
                  style={[styles.categoryRow, { borderColor: colors.border }]}
                  testID={`vitals-category-${cat.key}`}
                >
                  <MaterialIcons
                    name={cat.icon}
                    size={getScaledFontSize(22)}
                    color={worst ? LIGHT_COLOR[worst] : colors.subtext}
                    style={styles.categoryIcon}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: getScaledFontSize(17),
                        fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                      }}
                    >
                      {cat.label}
                    </Text>
                    <Text
                      style={{
                        color: colors.subtext,
                        fontSize: getScaledFontSize(14),
                        marginTop: 2,
                      }}
                    >
                      {summary}
                    </Text>
                  </View>
                  {/* A DISTINCT pill, never the neutral one — a neutral pill
                      reads as "measured and normal". */}
                  {allPlaceholders ? (
                    <View style={[styles.pill, { borderColor: colors.border }]}>
                      <Text
                        style={{
                          color: colors.subtext,
                          fontSize: getScaledFontSize(13),
                          fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                        }}
                      >
                        Not tracked yet
                      </Text>
                    </View>
                  ) : null}
                  <MaterialIcons
                    name={isOpen ? 'expand-less' : 'expand-more'}
                    size={getScaledFontSize(24)}
                    color={colors.subtext}
                  />
                </Pressable>
                {isOpen ? (
                  <View style={styles.measureList}>
                    {cat.rows.map((row) => (
                      <MeasureRow
                        key={row.label}
                        row={row}
                        colors={colors}
                        getScaledFontSize={getScaledFontSize}
                        getScaledFontWeight={getScaledFontWeight}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {showHRVCallout && hrvCalloutTitle ? (
        <View
          style={styles.hrvCallout}
          accessibilityRole="text"
          accessibilityLabel={`${hrvCalloutTitle}. Last ${HRV_MIN_SAMPLES} days averaged ${hrvRecentAvg.toFixed(0)} milliseconds versus ${hrvPriorAvg.toFixed(0)} milliseconds the ${HRV_MIN_SAMPLES} days before.`}
        >
          <MaterialIcons
            name={hrvVerdict.severity === 'green' ? 'trending-flat' : 'trending-down'}
            size={getScaledFontSize(20)}
            color={hrvCalloutLight ? LIGHT_COLOR[hrvCalloutLight] : colors.subtext}
            style={styles.hrvCalloutIcon}
          />
          <View style={styles.hrvCalloutText}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              {hrvCalloutTitle}
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                marginTop: 2,
              }}
            >
              The last {HRV_MIN_SAMPLES} days averaged {hrvRecentAvg.toFixed(0)} ms, against{' '}
              {hrvPriorAvg.toFixed(0)} ms the {HRV_MIN_SAMPLES} days before.
            </Text>
          </View>
        </View>
      ) : null}

      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(14),
          fontStyle: 'italic',
          marginTop: Spacing.sm,
          lineHeight: getScaledFontSize(14) * 1.4,
        }}
      >
        These are general adult ranges, not personalized to you. Anything marked
        &ldquo;we&apos;re not collecting this yet&rdquo; has never been measured — it is not a
        result.
      </Text>
    </SummaryCardShell>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'column' },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    // Ken's cohort skews older; the labs pattern this copies relies on padding
    // alone and lands a single-line row at ~36px, under the 44px floor.
    minHeight: TouchTargets.minimum,
  },
  categoryIcon: { width: 26, textAlign: 'center' },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  measureList: { paddingLeft: Spacing.sm, paddingVertical: Spacing.xs },
  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    minHeight: TouchTargets.minimum,
  },
  dotColumn: { width: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  measureText: { flex: 1 },
  skeletonStack: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  skeleton: { height: 44, borderRadius: Radii.md, opacity: 0.5 },
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
