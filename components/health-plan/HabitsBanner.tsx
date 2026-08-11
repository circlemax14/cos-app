/**
 * SCRUM-659 Story 4 (2026-08-05) — Routines banner for the Plan screen.
 *
 * ─── NAMING (Ken 2026-08-06) — READ THIS BEFORE RENAMING ANYTHING ───
 * The DISPLAY name of this section is "Routines". The TRANSPORT name is
 * still "habits" everywhere below the UI: the route
 * `/v1/patients/me/plan/habits`, the stored field `plan.habits[]`, the
 * flag `habits_in_plan_enabled`, the hooks (`usePlanHabits`), the query
 * keys, and this file's own name. That mismatch is deliberate — there
 * are live records and a live wire format, and renaming them buys the
 * user nothing. Change user-visible strings only.
 *
 * WHY the display rename: this section had to be differentiated from
 * plan Tasks. Routines are the *structure* of a patient's day — meals,
 * activities of daily living (showering, toothbrushing), shopping,
 * going to classes. They are NOT by definition good behaviours, so
 * copy here must never praise them or frame them as "healthy habits".
 * Tasks are the positive coping behaviours we want to turn INTO
 * habits; that distinction is spelled out once on /Home/habits and
 * must not be repeated here (the banner has two lines of subtitle).
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
 *   - flag ON  + no routines         → "Add routines to your plan" CTA
 *   - flag ON  + routines present    → "N routines" + subtitle
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
          ? 'Add routines to your plan'
          : `Manage ${count} routine${count === 1 ? '' : 's'}`
      }
      accessibilityHint="Opens your routines screen"
      hitSlop={4}
      style={({ pressed }) => [
        styles.card,
        {
          // Vishal 2026-08-11: "routines card format is not matching with
          // nutrition and medication card". Aligned to the 1F/55 wash those
          // two share. NOTE this overrides Ken's 2026-08-06 iter-2 call,
          // which deliberately kept Routines lighter than Medications — with
          // four cards in the stack now, matching beats contrast.
          backgroundColor: `${tint}1F`,
          borderColor: `${tint}55`,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Left iconic affordance — matches the Venn treatment on WellbeingMap
          card in size + shape (48pt circle) so both banners are visually
          symmetric side-by-side / above-and-below. */}
      <View
        // Solid well + white glyph, matching Medications and Nutrition. The
        // soft-wash version read as a different class of card next to them.
        style={[styles.iconWrap, { backgroundColor: tint, borderColor: tint }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <MaterialIcons name="repeat" size={24} color="#FFFFFF" />
      </View>

      <View style={styles.textCol}>
        <Text
          style={{
            color: text,
            fontSize: sz(16),
            fontWeight: wt(700) as any,
          }}
          // "Add routines to your plan" is two characters longer than the
          // string it replaced and clipped at scaled type; allow a wrap.
          numberOfLines={2}
        >
          {isEmpty ? 'Add routines to your plan' : 'Your daily routines'}
        </Text>
        <Text
          style={{
            color: subtext,
            fontSize: sz(13),
            marginTop: 3,
            lineHeight: 18,
          }}
          // Ken 2026-08-06: the Routines subtitle is longer than the old
          // Habits one (it has to name concrete examples so patients
          // recognise what belongs here). Two lines truncated it at the
          // larger accessibility text sizes our patients actually use,
          // so this is 3.
          numberOfLines={3}
        >
          {isEmpty
            ? 'The structure of your day — meals, washing, shopping, classes. Tap to add yours.'
            : `${count} routine${count === 1 ? '' : 's'} on your plan. Tap to add, edit, or remove.`}
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
