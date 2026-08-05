/**
 * SCRUM-659 Story 4 (2026-08-05) — Habits banner for the Plan screen.
 *
 * Placement: directly below the AI summary on the BPS surface (peer to
 * the WellbeingMap card) and above the "Personalize" prompt on the
 * legacy PlanScreenRedesignedV2 / unified-plan surfaces. Tap navigates
 * to /Home/habits (CRUD screen).
 *
 * Design (Vishal 2026-08-05, iteration 2): match the wellbeing-map
 * card in BiopsychosocialPlanScreen — tint-background pill with a
 * left iconic affordance (48pt colored circle w/ repeat glyph), title
 * + subtitle stack, chevron on the right. Same corner radius +
 * elevation + border as WellbeingMap so both cards read as one system.
 *
 * Flag gate: useHabitsInPlanFlag(). When OFF the banner returns null
 * (byte-identical to today's Plan surface).
 *
 * States rendered:
 *   - flag OFF                       → null
 *   - flag ON  + loading             → null (no flash — waits for count)
 *   - flag ON  + no habits           → "Add habits to your plan" CTA
 *   - flag ON  + habits present      → "N habits" + subtitle
 *
 * Props are optional so callers on non-BPS surfaces (unified-plan.tsx,
 * PlanScreenRedesignedV2) can mount without threading theme. Defaults
 * match the BPS tint palette so the visual identity is consistent.
 *
 * iOS 26.5-safe primitive envelope (View / Text / Pressable /
 * MaterialIcons / StyleSheet).
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { useHabitsInPlanFlag, usePlanHabits } from '@/hooks/use-plan-habits'

interface HabitsBannerProps {
  /** Optional theme colors (matches the shape BiopsychosocialPlanScreen passes). */
  colors?: Record<string, string>
  getScaledFontSize?: (n: number) => number
  getScaledFontWeight?: (n: number) => string | number
}

const DEFAULT_TINT = '#0B6963'  // teal — matches BPS Wellbeing accent
const DEFAULT_TEXT = '#11181C'
const DEFAULT_SUBTEXT = '#687076'

function HabitsBannerBase({ colors, getScaledFontSize, getScaledFontWeight }: HabitsBannerProps): React.JSX.Element | null {
  const flag = useHabitsInPlanFlag()
  const { habits, isLoading } = usePlanHabits()

  if (!flag) return null
  // Wait for first-load resolution so we don't flash between empty +
  // populated states on remount.
  if (isLoading) return null

  const count = habits.length
  const isEmpty = count === 0

  // Theme colors — default to the WellbeingMap teal palette so the two
  // cards read as one system, but honor whatever the caller passes.
  const tint = colors?.tint ?? DEFAULT_TINT
  const text = colors?.text ?? DEFAULT_TEXT
  const subtext = colors?.subtext ?? DEFAULT_SUBTEXT
  const sz = getScaledFontSize ?? ((n) => n)
  const wt = getScaledFontWeight ?? ((n) => String(n))

  return (
    <Pressable
      onPress={() => router.push('/Home/habits' as never)}
      accessibilityRole="button"
      accessibilityLabel={
        isEmpty
          ? 'Add habits to your plan'
          : `Manage ${count} habit${count === 1 ? '' : 's'}`
      }
      accessibilityHint="Opens your habits screen"
      hitSlop={4}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: `${tint}14`,
          borderColor: `${tint}33`,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Left iconic affordance — matches the Venn treatment on WellbeingMap
          card in size + shape (48pt circle) so both banners are visually
          symmetric side-by-side / above-and-below. */}
      <View
        style={[styles.iconWrap, { backgroundColor: `${tint}22`, borderColor: `${tint}44` }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <MaterialIcons name="repeat" size={24} color={tint} />
      </View>

      <View style={styles.textCol}>
        <Text
          style={{
            color: text,
            fontSize: sz(16),
            fontWeight: wt(700) as any,
          }}
          numberOfLines={1}
        >
          {isEmpty ? 'Add habits to your plan' : 'Your daily habits'}
        </Text>
        <Text
          style={{
            color: subtext,
            fontSize: sz(13),
            marginTop: 3,
            lineHeight: 18,
          }}
          numberOfLines={2}
        >
          {isEmpty
            ? 'Small daily practices that support your goals — tap to add a few.'
            : `${count} habit${count === 1 ? '' : 's'} on your plan. Tap to add, edit, or remove.`}
        </Text>
      </View>

      <MaterialIcons name="chevron-right" size={24} color={tint} />
    </Pressable>
  )
}

export const HabitsBanner = React.memo(HabitsBannerBase)
HabitsBanner.displayName = 'HabitsBanner'
export default HabitsBanner

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
    marginRight: 8,
  },
})
