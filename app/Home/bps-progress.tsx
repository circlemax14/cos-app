/**
 * BPS Progress route (CHUNK 50, redesigned).
 *
 * Ken 2026-07-22: the BPS surface shipped without the legacy Plan/Progress
 * tab bar — Ken could see plan structure but had no adherence / streak /
 * self-reported-metrics signal beyond chunk-47's Today hero. This route
 * reuses legacy `ProgressTab` under `/Home/bps-progress`, entered via the
 * "View Progress" link in BPS's header row (BPS_PROGRESS_LINK_ENABLED).
 *
 * ─────────────────────────────────────────────────────────────────────
 * REDESIGN — per-metric charts (this change)
 * ─────────────────────────────────────────────────────────────────────
 * Feedback: "Progress screen needs to be redesigned. It should show
 * separate graphs for those tasks which are asking readings from users."
 *
 * Before, a task that asked the patient to MEASURE something (BP, glucose,
 * weight) was flattened into the same completion percentage as "go for a
 * walk". The number the patient actually cared about — 118 mg/dL, trending
 * down over three weeks — was reduced to a tick mark. `SelfReportedMetrics
 * Card` inside ProgressTab did surface the readings, but as compact
 * one-line rows for every type the patient had ever logged, with systolic
 * and diastolic as two unrelated rows.
 *
 * Now the screen has two panes behind a segmented control:
 *
 *   READINGS  (new, default) — one CARD PER METRIC the plan actually asks
 *             the patient to record, with the latest value large, a
 *             sparkline of recent readings, the chart's real range in
 *             plain text, and an honest empty state.
 *   ACTIVITY  (unchanged)    — the existing `ProgressTab`: AI narrative,
 *             cadence control, adherence / streak / today stats, badges,
 *             and the original SelfReportedMetricsCard. Nothing was
 *             deleted; the completion summary is still one tap away.
 *
 * WHY A SEGMENTED CONTROL instead of stacking the new section above
 * ProgressTab: `ProgressTab`'s root element is itself a `<ScrollView>`.
 * Stacking would mean nesting two same-axis ScrollViews, which produces
 * the well-known RN scroll-stealing jank, and this file does not own
 * ProgressTab so its root cannot be changed. Two panes, one scroll
 * container each, is the only structure that adds the charts without
 * touching a component owned elsewhere. Each segment is a 44pt-minimum
 * tap target with a text label (never colour alone) per the a11y bar.
 *
 * WHICH metrics get a chart — see `deriveChartableMetricTypes` in
 * hooks/use-metric-history.ts. Source of truth is `detectMetricForTask`,
 * the SAME classifier that decides whether to open the RECORD modal, so
 * "what we ask for" and "what we chart" cannot drift apart.
 *
 * HONESTY RULES observed here (a health record must never flatter):
 *  - Sparkline bars are geometry only. The 0-100 normalised number is
 *    NEVER printed and NEVER spoken — the sparkline is removed from the
 *    accessibility tree and a text summary of the REAL values takes its
 *    place for VoiceOver.
 *  - "No readings yet" is only shown when the server actually said the
 *    list is empty. A failed read renders "couldn't load", not a cheerful
 *    empty state (see `degraded` in services/api/self-reported-metrics.ts).
 *  - `ScoreHistorySparkline` renders at most 7 bars, so when there is more
 *    history than that the caption says "last 7 of N readings" rather than
 *    implying the whole window is drawn.
 *  - A reading outside the fixed chart range pegs its bar; the card says
 *    so instead of letting a clamped bar read as an exact value.
 *
 * Data contract for ProgressTab mirrors `app/Home/health-plan.tsx:766-812`:
 * - completedToday = tasks.filter(t => t.status === 'completed').length
 * - totalToday = tasks.length
 * - adherencePercent = round((completedToday / totalToday) * 100), 0 if empty
 * - streakDays = 0  (legacy passes 0 today; ProgressTab renders its own
 *   empty-state convention. Real streak plumbing tracked in a follow-up
 *   SCRUM story to update legacy AND BPS in lockstep.)
 *
 * Cache key: ['plan-tasks', todayIso()] — the SAME key BPS's chunk-47
 * Today hero uses and auth-prefetch warms on sign-in. First render after
 * tapping "View Progress" rides the warm cache, no cold fetch fires in
 * the common path.
 *
 * Defensive redirect: if the bio flag is off or the plan record is
 * absent (stale deep-link after user migrated off BPS), replace to
 * `/Home/health-plan`. useEffect, not render-phase, to avoid the
 * setState-during-render warning that has bitten this codebase before.
 *
 * iOS 26.5 discipline: primitive envelope only — View / Text / Pressable /
 * ScrollView / MaterialIcons / StyleSheet. No SVG, no chart library, no new
 * native dependency. The sparkline is the existing plain-View component.
 * Cold-mount uses a static View placeholder — no ActivityIndicator on the
 * first-paint path. Matches chunks 17/39/47/48.
 *
 * OTA-flip / revert: flipping `BPS_PROGRESS_LINK_ENABLED = false` in
 * BiopsychosocialPlanScreen.tsx hides the entry link in 30-60s via
 * `npm run eas:update:production`. This route file remains bundled but
 * becomes UI-orphan; deep-linking still redirects defensively.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppWrapper } from '@/components/app-wrapper';
import { ProgressTab } from '@/components/health-plan/ProgressTab';
import { ScoreHistorySparkline } from '@/components/home/ScoreHistorySparkline';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag';
import { fetchTasksForDate } from '@/services/api/ai-health-plan';
import type { TaskOccurrence } from '@/services/api/types';
import {
  listSelfReportedMetrics,
  type SelfReportedMetric,
  type SelfReportedMetricType,
} from '@/services/api/self-reported-metrics';
import {
  METRIC_DISPLAY,
  METRIC_HISTORY_DAYS,
  buildMetricCards,
  deriveChartableMetricTypes,
  formatMetricValue,
  hasOutOfRangeValue,
  normaliseForSparkline,
  resolveScaleBounds,
  useMetricHistories,
  type MetricCardSpec,
  type MetricHistory,
} from '@/hooks/use-metric-history';
import { todayLocalIso } from '@/lib/day-key';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/** How many bars ScoreHistorySparkline can actually draw. Mirrored here so
 *  the caption can be truthful about how much of the window is visible. */
const SPARKLINE_BARS = 7;

/** Local YYYY-MM-DD for today. Matches the key used by
 *  BiopsychosocialPlanScreen (['plan-tasks', todayIso()]) and
 *  auth-prefetch.ts so we ride the warm cache on first render. */
function todayIso(): string {
  return todayLocalIso();
}

/** Short relative timestamp for a reading ("2 h ago", "Jul 28"). */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 1000) return 'just now';
  if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / 60000)} min ago`;
  if (diffMs < day) return `${Math.floor(diffMs / 3600000)} h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type Segment = 'readings' | 'activity';

export default function BpsProgressRoute(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const biopsychosocialPlanEnabled = useBiopsychosocialPlanFlag();
  const planQuery = useBiopsychosocialPlan();

  // Default to READINGS: the charts are the reason this redesign exists.
  // The default is FIXED rather than auto-selected from data, because a
  // pane that silently jumps to "Activity" once a fetch resolves is
  // disorienting — especially for our older cohort. When there is nothing
  // to chart, the readings pane says so and offers a button across.
  const [segment, setSegment] = React.useState<Segment>('readings');

  // Defensive redirect: bio flag off, or plan record missing (stale
  // deep-link, notification after BE deleted the record, manual URL
  // entry). Fires in an effect — never during render — so we don't
  // trigger the setState-during-render warning class.
  const hasBioPlan =
    biopsychosocialPlanEnabled && planQuery.data?.plan != null;
  const hasBioPlanDataReady = !planQuery.isLoading;

  React.useEffect(() => {
    if (hasBioPlanDataReady && !hasBioPlan) {
      router.replace('/Home/health-plan' as never);
    }
  }, [hasBioPlanDataReady, hasBioPlan]);

  // Shared cache key with the BPS Today hero — first render rides the
  // warm entry auth-prefetch wrote at sign-in (no cold fetch in the
  // common path). Off-tree failure returns [] and ProgressTab handles
  // the empty-state display via its own convention.
  const todayTasksQuery = useQuery<TaskOccurrence[]>({
    queryKey: ['plan-tasks', todayIso()],
    queryFn: () => fetchTasksForDate(todayIso()),
    staleTime: 60_000,
    enabled: hasBioPlan,
  });
  const todayTasks: TaskOccurrence[] = React.useMemo(
    () => todayTasksQuery.data ?? [],
    [todayTasksQuery.data],
  );

  const completedToday = todayTasks.filter((t) => t.status === 'completed').length;
  const totalToday = todayTasks.length;
  const adherencePercent =
    totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  // Secondary signal for "which metrics deserve a card": types the patient
  // has ALREADY recorded. Without it, a plan that asks for blood pressure
  // on Mondays would make the BP card vanish every Tuesday, which reads to
  // a patient as "my data was deleted".
  //
  // Deliberately the SAME queryKey + queryFn as
  // components/health-plan/SelfReportedMetricsCard — react-query dedupes,
  // so opening this screen costs ONE list request no matter which pane is
  // shown. Known limitation inherited from that card: the list is SK-
  // ordered, so a patient with >500 stored readings can have a
  // low-sorting type truncated away. That only affects the fallback; a
  // metric asked for by today's tasks is picked up from the tasks
  // themselves regardless.
  const recordedQuery = useQuery<SelfReportedMetric[]>({
    queryKey: ['self-reported-metrics-progress'],
    queryFn: () => listSelfReportedMetrics({ limit: 500 }),
    staleTime: 5 * 60 * 1000,
    enabled: hasBioPlan,
  });

  const recordedTypes = React.useMemo<SelfReportedMetricType[]>(() => {
    const set = new Set<SelfReportedMetricType>();
    for (const row of recordedQuery.data ?? []) {
      if (row?.type) set.add(row.type);
    }
    return Array.from(set);
  }, [recordedQuery.data]);

  const chartableTypes = React.useMemo(
    () => deriveChartableMetricTypes(todayTasks, recordedTypes),
    [todayTasks, recordedTypes],
  );

  const cards = React.useMemo(() => buildMetricCards(chartableTypes), [chartableTypes]);

  const { byType, isLoading: historiesLoading } = useMetricHistories(
    chartableTypes,
    METRIC_HISTORY_DAYS,
  );

  // CHUNK 50 fix (adversarial-verify majors #1 + #2):
  // Original guard `if (!hasBioPlan) return null` conflated two states:
  //   (a) planQuery still loading — should render shell + placeholder
  //   (b) planQuery resolved + no bio plan — should redirect (effect above)
  // Original path returned null in BOTH cases, so during (a) the entire
  // AppWrapper + Stack.Screen shell was absent, then materialized when
  // planQuery resolved — big first-paint jump. Fix: only return null
  // when the redirect will fire (case b). During case a we render the
  // shell + a placeholder that also covers todayTasksQuery.isLoading —
  // one continuous shell across the entire loading window, no null→content
  // transition. Placeholder height bumped to match the actual vertical
  // footprint so real content lands without pushing/pulling.
  if (hasBioPlanDataReady && !hasBioPlan) return null;
  const showPlaceholder =
    planQuery.isLoading || (todayTasksQuery.isLoading && !todayTasksQuery.data);

  return (
    <AppWrapper>
      <Stack.Screen options={{ title: 'Progress', headerBackTitle: 'Care Plan' }} />
      {/*
        SCRUM-656 (2026-07-31): explicit back-button header.
        The parent app/Home/_layout.tsx registers this route under a
        Tabs navigator with `headerShown: false` + `href: null` — no
        Stack, no header, no automatic back affordance. The
        `<Stack.Screen>` above is a defensive no-op for this navigator
        shape and is retained only for the theoretical case that the
        route is later re-parented under a Stack.
        User (2026-07-31): "when i click on view progress pill, i am
        taken to progress screen but i don't see any option to come
        back to plan screen again." Same shape as app/Home/about.tsx +
        assessments-catalog.tsx + badges.tsx use — Pressable +
        arrow-back MaterialIcon + title Text, pushed router.back().
      */}
      <View style={[styles.backHeader, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => {
            // SCRUM-657 (2026-07-31): router.back() pops the history
            // stack, but the Plan-tab entry point is a TAB SWITCH (not
            // a push), so back() falls through to whatever route was
            // pushed BEFORE the tab switch — usually Home. User:
            // "when i click on back on well being and progress screen,
            // i am being taken to home screen which is wrong." Use an
            // explicit router.replace to the Plan (BPS) route so the
            // destination is deterministic regardless of how the user
            // arrived here. Mirrors wellbeing-domain-checkins.tsx and
            // BpsWellbeingScoreCard's back-to-plan pattern.
            router.replace('/Home/biopsychosocial-plan' as never);
          }}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to care plan"
        >
          <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
        </Pressable>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(20),
            fontWeight: getScaledFontWeight(700) as 'bold',
            flex: 1,
          }}
          numberOfLines={1}
        >
          Progress
        </Text>
      </View>

      {showPlaceholder ? (
        <View
          style={styles.placeholder}
          accessible
          accessibilityLabel="Loading progress"
        />
      ) : (
        <>
          <SegmentedControl
            segment={segment}
            onChange={setSegment}
            textColor={colors.text}
            subtextColor={colors.subtext as string}
            tint={(colors.tint as string) ?? '#008080'}
            borderColor={colors.border as string}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />

          {segment === 'readings' ? (
            <ReadingsPane
              cards={cards}
              byType={byType}
              isLoading={historiesLoading && cards.length > 0}
              onGoToActivity={() => setSegment('activity')}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ) : (
            <ProgressTab
              streakDays={0 /* TODO(follow-up SCRUM): plumb real streak from /v1/.../analytics for legacy + BPS in lockstep. */}
              adherencePercent={adherencePercent}
              completedToday={completedToday}
              totalToday={totalToday}
            />
          )}
        </>
      )}
    </AppWrapper>
  );
}

// ---------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------

interface SegmentedControlProps {
  segment: Segment;
  onChange: (s: Segment) => void;
  textColor: string;
  subtextColor: string;
  tint: string;
  borderColor: string;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

/**
 * Two-option pane switcher.
 *
 * Selection is signalled by BOTH a filled background AND the
 * `accessibilityState.selected` flag AND a weight change — never by
 * colour alone. Each button is 44pt minimum height.
 */
function SegmentedControl({
  segment,
  onChange,
  textColor,
  subtextColor,
  tint,
  borderColor,
  getScaledFontSize,
  getScaledFontWeight,
}: SegmentedControlProps): React.JSX.Element {
  const options: { key: Segment; label: string }[] = [
    { key: 'readings', label: 'Readings' },
    { key: 'activity', label: 'Activity' },
  ];
  return (
    <View style={[styles.segmentRow, { borderColor }]} accessibilityRole="tablist">
      {options.map((opt) => {
        const active = segment === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${opt.label} view`}
            style={[
              styles.segmentBtn,
              { backgroundColor: active ? tint : 'transparent' },
            ]}
          >
            <Text
              style={{
                color: active ? '#FFFFFF' : subtextColor || textColor,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(active ? 700 : 500) as 'bold',
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------
// Readings pane — one card per metric the plan asks the patient to record
// ---------------------------------------------------------------------

interface ThemeColors {
  text: string;
  subtext?: string;
  card?: string;
  background: string;
  border?: string;
  tint?: string;
}

interface ReadingsPaneProps {
  cards: MetricCardSpec[];
  byType: Partial<Record<SelfReportedMetricType, MetricHistory>>;
  isLoading: boolean;
  onGoToActivity: () => void;
  colors: ThemeColors;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function ReadingsPane({
  cards,
  byType,
  isLoading,
  onGoToActivity,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: ReadingsPaneProps): React.JSX.Element {
  const subtext = (colors.subtext as string) ?? colors.text;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.paneContent}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          color: subtext,
          fontSize: getScaledFontSize(13),
          lineHeight: getScaledFontSize(20),
          marginBottom: 12,
        }}
      >
        {cards.length > 0
          ? `Each task that asks you to measure something gets its own chart here. Showing the last ${METRIC_HISTORY_DAYS} days.`
          : 'Charts appear here for any task that asks you to measure something.'}
      </Text>

      {cards.length === 0 ? (
        <View
          style={[
            styles.card,
            { backgroundColor: (colors.card as string) ?? colors.background, borderColor: (colors.border as string) ?? '#00000015' },
          ]}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(700) as 'bold',
              marginBottom: 6,
            }}
          >
            No measurement tasks yet
          </Text>
          <Text
            style={{
              color: subtext,
              fontSize: getScaledFontSize(13),
              lineHeight: getScaledFontSize(20),
            }}
          >
            When your care plan asks you to check something — blood pressure, blood
            glucose, weight — tap RECORD on that task. Your readings will be charted
            here.
          </Text>
          <Pressable
            onPress={onGoToActivity}
            accessibilityRole="button"
            accessibilityLabel="View activity summary"
            style={[styles.linkBtn, { borderColor: (colors.border as string) ?? '#00000020' }]}
          >
            <Text
              style={{
                color: (colors.tint as string) ?? '#008080',
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as 'bold',
              }}
            >
              View activity summary
            </Text>
          </Pressable>
        </View>
      ) : null}

      {cards.map((card) => (
        <MetricChartCard
          key={card.key}
          card={card}
          byType={byType}
          isLoading={isLoading}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------
// One metric card
// ---------------------------------------------------------------------

interface MetricChartCardProps {
  card: MetricCardSpec;
  byType: Partial<Record<SelfReportedMetricType, MetricHistory>>;
  isLoading: boolean;
  colors: ThemeColors;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

/**
 * A single metric's card: latest value, sparkline(s), range caption,
 * empty/degraded states. Blood pressure arrives here as ONE card with two
 * series (`card.isPair`) because systolic and diastolic are a single
 * measurement — splitting them invites reading one reading as two trends.
 */
function MetricChartCard({
  card,
  byType,
  isLoading,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: MetricChartCardProps): React.JSX.Element {
  const subtext = (colors.subtext as string) ?? colors.text;
  const cardBg = (colors.card as string) ?? colors.background;
  const border = (colors.border as string) ?? '#00000015';

  const series = card.types.map((type) => {
    const history = byType[type];
    const points = history?.points ?? [];
    return {
      type,
      spec: METRIC_DISPLAY[type],
      history,
      points,
      values: points.map((p) => p.value),
      latest: points.length > 0 ? points[points.length - 1] : undefined,
    };
  });

  // Card-level states. `degraded` beats every other state: if the read
  // failed we must not claim the patient has no readings.
  const anyDegraded = series.some((s) => s.history?.degraded === true);
  const anyResolved = series.some((s) => s.history != null);
  const maxCount = Math.max(0, ...series.map((s) => s.points.length));

  // The header value: for the BP pair this is "128/82", for everything
  // else the single latest reading. Real values only — never normalised.
  const headerValue = (() => {
    if (card.isPair) {
      const sys = series.find((s) => s.type === 'blood_pressure_systolic')?.latest;
      const dia = series.find((s) => s.type === 'blood_pressure_diastolic')?.latest;
      if (!sys && !dia) return null;
      const sysTxt = sys ? formatMetricValue('blood_pressure_systolic', sys.value) : '—';
      const diaTxt = dia ? formatMetricValue('blood_pressure_diastolic', dia.value) : '—';
      return { text: `${sysTxt}/${diaTxt}`, unit: 'mmHg', at: (sys ?? dia)?.recordedAt };
    }
    const only = series[0];
    if (!only?.latest) return null;
    return {
      text: formatMetricValue(only.type, only.latest.value),
      unit: only.spec?.unit ?? only.latest.unit ?? '',
      at: only.latest.recordedAt,
    };
  })();

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
      {/* Title + latest value */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(700) as 'bold',
            }}
          >
            {card.title}
          </Text>
          {headerValue?.at ? (
            <Text style={{ color: subtext, fontSize: getScaledFontSize(11), marginTop: 2 }}>
              Last recorded {formatRelative(headerValue.at)}
            </Text>
          ) : null}
        </View>
        {headerValue ? (
          <View style={styles.latestCol}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(30),
                fontWeight: getScaledFontWeight(700) as 'bold',
              }}
              accessibilityLabel={`Latest ${card.title}, ${headerValue.text} ${headerValue.unit}`}
            >
              {headerValue.text}
            </Text>
            <Text style={{ color: subtext, fontSize: getScaledFontSize(11) }}>
              {headerValue.unit}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Body: loading → degraded → empty → single-reading → chart */}
      {!anyResolved && isLoading ? (
        <View style={styles.cardPlaceholder} accessible accessibilityLabel={`Loading ${card.title}`} />
      ) : anyDegraded ? (
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(13),
            lineHeight: getScaledFontSize(20),
          }}
        >
          We couldn’t load this chart just now. Your readings are safe — try again in a
          moment.
        </Text>
      ) : maxCount === 0 ? (
        <Text
          style={{ color: subtext, fontSize: getScaledFontSize(13), lineHeight: getScaledFontSize(20) }}
        >
          No readings yet. Tap RECORD on the {card.title.toLowerCase()} task to log your
          first one.
        </Text>
      ) : maxCount < 2 ? (
        <Text
          style={{ color: subtext, fontSize: getScaledFontSize(13), lineHeight: getScaledFontSize(20) }}
        >
          One reading so far. A chart appears once you’ve recorded at least two, so there
          is a change to show.
        </Text>
      ) : (
        <View>
          {series.map((s) => (
            <MetricSeriesRow
              key={s.type}
              type={s.type}
              label={card.isPair ? (s.spec?.label ?? s.type) : null}
              points={s.points}
              subtext={subtext}
              textColor={colors.text}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ))}
          {maxCount > SPARKLINE_BARS ? (
            <Text style={{ color: subtext, fontSize: getScaledFontSize(11), marginTop: 8 }}>
              Showing your last {SPARKLINE_BARS} of {maxCount} readings in the last{' '}
              {METRIC_HISTORY_DAYS} days.
            </Text>
          ) : (
            <Text style={{ color: subtext, fontSize: getScaledFontSize(11), marginTop: 8 }}>
              {maxCount} readings in the last {METRIC_HISTORY_DAYS} days.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------
// One series row inside a card (a card has 1 row, or 2 for the BP pair)
// ---------------------------------------------------------------------

interface MetricSeriesRowProps {
  type: SelfReportedMetricType;
  /** Sub-label — only set on the BP pair card ("Systolic" / "Diastolic"). */
  label: string | null;
  points: { recordedAt: string; value: number; unit: string }[];
  subtext: string;
  textColor: string;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function MetricSeriesRow({
  type,
  label,
  points,
  subtext,
  textColor,
  getScaledFontSize,
  getScaledFontWeight,
}: MetricSeriesRowProps): React.JSX.Element | null {
  const spec = METRIC_DISPLAY[type];
  if (!spec || points.length === 0) return null;

  // A one-point series must NOT be drawn. ScoreHistorySparkline left-pads
  // a short series by repeating its first value, so a single reading
  // renders as seven identical bars — which reads as "seven identical
  // readings", a claim we have no data for. This matters most on the BP
  // pair card, where systolic can have three readings while diastolic has
  // one. Show the number, skip the picture.
  if (points.length < 2) {
    return (
      <View style={styles.seriesRow}>
        <Text
          style={{
            color: textColor,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(600) as 'bold',
          }}
        >
          {label ? `${label} · ` : ''}
          {formatMetricValue(type, points[points.length - 1].value)} {spec.unit}
        </Text>
        <Text style={{ color: subtext, fontSize: getScaledFontSize(11), marginTop: 4 }}>
          Only one reading — no trend to chart yet.
        </Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  // Only the last SPARKLINE_BARS values are actually drawn, so the range
  // caption and the a11y read-out must describe THOSE, not the whole
  // window — otherwise the text and the picture disagree.
  const shown = values.slice(-SPARKLINE_BARS);
  const normalised = normaliseForSparkline(type, shown);
  const bounds = resolveScaleBounds(spec, shown);
  const clamped = hasOutOfRangeValue(type, shown);

  const realList = shown.map((v) => formatMetricValue(type, v)).join(', ');
  const latest = shown[shown.length - 1];

  return (
    <View style={styles.seriesRow}>
      {label ? (
        <Text
          style={{
            color: textColor,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(600) as 'bold',
            marginBottom: 4,
          }}
        >
          {label} · {formatMetricValue(type, latest)} {spec.unit}
        </Text>
      ) : null}

      {/*
        A11Y — the sparkline is REMOVED from the accessibility tree.
        ScoreHistorySparkline exposes accessibilityValue={{min,max,now}}
        built from its 0-100 input; letting VoiceOver read that would
        announce a NORMALISED number as if it were the patient's reading
        (e.g. "30" for a glucose of 118). The hidden-then-replaced pattern
        below hands VoiceOver the REAL values instead.
      */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ScoreHistorySparkline
          series={normalised}
          accessibilityLabel={`${spec.label} trend`}
        />
      </View>
      <Text
        accessible
        accessibilityLabel={`${spec.label} readings, oldest to newest: ${realList} ${spec.unit}`}
        style={{ color: subtext, fontSize: getScaledFontSize(11), marginTop: 6 }}
      >
        Chart range {formatMetricValue(type, bounds.lo)}–{formatMetricValue(type, bounds.hi)}{' '}
        {spec.unit}. Bar height shows where each reading sits in that range.
        {clamped ? ' One or more readings sit outside this range and are drawn at the edge.' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  backBtn: {
    padding: 8,
    marginRight: 4,
  },
  placeholder: {
    // CHUNK 50 fix: bumped from 320 to 600 to better match the full
    // render footprint. Real content lands within ~40pt of this, no
    // visible push/pull on data arrival.
    height: 600,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(148,163,184,0.12)',
  },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    // 44pt minimum tap target — our patients skew older.
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  paneContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  latestCol: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  cardPlaceholder: {
    height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(148,163,184,0.12)',
  },
  seriesRow: {
    marginBottom: 10,
  },
  linkBtn: {
    marginTop: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
});
