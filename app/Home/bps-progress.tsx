/**
 * BPS Progress route (CHUNK 50).
 *
 * Ken 2026-07-22: the BPS surface shipped without the legacy Plan/Progress
 * tab bar — Ken could see plan structure but had no adherence / streak /
 * self-reported-metrics signal beyond chunk-47's Today hero. This route
 * reuses legacy `ProgressTab` under `/Home/bps-progress`, entered via the
 * "View Progress" link in BPS's header row (BPS_PROGRESS_LINK_ENABLED).
 *
 * Data contract mirrors `app/Home/health-plan.tsx:766-812` exactly:
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
 * iOS 26.5 discipline: cold-mount uses a static View placeholder — no
 * ActivityIndicator on the first-paint path. Matches chunks 17/39/47/48.
 *
 * OTA-flip / revert: flipping `BPS_PROGRESS_LINK_ENABLED = false` in
 * BiopsychosocialPlanScreen.tsx hides the entry link in 30-60s via
 * `npm run eas:update:production`. This route file remains bundled but
 * becomes UI-orphan; deep-linking still redirects defensively.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppWrapper } from '@/components/app-wrapper';
import { ProgressTab } from '@/components/health-plan/ProgressTab';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag';
import { fetchTasksForDate } from '@/services/api/ai-health-plan';
import type { TaskOccurrence } from '@/services/api/types';

/** Local YYYY-MM-DD for today. Matches the key used by
 *  BiopsychosocialPlanScreen (['plan-tasks', todayIso()]) and
 *  auth-prefetch.ts so we ride the warm cache on first render. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BpsProgressRoute(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const biopsychosocialPlanEnabled = useBiopsychosocialPlanFlag();
  const planQuery = useBiopsychosocialPlan();

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
  const todayTasks: TaskOccurrence[] = todayTasksQuery.data ?? [];

  const completedToday = todayTasks.filter((t) => t.status === 'completed').length;
  const totalToday = todayTasks.length;
  const adherencePercent =
    totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

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
  // transition. Placeholder height bumped to match ProgressTab's actual
  // vertical footprint (adherence card + streak row + metrics chart +
  // trends) so real content lands without pushing/pulling.
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
        <ProgressTab
          streakDays={0 /* TODO(follow-up SCRUM): plumb real streak from /v1/.../analytics for legacy + BPS in lockstep. */}
          adherencePercent={adherencePercent}
          completedToday={completedToday}
          totalToday={totalToday}
        />
      )}
    </AppWrapper>
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
    // CHUNK 50 fix: bumped from 320 to 600 to better match ProgressTab's
    // full render footprint (adherence card + streak row + self-reported
    // metrics chart + trends). Real content lands within ~40pt of this,
    // no visible push/pull on data arrival.
    height: 600,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(148,163,184,0.12)',
  },
});
