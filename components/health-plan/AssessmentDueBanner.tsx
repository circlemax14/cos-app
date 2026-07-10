/**
 * AssessmentDueBanner (COS-430).
 *
 * Prompts the user when one or more of their assessments has expired
 * (assessment-strategy-v2 §3.3 monthly re-assessment). Renders `null` when
 * nothing is due, so the banner is invisible on plans/screens where it
 * doesn't apply — including the flag-off state.
 *
 * Gated behind `ASSESSMENT_DUE_BANNER_ENABLED` (mirrors the app's other
 * dark-launch flag conventions — off by default). When the flag is off,
 * this component renders `null` regardless of assessment state.
 *
 * Data source: `fetchAssessments()` — already used elsewhere in the plan
 * screen (see health-plan.tsx). We use React Query to piggy-back on that
 * cache when it's already warm.
 *
 * Same iOS-26.5-safe primitives as legacy — no reanimated, no Modal.
 */
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { Radii, Spacing } from '@/constants/design-system'
import { fetchAssessments, type AssessmentRecord } from '@/services/api/assessments'

type ColorMap = Record<string, string>

/**
 * Feature flag — dark-launched. Flip to `true` in a follow-up commit once
 * Phase 2's monthly re-assessment engine (assessment-strategy-v2 §3.3)
 * populates `dueForRetake` explicitly rather than relying only on the
 * `expiresAt < now` derivation this component does today.
 */
export const ASSESSMENT_DUE_BANNER_ENABLED = false

export interface AssessmentDueBannerProps {
  colors: ColorMap
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

export function AssessmentDueBanner({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: AssessmentDueBannerProps): React.JSX.Element | null {
  // Hooks first, then the flag gate — same pattern the rest of the plan
  // screen uses to keep hook order stable across flag flips.
  const assessmentsQuery = useQuery({
    queryKey: ['assessments'],
    queryFn: fetchAssessments,
    staleTime: 60_000,
    enabled: ASSESSMENT_DUE_BANNER_ENABLED,
  })

  if (!ASSESSMENT_DUE_BANNER_ENABLED) return null

  const dueList = dueAssessments(assessmentsQuery.data ?? [])
  if (dueList.length === 0) return null

  const first = dueList[0]
  const rest = dueList.length - 1

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: '#FFF9E6',
          borderColor: '#FFB84D',
        },
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
  )
}

/**
 * Filter to assessments whose `expiresAt` has already passed. Interim
 * derivation until the Phase 2 engine adds explicit `dueForRetake`.
 * Invalid/absent `expiresAt` values are treated as NOT due (never show a
 * banner we can't back up with a real deadline).
 */
export function dueAssessments(records: readonly AssessmentRecord[]): AssessmentRecord[] {
  const now = Date.now()
  return records.filter((r) => {
    if (!r.expiresAt) return false
    const t = Date.parse(r.expiresAt)
    if (Number.isNaN(t)) return false
    return t <= now
  })
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
})
