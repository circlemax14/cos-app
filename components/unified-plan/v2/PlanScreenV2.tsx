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
      <CareManagerToast generatedAt={data?.meta?.generatedAt} />
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
        {(isLoading || isFetching) && !data ? (
          <PlanSkeleton />
        ) : isError && !data && !isFetching && failureCount > 0 ? (
          <PlanErrorCard onRetry={handleRetry} disabled={isRefetching} />
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
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
});
