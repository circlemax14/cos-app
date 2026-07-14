/**
 * ViewBioInsightsLink (COS-438).
 *
 * Self-gating card on the legacy Care Plan screen (`PlanScreenRedesignedV2`)
 * that pushes into `/Home/biopsychosocial-plan` when a bio plan record
 * already exists. Sibling of `TryNewPlanCta`: TryNewPlanCta appears when
 * the bio flag is on AND there is NO bio plan yet (offering the user a
 * chance to create one); this component appears when the bio flag is on
 * AND a bio plan DOES exist (offering the deeper view). Together the
 * two never render at the same time.
 *
 * Renders null unless the bio flag is on AND `useBiopsychosocialPlan()`
 * has a plan — so it is a no-op for users without bio, without adding
 * any prop plumbing on the parent.
 *
 * Same iOS-26.5-safe primitives as legacy — no Modal, no reanimated
 * Layout Animations, no polling.
 */
import React from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { Colors } from '@/constants/theme'
import { Radii, Spacing } from '@/constants/design-system'
import { useAccessibility } from '@/stores/accessibility-store'
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag'
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan'

function alpha(hex: string, hh: string): string {
  return hex.length === 7 ? hex + hh : hex
}

// Matches PlanScreenRedesignedV2's elevation(1) preset so this reads at
// the same visual weight as its neighbors.
const bannerElevation = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
  },
  android: { elevation: 2 },
  default: {},
}) as object

export function ViewBioInsightsLink(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  // Hooks unconditional first, gate at return time — same pattern
  // TryNewPlanCta uses.
  const biopsychosocialPlanEnabled = useBiopsychosocialPlanFlag()
  const planQuery = useBiopsychosocialPlan()

  if (!biopsychosocialPlanEnabled) return null
  if (planQuery.data?.plan == null) return null

  const tint = (colors.tint as string) ?? '#0D9488'

  return (
    <Pressable
      onPress={() => router.push('/Home/biopsychosocial-plan' as never)}
      accessibilityRole="button"
      accessibilityLabel="Open your biopsychosocial plan"
      accessibilityHint="Opens your plan reorganized across biological, psychological, and social wellness"
      style={({ pressed }) => [
        styles.banner,
        bannerElevation,
        {
          backgroundColor: alpha(tint, Platform.OS === 'ios' ? '14' : '22'),
          borderColor: alpha(tint, '33'),
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.iconChip, { backgroundColor: alpha(tint, '22') }]}>
        <MaterialIcons name="north-east" size={getScaledFontSize(22)} color={tint} />
      </View>
      <View style={{ flex: 1, marginLeft: Spacing.md - 4 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(17),
            fontWeight: getScaledFontWeight(700) as any,
          }}
        >
          Open your biopsychosocial plan
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            marginTop: 3,
            lineHeight: 18,
          }}
        >
          Same goals, organized around body, mind, and social &amp; spiritual wellbeing.
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={getScaledFontSize(24)} color={tint} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md - 2,
    borderWidth: 1,
    borderRadius: Radii.xl,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
