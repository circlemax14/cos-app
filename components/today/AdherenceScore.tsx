/**
 * Adherence score for Today's Schedule.
 *
 * Ken 2026-08-11: "What do you think about adherence score up in right corner
 * as well?" Vishal chose treatment B — the percentage leads, with the fraction
 * beneath it — and asked for it to be tappable.
 *
 * ── WHAT IT COUNTS, AND WHY THAT IS THE WHOLE DESIGN ─────────────────
 *
 * TASKS ONLY. Appointments cannot be completed from the app, so counting them
 * makes the number unactionable; and a missed doctor is not the same failure
 * as a skipped stretch, so averaging them together says nothing true.
 * Routines are structure, not asks — Vishal 2026-08-11: "no routines don't
 * count".
 *
 * ONLY WHAT IS DUE SO FAR. Against a whole-day denominator the patient opens
 * the app at 7am and sees 12%, and the figure reads as failure for most of
 * the day, every day.
 *
 * NEVER RED. A percentage is received differently from a count — "83%" is a
 * mark out of a hundred, and this cohort includes people for whom a
 * prominent compliance figure is a mood input rather than a UI element. It
 * is teal at every value, and the copy underneath never scolds.
 *
 * Tappable because a number nobody can interrogate gets mistrusted the first
 * time it looks wrong — and this one WILL look wrong to someone who expects
 * their 8pm task to be in the denominator at lunchtime.
 *
 * iOS 26.5 envelope: View / Text / Pressable / Modal / MaterialIcons /
 * StyleSheet. No ActivityIndicator, no Animated.
 */

import React from 'react'
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'

import type { Adherence } from '@/lib/today-timeline'

export interface AdherenceScoreProps {
  adherence: Adherence
  colors: { text: string; subtext: string; card: string; border: string; tint: string }
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

export function AdherenceScore({
  adherence,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: AdherenceScoreProps): React.ReactElement {
  const [explaining, setExplaining] = React.useState(false)
  const { done, due, percent, total } = adherence
  const bold = getScaledFontWeight(700) as never
  const stillToCome = Math.max(0, total - due)

  /**
   * Nothing due yet is a real state and deserves its own words. "0 of 0" and
   * "100%" both read oddly at 6am; "Nothing due yet" is simply true.
   */
  const nothingDueYet = due === 0

  return (
    <>
      <Pressable
        onPress={() => setExplaining(true)}
        accessibilityRole="button"
        accessibilityLabel={
          nothingDueYet
            ? 'Nothing due yet today'
            : `${percent} percent of today's tasks done, ${done} of ${due}`
        }
        accessibilityHint="Explains what this score counts"
        hitSlop={10}
        style={styles.wrap}
      >
        {nothingDueYet ? (
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), fontWeight: bold }}>
            Nothing due yet
          </Text>
        ) : (
          <>
            <Text style={{ color: colors.tint, fontSize: getScaledFontSize(26), fontWeight: bold, lineHeight: getScaledFontSize(28) }}>
              {percent}
              <Text style={{ fontSize: getScaledFontSize(13) }}>%</Text>
            </Text>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 1 }}>
              {done}/{due} done
            </Text>
          </>
        )}
      </Pressable>

      <Modal
        visible={explaining}
        transparent
        animationType="fade"
        onRequestClose={() => setExplaining(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setExplaining(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sheetHead}>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(17), fontWeight: bold, flex: 1 }}>
                Today&apos;s progress
              </Text>
              <Pressable
                onPress={() => setExplaining(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={10}
              >
                <MaterialIcons name="close" size={getScaledFontSize(22)} color={colors.subtext} />
              </Pressable>
            </View>

            <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), lineHeight: 22, marginTop: 10 }}>
              {nothingDueYet
                ? 'None of your tasks are due yet today.'
                : `You've done ${done} of the ${due} task${due === 1 ? '' : 's'} due so far today.`}
            </Text>

            {stillToCome > 0 && (
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), lineHeight: 20, marginTop: 8 }}>
                {stillToCome} more {stillToCome === 1 ? 'is' : 'are'} coming up later — {stillToCome === 1 ? 'it isn&apos;t' : 'they aren&apos;t'} counted yet.
              </Text>
            )}

            <View style={[styles.rule, { backgroundColor: colors.border }]} />

            {/* The two questions this number actually provokes. */}
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), lineHeight: 19 }}>
              This counts <Text style={{ color: colors.text, fontWeight: bold }}>tasks only</Text> — the
              things on your plan you tick off. Appointments and routines aren&apos;t counted:
              you can&apos;t complete an appointment here, and routines are the shape of your
              day rather than something to finish.
            </Text>

            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), lineHeight: 19, marginTop: 10 }}>
              It only counts what&apos;s <Text style={{ color: colors.text, fontWeight: bold }}>due so far</Text>,
              so a task set for this evening won&apos;t pull it down at breakfast.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', minHeight: 44, justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 34,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center' },
  rule: { height: 1, marginVertical: 16 },
})
