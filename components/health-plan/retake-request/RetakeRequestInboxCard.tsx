/**
 * RetakeRequestInboxCard (COS-482 Phase 1).
 *
 * Human-voiced inbox surface on Home when a care manager (or super-admin
 * from the unassigned pool) has asked the patient to redo an assessment
 * or full intake. Renders `null` when there are no pending requests —
 * silent-drop pattern, matches AssessmentDueBanner. Never renders any
 * "loading" / "error" chrome — the card is a nudge, not a spinner.
 *
 * iOS 26.5 primitive envelope (matches components/unified-plan/v2/net.ts
 * SIGABRT-avoidance discipline enforced across the plan surface):
 *   ONLY: View / Text / Pressable / StyleSheet / MaterialIcons.
 *   NO   Modal / Animated / reanimated / gesture-handler / bottom-sheet
 *        libs / paper components / Portal.
 *
 * The "Not now" affordance opens a full sheet SCREEN
 * (/Home/retake-snooze-sheet) rather than a bottom-sheet overlay, because
 * every bottom-sheet library the app has on hand (react-native-paper,
 * react-native-gesture-handler based sheets) crashes on iOS 26.5 the
 * moment Modal/Animated/Reanimated composes with the tap handler on the
 * card. The sheet screen renders its own Pressable scrim and the same
 * primitives, so it's SIGABRT-safe by construction.
 *
 * On tap paths:
 *   - Start now → /Home/assessment-stepper?instrumentId=<key> (or the
 *     intake wizard when the key is `full-intake`).
 *   - Not now  → /Home/retake-snooze-sheet?id=<requestId>.
 *   - Snooze/Dismiss are handled by the sheet screen (which owns the
 *     mutation hooks) — this card is READ-only for the row body.
 *
 * A11y contract:
 *   - Outer card carries a composed accessibilityLabel so a screen reader
 *     announces "Care Manager Sarah asked you to retake PHQ-9. Takes 4
 *     minutes." as one utterance. Inner Text nodes are hidden from a11y
 *     (importantForAccessibility="no-hide-descendants") so the reader
 *     doesn't repeat every fragment.
 *   - Both buttons have role="button" + composed accessibilityLabel.
 *
 * PII discipline: the render composes only the enriched fields the BE
 * ships (requesterFirstName, requesterRole, agencyName, instrumentDisplayName,
 * estMinutes, optional short note). No email, no last name.
 */

import React, { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { getColors, Radii, Spacing } from '@/constants/design-system'
import { useAccessibility } from '@/stores/accessibility-store'
import { usePendingRetakeRequests } from '@/hooks/use-retake-requests'
import { canDeferRetakeRequest } from '@/services/api/retake-requests'
import type { PatientRetakeRequestView } from '@/services/api/retake-requests'

/**
 * Map the BE-emitted requester role string to a human label the patient
 * will actually understand. Falls back to a title-cased version of the
 * raw role for unknown values so a future BE-added role never renders as
 * "your care team member" — the patient still sees a reasonable word.
 */
function humanRole(role: string): string {
  switch (role) {
    case 'CARE_MANAGER':
      return 'Care Manager'
    case 'ADMIN':
      return 'Admin'
    case 'SUPER_ADMIN':
      return 'Admin'
    case 'PROVIDER':
      return 'Provider'
    case 'CARE_GIVER':
      return 'Caregiver'
    default:
      // Title-case: "SOMETHING_NEW" → "Something New".
      return role
        .toLowerCase()
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w[0]?.toUpperCase() + w.slice(1))
        .join(' ')
  }
}

function estMinutesLabel(n: number): string {
  if (n <= 1) return '~1 minute'
  return `~${n} minutes`
}

/**
 * Compose the a11y announcement for the whole card. Kept as a pure fn so
 * the routing + contract tests can pin the exact utterance shape.
 */
export function composeRetakeCardAccessibilityLabel(row: PatientRetakeRequestView): string {
  const role = humanRole(row.requesterRole)
  const who = `${role} ${row.requesterFirstName}`
  const what = `asked you to retake ${row.instrumentDisplayName}`
  const time = `Takes ${estMinutesLabel(row.estMinutes)}`
  return `${who} ${what}. ${time}.`
}

/**
 * Deep-link target for "Start now". Full-intake routes to the intake
 * wizard; every other instrument routes to the shared assessment stepper
 * (matches the deep-links AssessmentCatalogContent + BpsWellbeingScoreCard
 * already use — see grep for `/Home/assessment-stepper`).
 */
export function retakeStartRoute(instrumentKey: string): string {
  if (instrumentKey === 'full-intake') return '/Home/patient-intake?source=retake-request'
  const q = encodeURIComponent(instrumentKey)
  return `/Home/assessment-stepper?instrumentId=${q}&source=retake-request`
}

export interface RetakeRequestInboxCardProps {
  /**
   * Test-only override so contract tests can render with a fixed row list
   * without wiring the React Query hook + a QueryClientProvider. Prod
   * callers omit this and the component reads from the hook.
   */
  __testRows?: PatientRetakeRequestView[]
}

export function RetakeRequestInboxCard({
  __testRows,
}: RetakeRequestInboxCardProps = {}): React.JSX.Element | null {
  // Hooks always run in the same order regardless of the test override so
  // React never sees a hook-count change across renders. Real callers
  // ignore the `__testRows` prop — the query still runs but its result is
  // discarded in favor of the fixture.
  const query = usePendingRetakeRequests()
  const rows = __testRows ?? query.data ?? []
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = getColors(settings.isDarkTheme)

  const first = rows[0]
  const moreCount = Math.max(0, rows.length - 1)

  const onStartNow = useCallback(() => {
    if (!first) return
    router.push(retakeStartRoute(first.instrumentKey) as never)
  }, [first])

  const onNotNow = useCallback(() => {
    if (!first) return
    router.push(`/Home/retake-snooze-sheet?id=${encodeURIComponent(first.id)}` as never)
  }, [first])

  const a11yLabel = useMemo(
    () => (first ? composeRetakeCardAccessibilityLabel(first) : ''),
    [first],
  )

  // Silent-drop when there's nothing pending. NEVER render an empty card,
  // a loading spinner, or an error banner from this surface — a nudge that
  // says "nothing to nudge you about" is anti-value.
  if (!first) return null

  const canDefer = canDeferRetakeRequest(first)

  const role = humanRole(first.requesterRole)
  const whoLine = first.agencyName
    ? `${first.requesterFirstName} (${role} · ${first.agencyName})`
    : `${first.requesterFirstName} (${role})`

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.background,
          borderColor: colors.tint + '55',
        },
      ]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.header} importantForAccessibility="no-hide-descendants">
        <View
          style={[styles.iconWrap, { backgroundColor: (colors.tint || '#008080') + '22' }]}
        >
          <MaterialIcons name="assignment" size={20} color={colors.tint || '#008080'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            {whoLine}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text + 'CC',
              fontSize: getScaledFontSize(11),
              marginTop: 1,
            }}
          >
            asked you to retake an assessment
          </Text>
        </View>
      </View>

      {first.note ? (
        <View style={styles.noteWrap} importantForAccessibility="no-hide-descendants">
          <Text
            numberOfLines={3}
            style={{
              color: colors.text + 'DD',
              fontSize: getScaledFontSize(13),
              fontStyle: 'italic',
              lineHeight: 18,
            }}
          >
            {'“'}
            {first.note}
            {'”'}
          </Text>
        </View>
      ) : null}

      <View style={styles.detailsRow} importantForAccessibility="no-hide-descendants">
        <View style={styles.detailCell}>
          <Text
            style={{
              color: colors.text + '99',
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(600) as any,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            What
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
              marginTop: 2,
            }}
          >
            {first.instrumentDisplayName}
          </Text>
        </View>
        <View style={styles.detailCell}>
          <Text
            style={{
              color: colors.text + '99',
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(600) as any,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Time
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
              marginTop: 2,
            }}
          >
            {estMinutesLabel(first.estMinutes)}
          </Text>
        </View>
      </View>

      {moreCount > 0 ? (
        <View importantForAccessibility="no-hide-descendants">
          <Text
            style={{
              color: colors.text + '99',
              fontSize: getScaledFontSize(11),
              marginTop: Spacing.xs,
            }}
          >
            {`+${moreCount} more request${moreCount === 1 ? '' : 's'} pending`}
          </Text>
        </View>
      ) : null}

      <View style={styles.ctaRow}>
        <Pressable
          onPress={onStartNow}
          accessibilityRole="button"
          accessibilityLabel={`Start ${first.instrumentDisplayName} now`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: colors.tint || '#008080',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            Start now
          </Text>
        </Pressable>

        {/*
          COS-763 — a mandatory row has no "Not now". The BE has refused
          snooze and dismiss on these since #10b, so the button was never a
          real choice: tapping it took the patient into the sheet and both
          actions came back 409 with nothing explaining why. Removing it is
          the honest version.
        */}
        {canDefer && (
          <Pressable
            onPress={onNotNow}
            accessibilityRole="button"
            accessibilityLabel="Not now — choose to snooze or dismiss"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                borderColor: colors.tint || '#008080',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: colors.tint || '#008080',
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              {'Not now ▾'}
            </Text>
          </Pressable>
        )}
      </View>

      {/*
        Say why the choice is missing. A button that silently disappears reads
        as a bug; one sentence turns it into a plan the patient is on. No
        deadline is quoted — `expiresAt` is a cleanup backstop (COS-758), not
        a promise we make to the patient.
      */}
      {!canDefer && (
        <Text
          style={{
            color: colors.icon || '#6B7280',
            fontSize: getScaledFontSize(12),
            lineHeight: getScaledFontSize(12) * 1.4,
          }}
        >
          This check-in is part of your plan, so it stays here until it&apos;s done.
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.lg ?? 12,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  noteWrap: {
    paddingHorizontal: 4,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  detailCell: {
    flex: 1,
    minWidth: 0,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radii.md ?? 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radii.md ?? 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    backgroundColor: 'transparent',
  },
})

export default RetakeRequestInboxCard
