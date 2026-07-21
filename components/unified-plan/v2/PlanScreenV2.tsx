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
import { formatRelative } from '@/lib/plan-time';
import { BpsAccordion } from '@/components/unified-plan/v2/BpsAccordion';
import { WellbeingMapCard } from '@/components/unified-plan/v2/WellbeingMapCard';
import { AISuggestionStrip } from '@/components/unified-plan/v2/AISuggestionStrip';
import { CareManagerToast } from '@/components/unified-plan/v2/CareManagerToast';
import type { UnifiedSectionKey } from '@/services/api/unified-plan';

export default function PlanScreenV2(): React.JSX.Element {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // COS-475b chunk 3 — first real data hook. useUnifiedPlan is a
  // react-query wrapper over GET /v1/plan (Phase 1). Same hook the
  // legacy path uses; not new bridge code, but the first time v2
  // pays for the fetch.
  const { data, refetch, isRefetching } = useUnifiedPlan();

  const onSwipeRefetch = React.useCallback(() => {
    void refetch();
  }, [refetch]);

  const onPullRefresh = React.useCallback(() => {
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
    // Small negative padding so the section header lands a hair below
    // the top edge of the viewport instead of flush against it.
    const target = bpsYRef.current + (sectionYRef.current[openRequest.section] ?? 0) - 12;
    scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true });
  }, [openRequest]);

  const freshness = React.useMemo(
    () => formatRelative(data?.meta?.generatedAt ?? null),
    [data?.meta?.generatedAt],
  );

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
          <View style={styles.freshnessPill}>
            <View
              style={[
                styles.freshnessDot,
                { backgroundColor: isRefetching ? colors.tint : colors.subtext },
              ]}
            />
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
              }}
            >
              {isRefetching ? 'Updating…' : `Updated ${freshness}`}
            </Text>
          </View>
        ) : null}

        <WellbeingMapCard />
        <AISuggestionStrip view={data ?? null} onSuggestionPress={requestOpenSection} />
        <View onLayout={onBpsLayout}>
          <BpsAccordion
            view={data ?? null}
            onRefetch={onSwipeRefetch}
            openRequest={openRequest}
            onSectionLayout={onSectionLayout}
          />
        </View>
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
