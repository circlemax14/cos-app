/**
 * PlanScreenV2 — CHUNK 1 (2026-07-20).
 *
 * Absolute minimum. No gesture-handler, no accordion, no data hooks,
 * no AsyncStorage, no toast, no offline banner, no Reanimated worklets,
 * no CareManagerToastHost, no MedsSignalContext.
 *
 * Purpose: prove the v2 mount PATH itself works on iOS 26.5 build 62.
 * If Ken lands on this screen without crashing, we know unified-plan.tsx
 * → PlanScreenV2 mount is safe and we can layer components one chunk
 * at a time. If it still crashes, the trigger is something in the
 * unified-plan route file or expo-router push itself — bigger fix.
 *
 * Later chunks will add (one commit + one OTA each):
 *   - Chunk 2: BpsAccordion shell (3 collapsed headers, no content)
 *   - Chunk 3: Plan bullets under each section (still no interactive)
 *   - Chunk 4: Goals list (read-only)
 *   - Chunk 5: Tasks list (read-only, no swipe)
 *   - Chunk 6: Swipe actions on tasks
 *   - Chunk 7: Routines
 *   - Chunk 8: AI suggestion strip
 *   - Chunk 9: Wellbeing map card
 *   - Chunk 10: Care-manager toast
 */

import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQueryClient } from '@tanstack/react-query';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useUnifiedPlan } from '@/hooks/use-unified-plan';
import { formatRelative, stalenessLevel, FRESHNESS_COLORS } from '@/lib/plan-time';
import { BpsAccordion } from '@/components/unified-plan/v2/BpsAccordion';
import { WellbeingMapCard } from '@/components/unified-plan/v2/WellbeingMapCard';
import { AISuggestionStrip } from '@/components/unified-plan/v2/AISuggestionStrip';
import { CareManagerToast } from '@/components/unified-plan/v2/CareManagerToast';
import { PlanSkeleton, PlanErrorCard } from '@/components/unified-plan/v2/PlanSkeleton';
import { CachedPlanBanner } from '@/components/unified-plan/v2/CachedPlanBanner';
import {
  NoTierEmptyState,
  BasicGenerateEmptyState,
  HasTierNoPlanEmptyState,
  hasPlanContent,
} from '@/components/unified-plan/v2/PlanEmptyStates';
import { useFirstVisitChooser } from '@/components/unified-plan/v2/useFirstVisitChooser';
import { PlanTierPill } from '@/components/unified-plan/v2/PlanTierPill';
import { RegenerateButton } from '@/components/unified-plan/v2/RegenerateButton';
import { GeneratingBanner } from '@/components/unified-plan/v2/GeneratingBanner';
import { PersonalizePlanBanner } from '@/components/unified-plan/v2/PersonalizePlanBanner';
import { AssessmentDueBanner } from '@/components/unified-plan/v2/AssessmentDueBanner';
import { InlineAssessmentCatalog } from '@/components/unified-plan/v2/InlineAssessmentCatalog';
import { useIsAssessmentDueVisible } from '@/components/unified-plan/v2/useIsAssessmentDueVisible';
import { fireAndForgetPost } from '@/components/unified-plan/v2/net';
import { usePlanType } from '@/hooks/use-plan-type';
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name';
import { useHealthPlanAssignments } from '@/hooks/use-health-plan-assignments';
import type { PlanType } from '@/services/api/plan-type';
import type { UnifiedSectionKey } from '@/services/api/unified-plan';

export default function PlanScreenV2(): React.JSX.Element {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // COS-475b chunk 3 — first real data hook. useUnifiedPlan is a
  // react-query wrapper over GET /v1/plan (Phase 1). Same hook the
  // legacy path uses; not new bridge code, but the first time v2
  // pays for the fetch.
  const {
    data,
    refetch,
    isRefetching,
    isLoading,
    isError,
    isFetching,
    failureCount,
  } = useUnifiedPlan();

  // CHUNK 32 (2026-07-21) — plan-type hook reused from the shared
  // ['plan-type'] react-query cache. Legacy already primes this cache
  // (app/Home/health-plan.tsx line 390), so bouncing between paths is a
  // no-op fetch — no flicker, no double network trip.
  const planTypeQ = usePlanType();
  const planTypeDisplayNameFn = usePlanTypeDisplayName();

  // CHUNK 32 — first-visit auto-open of the plan-type chooser. Byte-
  // identical AsyncStorage key + double-guard as legacy.
  useFirstVisitChooser({
    isLoading: planTypeQ.isLoading,
    data: planTypeQ.planType,
  });

  // CHUNK 35 (2026-07-21) — assessments-complete gate + Personalize CTA.
  //
  // Backend serves per-plan-type assignment progress at
  // /v1/patients/me/health-plan/assignments (SCRUM-254). `canGenerate`
  // is the one-field gate: basic → always true, advanced/agency → true
  // iff every assigned check-in is complete. Legacy consumes the same
  // hook at app/Home/health-plan.tsx line 416 (current file).
  //
  // Two effects flow from this:
  //   1. RegenerateButton disable predicate unions `!canGeneratePlan`
  //      so a non-Basic user with incomplete check-ins sees the reload
  //      icon greyed. Byte-identical to legacy line 926.
  //   2. PersonalizePlanBanner renders (below the tier pill) when
  //      `isNonBasicPlan && !canGeneratePlan`, routing the user to the
  //      check-ins catalog. Copy mirrors legacy verbatim.
  //
  // FAIL-OPEN FALLBACK: when the assignments query hasn't resolved or
  // errored, we fall back to `planTypeQ.planType === 'basic'`. This is
  // byte-identical to legacy line 422 and intentional: Basic never
  // needs check-ins, so Basic users are permissive by default, and
  // non-Basic users get the safer "disabled until we know" stance.
  // If the BE returns a defined `false` during a plan-tier transition
  // it WILL block Basic — that matches legacy exactly. Don't "fix" it.
  const assignmentsQuery = useHealthPlanAssignments();
  const assignments = assignmentsQuery.data;
  const isNonBasicPlan =
    planTypeQ.planType === 'advanced' ||
    planTypeQ.planType === 'agency-supported' ||
    planTypeQ.planType === 'agency-managed';
  const canGeneratePlan = assignments?.canGenerate ?? (planTypeQ.planType === 'basic');

  // CHUNK 36 fix (adversarial-verify blocker): shared signal for whether
  // v2's AssessmentDueBanner would render. Used below to suppress
  // CachedPlanBanner when they'd otherwise stack. Returns false always
  // when ASSESSMENT_DUE_BANNER_ENABLED is off (day 1), so today this
  // adds zero behavior change; it's the guard for the flag-on future.
  const isAssessmentDueVisible = useIsAssessmentDueVisible();

  // SCRUM-535 focus-refetch: when the user completes a check-in on the
  // assessments-catalog screen the query is invalidated, but invalidation
  // only refetches an *active* observer. PlanScreenV2 is backgrounded
  // during that flow, so on return the stale canGenerate=false snapshot
  // is re-served and both the Regenerate button and Personalize banner
  // stay in their pre-completion state. Refetching on focus reflects the
  // live backend truth the moment the user comes back.
  //
  // Only assignments is refetched here — v2 does not consume the raw
  // assessments query for progress copy (legacy line 407-412 does; v2
  // shows the banner as a binary gate), so adding it would enlarge
  // surface for no user-visible gain. Keep an eye on CloudWatch QPS on
  // /v1/patients/me/health-plan/assignments — this is the first v2
  // observer on that query key, and the 60s staleTime + useFocusEffect
  // are non-compounding but any v2-side check-in flow that invalidates
  // the key will multiply refetches across surfaces.
  const refetchAssignments = assignmentsQuery.refetch;
  const queryClient = useQueryClient();
  useFocusEffect(
    React.useCallback(() => {
      void refetchAssignments();
      // CHUNK 36 (2026-07-21) — extend chunk 35's focus effect to also
      // invalidate the two query keys InlineAssessmentCatalog and
      // AssessmentDueBanner read from. Without this the completed-count
      // subhead ("N of M completed") and the due-nudge list stay stale
      // until manual pull-to-refresh after a user returns from completing
      // a check-in on the assessments-catalog stepper. Invalidate (not
      // refetch) so the queries only re-fire if InlineAssessmentCatalog
      // is actually mounted this render — the non-basic-no-plan branch.
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      queryClient.invalidateQueries({ queryKey: ['instruments-recommended'] });
    }, [refetchAssignments, queryClient]),
  );

  // CHUNK 35 EXPLICIT NON-GOAL — AI_AWAITING_ASSESSMENTS re-route.
  //
  // Legacy app/Home/health-plan.tsx lines 529-530 inspect a POST error
  // code from /v1/patients/me/health-plan/ai/generate and route the
  // user to the check-ins catalog on `AI_AWAITING_ASSESSMENTS`. We
  // deliberately DO NOT port that here in chunk 35:
  //   - `handleGenerate` above uses `fireAndForgetPost` because chunk
  //     9.5 proved that awaiting an axios/fetch response inside a tap
  //     handler is a repeatable iOS 26.5 SIGABRT source.
  //   - The `!canGeneratePlan` gate we just added prevents the button
  //     from firing at all in 99% of cases where BE would return that
  //     code. The remaining <1% window is a BE flag lag where the
  //     `canGenerate` value we have is momentarily stale; in that
  //     case the POST fires, the BE noops, and the next 60s
  //     assignments refetch resurfaces the banner. Tolerating one
  //     wasted click beats re-introducing a crash risk.
  //   - A proper port needs either (a) proven-safe raw-fetch response
  //     inspection on iOS 26.5, or (b) the async 202/jobId flow (see
  //     project_biopsychosocial_async_regenerate_followup.md).
  // Deferred to chunk 36 with a linked follow-up SCRUM story.

  // CHUNK 32 — Basic-tier Generate CTA state + staged refetch cadence.
  // Bedrock plan generation p95 is ~8–15s with 25s+ tails; three staged
  // refetches at t=5s / 15s / 30s beat a single fire so users don't
  // have to pull-to-refresh. All timers ref-tracked for unmount cleanup
  // so a stray refetch after navigate-away can't hit a dead queryClient.
  const [generating, setGenerating] = React.useState(false);
  const refetchTimerRef = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);

  React.useEffect(
    () => () => {
      refetchTimerRef.current.forEach(clearTimeout);
      refetchTimerRef.current = [];
    },
    [],
  );

  const handleGenerate = React.useCallback((force: unknown = false) => {
    if (generating) return;
    setGenerating(true);
    // Fire-and-forget POST — NEVER await axios inside a tap handler on
    // this binary (chunk 9.5 SIGABRT). Reconcile via staged refetches.
    // CHUNK 34 (2026-07-21) — `force` param threaded through so the header
    // RegenerateButton can force-regenerate an existing plan (force=true).
    // Chunk 32's Basic-tier CTA passes handleGenerate directly to a
    // Pressable's onPress, which invokes it with a GestureResponderEvent
    // as arg 0 — under a naive `force: boolean = false` signature that
    // truthy event object would silently flip the Basic CTA to force=true.
    // Type is `unknown` + explicit `=== true` normalize to prevent that.
    const forceBool = force === true;
    void fireAndForgetPost('/v1/patients/me/health-plan/ai/generate', { force: forceBool });
    // CHUNK 34 fix (adversarial-verify major #1): don't clear `generating`
    // on the last timer's finally — Bedrock has 25s+ tails, so a t=30s
    // clear would mislabel a still-running own-tap as cross-device via the
    // GeneratingBanner. Instead, let the effect below observe the
    // refreshInFlight true→false transition and clear `generating` then.
    // The timers here still refetch for optimistic freshness; they just
    // don't touch the local flag.
    const schedule = (ms: number) => {
      const t = setTimeout(() => {
        void refetch();
      }, ms);
      refetchTimerRef.current.push(t);
    };
    schedule(5000);
    schedule(15000);
    schedule(30000);
  }, [generating, refetch]);

  // CHUNK 34 (2026-07-21) — server-truth "a generation is running" flag.
  // `data?.meta?.refreshInFlight === true` is explicit-`=== true` so that
  // pre-COS-475 BE deploys that omit the field entirely are treated as
  // false rather than truthy-undefined. Union with the local `generating`
  // tap flag gives us the "any-source generating" signal that gates both
  // the header button spinner/disable AND the cross-device banner.
  const refreshInFlight = data?.meta?.refreshInFlight === true;
  const isGeneratingFromAnySource = generating || refreshInFlight;

  // CHUNK 34 fix (adversarial-verify major #1 tail): clear local `generating`
  // when server refreshInFlight transitions true → false. This means the
  // spinner stays on for the entire real generation, not just an arbitrary
  // 30s window — and GeneratingBanner (which requires `refreshInFlight &&
  // !generating`) never fires for the user who tapped Regenerate themselves
  // because their `generating` stays true as long as refreshInFlight is true.
  const prevRefreshInFlightRef = React.useRef(refreshInFlight);
  React.useEffect(() => {
    if (prevRefreshInFlightRef.current === true && refreshInFlight === false) {
      setGenerating(false);
    }
    prevRefreshInFlightRef.current = refreshInFlight;
  }, [refreshInFlight]);

  const handleRegenerate = React.useCallback(() => {
    handleGenerate(true);
  }, [handleGenerate]);

  const onChoosePlan = React.useCallback(() => {
    router.push('/Home/plan-type-chooser' as never);
  }, []);

  // CHUNK 35 fix (adversarial-verify nit): hoisted from inline arrow so
  // PersonalizePlanBanner gets a stable prop identity render-to-render,
  // matching the useCallback discipline of onChoosePlan/handleRegenerate/
  // handleRetry.
  const handlePersonalize = React.useCallback(() => {
    router.push('/Home/assessments-catalog?source=plan-upgrade' as never);
  }, []);

  const onSwipeRefetch = React.useCallback(() => {
    void refetch();
  }, [refetch]);

  const onPullRefresh = React.useCallback(() => {
    void refetch();
  }, [refetch]);

  // CHUNK 17 — stable identity for the error-card retry button so
  // react-query's refetch identity churn does not force the Pressable
  // to re-render on every fetch tick. Also acts as the fire-and-forget
  // adapter (Pressable onPress signature is void, refetch returns a
  // Promise) — no floating-promise warning.
  const handleRetry = React.useCallback(() => {
    void refetch();
  }, [refetch]);

  const onBack = React.useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  // CHUNK 16 (2026-07-21) — controlled-open bridge from AISuggestionStrip
  // chip taps into BpsAccordion. Nonce bumps on every request so the child
  // effect re-fires even when the same section is requested twice in a row
  // (e.g. tap a Bio chip, manually collapse Bio, tap the same chip again).
  // React coalesces same-value setState, so a plain SectionKey state would
  // silently drop the second tap — the { section, nonce } object identity
  // change avoids that.
  const [openRequest, setOpenRequest] = React.useState<
    { section: UnifiedSectionKey; nonce: number } | null
  >(null);

  const requestOpenSection = React.useCallback((section: UnifiedSectionKey) => {
    setOpenRequest((prev) => ({ section, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  // CHUNK 16 addendum — scroll-to-section on chip tap. Without this the
  // Bio chip tap is a no-op visually (Bio auto-opens on first paint;
  // section is already open, no state change) and the Psy/Soc chip taps
  // open a section that's below the fold. Refs (not state) so a layout
  // pass never triggers a re-render.
  const scrollRef = React.useRef<ScrollView>(null);
  const bpsYRef = React.useRef(0);
  const sectionYRef = React.useRef<Record<UnifiedSectionKey, number>>({
    biological: 0,
    psychological: 0,
    socialSpiritual: 0,
  });

  const onBpsLayout = React.useCallback(
    (e: { nativeEvent: { layout: { y: number } } }) => {
      bpsYRef.current = e.nativeEvent.layout.y;
    },
    [],
  );

  const onSectionLayout = React.useCallback(
    (section: UnifiedSectionKey, y: number) => {
      sectionYRef.current[section] = y;
    },
    [],
  );

  React.useEffect(() => {
    if (!openRequest) return;
    // CHUNK 17 defense-in-depth: BpsAccordion is unmounted while the
    // skeleton/error card renders, so onBpsLayout / onSectionLayout
    // never fire and both refs stay at their initial 0 sentinels.
    // AISuggestionStrip returns null with no bullets pre-data so a
    // chip tap is unreachable today — but if a future chunk feeds
    // the strip a static "getting started" chip during loading, this
    // guard prevents a stray scrollTo(y=0). Zero is legitimate at
    // the top of the accordion, so we can't distinguish "unset" from
    // "top" — the cheap fix is to bail if the accordion is not
    // currently mounted (checked via the same isLoading/isError gate
    // that controls the swap below).
    if ((isLoading && !data) || (isError && !data && !isFetching && failureCount > 0)) {
      return;
    }
    // Small negative padding so the section header lands a hair below
    // the top edge of the viewport instead of flush against it.
    const target = bpsYRef.current + (sectionYRef.current[openRequest.section] ?? 0) - 12;
    scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true });
  }, [openRequest, isLoading, isError, isFetching, failureCount, data]);

  const freshness = React.useMemo(
    () => formatRelative(data?.meta?.generatedAt ?? null),
    [data?.meta?.generatedAt],
  );

  // CHUNK 27 (2026-07-21) — persistent care-team update chip. When
  // `data.meta.generatedAt` advances between polls the CareManagerToast
  // auto-hides after 4s and Ken loses the affordance to review the
  // update. We independently observe the same field with our own
  // sentinel (byte-identical to CareManagerToast's previousRef pattern
  // at lines 40, 50-67 so cold-boot never registers a phantom update)
  // and remember the timestamp session-scoped. The chip renders below
  // the freshness pill and taps bump `reopenNonce` which CareManagerToast
  // consumes via its optional prop to re-show its toast.
  const [lastCareUpdateAt, setLastCareUpdateAt] = React.useState<string | null>(null);
  const [reopenNonce, setReopenNonce] = React.useState<number>(0);
  const careUpdateSeenRef = React.useRef<string | null | undefined>(undefined);

  React.useEffect(() => {
    const generatedAt = data?.meta?.generatedAt ?? null;
    if (careUpdateSeenRef.current === undefined) {
      careUpdateSeenRef.current = generatedAt;
      return;
    }
    if (
      generatedAt &&
      careUpdateSeenRef.current &&
      careUpdateSeenRef.current !== generatedAt
    ) {
      setLastCareUpdateAt(generatedAt);
    }
    careUpdateSeenRef.current = generatedAt;
  }, [data?.meta?.generatedAt]);

  const handleChipPress = React.useCallback(() => {
    setReopenNonce((n) => n + 1);
  }, []);

  // COS-475b CHUNK 18 — stale-plan color escalation. Memo dep is the same
  // `generatedAt` string reference used by `freshness` above, so the two
  // memos flip in lockstep. NO setInterval / AppState here by design (iOS
  // 26.5 forbidden-primitives list); a plan that ages past a threshold
  // mid-session keeps its previous color until the next refetch bumps
  // generatedAt. See `stalenessLevel` JSDoc for the invariant.
  const staleness = React.useMemo(
    () => stalenessLevel(data?.meta?.generatedAt),
    [data?.meta?.generatedAt],
  );
  const freshnessScheme = settings.isDarkTheme ? 'dark' : 'light';
  const stalenessColor = FRESHNESS_COLORS[staleness][freshnessScheme];

  return (
    <AppWrapper>
      <CareManagerToast generatedAt={data?.meta?.generatedAt} reopenNonce={reopenNonce} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onPullRefresh}
            tintColor={colors.tint}
          />
        }
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
          >
            <Text style={{ color: colors.tint, fontSize: getScaledFontSize(16) }}>‹ Back</Text>
          </Pressable>
          {/*
            CHUNK 34 (2026-07-21) — flex:1 spacer pushes the RegenerateButton
            to the right edge without switching the parent row to
            justifyContent:'space-between' (chunk-17 diary flagged that
            change as a wrap regression for the freshness pill on narrow
            devices at large dynamic-type).
          */}
          <View style={{ flex: 1 }} />
          {/*
            CHUNK 34 fix (adversarial-verify major #2): gate button on
            hasPlanContent so it only renders when a real plan exists to
            regenerate. In empty-state branches (NoTier / BasicGenerate /
            HasTierNoPlan) the header button is hidden and each empty
            state's own CTA is the sole entry point — no competing CTAs
            firing the same POST twice. Predicate mirrors PlanTierPill's
            gate for consistency.
          */}
          {data &&
          'sections' in data &&
          hasPlanContent(data) &&
          planTypeQ.planType !== undefined &&
          !planTypeQ.isLoading &&
          !planTypeQ.isError ? (
            <RegenerateButton
              onPress={handleRegenerate}
              /*
                CHUNK 35 (2026-07-21) — union `!canGeneratePlan` into the
                disable predicate. Byte-identical to legacy line 926
                (`disabled={generating || !canGeneratePlan}`). Spinner
                is still driven by `isGeneratingFromAnySource` alone —
                greyed vs spinning are two distinct stories and the
                spinner should reflect generation state, not gate state.
              */
              disabled={isGeneratingFromAnySource || !canGeneratePlan}
              isGenerating={isGeneratingFromAnySource}
              accessibilityHint={
                !canGeneratePlan && !isGeneratingFromAnySource
                  ? 'Complete required check-ins first'
                  : undefined
              }
            />
          ) : null}
        </View>

        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(28),
            fontWeight: '600',
            marginTop: 8,
          }}
        >
          Your plan
        </Text>
        {freshness ? (
          <View
            style={styles.freshnessPill}
            accessible={true}
            accessibilityLabel={
              isRefetching
                ? 'Plan updating'
                : `Plan updated ${freshness}${
                    staleness === 'stale' ? ', stale' : staleness === 'aging' ? ', aging' : ''
                  }`
            }
          >
            <View
              style={[
                styles.freshnessDot,
                { backgroundColor: isRefetching ? colors.tint : stalenessColor },
              ]}
            />
            <Text
              style={{
                color: isRefetching || staleness === 'fresh' ? colors.subtext : stalenessColor,
                fontSize: getScaledFontSize(12),
              }}
            >
              {isRefetching
                ? 'Updating…'
                : `Updated ${freshness}${staleness === 'stale' ? ' · Stale' : ''}`}
            </Text>
          </View>
        ) : null}

        {/*
          CHUNK 27 — persistent care-team update chip. Renders BELOW the
          freshness pill (not next to it) so wrapping is clean at large
          dynamic-type on iPhone14,3. Gated mutually exclusive with the
          skeleton/error branches (chunk 17) — never flashes into empty
          space during loading/first-error. Visually weaker than the
          freshness pill (subtext color, 12/400, no fill) so the pill
          stays the primary trust signal.
        */}
        {lastCareUpdateAt && data && !isLoading && !isFetching && !isError ? (
          <Pressable
            onPress={handleChipPress}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Care team updated ${formatRelative(lastCareUpdateAt)}. Tap to review.`}
            accessibilityHint="Reopens the care team update notice"
            style={({ pressed }) => [styles.careChip, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="history" size={14} color={colors.subtext} />
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                fontWeight: '400',
              }}
            >
              {`Care team update · ${formatRelative(lastCareUpdateAt)}`}
            </Text>
          </Pressable>
        ) : null}

        {/*
          CHUNK 33 (2026-07-21) — persistent plan-tier pill.
          Renders BELOW the freshness pill / care-team chip and ABOVE
          the CachedPlanBanner / WellbeingMapCard so top-of-plan
          identity ("what tier am I on") is always visible when the
          user has real plan content. Mutually exclusive with the
          NoTier / BasicGenerate / HasTierNoPlan empty states below
          (each already exposes its own Choose/Change CTA) — reuses
          `hasPlanContent(data)` from PlanEmptyStates so the gate can't
          drift. The `!isLoading && !isFetching && !isError` clause
          prevents flash-in-empty-space during cold fetch; the
          `!planTypeQ.isLoading && !planTypeQ.isError` + `planType !==
          undefined` check keeps the pill hidden until the plan-type
          query confirms a tier. `usePlanType()` deliberately does not
          expose `isSuccess` (see hooks/use-plan-type.ts) — the trio
          above is the equivalent success-branch predicate.
        */}
        {planTypeQ.planType !== undefined &&
        !planTypeQ.isLoading &&
        !planTypeQ.isError &&
        data &&
        'sections' in data &&
        hasPlanContent(data) &&
        !isLoading &&
        !isFetching &&
        !isError ? (
          <PlanTierPill
            planType={planTypeQ.planType as PlanType}
            displayName={planTypeDisplayNameFn(planTypeQ.planType as PlanType)}
            onPress={onChoosePlan}
          />
        ) : null}

        {/*
          CHUNK 36 (2026-07-21) — AssessmentDueBanner (monthly retake nudge).
          Renders BELOW the PlanTierPill block and ABOVE the PersonalizePlanBanner
          / GeneratingBanner / CachedPlanBanner. Internally returns null when
          `ASSESSMENT_DUE_BANNER_ENABLED` is off (day 1) or nothing is due, so
          the day-1 render is a no-op regardless of the outer gate below.
          Mutual-exclusion truth table (documented in the PR body):
            - hasPlanContent required — the empty-state branches (Basic/Preparing/
              InlineCatalog/NoTier) own their own guidance; a due-retake nudge on
              top of an empty state would be noise.
            - !refreshInFlight, !generating — during regeneration we already show
              GeneratingBanner (amber); stacking two amber banners at the top
              was the visual regression that killed chunks 26/34/35's precedence
              work if we didn't hold this invariant.
            - !isNonBasicPlan || canGeneratePlan — PersonalizePlanBanner takes
              precedence when both would fire (rare, but a non-Basic user with
              incomplete initial check-ins + a stale monthly retake will hit
              both). Personalize routes to check-ins, DueBanner also routes to
              check-ins — the same destination, so priority goes to Personalize
              because its ONE-of-Y semantics are stronger than "and one of your
              monthlies is due" when the initial set isn't done.
        */}
        {data &&
        'sections' in data &&
        hasPlanContent(data) &&
        !refreshInFlight &&
        !generating &&
        (!isNonBasicPlan || canGeneratePlan) ? (
          <AssessmentDueBanner />
        ) : null}

        {/*
          CHUNK 35 (2026-07-21) — PersonalizePlanBanner.
          Renders BELOW the PlanTierPill block (tier identity leads) and
          ABOVE both GeneratingBanner and CachedPlanBanner.
          Gate composed of eight conjuncts so it never flashes:
            - isNonBasicPlan: Basic never needs check-ins.
            - !canGeneratePlan: the actual gate. Fails-open via legacy's
              `?? (planType === basic)` fallback (see derivation above).
            - !assignmentsQuery.isLoading && !assignmentsQuery.isError:
              hide during cold-fetch AND on chronic query error. On
              chronic error the RegenerateButton also stays greyed via
              the same ?? fallback — followup UX ticket to consider a
              "Check-in status unavailable" hint if this becomes user-
              visible in the wild.
            - !planTypeQ.isLoading && !planTypeQ.isError: parity with
              the assignments gate — a transient plan-type failure
              could otherwise flicker isNonBasicPlan false→true on
              recovery and flash the banner.
            - !!data && 'sections' in data && hasPlanContent(data): the
              empty-state branches below (NoTier/Basic/HasTierNoPlan)
              already expose their own CTAs; don't stack a second one.
          Precedence over CachedPlanBanner: when both would otherwise
          render, Personalize wins because it's actionable (tap → route
          to check-ins) while Cached is informational (tap → retry
          fetch). CachedPlanBanner's gate below excludes this state.
        */}
        {isNonBasicPlan &&
        !canGeneratePlan &&
        !assignmentsQuery.isLoading &&
        !assignmentsQuery.isError &&
        !planTypeQ.isLoading &&
        !planTypeQ.isError &&
        !!data &&
        'sections' in data &&
        hasPlanContent(data) &&
        // CHUNK 35 fix (adversarial-verify major): suppress when a
        // regeneration is in flight — GeneratingBanner shows below, and
        // Personalize would stack two banners in the rare "incomplete
        // check-ins + another device is regenerating" state. The tap
        // target on Personalize (route to check-ins) is still valid but
        // the banner will re-appear naturally when refreshInFlight goes
        // false (via the transition effect chunk 34 established).
        !refreshInFlight ? (
          <PersonalizePlanBanner
            onPress={handlePersonalize}
          />
        ) : null}

        {/*
          CHUNK 34 (2026-07-21) — cross-device "already regenerating" banner.
          Fires when the BE has surfaced `meta.refreshInFlight === true` but
          the local tap flag is false — i.e. another device (or the legacy
          surface) kicked off a regeneration and this device's 60s poll
          picked it up. Placed BETWEEN the PlanTierPill block above and the
          CachedPlanBanner below so at most one amber banner is in view
          (see the CachedPlanBanner gate — chunk 34 concern #9 — which now
          short-circuits when refreshInFlight is true).
          Also gated on `!!data` so it never flashes into the skeleton /
          error-card layout branches, which own their own empty space.
        */}
        <GeneratingBanner visible={refreshInFlight && !generating && !!data} />

        {/*
          Cached-plan banner (Chunk 26):
          Fires ONLY when we already have a plan cached AND the last refetch
          attempt failed AND no refetch is currently in flight. Symmetric
          complement to the PlanErrorCard gate below (which fires when `data`
          is absent), so the two are mutually exclusive on `data` truthiness
          and never double-render.
          Note: `failureCount > 0` is intentionally kept to match the exact
          shape of the existing PlanErrorCard gate for consistency; react-query
          resets failureCount to 0 on a successful refetch (verified in the
          version currently bundled — see hooks/use-unified-plan.ts), so the
          banner clears on the next successful retry.
          CHUNK 34 (2026-07-21) — precedence rule: when the GeneratingBanner
          above is visible (refreshInFlight true), suppress the cached-plan
          banner so at most one amber banner stacks. Mathematically the two
          are rarely co-truthy (refreshInFlight requires a successful GET,
          cached-plan requires a failed one) but a mid-regen fetch error
          can briefly satisfy both — precedence goes to the regenerating
          story since a retry now would 409 anyway.
          CHUNK 35 (2026-07-21) — additional precedence rule: when the
          PersonalizePlanBanner above is visible, suppress the cached-plan
          banner. Both use accent-left color stripes and both could be
          truthy on a non-Basic user with incomplete check-ins whose last
          background refetch also failed. Personalize wins because it's
          actionable (route to check-ins) while Cached is informational
          (retry fetch); the retry is available via pull-to-refresh anyway.
        */}
        {data &&
        isError &&
        !isFetching &&
        failureCount > 0 &&
        !refreshInFlight &&
        // CHUNK 36 fix (adversarial-verify blocker): also suppress when
        // AssessmentDueBanner would render. Both are amber and would
        // stack otherwise. Precedence: actionable retake > informational
        // cached-error (retry is still one pull-to-refresh away).
        !isAssessmentDueVisible &&
        !(
          isNonBasicPlan &&
          !canGeneratePlan &&
          !assignmentsQuery.isLoading &&
          !assignmentsQuery.isError &&
          !planTypeQ.isLoading &&
          !planTypeQ.isError &&
          'sections' in data &&
          hasPlanContent(data)
        ) ? (
          <CachedPlanBanner onRetry={handleRetry} disabled={isRefetching} />
        ) : null}

        <WellbeingMapCard />
        <AISuggestionStrip view={data ?? null} onSuggestionPress={requestOpenSection} />
        {/*
          CHUNK 17 — accordion slot swap.
          - `(isLoading || isFetching) && !data`: cold fetch OR retry
            while we still have no data. Gating on isFetching too
            (chunk 17 fix) closes the mid-retry flash where the error
            card would unmount → empty BpsAccordion mounts for a beat
            → data or new error arrives. Never gate on `isLoading`
            alone — react-query returns cached data immediately and
            isLoading is false in that case, so a bare gate would
            flash the skeleton on every cache-hit remount.
          - `isError && !data && !isFetching && failureCount > 0`: only
            show the error card when (a) there is no cached data to
            fall back on, (b) no fetch is in flight (a background
            refetch failing over stale data should keep the plan
            visible and let the freshness pill handle the story),
            and (c) at least one fetch has actually been attempted
            (some react-query versions transiently surface
            isError=true on mount before any query runs).
        */}
        {/*
          CHUNK 32 (2026-07-21) — empty-state gates layered under the
          skeleton/error gates. ORDER IS LOAD-BEARING:
            1) skeleton  — cold fetch, no data
            2) error     — no data + failed retries
            3) NoTier    — plan-type resolved AND is undefined (no tier
                           chosen). Gated on !planTypeQ.isLoading to
                           avoid a 200ms flash of "Choose your plan first"
                           on cold boot before the type query resolves.
            4) Basic     — has data envelope AND zero content AND tier
                           is 'basic' → Generate CTA. `'sections' in data`
                           narrows against a hypothetical __featureDisabled
                           envelope reaching this branch (useUnifiedPlan
                           already folds it to null, defensive belt).
            5) Preparing — has data envelope AND zero content, any tier
                           other than Basic → "Your care plan is being
                           prepared" + Change plan pill.
            6) Accordion — real content, or feature-disabled null data
                           (accordion already handles null gracefully).
        */}
        {(isLoading || isFetching) && !data ? (
          <PlanSkeleton />
        ) : isError && !data && !isFetching && failureCount > 0 ? (
          <PlanErrorCard onRetry={handleRetry} disabled={isRefetching} />
        ) : !planTypeQ.isLoading && !planTypeQ.isError && planTypeQ.planType === undefined ? (
          // Only fire when we've CONFIRMED (query didn't error) that the
          // user has no tier. A transient plan-type API failure previously
          // fell into this branch and force-pushed users into the chooser
          // as if they'd never picked a tier — misleading and worse UX than
          // just falling through to the accordion (which handles null data
          // gracefully; a real re-choose is still one Change-plan tap away
          // from the has-tier state).
          <NoTierEmptyState onChoose={onChoosePlan} />
        ) : data &&
          'sections' in data &&
          !hasPlanContent(data) &&
          planTypeQ.planType === 'basic' ? (
          <BasicGenerateEmptyState onGenerate={handleGenerate} generating={generating} />
        ) : data &&
          'sections' in data &&
          !hasPlanContent(data) &&
          isNonBasicPlan ? (
          /*
            CHUNK 36 (2026-07-21) — Non-basic (advanced/agency) users with
            a tier chosen but no plan yet get the inline assessment catalog
            so they can start check-ins directly on the plan tab. Legacy
            renders this at app/Home/health-plan.tsx line 724; v2 chunk 32
            previously showed HasTierNoPlanEmptyState ("Your care plan is
            being prepared") here, which was a parity gap — non-basic users
            couldn't start check-ins without navigating.

            `handleGenerate` (parent-owned fire-and-forget POST + staged
            refetch) is passed as `onBuildPlan`; `generating` unions the
            local tap flag with the server refreshInFlight signal, matching
            the RegenerateButton disable predicate for consistency.
          */
          <InlineAssessmentCatalog
            onBuildPlan={handleGenerate}
            generating={isGeneratingFromAnySource}
          />
        ) : data &&
          'sections' in data &&
          !hasPlanContent(data) &&
          planTypeQ.planType !== undefined ? (
          /*
            CHUNK 36 defensive fallback: any tier we didn't recognize as
            basic OR non-basic (future tier introductions we haven't
            special-cased yet) still gets a graceful empty state instead
            of the accordion mounting against no content. HasTierNoPlanEmptyState
            is kept imported for exactly this branch.
          */
          <HasTierNoPlanEmptyState
            planTypeDisplayName={planTypeDisplayNameFn(planTypeQ.planType as PlanType)}
            onChangePlan={onChoosePlan}
          />
        ) : (
          <View onLayout={onBpsLayout}>
            <BpsAccordion
              view={data ?? null}
              onRefetch={onSwipeRefetch}
              openRequest={openRequest}
              onSectionLayout={onSectionLayout}
            />
          </View>
        )}
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  freshnessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  freshnessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  careChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
});
