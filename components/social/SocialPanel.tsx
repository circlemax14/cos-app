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
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  acceptConnection,
  declineConnection,
  fetchConnections,
  fetchSocialVisibility,
  fetchSuggestions,
  requestConnection,
  searchDirectory,
  setDiscoverability,
  type Connection,
  type DirectoryEntry,
} from '@/services/api/conversations'
import { Colors } from '@/constants/theme'
import { Spacing, Radii } from '@/constants/design-system'
import { useAccessibility } from '@/stores/accessibility-store'
import { useCanShowScreen } from '@/hooks/use-feature-permissions'

/** Matches MIN_QUERY_LENGTH on the server. Below this we do not even ask. */
const MIN_QUERY = 2

type Mode = 'find' | 'requests'

/** One person, in search results or in suggestions — identical either way, so
 *  a suggestion can never be made to look more endorsed than a search hit. */
function PersonRow({
  item,
  colors,
  fs,
  requested,
  sending,
  onConnect,
}: {
  item: DirectoryEntry
  colors: (typeof Colors)['light']
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
          <ActivityIndicator size="small" color={colors.tint} />
        ) : (
          <Text style={{ color: colors.tint, fontSize: fs(13), fontWeight: '600' }}>
            {requested ? 'Requested' : 'Connect'}
          </Text>
        )}
      </Pressable>
    </View>
  )
}

export function SocialPanel(): React.JSX.Element | null {
  const { settings, getScaledFontSize: fs, getScaledFontWeight: fw } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const qc = useQueryClient()
  const canShow = useCanShowScreen()

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

  const toggleDiscoverable = useMutation({
    mutationFn: (next: boolean) => setDiscoverability(next),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['social-visibility'] }),
  })


  const connect = useMutation({
    mutationFn: (userId: string) => requestConnection(userId),
    onSuccess: (_d, userId) => setRequested((r) => ({ ...r, [userId]: true })),
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
        <MaterialIcons name={icon} size={fs(18)} color={on ? colors.tint : colors.icon} />
        <Text
          style={{
            color: on ? colors.tint : colors.subtext,
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
    <View style={styles.wrap}>
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
              <Text style={[styles.hint, { color: colors.subtext, fontSize: fs(13) }]}>
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
                      fs={fs}
                      requested={requested[item.userId] === true}
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
            <Text style={[styles.hint, { color: colors.subtext, fontSize: fs(13) }]}>
              Nobody found. They may not have turned on “Let others find me”.
            </Text>
          ) : (
            (resultsQ.data ?? []).map((item: DirectoryEntry) => (
              <PersonRow
                key={item.userId}
                item={item}
                colors={colors}
                fs={fs}
                requested={requested[item.userId] === true}
                sending={connect.isPending && connect.variables === item.userId}
                onConnect={() => connect.mutate(item.userId)}
              />
            ))
          )}
        </>
      ) : null}

      {mode === 'requests' && canRequests ? (
        pendingQ.isLoading ? (
          <ActivityIndicator style={{ marginTop: Spacing.md }} color={colors.tint} />
        ) : pendingCount === 0 ? (
          <Text style={[styles.hint, { color: colors.subtext, fontSize: fs(13) }]}>
            No requests waiting.
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
                  <Text style={{ color: colors.tint, fontSize: fs(13), fontWeight: '600' }}>Accept</Text>
                )}
              </Pressable>
            </View>
          ))
        )
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm },
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
  hint: { paddingVertical: Spacing.md, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
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
