/**
 * PlanScreenV2 (COS-475, Phase 6.4).
 *
 * The interactive successor to the read-only UnifiedPlan screen. Mount
 * order (top → bottom):
 *
 *   OfflineBanner  (conditional)
 *   RetireClassicSunsetBanner (conditional)
 *   WellbeingMapCard
 *   AISuggestionStrip (auto-hides when empty)
 *   BpsAccordion (three BpsSectionPanel children)
 *   AICitationsFooter
 *
 * CareManagerToastHost sits absolute-positioned at the top of the
 * screen. Route parity with unified-plan.tsx: mounted at
 * /Home/unified-plan when `plan_screen_v2_enabled` is ON.
 *
 * No RN Modal is used in the mount path — every sheet is an expo-router
 * route under app/Home/(plan)/. See app/Home/(plan)/_layout.tsx.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { AICitationsFooter } from '@/components/ai/ai-citations-footer';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/design-system';
import { EVER_VISITED_KEY } from '@/lib/unified-plan-banner';
import { getTodayLocalDate } from '@/lib/plan-v2/patient-local-date';
import {
  migrateLegacyHideReadingsKeys,
  readAllHideReadings,
  writeHideReadings,
} from '@/lib/plan-v2/hide-readings';
import { FEATURE_DISABLED_BANNER } from '@/lib/plan-v2/error-copy';
import {
  PlanV2SessionProvider,
  usePlanV2Session,
} from '@/lib/plan-v2/session-state';
import { useAccessibility } from '@/stores/accessibility-store';
import { useUnifiedPlan } from '@/hooks/use-unified-plan';
import { useAISuggestions } from '@/hooks/use-ai-suggestions';
import { useCareManagerSync } from '@/hooks/use-care-manager-sync';
import { useOfflineStatus } from '@/hooks/use-offline-status';
import { useRoutines } from '@/hooks/use-routines';
import { useUser } from '@/hooks/use-user';
import type { UnifiedSectionKey } from '@/services/api/unified-plan';

import { AISuggestionStrip } from './AISuggestionStrip';
import { BpsAccordion } from './BpsAccordion';
import { CareManagerToastHost } from './CareManagerToastHost';
import { OfflineBanner } from './OfflineBanner';
import { RetireClassicSunsetBanner } from './RetireClassicSunsetBanner';
import { WellbeingMapCard } from './WellbeingMapCard';

type HideReadingsMap = Record<UnifiedSectionKey, boolean>;

const DEFAULT_HIDE_READINGS: HideReadingsMap = {
  biological: false,
  psychological: false,
  socialSpiritual: false,
};

function hasAiSourced(view: import('@/services/api/unified-plan').UnifiedPlanView): boolean {
  const keys: UnifiedSectionKey[] = ['biological', 'psychological', 'socialSpiritual'];
  return keys.some((k) => {
    const s = view.sections[k];
    return (
      s?.goals?.some((g) => g.source === 'ai_generated') ||
      s?.tasks?.some((t) => t.source === 'ai_generated')
    );
  });
}

export default function PlanScreenV2(): React.JSX.Element {
  return (
    <PlanV2SessionProvider>
      <PlanScreenV2Inner />
    </PlanV2SessionProvider>
  );
}

function PlanScreenV2Inner(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const colorMap = colors as unknown as Record<string, string | undefined>;

  const { data: view, disabled, isLoading, isRefetching, isError, refetch } = useUnifiedPlan();
  const { offline } = useOfflineStatus();
  const { routines, refetch: refetchRoutines } = useRoutines();
  const { toastToken, lastHighlightedSection } = useCareManagerSync(view);
  const { data: user } = useUser();
  const userSub = user?.sub ?? '';
  const {
    featureDisabled,
    clearFeatureDisabled,
  } = usePlanV2Session();

  const routineTitles = React.useMemo(() => routines.map((r) => r.title), [routines]);
  const { items: suggestions, dismissAll } = useAISuggestions(view, { routineTitles });

  const [hideReadingsMap, setHideReadingsMap] = useState<HideReadingsMap>(DEFAULT_HIDE_READINGS);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const scheduledFor = getTodayLocalDate();
  const canGoBack = router.canGoBack();

  // Mark screen as ever-visited so TryUnifiedPlanBanner won't re-appear.
  useEffect(() => {
    AsyncStorage.setItem(EVER_VISITED_KEY, '1').catch(() => {});
  }, []);

  // Hydrate hide-readings persistence — per-user, migrating any legacy
  // device-wide keys into the sub-scoped namespace on first read.
  useEffect(() => {
    if (!userSub) return;
    let alive = true;
    (async () => {
      await migrateLegacyHideReadingsKeys(userSub);
      const m = await readAllHideReadings(userSub);
      if (alive) setHideReadingsMap(m);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [userSub]);

  // Reset the FEATURE_DISABLED session breaker whenever the BE returns a
  // FRESH view — the flag may have flipped back on since we tripped.
  // We latch onto changes in generatedAt so the reset doesn't fire on
  // the same effect run that just tripped the breaker (which would
  // instantly undo it before any row could observe the disabled state).
  const lastGeneratedAt = view?.meta?.generatedAt ?? null;
  const seenGeneratedAt = useRef<string | null>(lastGeneratedAt);
  useEffect(() => {
    if (!lastGeneratedAt) return;
    if (seenGeneratedAt.current === lastGeneratedAt) return;
    seenGeneratedAt.current = lastGeneratedAt;
    if (featureDisabled) clearFeatureDisabled();
  }, [lastGeneratedAt, featureDisabled, clearFeatureDisabled]);

  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // On offline→online transition, refetch once to catch up.
  const prevOffline = useRef(offline);
  useEffect(() => {
    if (prevOffline.current && !offline) {
      void refetch();
      void refetchRoutines();
    }
    prevOffline.current = offline;
  }, [offline, refetch, refetchRoutines]);

  const onToggleHideReadings = useCallback(
    (sectionKey: UnifiedSectionKey, next: boolean) => {
      setHideReadingsMap((prev) => ({ ...prev, [sectionKey]: next }));
      if (userSub) void writeHideReadings(userSub, sectionKey, next);
    },
    [userSub],
  );

  const onRefresh = useCallback(() => {
    void refetch();
    void refetchRoutines();
  }, [refetch, refetchRoutines]);

  const doRefetch = useCallback(() => {
    void refetch();
    void refetchRoutines();
  }, [refetch, refetchRoutines]);

  const onToastCareManagerTap = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  // ── Disabled / loading / error branches — mirror unified-plan.tsx UX ──
  if (disabled) {
    return (
      <AppWrapper>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <MaterialIcons
            name="hourglass-empty"
            size={getScaledFontSize(28)}
            color={colors.subtext}
          />
          <Text
            style={[
              styles.centerTitle,
              {
                color: colors.text,
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              },
            ]}
          >
            Not available yet
          </Text>
          <Pressable
            onPress={() =>
              router.replace({
                pathname: '/Home/health-plan',
                params: { classic: '1' },
              } as never)
            }
            accessibilityRole="button"
            accessibilityLabel="Go to Classic care plan"
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
            testID="plan-v2-disabled-classic-cta"
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              Go to Classic care plan
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    );
  }

  if (isLoading && !view) {
    return (
      <AppWrapper>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              marginTop: 10,
            }}
          >
            Loading your plan…
          </Text>
        </View>
      </AppWrapper>
    );
  }

  if (isError && !view) {
    return (
      <AppWrapper>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <MaterialIcons
            name="error-outline"
            size={getScaledFontSize(28)}
            color={colors.subtext}
          />
          <Text
            style={[
              styles.centerTitle,
              {
                color: colors.text,
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              },
            ]}
          >
            Couldn&apos;t load your plan
          </Text>
          <Pressable
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              Retry
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    );
  }

  if (!view) return <AppWrapper><View /></AppWrapper>;

  const showCitations = hasAiSourced(view);

  return (
    <AppWrapper>
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: 32 }}
          accessibilityLabel="Your plan, biopsychosocial view"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.tint}
            />
          }
        >
          {offline ? (
            <OfflineBanner
              colors={colorMap}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ) : null}
          {featureDisabled ? (
            <View
              style={[
                styles.featureDisabledBanner,
                {
                  backgroundColor: (colorMap.card as string) ?? '#FFFFFF',
                  borderColor: (colorMap.warning as string) ?? '#B45309',
                },
              ]}
              accessibilityRole="alert"
              accessibilityLabel="Plan editing is temporarily unavailable"
              testID="plan-v2-feature-disabled-banner"
            >
              <MaterialIcons
                name="info-outline"
                size={getScaledFontSize(14)}
                color={(colorMap.warning as string) ?? '#B45309'}
              />
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(12),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                  marginLeft: 6,
                  flex: 1,
                }}
                numberOfLines={2}
              >
                {FEATURE_DISABLED_BANNER}
              </Text>
            </View>
          ) : null}
          <RetireClassicSunsetBanner
            colors={colorMap}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />

          {/* Header row */}
          <View style={styles.headerRow}>
            {canGoBack ? (
              <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={12}
                style={styles.iconBtn}
                testID="plan-v2-back-btn"
              >
                <MaterialIcons name="chevron-left" size={getScaledFontSize(28)} color={colors.text} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(20),
                  fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
                }}
                numberOfLines={1}
              >
                Your plan
              </Text>
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(12),
                  marginTop: 1,
                }}
                numberOfLines={1}
              >
                Organized by biopsychosocial
              </Text>
            </View>
            <Pressable
              onPress={onRefresh}
              accessibilityRole="button"
              accessibilityLabel="Refresh plan"
              hitSlop={10}
              style={styles.iconBtn}
            >
              {isRefetching ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <MaterialIcons name="refresh" size={getScaledFontSize(22)} color={colors.subtext} />
              )}
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: Spacing.md }}>
            <WellbeingMapCard
              colors={colorMap}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          </View>

          <AISuggestionStrip
            items={suggestions}
            onDismissAll={dismissAll}
            colors={colorMap}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />

          <BpsAccordion
            view={view}
            routines={routines}
            scheduledFor={scheduledFor}
            offline={offline}
            hideReadingsMap={hideReadingsMap}
            onToggleHideReadings={onToggleHideReadings}
            highlightedSection={lastHighlightedSection}
            colors={colorMap}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onToast={showToast}
            onRefetch={doRefetch}
          />

          <View style={{ paddingHorizontal: Spacing.md, marginTop: Spacing.sm }}>
            {showCitations ? <AICitationsFooter compact /> : null}
          </View>
        </ScrollView>

        <CareManagerToastHost
          token={toastToken}
          onPress={onToastCareManagerTap}
          colors={colorMap}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {toast ? (
          // pointerEvents="box-none" lets taps pass through the wrap to
          // rows below; the toast is intentionally NOT interactive (no
          // fake "Undo" — the BE has no un-omit endpoint), but the wrap
          // must not swallow touches for rows underneath it.
          <View pointerEvents="box-none" style={styles.toastWrap} testID="plan-v2-toast">
            <View
              pointerEvents="none"
              style={[
                styles.toast,
                {
                  backgroundColor: (colors.card as string) ?? '#111827',
                  borderColor: (colors.border as string) ?? '#374151',
                },
              ]}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(12),
                  fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
                }}
                numberOfLines={2}
              >
                {toast.text}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  centerTitle: {
    marginTop: 10,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  iconBtn: {
    padding: 4,
    position: 'relative',
  },
  toastWrap: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.xl ?? 24,
    alignItems: 'center',
  },
  toast: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 360,
  },
  featureDisabledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: 10,
    borderWidth: 1,
  },
});
