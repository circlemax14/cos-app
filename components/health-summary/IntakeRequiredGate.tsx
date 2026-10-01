/**
 * COS-1182 — a pending Health Status request blocks the Health Status screen.
 *
 * Vishal, 2026-09-30: "similar workflow we have to develop for health status
 * also ... It should show a message complete your health status and once the
 * check-ins are complete, then we will again generate the health summary and
 * then send a notification and update the health status screen."
 *
 * ─── WHAT WAS THERE BEFORE ────────────────────────────────────────────
 *
 * Two things, neither of them this:
 *
 *   1. `plan.tsx` already gated its sections on `intake.status === 'complete'`.
 *      That answers "has this patient EVER done an intake?" and knows nothing
 *      about a care manager's ask. A patient with a completed intake and a
 *      pending re-ask saw their sections as normal.
 *   2. A pending `full-intake` request DID gate something — the care plan tab —
 *      because RetakeRequiredGate counted every track. Wrong screen, and wrong
 *      copy ("waiting on one assessment"). That is fixed in the same change.
 *
 * ─── WHY IT MIRRORS RetakeRequiredGate RATHER THAN SHARING IT ─────────
 *
 * Same shape deliberately, different copy and a different destination: this one
 * says "Health Status", routes to the intake wizard in retake mode, and reads
 * the SUMMARY's rebuilding flag rather than the plan's `generating`. Folding both
 * into one component would mean a props matrix for every one of those, on a
 * surface whose whole job is to say one clear thing.
 *
 * NOT A HARD BLOCK, for the same reason as the plan gate: the card's "Not now"
 * opens the snooze sheet, so a patient who cannot face it right now still
 * reaches their health status. A mandatory ask has no "Not now" (COS-1179).
 *
 * iOS 26.5 envelope: View / Text / ScrollView / ActivityIndicator only at this
 * level, matching RetakeRequiredGate.
 */

import React from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'

import { getColors, Spacing } from '@/constants/design-system'
import { useAccessibility } from '@/stores/accessibility-store'
import { usePendingRetakeRequests } from '@/hooks/use-retake-requests'
import { retakeTrackOf } from '@/lib/retake-queue'
import { RetakeRequestInboxCard } from '@/components/health-plan/retake-request/RetakeRequestInboxCard'

export interface IntakeRequiredGateProps {
  children: React.ReactNode
  /** True while the health summary is regenerating (server state). */
  rebuilding?: boolean
  /** Test-only override; a number forces the pending count. */
  __testPendingCount?: number
}

export function IntakeRequiredGate({
  children,
  rebuilding,
  __testPendingCount,
}: IntakeRequiredGateProps): React.JSX.Element {
  const query = usePendingRetakeRequests()
  const pendingCount =
    __testPendingCount ??
    (query.data ?? []).filter(
      (r) => retakeTrackOf(r.instrumentKey) === 'health-status-intake',
    ).length

  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = getColors(settings.isDarkTheme)

  /*
   * Rebuild first, same ordering as the plan gate and for the same reason:
   * completing the intake both clears the request AND starts the regeneration,
   * so checking pending first would flash the OLD health status in the gap
   * between those two facts.
   */
  if (rebuilding === true) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        <Text
          style={[
            styles.title,
            { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as never },
          ]}
        >
          Updating your health status
        </Text>
        <Text
          style={[styles.body, { color: colors.text + 'BB', fontSize: getScaledFontSize(14) }]}
        >
          Thanks — that is everything we needed. We are putting your health status together
          now and will let you know as soon as it is ready.
        </Text>
        <ActivityIndicator style={{ marginTop: Spacing.lg }} color={colors.tint as string} />
      </ScrollView>
    )
  }

  // LOADING RENDERS THE CONTENT, not the gate. Most patients have nothing
  // pending, so gating on load would flash a blocker at everyone. Same call as
  // RetakeRequiredGate.
  if (pendingCount <= 0) return <>{children}</>

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text
        style={[
          styles.title,
          { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as never },
        ]}
      >
        Complete your health status
      </Text>
      <Text style={[styles.body, { color: colors.text + 'BB', fontSize: getScaledFontSize(14) }]}>
        Your care team has asked you to bring this up to date. Once you finish, we will
        rebuild your health status and let you know.
      </Text>
      {/*
        * The same card as Home and the plan gate, deliberately: a second,
        * differently-worded ask would read as a second request, and a patient who
        * answered one would still find the other waiting. It names who asked, and
        * its Start now opens the intake wizard in retake mode.
        */}
      <View style={{ marginTop: Spacing.md }}>
        <RetakeRequestInboxCard track="health-status-intake" onGateRoute />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.md, paddingTop: Spacing.lg },
  title: { marginBottom: Spacing.sm },
  body: { lineHeight: 20 },
})
