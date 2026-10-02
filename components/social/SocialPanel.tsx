/**
 * COS-1124 — the Social tab does its own work, in place.
 *
 * Vishal, 2026-09-25: "if I click on Find people another modal is opening,
 * which is actually wrong — we should not open any other modal… whatever we
 * need to do is within the same screen."
 *
 * It used to be three buttons that pushed you somewhere else: Find people →
 * a full-screen route, Requests → another, plus an Add member form. Leaving a
 * modal to do the modal's job is a strange trip on any surface, and worse here
 * because the Supports modal unmounts when you go, so you come back to a tab
 * that has forgotten where you were.
 *
 * So: one panel, two modes, no navigation. The search box, the discoverability
 * switch and the incoming requests all live on this tab, and the icon row
 * swaps the DATA rather than the screen.
 *
 * ─── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────
 *
 * Suggestions ("people nearby", "people with similar health") are NOT here,
 * because nothing behind this screen can answer them today:
 *
 *   - the directory search is the only listing endpoint and it REQUIRES a
 *     query of 2+ characters, so there is no way to browse. A
 *     `browse-directory` permission exists in the entitlements catalog with no
 *     route implementing it.
 *   - `DirectoryEntry` carries userId, displayName and photoUrl. No location,
 *     no region, no conditions. There is nothing to be near or similar to.
 *
 * Inventing a suggestion list from what is on the wire would mean showing
 * arbitrary people under a heading that claims a relationship they do not
 * have. See the note in the empty state, which says plainly what the search
 * covers rather than implying more.
 */

import React from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextStyle,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  acceptConnection,
  cancelConnection,
  declineConnection,
  fetchConnections,
  fetchEmailInvites,
  fetchSocialVisibility,
  fetchSuggestions,
  requestConnection,
  searchDirectory,
  sendEmailInvite,
  setDiscoverability,
  withdrawEmailInvite,
  type Connection,
  type DirectoryEntry,
  type Invite,
  type InviteError,
  type InviteRelationship,
} from '@/services/api/conversations'
import { Colors } from '@/constants/theme'
import { Spacing, Radii, TouchTargets, getColors } from '@/constants/design-system'
import { layoutForWidth } from '@/components/home/HomeResponsiveProvider'
import { intakeFontSize } from '@/components/health-plan/patient-intake/intake-legibility'
import { AccessibleInput } from '@/components/ui/accessible-input'
import { isValidEmailFormat } from '@/lib/email-format'
import { useAccessibility } from '@/stores/accessibility-store'
import { useCanShowScreen } from '@/hooks/use-feature-permissions'

/** Matches MIN_QUERY_LENGTH on the server. Below this we do not even ask. */
const MIN_QUERY = 2

/** The server's cap, enforced by zod on the route. Mirrored for the counter. */
const MAX_NOTE = 280

/**
 * COS-1231 — the Mode union gained two members, APPENDED.
 *
 * Order is load-bearing for tests/unit/social-tab-entry.test.ts, whose regex
 * is unanchored: anything after 'requests' passes, anything inserted before it
 * fails. Nothing here relies on the order at runtime — the test does.
 */
type Mode = 'find' | 'requests' | 'invite' | 'invite-sent'

/** How you know the person you are inviting. Matches INVITE_RELATIONSHIPS. */
const RELATIONSHIPS: { key: InviteRelationship; label: string }[] = [
  { key: 'family', label: 'Family' },
  { key: 'friend', label: 'Friend' },
  { key: 'carer', label: 'Carer' },
  { key: 'clinician', label: 'Clinician' },
]

/** One person, in search results or in suggestions — identical either way, so
 *  a suggestion can never be made to look more endorsed than a search hit. */
function PersonRow({
  item,
  colors,
  actionTint,
  fs,
  requested,
  sending,
  onConnect,
}: {
  item: DirectoryEntry
  colors: (typeof Colors)['light']
  /** COS-1231 — the AA-legible teal. See the note where it is derived. */
  actionTint: string
  fs: (n: number) => number
  requested: boolean
  /**
   * THIS row's request is in flight — not "some request somewhere is".
   *
   * It used to be `connect.isPending`, which is true for every row while any
   * one of them is sending, so tapping Connect on one person greyed out the
   * whole list. The mutation's `variables` carries the userId being sent, so
   * the state can be attributed to the row that owns it.
   */
  sending: boolean
  onConnect: () => void
}): React.JSX.Element {
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.border }]}>
          <MaterialIcons name="person" size={fs(20)} color={colors.icon} />
        </View>
      )}
      <Text
        style={{ flex: 1, marginLeft: Spacing.sm, color: colors.text, fontSize: fs(15) }}
        numberOfLines={1}
      >
        {item.displayName || 'Unnamed'}
      </Text>
      <Pressable
        onPress={onConnect}
        disabled={requested || sending}
        accessibilityRole="button"
        accessibilityState={{ disabled: requested || sending, busy: sending }}
        accessibilityLabel={
          requested
            ? `Request already sent to ${item.displayName}`
            : sending
              ? `Sending a request to ${item.displayName}`
              : `Send a request to ${item.displayName}`
        }
        style={[
          styles.actionBtn,
          { borderColor: colors.border, opacity: requested ? 0.5 : 1 },
        ]}
      >
        {/*
          The spinner replaces the label rather than sitting beside it, and the
          button carries a minWidth, so the row does not reflow mid-tap. A
          control that changes width while you are looking at it reads as a
          glitch even when the outcome is correct.
        */}
        {sending ? (
          <ActivityIndicator size="small" color={actionTint} />
        ) : (
          <Text style={{ color: actionTint, fontSize: fs(13), fontWeight: '600' }}>
            {requested ? 'Requested' : 'Connect'}
          </Text>
        )}
      </Pressable>
    </View>
  )
}

export function SocialPanel(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight: fw } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const qc = useQueryClient()
  const canShow = useCanShowScreen()

  /*
   * COS-1231 — type that grows with the SCREEN, not only with the setting.
   *
   * Every size in this file was a phone size handed straight to
   * `getScaledFontSize`, and that helper's isTablet() only removes phone
   * dampening — it never enlarges. So fs(13) rendered at 13pt on a 10" iPad
   * held at arm's length, which is what cost the clinical lead two days on
   * COS-1225. The breakpoint step is composed BEFORE the accessibility scaler
   * so a patient who has already raised their system font keeps that on top.
   *
   * The thresholds are not redefined here: layoutForWidth owns the one ladder,
   * and it reads useWindowDimensions, so this follows a rotation —
   * getScaledFontSize's own isTablet() reads Dimensions imperatively and does
   * not.
   */
  const { width } = useWindowDimensions()
  const { breakpoint } = layoutForWidth(width)
  const fs = React.useCallback(
    (base: number) => intakeFontSize(base, breakpoint, getScaledFontSize),
    [breakpoint, getScaledFontSize],
  )

  /*
   * COS-1223/COS-1231 — `colors.tint` (#008080) is an AA FILL, not an AA TEXT
   * colour: 4.38:1 on the card and 3.42:1 on the dark card, both under 4.5.
   * This panel painted every teal LABEL with it. On an audience that is largely
   * 60+ and partly visually impaired that is the wrong trade for a brand hue,
   * so labels use the design system's own AA pair instead — light primaryDark
   * #0F766E 5.02:1, dark primary #2DD4BF 8.78:1. The visibility ICON keeps
   * colors.tint: non-text contrast is a 3:1 bar and both themes clear it.
   */
  const tokens = getColors(!!settings.isDarkTheme)
  const actionTint = settings.isDarkTheme ? tokens.primary : tokens.primaryDark
  /** Colors (constants/theme) has no error token; the design system does. */
  const errorColor = tokens.error

  const canFind = canShow('find-people')
  const canRequests = canShow('connection-requests')

  const [mode, setMode] = React.useState<Mode>('find')
  /*
   * COS-1126 — "let others find me" moved off the body and onto an icon beside
   * the pills. Vishal: "add some icon, when I click on it a dropdown will open
   * with this message and then toggle it, and when it is enabled change that
   * colour to some colourful icon so that everyone is aware of that."
   *
   * The colour is the point: the switch is now one tap away instead of in
   * front of you, so the icon has to carry the state at a glance. It is also
   * why the icon is never ambiguous — a filled eye when on, a struck-through
   * eye when off, not one glyph in two tints.
   */
  const [showVisibility, setShowVisibility] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [requested, setRequested] = React.useState<Record<string, boolean>>({})

  /*
   * COS-1231 — the invite sheet's own fields.
   *
   * They live here, on the panel, because the sheet is a MODE rather than a
   * component with its own lifetime: a react-native Modal stacked inside this
   * one is the documented iOS 26.5 SIGABRT class, and a pushed route unmounts
   * the Supports modal, which is the bug COS-1124 fixed. Mode state also means
   * a half-typed invitation survives a tap on Requests and back.
   */
  const [inviteEmail, setInviteEmail] = React.useState('')
  const [inviteRelationship, setInviteRelationship] =
    React.useState<InviteRelationship | null>(null)
  const [inviteNote, setInviteNote] = React.useState('')
  /** Inline, under the field that caused it. Alert.alert renders a Modal. */
  const [inviteFieldError, setInviteFieldError] = React.useState<string | null>(null)
  const [inviteBanner, setInviteBanner] = React.useState<string | null>(null)
  /** The invitation screen 3 is confirming. Held so it can name the address. */
  const [sentInvite, setSentInvite] = React.useState<Invite | null>(null)

  const trimmed = query.trim()

  const resultsQ = useQuery({
    queryKey: ['directory-search', trimmed],
    queryFn: () => searchDirectory(trimmed),
    // Below the minimum we do not call at all, rather than calling and handling
    // a 400 — an error that flashes on the first keystroke of every search
    // trains people to ignore errors.
    enabled: canFind && trimmed.length >= MIN_QUERY,
    staleTime: 15_000,
  })

  const visibilityQ = useQuery({
    queryKey: ['social-visibility'],
    queryFn: fetchSocialVisibility,
    staleTime: 60_000,
    enabled: canFind,
  })

  /*
   * COS-1125 — suggestions are people in your region who asked to be
   * suggested. Fetched only while the search box is empty: the moment someone
   * types, they have told us what they are looking for, and a "you may know"
   * list underneath their own results is noise.
   */
  const suggestionsQ = useQuery({
    queryKey: ['social-suggestions'],
    queryFn: fetchSuggestions,
    staleTime: 60_000,
    // COS-1126 — no second switch. Suggestions follow discoverability, which
    // is the only consent there is now.
    enabled: canFind && visibilityQ.data?.discoverable === true,
  })

  const pendingQ = useQuery({
    queryKey: ['connections', 'pending-in'],
    queryFn: () => fetchConnections('pending-in'),
    staleTime: 15_000,
    enabled: canRequests,
  })

  /*
   * COS-1129 — requests you SENT.
   *
   * Vishal: "how do I check the account which I already requested?" Until now
   * a sent request vanished: the row disappeared from suggestions (correctly —
   * they are excluded) and the Connect button reverted to "Connect" because
   * the only record was component state, lost when the modal closed. The
   * server knew the whole time; nothing asked it.
   *
   * Fetched in BOTH modes, because it answers two questions: what can I cancel,
   * and which of these search results have I already written to.
   */
  const sentQ = useQuery({
    queryKey: ['connections', 'pending-out'],
    queryFn: () => fetchConnections('pending-out'),
    staleTime: 15_000,
    enabled: canFind || canRequests,
  })

  /*
   * COS-1231 — email invitations I have sent.
   *
   * Fetched on the same condition as sentQ, because it answers the same
   * question in the other half of the Requests screen: what did I already do,
   * and what can I take back. Withdrawn rows are excluded by the server and
   * 'expired' is DERIVED there on every read — never recomputed here, because
   * two clocks disagreeing about whether a link is dead is how a screen offers
   * Withdraw on something already gone.
   */
  const invitesQ = useQuery({
    queryKey: ['social-invites'],
    queryFn: fetchEmailInvites,
    staleTime: 15_000,
    enabled: canFind || canRequests,
  })

  /** Peers with a request already in flight, straight from the server. */
  const alreadyRequested = React.useMemo(
    () => new Set((sentQ.data ?? []).map((c) => c.peerId)),
    [sentQ.data],
  )

  const toggleDiscoverable = useMutation({
    mutationFn: (next: boolean) => setDiscoverability(next),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['social-visibility'] }),
  })


  const connect = useMutation({
    mutationFn: (userId: string) => requestConnection(userId),
    onSuccess: (_d, userId) => {
      setRequested((r) => ({ ...r, [userId]: true }))
      // So the Sent list and the button state agree without a reopen.
      void qc.invalidateQueries({ queryKey: ['connections', 'pending-out'] })
      void qc.invalidateQueries({ queryKey: ['social-suggestions'] })
    },
  })

  const cancel = useMutation({
    mutationFn: (peerId: string) => cancelConnection(peerId),
    onSuccess: (_d, peerId) => {
      // Drop the local optimistic flag too, or the row would still read
      // "Requested" after the request it refers to has gone.
      setRequested((r) => {
        const next = { ...r }
        delete next[peerId]
        return next
      })
      void qc.invalidateQueries({ queryKey: ['connections', 'pending-out'] })
      void qc.invalidateQueries({ queryKey: ['social-suggestions'] })
    },
  })

  /*
   * COS-1231 — send the invitation.
   *
   * `delivered` comes back from the transport and is carried into screen 3,
   * which NAMES the address. A Resend 429 or 5xx is swallowed server-side into
   * delivered:false with no retry, no backoff and no queue, so a confirmation
   * that assumed success would be the app stating something untrue to a patient
   * who will then wait for a reply that cannot come.
   */
  const sendInvite = useMutation({
    mutationFn: (input: { email: string; relationship: InviteRelationship; note?: string }) =>
      sendEmailInvite(input),
    onSuccess: (result) => {
      setSentInvite(result.invite)
      setInviteBanner(null)
      setMode('invite-sent')
      void qc.invalidateQueries({ queryKey: ['social-invites'] })
      // An address that already had an account also produces a normal in-app
      // request, so the sent list can change on this call too.
      void qc.invalidateQueries({ queryKey: ['connections', 'pending-out'] })
    },
    onError: (err: InviteError) => {
      /*
       * INVITE_ALREADY_PENDING carries the invitation that already exists, so
       * the patient is shown the one they sent rather than being told off and
       * left to go looking. This IS the "we won't email them again unless you
       * send a new invitation" promise, kept.
       */
      if (err.code === 'INVITE_ALREADY_PENDING' && err.existing) {
        setSentInvite(err.existing)
        setInviteBanner(null)
        setMode('invite-sent')
        void qc.invalidateQueries({ queryKey: ['social-invites'] })
        return
      }
      if (err.code === 'SELF_INVITE' || err.code === 'VALIDATION_ERROR') {
        setInviteFieldError(err.message)
        return
      }
      // The server's copy is written for a patient to read, so it is used as
      // given; the fallback is for a network failure, which has no code.
      setInviteBanner(err.message || "Couldn't send — try again.")
    },
  })

  const withdrawInvite = useMutation({
    mutationFn: (inviteId: string) => withdrawEmailInvite(inviteId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['social-invites'] }),
  })

  /* Both actions refresh the same keys, so the Inbox banner clears too. */
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['connections', 'pending-in'] })
    void qc.invalidateQueries({ queryKey: ['conversations'] })
  }
  const accept = useMutation({
    mutationFn: (peerId: string) => acceptConnection(peerId),
    onSuccess: refresh,
  })
  const decline = useMutation({
    mutationFn: (peerId: string) => declineConnection(peerId),
    onSuccess: refresh,
  })
  /*
   * Which peer is being answered, and how. Same reasoning as PersonRow's
   * `sending`: `accept.isPending` alone is true for every row while any one is
   * in flight, so answering one request froze the whole list and gave no sign
   * which one was working.
   */
  const answering = (peerId: string): 'accept' | 'decline' | null => {
    if (accept.isPending && accept.variables === peerId) return 'accept'
    if (decline.isPending && decline.variables === peerId) return 'decline'
    return null
  }

  if (!canFind && !canRequests) return null

  const pendingCount = pendingQ.data?.length ?? 0
  const discoverable = visibilityQ.data?.discoverable === true
  const sentCount = sentQ.data?.length ?? 0

  /*
   * COS-1231 — only invitations still in flight are listed, so the section is
   * about things the patient can still act on. 'claimed' rows have become
   * ordinary pending requests and already appear above; 'expired' rows have
   * nothing to withdraw. Both statuses come from the SERVER.
   */
  const openInvites = (invitesQ.data ?? []).filter((i) => i.status === 'invited')

  const startInvite = () => {
    setInviteFieldError(null)
    setInviteBanner(null)
    setMode('invite')
  }

  /*
   * Validation on SUBMIT, with Send left enabled.
   *
   * A greyed-out Send tells a patient nothing about what is missing, and
   * VoiceOver reads it as "dimmed" with no reason — on this audience that is a
   * support call. So the button stays live and names the one thing that is
   * wrong, WHERE it is wrong: a bad address under the address field, a missing
   * relationship in the banner above Send, because the chips are nowhere near
   * the email field's error slot.
   */
  const submitInvite = () => {
    setInviteBanner(null)
    if (!isValidEmailFormat(inviteEmail)) {
      // Caught before the request, because the server's 422 covers three
      // different mistakes in one sentence and does not say which was made.
      setInviteFieldError('That does not look like an email address.')
      return
    }
    setInviteFieldError(null)
    if (!inviteRelationship) {
      setInviteBanner('Please choose how you know them.')
      return
    }
    const note = inviteNote.trim()
    sendInvite.mutate({
      email: inviteEmail.trim(),
      relationship: inviteRelationship,
      // Trimmed and capped here as well as on the server: maxLength on an input
      // does not survive a paste on every platform.
      note: note ? note.slice(0, MAX_NOTE) : undefined,
    })
  }

  /** A date a patient reads, not an ISO string. */
  const dayLabel = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const ModeButton = ({
    id,
    icon,
    label,
    badge,
  }: {
    id: Mode
    icon: React.ComponentProps<typeof MaterialIcons>['name']
    label: string
    badge?: number
  }) => {
    const on = mode === id
    return (
      <Pressable
        onPress={() => setMode(id)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={badge ? `${label}, ${badge} waiting` : label}
        style={[
          styles.modeBtn,
          { borderColor: on ? colors.tint : colors.border, backgroundColor: on ? `${colors.tint}14` : 'transparent' },
        ]}
      >
        <MaterialIcons name={icon} size={fs(18)} color={on ? actionTint : colors.icon} />
        <Text
          style={{
            color: on ? actionTint : colors.subtext,
            fontSize: fs(13),
            fontWeight: fw(on ? 700 : 500) as TextStyle['fontWeight'],
            marginLeft: 6,
          }}
        >
          {label}
        </Text>
        {/* The count is the whole reason to look at this tab, so it is on the
            control itself rather than inside it. */}
        {badge ? (
          <View style={[styles.badge, { backgroundColor: colors.tint }]}>
            <Text style={{ color: '#fff', fontSize: fs(11), fontWeight: '700' }}>{badge}</Text>
          </View>
        ) : null}
      </Pressable>
    )
  }

  return (
    /*
     * COS-1231 — a ScrollView, which this panel has never had.
     *
     * modal.tsx renders it bare while every sibling branch of that ternary
     * wraps its content in one, so the sent list and a long set of search
     * results already ran off the bottom of the screen unreachably. Adding an
     * invite card, four chips, a 280-character note and a promise card on top
     * of an unscrollable column would have put Send below the fold on a phone
     * in accessibility mode. Same class as COS-1225.
     *
     * keyboardShouldPersistTaps so a chip or Send tapped with the keyboard up
     * registers on the first touch rather than only dismissing the keyboard —
     * the single most common "the button does nothing" report on a form.
     */
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.wrap}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/* Mode row — swaps the DATA below, never the screen. */}
      <View style={styles.modeRow}>
        {canFind && <ModeButton id="find" icon="person-search" label="Find people" />}
        {canRequests && (
          <ModeButton id="requests" icon="mark-email-unread" label="Requests" badge={pendingCount} />
        )}
        <View style={{ flex: 1 }} />
        {canFind && (
          <Pressable
            onPress={() => setShowVisibility((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showVisibility }}
            accessibilityLabel={
              discoverable
                ? 'You are findable by others. Change who can find you.'
                : 'You are not findable by others. Change who can find you.'
            }
            hitSlop={8}
            style={[
              styles.visBtn,
              {
                borderColor: discoverable ? colors.tint : colors.border,
                backgroundColor: discoverable ? `${colors.tint}1A` : 'transparent',
              },
            ]}
          >
            <MaterialIcons
              name={discoverable ? 'visibility' : 'visibility-off'}
              size={fs(20)}
              color={discoverable ? colors.tint : colors.icon}
            />
          </Pressable>
        )}
      </View>

      {showVisibility && canFind && (
        <View style={[styles.visPanel, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={{ flex: 1, paddingRight: Spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: fs(14), fontWeight: fw(600) as TextStyle['fontWeight'] }}>
              Let other people find me
            </Text>
            <Text style={{ color: colors.subtext, fontSize: fs(12), marginTop: 2, lineHeight: fs(17) }}>
              {discoverable
                ? 'People can find you by name, and you will see suggestions from your area.'
                : 'You can still search. Nobody can find you, and you will see no suggestions.'}
            </Text>
          </View>
          <Switch
            value={discoverable}
            onValueChange={(v) => toggleDiscoverable.mutate(v)}
            disabled={visibilityQ.isLoading || toggleDiscoverable.isPending}
            accessibilityLabel="Let other people find me"
          />
        </View>
      )}

      {mode === 'find' && canFind ? (
        <>
          <View style={[styles.searchRow, { borderColor: colors.border }]}>
            <MaterialIcons name="search" size={fs(20)} color={colors.icon} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name"
              placeholderTextColor={colors.subtext}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search for people by name"
              style={{ flex: 1, marginLeft: Spacing.sm, color: colors.text, fontSize: fs(15), paddingVertical: 8 }}
            />
            {trimmed.length > 0 && (
              <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
                <MaterialIcons name="close" size={fs(18)} color={colors.icon} />
              </Pressable>
            )}
          </View>

          {/*
            The switch belongs beside the search, not on another screen: finding
            and being findable are the same decision seen from two sides, and
            someone searching is exactly who is wondering whether they show up.
          */}
          {trimmed.length < MIN_QUERY ? (
            <>
              <Text style={[styles.hint, { color: colors.subtext, fontSize: fs(13), lineHeight: fs(19) }]}>
                Type a name to search. Only people who have turned on “Let others find me”
                appear here.
              </Text>
              {/*
                Suggestions sit BELOW the prompt, and only while the box is
                empty. The moment someone types they have said what they are
                looking for, and a "you may know" list under their own results
                is noise.
              */}
              {discoverable && (suggestionsQ.data?.length ?? 0) > 0 && (
                <>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: fs(13),
                      fontWeight: fw(700) as TextStyle['fontWeight'],
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      marginTop: Spacing.sm,
                    }}
                  >
                    People in your area
                  </Text>
                  {(suggestionsQ.data ?? []).map((item: DirectoryEntry) => (
                    <PersonRow
                      key={`sug-${item.userId}`}
                      item={item}
                      colors={colors}
                      actionTint={actionTint}
                      fs={fs}
                      requested={requested[item.userId] === true || alreadyRequested.has(item.userId)}
                      sending={connect.isPending && connect.variables === item.userId}
                      onConnect={() => connect.mutate(item.userId)}
                    />
                  ))}
                </>
              )}
            </>
          ) : resultsQ.isLoading ? (
            <ActivityIndicator style={{ marginTop: Spacing.md }} color={colors.tint} />
          ) : (resultsQ.data?.length ?? 0) === 0 ? (
            <Text style={[styles.hint, { color: colors.subtext, fontSize: fs(13), lineHeight: fs(19) }]}>
              Nobody found. They may not have turned on “Let others find me”.
            </Text>
          ) : (
            (resultsQ.data ?? []).map((item: DirectoryEntry) => (
              <PersonRow
                key={item.userId}
                item={item}
                colors={colors}
                actionTint={actionTint}
                fs={fs}
                requested={requested[item.userId] === true || alreadyRequested.has(item.userId)}
                sending={connect.isPending && connect.variables === item.userId}
                onConnect={() => connect.mutate(item.userId)}
              />
            ))
          )}

          {/*
            COS-1231 SCREEN 1 — the way in for someone who is not here yet.

            It sits at the FOOT of find mode on purpose: directory search is the
            answer when the person already has an account, and this is the next
            thing you need when it comes back "Nobody found". Above the results
            it would read as the primary action and send invitations to people
            who are already reachable.

            The second sentence is the whole consent model in one line, and it
            is here rather than only inside the sheet because this is the screen
            where the patient decides whether to start at all.
          */}
          <Pressable
            onPress={startInvite}
            accessibilityRole="button"
            accessibilityLabel="Invite someone by email"
            accessibilityHint="Opens a form to send one email invitation"
            style={[styles.inviteCard, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <MaterialIcons name="mail-outline" size={fs(22)} color={actionTint} />
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fs(15),
                  fontWeight: fw(700) as TextStyle['fontWeight'],
                }}
              >
                Not on Circle Support yet?
              </Text>
              <Text style={{ color: colors.text, fontSize: fs(14), marginTop: 2, lineHeight: fs(20) }}>
                Invite them by email.
              </Text>
              <Text
                style={{ color: colors.subtext, fontSize: fs(13), marginTop: 4, lineHeight: fs(19) }}
              >
                They choose whether to join — nothing is shared until they accept.
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={fs(22)} color={colors.icon} />
          </Pressable>
        </>
      ) : null}

      {/*
        COS-1231 SCREEN 2 — the invite sheet, as a MODE.

        Not a react-native Modal: the Supports modal is itself
        presentation:'modal', and stacked transparent Modals are the documented
        iOS 26.5 SIGABRT class. Not a pushed route either: leaving the Supports
        modal unmounts it, which is the bug COS-1124 fixed. Vishal: "whatever we
        need to do is within the same screen."
      */}
      {mode === 'invite' && canFind ? (
        <>
          <Pressable
            onPress={() => setMode('find')}
            accessibilityRole="button"
            accessibilityLabel="Back to find people"
            hitSlop={8}
            style={styles.backRow}
          >
            <MaterialIcons name="arrow-back" size={fs(20)} color={actionTint} />
            <Text
              style={{
                color: actionTint,
                fontSize: fs(14),
                marginLeft: 6,
                fontWeight: fw(600) as TextStyle['fontWeight'],
              }}
            >
              Back
            </Text>
          </Pressable>

          <Text
            style={{
              color: colors.text,
              fontSize: fs(18),
              fontWeight: fw(700) as TextStyle['fontWeight'],
            }}
            accessibilityRole="header"
          >
            Invite someone by email
          </Text>

          {/*
            AccessibleInput, which has existed with zero importers since it was
            written: label + error + hint, real primitives, a touch target that
            already clears 44pt. The email field is its first consumer.
          */}
          <AccessibleInput
            label="Their email address"
            value={inviteEmail}
            onChangeText={(t) => {
              setInviteEmail(t)
              if (inviteFieldError) setInviteFieldError(null)
            }}
            error={inviteFieldError ?? undefined}
            hint="We send one email to this address and nothing else"
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={254}
            returnKeyType="done"
          />

          <Text
            style={{
              color: colors.text,
              fontSize: fs(14),
              fontWeight: fw(600) as TextStyle['fontWeight'],
              marginTop: Spacing.xs,
            }}
          >
            How do you know them?
          </Text>
          {/*
            Chips rather than a picker: four options is few enough to show all
            of them, and a dropdown on this audience is a tap, a scroll and a
            tap. Styling copied from PersonalGoalSheet's selection row, with
            this panel's own tint alpha so it matches the mode pills beside it.
          */}
          <View style={styles.chipRow}>
            {RELATIONSHIPS.map((r) => {
              const on = inviteRelationship === r.key
              return (
                <Pressable
                  key={r.key}
                  onPress={() => {
                    setInviteRelationship(r.key)
                    if (inviteFieldError) setInviteFieldError(null)
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`How you know them: ${r.label}`}
                  style={[
                    styles.chip,
                    {
                      borderColor: on ? colors.tint : colors.border,
                      backgroundColor: on ? `${colors.tint}14` : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: on ? actionTint : colors.text,
                      fontSize: fs(14),
                      fontWeight: fw(on ? 700 : 500) as TextStyle['fontWeight'],
                    }}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.noteLabelRow}>
            <Text
              style={{
                color: colors.text,
                fontSize: fs(14),
                fontWeight: fw(600) as TextStyle['fontWeight'],
                flex: 1,
              }}
            >
              Add a note (optional)
            </Text>
            {/*
              Live, and announced: the cap is enforced server-side too, so a
              patient who pastes a paragraph needs to see it being cut off here
              rather than discover it in the mail their daughter receives.
            */}
            <Text
              style={{ color: colors.subtext, fontSize: fs(13) }}
              accessibilityLabel={`${inviteNote.length} of ${MAX_NOTE} characters used`}
            >
              {`${inviteNote.length}/${MAX_NOTE}`}
            </Text>
          </View>
          <TextInput
            value={inviteNote}
            onChangeText={(t) => setInviteNote(t.slice(0, MAX_NOTE))}
            maxLength={MAX_NOTE}
            multiline
            placeholder="Hi Sarah, I would like you in my care circle."
            placeholderTextColor={colors.subtext}
            accessibilityLabel="An optional note to include in the invitation"
            style={[
              styles.noteInput,
              {
                borderColor: colors.border,
                color: colors.text,
                backgroundColor: colors.background,
                fontSize: fs(15),
                minHeight: Math.max(88, fs(15) * 4),
              },
            ]}
          />

          {/*
            The promise card. It is written in the app as well as in the email
            because the patient is being asked to hand us someone else's address
            — the person who needs to know what we will do with it is reading
            this screen, not the one that arrives later.
          */}
          <View
            style={[styles.promiseCard, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: fs(14),
                fontWeight: fw(700) as TextStyle['fontWeight'],
              }}
            >
              One email, and that&apos;s it.
            </Text>
            <Text style={{ color: colors.text, fontSize: fs(13), marginTop: 4, lineHeight: fs(19) }}>
              No marketing, no reminders. We will not email them again unless you send a new
              invitation. None of your health information is included.
            </Text>
          </View>

          {inviteBanner ? (
            // The failure affordance from retake-snooze-sheet: an inline banner
            // and a button that re-enables. Alert.alert renders a Modal.
            <View style={[styles.banner, { borderColor: errorColor, backgroundColor: colors.card }]}>
              <MaterialIcons name="error-outline" size={fs(18)} color={errorColor} />
              <Text
                style={{ color: errorColor, fontSize: fs(13), flex: 1, marginLeft: 8 }}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {inviteBanner}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={submitInvite}
            disabled={sendInvite.isPending}
            accessibilityRole="button"
            accessibilityState={{ disabled: sendInvite.isPending, busy: sendInvite.isPending }}
            accessibilityLabel="Send invitation"
            accessibilityHint="Sends one email to the address above"
            style={[
              styles.sendBtn,
              { backgroundColor: actionTint, opacity: sendInvite.isPending ? 0.5 : 1 },
            ]}
          >
            {sendInvite.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text
                style={{
                  color: '#fff',
                  fontSize: fs(16),
                  fontWeight: fw(700) as TextStyle['fontWeight'],
                }}
              >
                Send invitation
              </Text>
            )}
          </Pressable>
        </>
      ) : null}

      {/*
        COS-1231 SCREEN 3 — confirmation.

        It NAMES the address, so it has to be honest about whether the mail
        actually left: `delivered` comes from the transport, and a Resend 429 or
        5xx is swallowed server-side into delivered:false with no retry and no
        queue. Telling a patient their daughter has been emailed when she has
        not is worse than telling them to try again.
      */}
      {mode === 'invite-sent' && canFind && sentInvite ? (
        <>
          <View style={styles.sentHeader}>
            <MaterialIcons
              name={sentInvite.delivered ? 'mark-email-read' : 'error-outline'}
              size={fs(26)}
              color={sentInvite.delivered ? actionTint : errorColor}
            />
            <Text
              style={{
                color: colors.text,
                fontSize: fs(18),
                fontWeight: fw(700) as TextStyle['fontWeight'],
                marginLeft: Spacing.sm,
                flex: 1,
              }}
              accessibilityRole="header"
            >
              {sentInvite.delivered ? 'Invitation sent' : 'We could not send that email'}
            </Text>
          </View>

          <Text style={{ color: colors.text, fontSize: fs(15), lineHeight: fs(21) }}>
            {sentInvite.delivered
              ? `We emailed ${sentInvite.email}.`
              : `${sentInvite.email} has not been emailed. Your invitation is saved — try sending it again from Requests.`}
          </Text>

          {sentInvite.delivered ? (
            <>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fs(14),
                  fontWeight: fw(700) as TextStyle['fontWeight'],
                  marginTop: Spacing.sm,
                }}
              >
                What happens next
              </Text>
              {[
                `Their link works for 14 days, until ${dayLabel(sentInvite.expiresAt)}.`,
                'If they join, they appear under Requests for you to confirm.',
                'You choose what they can see later, and separately.',
              ].map((step, i) => (
                <View key={step} style={styles.stepRow}>
                  <Text
                    style={{
                      color: actionTint,
                      fontSize: fs(14),
                      fontWeight: fw(700) as TextStyle['fontWeight'],
                      width: fs(20),
                    }}
                  >
                    {`${i + 1}.`}
                  </Text>
                  <Text
                    style={{ color: colors.text, fontSize: fs(14), flex: 1, lineHeight: fs(20) }}
                  >
                    {step}
                  </Text>
                </View>
              ))}
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: fs(13),
                  marginTop: Spacing.sm,
                  lineHeight: fs(19),
                }}
              >
                We won&apos;t email them again unless you send a new invitation.
              </Text>
            </>
          ) : null}

          <Pressable
            onPress={() => {
              // Cleared on the way out, not on the way in: the fields have to
              // survive a mistyped address and a 429 so nothing is retyped.
              setInviteEmail('')
              setInviteRelationship(null)
              setInviteNote('')
              setSentInvite(null)
              setInviteFieldError(null)
              setInviteBanner(null)
              setMode('find')
            }}
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={[styles.sendBtn, { backgroundColor: actionTint }]}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: fs(16),
                fontWeight: fw(700) as TextStyle['fontWeight'],
              }}
            >
              Done
            </Text>
          </Pressable>
        </>
      ) : null}

      {mode === 'requests' && canRequests ? (
        pendingQ.isLoading ? (
          <ActivityIndicator style={{ marginTop: Spacing.md }} color={colors.tint} />
        ) : pendingCount === 0 && sentCount === 0 && openInvites.length === 0 ? (
          // COS-1231 — email invitations count as "sent". Without them in this
          // condition the panel claimed nothing was sent while listing an
          // invitation directly underneath.
          <Text style={[styles.hint, { color: colors.subtext, fontSize: fs(13), lineHeight: fs(19) }]}>
            No requests waiting, and none sent.
          </Text>
        ) : (
          (pendingQ.data ?? []).map((item: Connection) => (
            <View key={item.peerId} style={[styles.row, { borderColor: colors.border }]}>
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.border }]}>
                <MaterialIcons name="person" size={fs(20)} color={colors.icon} />
              </View>
              <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: fs(15) }} numberOfLines={1}>
                  Someone would like to connect
                </Text>
                <Text style={{ color: colors.subtext, fontSize: fs(11), marginTop: 2 }}>
                  {new Date(item.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <Pressable
                onPress={() => decline.mutate(item.peerId)}
                disabled={answering(item.peerId) !== null}
                accessibilityRole="button"
                accessibilityState={{ busy: answering(item.peerId) === 'decline' }}
                accessibilityLabel="Decline this request"
                style={[
                  styles.actionBtn,
                  { borderColor: colors.border, opacity: answering(item.peerId) ? 0.5 : 1 },
                ]}
              >
                {answering(item.peerId) === 'decline' ? (
                  <ActivityIndicator size="small" color={colors.subtext} />
                ) : (
                  <Text style={{ color: colors.subtext, fontSize: fs(13) }}>Decline</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => accept.mutate(item.peerId)}
                disabled={answering(item.peerId) !== null}
                accessibilityRole="button"
                accessibilityState={{ busy: answering(item.peerId) === 'accept' }}
                accessibilityLabel="Accept this request"
                style={[
                  styles.actionBtn,
                  { borderColor: colors.tint as string, opacity: answering(item.peerId) ? 0.5 : 1 },
                ]}
              >
                {answering(item.peerId) === 'accept' ? (
                  <ActivityIndicator size="small" color={colors.tint} />
                ) : (
                  <Text style={{ color: actionTint, fontSize: fs(13), fontWeight: '600' }}>Accept</Text>
                )}
              </Pressable>
            </View>
          ))
        )
      ) : null}

      {/*
        COS-1129 — requests you SENT, so they can be withdrawn.
        Rendered under the incoming list rather than as a third mode: they are
        both "requests", and a tab you have to discover to find out what you
        already did is the problem being fixed.
      */}
      {mode === 'requests' && canRequests && sentCount > 0 && (
        <>
          <Text
            style={{
              color: colors.subtext,
              fontSize: fs(13),
              fontWeight: fw(700) as TextStyle['fontWeight'],
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              marginTop: Spacing.md,
            }}
          >
            {`Sent by you (${sentCount})`}
          </Text>
          {(sentQ.data ?? []).map((item: Connection) => {
            const busyRow = cancel.isPending && cancel.variables === item.peerId
            return (
              <View key={`sent-${item.peerId}`} style={[styles.row, { borderColor: colors.border }]}>
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.border }]}>
                  <MaterialIcons name="schedule" size={fs(18)} color={colors.icon} />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Text style={{ color: colors.text, fontSize: fs(15) }} numberOfLines={1}>
                    {item.displayName || 'Waiting for a reply'}
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: fs(11), marginTop: 2 }}>
                    {`Sent ${new Date(item.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => cancel.mutate(item.peerId)}
                  disabled={busyRow}
                  accessibilityRole="button"
                  accessibilityState={{ busy: busyRow }}
                  accessibilityLabel="Cancel this request"
                  style={[styles.actionBtn, { borderColor: colors.border, opacity: busyRow ? 0.5 : 1 }]}
                >
                  {busyRow ? (
                    <ActivityIndicator size="small" color={colors.subtext} />
                  ) : (
                    <Text style={{ color: colors.subtext, fontSize: fs(13) }}>Cancel</Text>
                  )}
                </Pressable>
              </View>
            )
          })}
        </>
      )}

      {/*
        COS-1231 SCREEN 4 — "Invitations you sent", beside the in-app ones.

        A SECOND section rather than a merged list, because the two rows are not
        the same thing and must not look it: one is a request a real account has
        received and can answer today, the other is an email to an address that
        may belong to nobody. Merging them would make an email to a typo look
        like a person who is thinking about it.

        The rows are built inline here rather than through the shared person-row
        component, which takes a DirectoryEntry with a userId and a photo — an
        invitee has neither.
      */}
      {mode === 'requests' && canRequests && openInvites.length > 0 && (
        <>
          <Text
            style={{
              color: colors.subtext,
              fontSize: fs(13),
              fontWeight: fw(700) as TextStyle['fontWeight'],
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              marginTop: Spacing.md,
            }}
          >
            {`Invitations you sent (${openInvites.length})`}
          </Text>
          {openInvites.map((item: Invite) => {
            const busyRow = withdrawInvite.isPending && withdrawInvite.variables === item.inviteId
            return (
              <View
                key={`invite-${item.inviteId}`}
                style={[styles.row, { borderColor: colors.border }]}
              >
                <View
                  style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.border }]}
                >
                  <MaterialIcons name="mail-outline" size={fs(18)} color={colors.icon} />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Text style={{ color: colors.text, fontSize: fs(15) }} numberOfLines={1}>
                    {item.email}
                  </Text>
                  <View style={styles.pillRow}>
                    {/*
                      The pill says INVITED, not "pending" or "sent": it is the
                      server's own status word, so what the screen says and what
                      the row is cannot drift apart.
                    */}
                    <View style={[styles.pill, { borderColor: colors.border }]}>
                      <Text
                        style={{
                          color: colors.subtext,
                          fontSize: fs(11),
                          fontWeight: fw(700) as TextStyle['fontWeight'],
                          letterSpacing: 0.3,
                        }}
                      >
                        INVITED
                      </Text>
                    </View>
                    <Text style={{ color: colors.subtext, fontSize: fs(11) }}>
                      {`Expires ${dayLabel(item.expiresAt)}`}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => withdrawInvite.mutate(item.inviteId)}
                  disabled={busyRow}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busyRow, busy: busyRow }}
                  accessibilityLabel={`Withdraw the invitation to ${item.email}`}
                  style={[
                    styles.actionBtn,
                    { borderColor: colors.border, opacity: busyRow ? 0.5 : 1 },
                  ]}
                >
                  {busyRow ? (
                    <ActivityIndicator size="small" color={colors.subtext} />
                  ) : (
                    <Text style={{ color: colors.subtext, fontSize: fs(13) }}>Withdraw</Text>
                  )}
                </Pressable>
              </View>
            )
          })}
          <Text
            style={{ color: colors.subtext, fontSize: fs(12), lineHeight: fs(18), marginTop: 4 }}
          >
            Email invitations expire after 14 days. We don&apos;t send reminders.
          </Text>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  wrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    // Room under the last control so Send and Withdraw are never flush against
    // the bottom edge of the sheet.
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  modeRow: { flexDirection: 'row', gap: Spacing.sm },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badge: {
    marginLeft: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  visBtn: {
    borderWidth: 1,
    borderRadius: Radii.full,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: Spacing.sm,
  },
  // lineHeight is set at each use site from fs(), not frozen at 19 here: with the
  // breakpoint step a 13pt hint renders near 18pt on a tablet and a fixed 19
  // clips the descenders on exactly the device this epic widened the type for.
  hint: { paddingVertical: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  /* ── COS-1231 ───────────────────────────────────────────────────── */
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: Spacing.sm + 4,
    marginTop: Spacing.sm,
    // 44pt even before the type scales: this is the entry point to the whole
    // feature on an audience that is largely 60+.
    minHeight: TouchTargets.minimum,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TouchTargets.minimum,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: Radii.full,
    paddingHorizontal: 14,
    // A chip is a real target, not a label: 44pt tall and wide enough that four
    // of them still wrap rather than shrink.
    minHeight: TouchTargets.minimum,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteLabelRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: Spacing.xs },
  noteInput: {
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    textAlignVertical: 'top',
  },
  promiseCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: Spacing.sm + 4,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.sm,
  },
  sendBtn: {
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TouchTargets.button,
    marginTop: Spacing.xs,
  },
  sentHeader: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 3 },
  pill: {
    borderWidth: 1,
    borderRadius: Radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    // Holds its size when the label swaps for a spinner, so the row cannot
    // reflow under the finger that just tapped it.
    minWidth: 86,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default SocialPanel
