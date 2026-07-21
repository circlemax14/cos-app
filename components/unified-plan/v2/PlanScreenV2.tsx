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
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

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
import { fireAndForgetPost } from '@/components/unified-plan/v2/net';
import { usePlanType } from '@/hooks/use-plan-type';
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name';
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
              disabled={isGeneratingFromAnySource}
              isGenerating={isGeneratingFromAnySource}
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
        */}
        {data && isError && !isFetching && failureCount > 0 && !refreshInFlight ? (
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
          planTypeQ.planType !== undefined ? (
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
