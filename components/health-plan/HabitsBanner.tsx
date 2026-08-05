/**
 * SCRUM-659 Story 4 (2026-08-05) — Habits banner for the Plan screen.
 *
 * Mounts ABOVE the BPS / classic-category cards. Renders a compact
 * "your habits" row with count + "Manage" chevron; tap navigates to
 * /Home/habits (CRUD screen).
 *
 * Flag gate: useHabitsInPlanFlag(). When OFF the banner returns null
 * (byte-identical to today's Plan surface).
 *
 * States rendered:
 *   - flag OFF                       → null
 *   - flag ON  + no habits           → CTA "Add habits" (opens screen)
 *   - flag ON  + habits present      → "N habits" chip + Manage chevron
 *
 * iOS 26.5-safe primitive envelope (View / Text / Pressable /
 * MaterialIcons / StyleSheet).
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { useHabitsInPlanFlag, usePlanHabits } from '@/hooks/use-plan-habits'

function HabitsBannerBase(): React.JSX.Element | null {
  const flag = useHabitsInPlanFlag()
  const { habits, isLoading } = usePlanHabits()

  if (!flag) return null
  // Never render during loading — banner appears once we know the true
  // count. Prevents a flash between empty-state and populated view.
  if (isLoading) return null

  const count = habits.length
  const isEmpty = count === 0

  return (
    <Pressable
      onPress={() => router.push('/Home/habits' as never)}
      accessibilityRole="button"
      accessibilityLabel={isEmpty ? 'Add habits to your plan' : `Manage ${count} habit${count === 1 ? '' : 's'}`}
      hitSlop={4}
      style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
    >
      <View style={styles.iconWrap}>
        <MaterialIcons name="repeat" size={20} color="#0B6963" />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {isEmpty ? 'Add habits to your plan' : 'Your daily habits'}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {isEmpty
            ? 'Small daily practices that support your goals.'
            : `${count} habit${count === 1 ? '' : 's'} · tap to manage`}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color="#687076" />
    </Pressable>
  )
}

export const HabitsBanner = React.memo(HabitsBannerBase)
HabitsBanner.displayName = 'HabitsBanner'
export default HabitsBanner

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(11, 105, 99, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  bannerPressed: { opacity: 0.7 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#11181C',
  },
  subtitle: {
    fontSize: 12,
    color: '#687076',
    marginTop: 2,
  },
})
