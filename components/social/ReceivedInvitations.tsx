/**
 * COS-1233 — "Invitations for you": the recipient's half of the double opt-in.
 *
 * ─── WHY THIS EXISTS AT ALL ──────────────────────────────────────────
 *
 * The invite feature shipped able to SEND and unable to COMPLETE. Redemption
 * was bound to the token in the email, nothing could carry that token through
 * an app install into signup (universal links are declared and dead — no AASA,
 * no assetlinks), and no client ever sent `inviteToken`. So an invited address
 * signed up and nothing was ever claimed.
 *
 * The invitation now surfaces to the RECIPIENT, who accepts or ignores it
 * themselves. Accept creates the connection request with THEM as requester, so
 * the inviter still confirms — two consents, in order. Ignore is terminal and
 * silent: the inviter is told nothing, because telling them converts a private
 * "no" into a social signal.
 *
 * ─── IT IS MOUNTED TWICE, AND OWNS EVERYTHING IT NEEDS ───────────────
 *
 * On Home (so it is reachable the first time a brand-new invitee opens the app,
 * which is the whole point) and in the Supports modal's Requests mode. It takes
 * NO props and reads its own colours, type ladder and data, because the two
 * hosts are a 3,700-line screen and a panel whose contract test forbids props.
 * Both mounts share one React Query key, so one fetch serves both.
 *
 * It returns `null` when there is nothing to answer, in the same discipline as
 * RetakeRequestInboxCard: no chrome and no layout shift on the empty state,
 * which is every patient except the handful with a live invitation.
 *
 * ─── NO ENTITLEMENT GATE. DELIBERATELY. ──────────────────────────────
 *
 * The three routes behind this are not gated server-side and nothing here may
 * gate them client-side. A brand-new invitee lands on `starter`, which grants
 * zero find-people.*, connections.* or conversation.* keys, so any gate makes
 * the feature a permanent dead end for exactly the population it exists for —
 * this codebase's most repeated failure (COS-1019 Health Plans, COS-856 tab
 * gating, find-people.* itself).
 *
 * ─── iOS 26 ENVELOPE (ADR-0003) ──────────────────────────────────────
 *
 * Plain primitives only. No Modal, no Animated, no LayoutAnimation, no SVG —
 * this mounts on Home, which is the cold-mount path that has crashed in
 * production, and the status line is an inline live region rather than an alert.
 */

import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  acceptReceivedInvite,
  fetchReceivedInvites,
  ignoreReceivedInvite,
  type InviteError,
  type ReceivedInvite,
} from '@/services/api/conversations'
import { Colors } from '@/constants/theme'
import { Spacing, Radii, TouchTargets, getColors } from '@/constants/design-system'
import { layoutForWidth } from '@/components/home/HomeResponsiveProvider'
import { intakeFontSize } from '@/components/health-plan/patient-intake/intake-legibility'
import { acceptOutcome, invitationLine, INVITE_GONE } from '@/lib/received-invite-copy'
import { useAccessibility } from '@/stores/accessibility-store'

/** The one query key, shared with SocialPanel so both mounts see one fetch. */
export const RECEIVED_INVITES_KEY = ['social-invites-received'] as const

export function ReceivedInvitations(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight: fw } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const qc = useQueryClient()

  /*
   * The AA-legible teal, not colors.tint (#008080): 4.38:1 on the card and
   * 3.42:1 on the dark card, both under the 4.5 bar for text on an audience
   * that is largely 60+ and partly visually impaired. Same pair SocialPanel
   * settled on in COS-1231.
   */
  const tokens = getColors(!!settings.isDarkTheme)
  const actionTint = settings.isDarkTheme ? tokens.primary : tokens.primaryDark

  /*
   * Type that steps with the SCREEN as well as the setting. getScaledFontSize's
   * own isTablet() only removes phone dampening — it never enlarges — so a 15pt
   * line rendered at 15pt on a 10" iPad. layoutForWidth owns the one ladder and
   * INTAKE_TYPE_STEP owns the step; a second set of thresholds here is the
   * drift this codebase keeps shipping.
   */
  const { width } = useWindowDimensions()
  const { breakpoint } = layoutForWidth(width)
  const fs = React.useCallback(
    (base: number) => intakeFontSize(base, breakpoint, getScaledFontSize),
    [breakpoint, getScaledFontSize],
  )

  /**
   * The outcome of the last action, as an inline live region.
   *
   * Not a toast and not an Alert: Alert.alert renders a Modal, and this mounts
   * inside a `presentation:'modal'` screen in one of its two homes, which is the
   * documented iOS 26.5 SIGABRT class. It also has to survive the row it refers
   * to disappearing from the list.
   */
  const [status, setStatus] = React.useState<string | null>(null)

  const invitesQ = useQuery({
    queryKey: RECEIVED_INVITES_KEY,
    queryFn: fetchReceivedInvites,
    /*
     * `[]` is the normal answer and it means two different things — no live
     * invitation, or an address that asked us to stop. Neither is an error and
     * neither is rendered differently, so there is no error branch here either: a
     * failed fetch shows nothing, exactly like an empty one.
     *
     * COS-1235 — the THIRD thing it used to mean, "we hold no email address for
     * this account", is now `reachable:false` on the same response, and it is
     * rendered by SocialPanel rather than here. See that file: this component
     * mounts on Home for every patient on every open, and a permanent banner there
     * for the 13-of-32 accounts with no address is unsolicited noise, where the
     * Requests panel is the place somebody goes LOOKING for an invitation.
     */
    staleTime: 60_000,
  })
  const invites = invitesQ.data?.invites ?? []

  /**
   * ONE failure path for both actions.
   *
   * INVITE_NOT_FOUND is the server's single 404 for a missing, expired,
   * already-claimed, already-ignored or somebody-else's id — including a second
   * Ignore, which is the ordinary double-tap. It is success-equivalent: say the
   * invitation has gone and refresh the list rather than presenting a failure
   * the patient can do nothing about.
   */
  const onFail = (err: InviteError) => {
    if (err?.code === 'INVITE_NOT_FOUND') {
      setStatus(INVITE_GONE)
      void qc.invalidateQueries({ queryKey: RECEIVED_INVITES_KEY })
      return
    }
    setStatus(err?.message || 'That did not work — please try again.')
  }

  const accept = useMutation({
    mutationFn: (inviteId: string) => acceptReceivedInvite(inviteId),
    onSuccess: (res, inviteId) => {
      /*
       * `requested` and `connected` decide the sentence, and there are three of
       * them. `requested:false` means the invitation is spent but NO request
       * reached the inviter (one of the two had declined the other in-app), so the
       * copy must not say they were told. `connected:true` (COS-1235) means the
       * inviter had already asked in-app, so it is finished and there is no second
       * step to promise. See lib/received-invite-copy.ts, where all three are tested.
       */
      const name = invites.find((i) => i.inviteId === inviteId)?.inviterName ?? ''
      setStatus(acceptOutcome(name, res.requested, res.connected))
      void qc.invalidateQueries({ queryKey: RECEIVED_INVITES_KEY })
      /*
       * The connection now exists as MY OWN 'pending-out' row, which the
       * inviter completes. So the Sent list has changed and the Requests badge
       * with it — but there is no accepted connection and no conversation to
       * render, which is why neither of those keys is touched here.
       */
      void qc.invalidateQueries({ queryKey: ['connections', 'pending-out'] })
      /*
       * COS-1235 — and when it CONNECTED outright (the inviter had already asked
       * in-app), the accepted list and the conversation inbox have both changed.
       * Invalidated only on that branch, so the ordinary path still touches
       * nothing it did not affect.
       */
      if (res.connected) {
        // The same two keys SocialPanel's own accept refreshes, and for the same
        // reason: a live connection means a conversation exists now.
        void qc.invalidateQueries({ queryKey: ['connections', 'pending-in'] })
        void qc.invalidateQueries({ queryKey: ['conversations'] })
      }
    },
    onError: onFail,
  })

  const ignore = useMutation({
    mutationFn: (inviteId: string) => ignoreReceivedInvite(inviteId),
    /*
     * SILENT on purpose, in both directions: nothing goes to the inviter, and
     * nothing is announced here either. A "declined" confirmation would make a
     * private no feel like a report filed. The row simply goes.
     */
    onSuccess: () => {
      setStatus(null)
      void qc.invalidateQueries({ queryKey: RECEIVED_INVITES_KEY })
    },
    onError: onFail,
  })

  // Nothing to answer and nothing to report: render NOTHING, so the mount is a
  // no-op for every patient without a live invitation.
  if (invites.length === 0 && !status) return null

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {/*
        The heading needs rows under it. After the last invitation is answered
        the card stays up to hold the outcome, and "Invitation for you" over
        nothing would be the screen contradicting the sentence below it.
      */}
      {invites.length > 0 ? (
        <View style={styles.headerRow}>
          <MaterialIcons name="group-add" size={fs(22)} color={actionTint} />
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: fs(16),
              fontWeight: fw(700) as TextStyle['fontWeight'],
              marginLeft: Spacing.sm,
              flex: 1,
            }}
          >
            {invites.length > 1 ? `Invitations for you (${invites.length})` : 'Invitation for you'}
          </Text>
        </View>
      ) : null}

      {status ? (
        /*
          Both attributes, like the banner in SocialPanel: accessibilityLiveRegion
          is Android-only, and the whole point of this line is that it is read out
          to somebody who just tapped Accept and cannot see the row disappear.
        */
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            color: colors.text,
            fontSize: fs(14),
            lineHeight: fs(20),
            marginTop: Spacing.xs,
          }}
        >
          {status}
        </Text>
      ) : null}

      {invites.map((item: ReceivedInvite) => {
        const accepting = accept.isPending && accept.variables === item.inviteId
        const ignoring = ignore.isPending && ignore.variables === item.inviteId
        const busy = accepting || ignoring
        const line = invitationLine(item.inviterName, item.relationship)
        return (
          <View
            key={item.inviteId}
            style={[styles.row, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.text, fontSize: fs(15), lineHeight: fs(21) }}>
              {line}
            </Text>
            {/*
              Their note, as its own quoted block. It is free text a stranger
              wrote, so it is never run together with our own sentence above —
              and numberOfLines is deliberately absent: a 280-character note
              truncated at the point it says who the sender is would be worse
              than a tall row.
            */}
            {item.note ? (
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: fs(14),
                  lineHeight: fs(20),
                  marginTop: Spacing.xs,
                  fontStyle: 'italic',
                }}
              >
                {`“${item.note}”`}
              </Text>
            ) : null}

            {/*
              Nothing is shared by accepting, and that is the sentence that
              decides it for this audience — the invitation itself arrived from
              somebody who typed their address, so the screen says what the next
              step is rather than implying a connection has been made.
            */}
            <Text
              style={{
                color: colors.subtext,
                fontSize: fs(13),
                lineHeight: fs(19),
                marginTop: Spacing.xs,
              }}
            >
              If you accept, they confirm it before you are connected. Nothing of yours is
              shared until then.
            </Text>

            <View style={styles.actions}>
              {/*
                Ignore first in the reading order and visually quieter, Accept
                last and solid: the destructive-but-silent option must not be
                the one a shaky hand finds first, and 44pt is the floor on both
                before the type scales.
              */}
              <Pressable
                onPress={() => ignore.mutate(item.inviteId)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy: ignoring }}
                accessibilityLabel={`Ignore the invitation from ${item.inviterName}`}
                accessibilityHint="Removes it. We do not tell them."
                style={[
                  styles.btn,
                  styles.btnQuiet,
                  { borderColor: colors.border, opacity: busy ? 0.5 : 1 },
                ]}
              >
                {/*
                  Full-contrast label, not the hint grey. Ignore is the quieter
                  of the two because it is OUTLINED rather than filled — dimming
                  the word as well would put a real choice under AA on an
                  audience that is partly visually impaired, and "I can't read
                  the other button" is not how somebody should end up accepting.
                */}
                {ignoring ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: fs(15),
                      fontWeight: fw(600) as TextStyle['fontWeight'],
                    }}
                  >
                    Ignore
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => accept.mutate(item.inviteId)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy: accepting }}
                accessibilityLabel={`Accept the invitation from ${item.inviterName}`}
                accessibilityHint="Sends them a request they confirm"
                style={[
                  styles.btn,
                  { backgroundColor: actionTint, opacity: busy ? 0.5 : 1 },
                ]}
              >
                {accepting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    style={{
                      color: '#fff',
                      fontSize: fs(15),
                      fontWeight: fw(700) as TextStyle['fontWeight'],
                    }}
                  >
                    Accept
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.md,
    padding: Spacing.sm + 4,
    marginBottom: Spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  // Wraps rather than shrinks: two 44pt buttons side by side with the type
  // stepped up on a narrow phone is how a label ends up clipped to "Igno…", so
  // flexBasis lets them stack instead.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  btn: {
    flexGrow: 1,
    flexBasis: 120,
    borderRadius: Radii.md,
    minHeight: TouchTargets.minimum,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnQuiet: { borderWidth: 1 },
})

export default ReceivedInvitations
