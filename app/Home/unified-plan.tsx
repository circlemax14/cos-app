/**
 * Unified BPS plan screen (COS-467, Phase 2 FE).
 *
 * Renders three UnifiedSectionCards driven by GET /v1/plan. Reachable
 * only via the TryUnifiedPlanBanner CTA + explicit deep-link — Phase 2
 * is an opt-in peer to the legacy Care Plan and Biopsychosocial tabs;
 * no default route change, no existing tab retired.
 *
 * State branches:
 *   - BE flag off (useUnifiedPlan().disabled) → inert placeholder with a
 *     "Back to Care Plan" button so the user never lands on a dead route.
 *   - Loading + no cached data → ActivityIndicator.
 *   - Error + no cached data → error card with Retry.
 *   - Otherwise → header + three section cards + footer.
 */

import React, { useCallback, useEffect } from 'react';
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
import { Radii, Spacing } from '@/constants/design-system';
import { UnifiedSectionCard } from '@/components/unified-plan/UnifiedSectionCard';
import { ClassicViewLink } from '@/components/unified-plan/ClassicViewLink';
import {
  UNIFIED_SECTION_META,
  UNIFIED_SECTION_ORDER,
} from '@/components/unified-plan/section-labels';
import { EVER_VISITED_KEY } from '@/lib/unified-plan-banner';
import { formatRelative } from '@/lib/plan-time';
import { useAccessibility } from '@/stores/accessibility-store';
import { useUnifiedPlan } from '@/hooks/use-unified-plan';
import { useUnifiedPlanDefaultEnabled } from '@/hooks/use-unified-plan-default-flag';
import { usePlanScreenV2Enabled } from '@/hooks/use-plan-screen-v2-flag';
import PlanScreenV2 from '@/components/unified-plan/v2/PlanScreenV2';
import { assessmentHrefForSection } from '@/lib/unified-plan-assessment-routing';
import type {
  UnifiedPlanSection,
  UnifiedPlanView,
  UnifiedSectionKey,
} from '@/services/api/unified-plan';

function hasAiSourcedItems(view: UnifiedPlanView): boolean {
  return UNIFIED_SECTION_ORDER.some((k) => {
    const s: UnifiedPlanSection = view.sections[k];
    return (
      s.goals.some((g) => g.source === 'ai_generated') ||
      s.tasks.some((t) => t.source === 'ai_generated')
    );
  });
}

export default function UnifiedPlanScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // COS-475b Phase 6.4 chunked rebuild — v2 flag gate. Hook must run
  // unconditionally (rules-of-hooks); the swap happens after all other
  // hooks return. Chunk 1's PlanScreenV2 owns none of the v1 data, so
  // the useUnifiedPlan call below is only paid for on the legacy path.
  const planScreenV2 = usePlanScreenV2Enabled();

  const {
    data,
    disabled,
    isLoading,
    isRefetching,
    isError,
    refetch,
    lastUpdated,
  } = useUnifiedPlan();

  // COS-469 / Phase 4 — when default-flip is ON, unified-plan IS the Care
  // Plan tab entry point, so a chevron-left back button no-ops (no stack)
  // and the ClassicViewLink header affordance is the relevant escape hatch.
  // When default-flip is OFF, the user reached this screen via banner-push
  // from the classic Care Plan and the back button is meaningful.
  const unifiedDefaultOn = useUnifiedPlanDefaultEnabled();
  // `router.canGoBack()` is the authoritative check — hides the button in
  // any config where pressing it would no-op (tab-entry point or root nav).
  const canGoBack = router.canGoBack();

  const onEmptyAssessmentPress = useCallback((sectionKey: UnifiedSectionKey) => {
    router.push(assessmentHrefForSection(sectionKey) as never);
  }, []);

  // Once the user has landed on this screen — even once — the peer banner
  // has done its job. Persist a flag so TryUnifiedPlanBanner returns null
  // permanently, independent of the 7-day dismissal window. Fire-and-forget:
  // a failed write just means the banner shows once more next launch.
  useEffect(() => {
    AsyncStorage.setItem(EVER_VISITED_KEY, '1').catch(() => {});
  }, []);

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  // COS-475b — swap to v2 after all hooks so rules-of-hooks holds. v2
  // chunk 1 is a bare shell that doesn't touch useUnifiedPlan's data;
  // the paid-for fetch above is discarded when v2 is on. That's fine
  // for chunks 1–3; from chunk 4 v2 will consume this data.
  if (planScreenV2) {
    return <PlanScreenV2 />;
  }

  // ── Disabled placeholder ─────────────────────────────────────────
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
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              textAlign: 'center',
              lineHeight: 18,
              marginTop: 6,
              maxWidth: 320,
            }}
          >
            The unified plan view isn&apos;t available yet. You can still use your Care Plan
            and Biopsychosocial views.
          </Text>
          {/*
            COS-469 / Phase 4 — when PLAN_BPS_UNIFIED_DEFAULT_ENABLED is ON
            but PLAN_BPS_UNIFIED_ENABLED (endpoint) is OFF, unified-plan is
            the visible Care Plan tab but 404s. This CTA is the user's only
            escape to a working plan. `router.replace` (not push) so
            re-tapping the tab doesn't stack duplicates; `?classic=1` is
            the stable bypass hook documented alongside ClassicViewLink.
          */}
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
            testID="unified-plan-disabled-classic-cta"
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

  // ── Loading ──────────────────────────────────────────────────────
  if (isLoading && !data) {
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
            Loading your unified plan…
          </Text>
        </View>
      </AppWrapper>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (isError && !data) {
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
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              textAlign: 'center',
              marginTop: 6,
              maxWidth: 320,
            }}
          >
            Check your connection and try again.
          </Text>
          <Pressable
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Retry loading unified plan"
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

  // Defensive — should be unreachable at this point.
  if (!data) return <AppWrapper><View /></AppWrapper>;

  const refreshInFlight = !!data.meta?.refreshInFlight;
  const hasLegacy = !!data.meta?.hasLegacy;
  const showCitations = hasAiSourcedItems(data);

  return (
    <AppWrapper>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 32 }}
        accessibilityLabel="Unified plan, organized by biopsychosocial"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.tint}
          />
        }
      >
        {/* Screen header */}
        <View style={styles.headerRow}>
          {/*
            COS-469 / Phase 4 — the chevron-left back button only makes sense
            when unified-plan was pushed onto a stack (banner-CTA from the
            classic Care Plan, deep link, etc.). When the default-flip flag
            is ON and unified-plan IS the tab entry point, there's no stack
            to pop and the button silently no-ops — hide it. `canGoBack()`
            is the authoritative check for the current nav state.
          */}
          {canGoBack ? (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              style={styles.iconBtn}
              testID="unified-plan-back-btn"
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
          {/* COS-469 / Phase 4 — Classic view escape hatch. Only rendered
              when the default-flip flag is ON — pre-flip users reach this
              screen only via banner-push from Care Plan, so the classic
              route is already one back-tap away. */}
          {unifiedDefaultOn ? (
            <ClassicViewLink color={colors.subtext} size={getScaledFontSize(22)} />
          ) : null}
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
            {refreshInFlight && !isRefetching ? (
              <View style={[styles.refreshDot, { backgroundColor: colors.tint }]} />
            ) : null}
          </Pressable>
        </View>

        {/* Meta strip */}
        <View style={styles.metaStrip}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              flex: 1,
            }}
          >
            Updated {formatRelative(lastUpdated)}
          </Text>
          {hasLegacy && (
            <Pressable
              onPress={() => router.push('/Home/health-plan' as never)}
              accessibilityRole="link"
              accessibilityLabel="See legacy Care Plan"
              hitSlop={8}
            >
              <Text
                style={{
                  color: colors.tint,
                  fontSize: getScaledFontSize(12),
                  fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                }}
              >
                See legacy Care Plan
              </Text>
            </Pressable>
          )}
        </View>

        {/* Section cards */}
        <View style={{ paddingHorizontal: Spacing.md, marginTop: Spacing.sm }}>
          {UNIFIED_SECTION_ORDER.map((key) => {
            const section = data.sections[key];
            if (!section) return null;
            const meta = UNIFIED_SECTION_META[key];
            return (
              <View key={key} accessibilityLabel={`${meta.title} section`}>
                <UnifiedSectionCard
                  sectionKey={key}
                  section={section}
                  colors={colors as unknown as Record<string, string | undefined>}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                  onEmptyAssessmentPress={onEmptyAssessmentPress}
                />
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View style={{ paddingHorizontal: Spacing.md, marginTop: Spacing.sm }}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              textAlign: 'center',
              lineHeight: 15,
            }}
          >
            Read-only preview — editing coming soon.
          </Text>
          {showCitations ? <AICitationsFooter compact /> : null}
        </View>
      </ScrollView>
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
    borderRadius: Radii.sm,
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
  refreshDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginTop: 6,
  },
});
