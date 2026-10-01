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
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'

import { getColors, Spacing } from '@/constants/design-system'
import { useAccessibility } from '@/stores/accessibility-store'
import { usePendingRetakeRequests } from '@/hooks/use-retake-requests'
import { retakeTrackOf } from '@/lib/retake-queue'
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan'
import { RetakeRequestInboxCard } from './RetakeRequestInboxCard'

export interface RetakeRequiredGateProps {
  children: React.ReactNode
  /**
   * Test-only override. `undefined` defers to the hook; a number forces the
   * pending count so the contract can be exercised without a QueryClient.
   */
  __testPendingCount?: number
  /** Test-only override for the rebuild-in-flight branch. */
  __testRebuilding?: boolean
}

export function RetakeRequiredGate({
  children,
  __testPendingCount,
  __testRebuilding,
}: RetakeRequiredGateProps): React.JSX.Element {
  // Hook order is stable regardless of the override — React must never see a
  // changing hook count across renders.
  const query = usePendingRetakeRequests()
  /*
   * COS-1182 — ASSESSMENT requests only. The health-status intake is not ours.
   *
   * This counted every pending row, so a "please redo your Health Status
   * questionnaire" ask blocked the CARE PLAN tab, under assessment-flavoured
   * copy ("Before we show your plan… waiting on one assessment"), and its Start
   * now opened the intake wizard from the plan screen.
   *
   * The two are separate tracks server-side (COS-1178) precisely because they
   * are answered on different surfaces and can be outstanding at the same time.
   * The intake ask belongs to the Health Status screen, which now has its own
   * gate (IntakeRequiredGate).
   */
  const pendingCount =
    __testPendingCount ??
    (query.data ?? []).filter((r) => retakeTrackOf(r.instrumentKey) === 'assessment').length
  const plan = useBiopsychosocialPlan()
  const rebuilding = __testRebuilding ?? plan.data?.generating === true
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = getColors(settings.isDarkTheme)

  /*
   * COS-1171 — the plan is being rebuilt, so do not show a stale one.
   *
   * Vishal, 2026-09-30: "it should show a loader … we are rebuilding your plan
   * … until the plan is actually ready. Even if I close the app and come back
   * again, then I should see this loader."
   *
   * Checked BEFORE the pending count, because the order matters at exactly the
   * moment that matters: answering the last check-in of a request both clears
   * the request AND starts the rebuild. Pending-first would flash the OLD plan
   * in the gap between those two facts — which is what he saw.
   *
   * `generating` is server state on the plan record, so this survives closing
   * the app: a cold start refetches it and lands straight back here. It is not
   * a local spinner.
   *
   * It clears two ways — the BIOPSYCHOSOCIAL_PLAN_READY push invalidates the
   * query, and the hook polls every 10s while generating in case that push
   * never arrives.
   */
  if (rebuilding) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text
          accessibilityRole="header"
          style={[
            styles.heading,
            {
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as never,
            },
          ]}
        >
          Rebuilding your plan
        </Text>
        <Text style={[styles.body, { color: colors.secondary, fontSize: getScaledFontSize(15) }]}>
          Thanks — we have your answers. We are working them into your plan now. This usually takes
          a minute, and we will let you know the moment it is ready.
        </Text>
        <View
          style={styles.spinnerRow}
          accessibilityRole="progressbar"
          accessibilityLabel="Rebuilding your plan"
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text
          style={[styles.footnote, { color: colors.secondary, fontSize: getScaledFontSize(13) }]}
        >
          You can close the app — this carries on without you, and you will get a notification when
          your plan is ready.
        </Text>
      </ScrollView>
    )
  }

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
      <RetakeRequestInboxCard onGateRoute />

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
  spinnerRow: { paddingVertical: Spacing.lg, alignItems: 'center' },
})
