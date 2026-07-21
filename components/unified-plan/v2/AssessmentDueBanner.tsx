/**
 * AssessmentDueBanner (v2) — CHUNK 36 (2026-07-21).
 *
 * v2-safe leaf port of components/health-plan/AssessmentDueBanner.tsx into
 * the unified-plan/v2 folder. Same iOS-26.5-safe primitives as the legacy
 * banner — no Modal, no Reanimated, no gesture-handler, no useMutation
 * around axios. Pure `useQuery` (react-query) + Pressable + router.push.
 *
 * ── Feature flag ────────────────────────────────────────────────────
 * We re-export the SAME `ASSESSMENT_DUE_BANNER_ENABLED` constant that the
 * legacy banner declares — single source of truth. When Phase 2 lights up
 * the monthly re-assessment engine we flip that one constant and BOTH
 * the legacy and v2 surfaces come on together. If we forked the flag we'd
 * have two switches to remember to flip; that's a trap.
 *
 * ── Data ────────────────────────────────────────────────────────────
 * `fetchAssessments()` — same query key `['assessments']` the InlineAssessmentCatalog
 * uses, so both surfaces share a warm cache. staleTime is 60_000 (matches
 * legacy banner); the InlineAssessmentCatalog registers its own 60_000
 * staleTime for the same key, so no QPS uptick and no flicker.
 *
 * `enabled: ASSESSMENT_DUE_BANNER_ENABLED` keeps the query unregistered
 * while the flag is off — zero network cost on day 1.
 *
 * ── Hook order ──────────────────────────────────────────────────────
 * Hooks declared unconditionally; flag early-return AFTER hook declarations
 * so hook order stays stable across a runtime flag flip.
 *
 * ── Renders null when ────────────────────────────────────────────────
 *   1. Flag is off (day 1)
 *   2. Query hasn't resolved or errored
 *   3. No assessment `expiresAt` has passed
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { Radii, Spacing } from '@/constants/design-system';
import { fetchAssessments } from '@/services/api/assessments';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  ASSESSMENT_DUE_BANNER_ENABLED,
  dueAssessments,
} from '@/components/health-plan/AssessmentDueBanner';

export function AssessmentDueBanner(): React.JSX.Element | null {
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility();

  // Hooks unconditionally — flag gate is a POST-hook return so hook order
  // is invariant across a runtime flag flip.
  const assessmentsQuery = useQuery({
    queryKey: ['assessments'],
    queryFn: fetchAssessments,
    staleTime: 60_000,
    enabled: ASSESSMENT_DUE_BANNER_ENABLED,
  });

  if (!ASSESSMENT_DUE_BANNER_ENABLED) return null;

  const dueList = dueAssessments(assessmentsQuery.data ?? []);
  if (dueList.length === 0) return null;

  const first = dueList[0];
  const rest = dueList.length - 1;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: '#FFF9E6', borderColor: '#FFB84D' },
      ]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${dueList.length} monthly check-in${dueList.length === 1 ? '' : 's'} due`}
    >
      <View style={styles.iconWrap}>
        <MaterialIcons name="notifications-active" size={20} color="#B26900" />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: '#5A3A00',
            fontSize: getScaledFontSize(14),
            fontWeight: getScaledFontWeight(700) as any,
          }}
        >
          Time to retake your monthly check-ins
        </Text>
        <Text
          style={{
            color: '#5A3A00',
            fontSize: getScaledFontSize(12),
            marginTop: 2,
            lineHeight: 17,
          }}
        >
          {first.instrumentId}
          {rest > 0 ? ` and ${rest} other${rest === 1 ? '' : 's'} ` : ' '}
          — takes ~4 minutes.
        </Text>
      </View>
      <Pressable
        onPress={() =>
          router.push('/Home/assessments-catalog?source=due-banner' as never)
        }
        accessibilityRole="button"
        accessibilityLabel="Start assessment"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.cta}
      >
        <Text
          style={{
            color: '#B26900',
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(700) as any,
          }}
        >
          Start ›
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    marginHorizontal: Spacing.screenPadding ?? 16,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radii.xl ?? 14,
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFEBC1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cta: { paddingHorizontal: 4, paddingVertical: 4 },
});
