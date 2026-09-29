/**
 * COS-1166 — a pending assessment BLOCKS the plan until it is answered.
 *
 * Vishal, 2026-09-29: "even if the patient doesn't open the notification and
 * directly open the app and then go to the plan screen, then there the
 * patient has to complete the assessment first."
 *
 * Until now the pending request was an inline card (SCRUM-687) sitting above
 * the AI summary. A card can be scrolled past, and the data says it is being
 * scrolled past: on production the SAME three instruments have been
 * re-requested for the same two accounts every day — 09-19, 09-28, 09-29 —
 * because nobody ever answers them.
 *
 * So the card becomes a gate. Same component, deliberately: a second,
 * differently-worded "time to reassess" screen would read as a second,
 * separate request, and a patient who acted on one would still find the other
 * waiting. One card, one source of truth — it disappears from Home, from the
 * plan and from this gate together when answered.
 *
 * NOT A HARD BLOCK. The card's "Not now" opens the snooze sheet, so a patient
 * who cannot do it right now still reaches their care plan. A gate with no
 * exit would take a patient's plan away from them at the moment they most
 * likely want to look at it.
 *
 * LOADING RENDERS THE PLAN, NOT THE GATE. The health-summary intake gate does
 * the opposite (treats loading as gated) because nearly every patient there
 * IS pre-intake. Here the majority have nothing pending, so gating on load
 * would flash a blocker at everyone. The card already reasons this way —
 * "NEVER render an empty card".
 *
 * iOS 26.5 envelope: View / Text / StyleSheet only at this level, and the
 * card itself is already inside the envelope. No Modal — the gate REPLACES
 * its children rather than floating over them, which is also why "Not now"
 * can push a sheet screen safely.
 */

import React from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'

import { getColors, Spacing } from '@/constants/design-system'
import { useAccessibility } from '@/stores/accessibility-store'
import { usePendingRetakeRequests } from '@/hooks/use-retake-requests'
import { RetakeRequestInboxCard } from './RetakeRequestInboxCard'

export interface RetakeRequiredGateProps {
  children: React.ReactNode
  /**
   * Test-only override. `undefined` defers to the hook; a number forces the
   * pending count so the contract can be exercised without a QueryClient.
   */
  __testPendingCount?: number
}

export function RetakeRequiredGate({
  children,
  __testPendingCount,
}: RetakeRequiredGateProps): React.JSX.Element {
  // Hook order is stable regardless of the override — React must never see a
  // changing hook count across renders.
  const query = usePendingRetakeRequests()
  const pendingCount = __testPendingCount ?? query.data?.length ?? 0
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = getColors(settings.isDarkTheme)

  // Nothing outstanding — the plan renders exactly as it did before.
  if (pendingCount <= 0) return <>{children}</>

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={[
          styles.heading,
          {
            color: colors.text,
            fontSize: getScaledFontSize(22),
             
            fontWeight: getScaledFontWeight(700) as any,
          },
        ]}
      >
        Before we show your plan
      </Text>
      <Text
        style={[styles.body, { color: colors.secondary, fontSize: getScaledFontSize(15) }]}
      >
        {pendingCount === 1
          ? 'Your care team is waiting on one assessment. Your plan is built from your answers, so it is out of date until this is done.'
          : `Your care team is waiting on ${String(pendingCount)} assessments. Your plan is built from your answers, so it is out of date until these are done.`}
      </Text>

      {/* The same card as Home and the plan — one request, one place to answer it. */}
      <RetakeRequestInboxCard />

      <Text
        style={[styles.footnote, { color: colors.secondary, fontSize: getScaledFontSize(13) }]}
      >
        Not a good time? Choose “Not now” and we’ll bring your plan straight back.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  heading: { marginTop: Spacing.xl },
  body: { lineHeight: 22 },
  footnote: { lineHeight: 19 },
})
