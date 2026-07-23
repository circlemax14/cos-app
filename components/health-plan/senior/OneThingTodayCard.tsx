/**
 * OneThingTodayCard (COS-479, 2026-07-23) — the "focus on one thing today"
 * card that sits in the new Hero Score layout (Direction 1 + wellbeing
 * map glimpse). Ken-approved composition item #5.
 *
 * Purpose:
 *   Names ONE small action the patient can take today, tuned to the
 *   currently-weakest wellbeing domain (bio / mind / social) surfaced by
 *   deriveWellbeing().focus. Patients tap "I did it" to acknowledge the
 *   completion. In v1 the button is a local UI-only affordance; a
 *   follow-up chunk will persist the completion to DDB (see notes in the
 *   discovery output).
 *
 * Layout (spec verbatim):
 *   - Empty state (no focus domain): soft-tinted card, single Text
 *     "You are all caught up for today.", no button.
 *   - Focus state: soft teal card (borderRadius 16, backgroundColor teal
 *     8% tint, borderColor teal 20%), padding 20pt.
 *       - Title: "Today, focus on your {DOMAIN_CALLOUT_NAME[focusDomain]}."
 *         at 18pt weight 600
 *       - Optional action sentence at 15pt weight 400 (hidden if missing
 *         to avoid an empty text row that would shift the button up)
 *       - "I did it" Pressable — 44pt height, teal fill, white text 17pt
 *         weight 600, borderRadius 12, alignSelf stretch
 *
 * a11y contract:
 *   - Card container is a single a11y node with a full-sentence label so
 *     VoiceOver reads the focus + action as one chunk (matches chunks
 *     82-124 discipline — no exposed inner nodes that force patients to
 *     swipe through 3 separate Text elements).
 *   - The "I did it" Pressable is a proper role=button with a hint that
 *     explains what tapping accomplishes.
 *   - Inner Text nodes are `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`
 *     so the VoiceOver focus stays on the card container's aggregated
 *     label rather than reading each fragment twice.
 *
 * iOS 26.5 primitive envelope:
 *   Uses ONLY View / Text / Pressable / MaterialIcons / StyleSheet.
 *   No Modal, no Animated, no LayoutAnimation, no Portal, no gradient,
 *   no blur, no ActivityIndicator, no rotate transforms. Static primitives
 *   only — matches the chunks 82-124 iOS 26.5 rulebook so the shipped
 *   BPS surface stays crash-free on iPhone 14 iOS 26.5 build 62+.
 *
 * Palette:
 *   Warm teal that aligns with BpsWellbeingScoreCard's tint fallback
 *   (#0D9488). Fixed hex — this component does NOT accept a colors prop
 *   per the spec, so we hard-code Ken's warm-teal baseline. All alphas
 *   below are hex suffixes to keep the file self-contained (no rgba().
 */
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { DOMAIN_CALLOUT_NAME, type BpsDomain } from '@/lib/wellbeing-score'

// ---------------------------------------------------------------
// Warm-teal palette. Kept as module consts so the color story stays
// in one place if Ken tunes the tint later. Alphas are hex suffixes:
//   0.08 → '14' (approx), 0.20 → '33'. Using round approximations
//   matches the "solid + hex-alpha" pattern already shipped in
//   BpsWellbeingScoreCard's pill tint (`pillColor + '14'`).
// ---------------------------------------------------------------

const TEAL = '#0D9488'
const TEAL_TINT_08 = '#0D948814' // ~8% teal — card background
const TEAL_TINT_20 = '#0D948833' // ~20% teal — card border

// Empty-state background: same teal-tinted card so the empty and focus
// states share visual footprint (avoids a jarring surface swap when a
// patient completes their last check-in of the day).
const EMPTY_BG = TEAL_TINT_08
const EMPTY_BORDER = TEAL_TINT_20

// Text colors — dark slate keeps contrast against the tinted card
// without pulling in the parent `colors` map. If theming becomes a
// requirement, promote to props in a follow-up chunk.
const TEXT_PRIMARY = '#0F172A'
const TEXT_SECONDARY = '#334155'

// ---------------------------------------------------------------
// Props
// ---------------------------------------------------------------

export interface OneThingTodayCardProps {
  /**
   * Weakest-domain signal from deriveWellbeing().focus. When undefined
   * (all domains balanced OR insufficient data), the card falls into
   * the empty state. Passed in from the parent BiopsychosocialPlanScreen
   * so the whole hero stack renders from a single deriveWellbeing() pass
   * (chunk 60 "compute once" contract).
   */
  focusDomain?: BpsDomain
  /**
   * Plain-English action sentence keyed off the focus domain. Sourced
   * from lib/wellbeing-caption.ts (`actionForFocus(focusDomain)`).
   * Optional — when missing, the sentence line is hidden entirely
   * rather than rendering an empty spacer (spec: "if focusActionSentence
   * missing, hide this line entirely").
   */
  focusActionSentence?: string
  /**
   * Fires when the patient taps "I did it". v1 wires nothing but a
   * local visual affordance; the parent can persist to DDB in a
   * follow-up chunk without touching this component's shape.
   */
  onCompleted?: () => void
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export default function OneThingTodayCard({
  focusDomain,
  focusActionSentence,
  onCompleted,
}: OneThingTodayCardProps): React.ReactElement {
  // Empty state — no focus domain surfaced. Renders a single caught-up
  // sentence so the surface still says something warm on days where
  // every domain is balanced. Matches the "soft-tinted card" spec.
  if (!focusDomain) {
    return (
      <View
        accessible
        accessibilityRole="none"
        accessibilityLabel="You are all caught up for today."
        style={[styles.card, styles.emptyCard]}
      >
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.emptyText}
        >
          You are all caught up for today.
        </Text>
      </View>
    )
  }

  // Focus state — build the a11y label as ONE sentence so VoiceOver
  // reads "Today's focus: physical health. Take a 10-minute walk today."
  // in a single announcement instead of three fragmented reads.
  const domainNoun = DOMAIN_CALLOUT_NAME[focusDomain]
  const cardLabel = focusActionSentence
    ? `Today's focus: ${domainNoun}. ${focusActionSentence}`
    : `Today's focus: ${domainNoun}.`

  return (
    <View
      accessible
      accessibilityRole="none"
      accessibilityLabel={cardLabel}
      style={styles.card}
    >
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.title}
      >
        Today, focus on your {domainNoun}.
      </Text>

      {focusActionSentence ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.actionSentence}
        >
          {focusActionSentence}
        </Text>
      ) : null}

      <Pressable
        onPress={onCompleted}
        accessibilityRole="button"
        accessibilityLabel="I did it"
        accessibilityHint="Marks today's focus as complete"
        // Static press feedback via opacity — no Animated / no scale
        // transform (both are on the iOS 26.5 avoid list for this
        // surface). Matches BpsWellbeingScoreCard's chunk-66 CTA
        // opacity-only press feedback (0.85).
        style={({ pressed }) => [
          styles.doneButton,
          { opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.doneButtonText}
        >
          I did it
        </Text>
      </Pressable>
    </View>
  )
}

// ---------------------------------------------------------------
// Styles — static StyleSheet. Marries the spec verbatim (padding
// 20pt, borderRadius 16, teal 8%/20% surfaces) with the chunk-59+
// warm-palette conventions from BpsWellbeingScoreCard.
// ---------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: TEAL_TINT_08,
    borderColor: TEAL_TINT_20,
    borderWidth: 1,
    padding: 20,
    // Vertical rhythm between title / sentence / button. gap works on
    // RN 0.71+ (this repo is well above) and keeps the button pinned
    // to the card bottom without absolute positioning.
    gap: 12,
  },
  emptyCard: {
    backgroundColor: EMPTY_BG,
    borderColor: EMPTY_BORDER,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '400',
    color: TEXT_SECONDARY,
    lineHeight: 22,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    lineHeight: 24,
  },
  actionSentence: {
    fontSize: 15,
    fontWeight: '400',
    color: TEXT_SECONDARY,
    lineHeight: 22,
  },
  doneButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: TEAL,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    // marginTop nudges the button below the sentence gap so the whole
    // stack sits comfortably even when the sentence is short.
    marginTop: 4,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
})

// Named export so callers can import either way — default for the
// screen ergonomics, named for helpers/tests that prefer explicit
// bindings.
export { OneThingTodayCard }
