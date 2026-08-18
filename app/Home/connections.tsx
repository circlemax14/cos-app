/**
 * People — patient-to-patient connections (SCRUM-686).
 *
 * Vishal 2026-08-15: "we can search other patients and then send a connect
 * request ... once other approves then that user will be available in social
 * and then patient can add them in circle, while initiating a connect request
 * ken wants them to come under different tabs".
 *
 * ─── THE ORDER OF THIS SCREEN IS THE ARGUMENT ───────────────────────────────
 *
 * Requests waiting on YOU come first, because they are the only thing here with
 * someone else waiting at the other end. Then your own visibility, because it
 * is the thing that has to be true before search works in either direction.
 * Then finding someone. Then the people you are already connected to.
 *
 * ─── VISIBILITY IS THE FIRST THING, NOT A SETTING BURIED ELSEWHERE ──────────
 *
 * Being findable in a health app reveals that you use one. That is a real
 * disclosure, and a patient should meet the choice at the moment they meet the
 * feature — not discover later that a toggle they never saw made them
 * searchable. It ships OFF and the copy says plainly what turning it on means.
 *
 * ─── SEARCH IS EXACT EMAIL, AND THE SCREEN SAYS SO ──────────────────────────
 *
 * The backend refuses anything else. Rather than let someone type a name and
 * get a blank, the field states the rule up front. A "no result" here is also
 * deliberately ambiguous — it cannot tell you whether the person has no account
 * or simply is not discoverable, because distinguishing those would leak
 * membership. The copy does not pretend otherwise.
 *
 * iOS 26.5 envelope: View / Text / Pressable / Switch / TextInput / ScrollView /
 * MaterialIcons / StyleSheet. No Modal, no Animated.
 */

import React from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  PSYCHOLOGICAL_CATEGORIES,
  SOCIAL_CATEGORIES,
  type Connection,
  type DiscoverableProfile,
  acceptConnection,
  addToCircle,
  getDiscoverability,
  isFeatureOff,
  listConnections,
  removeConnection,
  removeFromCircle,
  requestConnection,
  searchByEmail,
  setDiscoverability,
  updateCategory,
} from '@/services/api/connections'

const ALL_CATEGORIES = [...SOCIAL_CATEGORIES, ...PSYCHOLOGICAL_CATEGORIES]

function labelFor(categoryId: string): string {
  return ALL_CATEGORIES.find((c) => c.id === categoryId)?.label ?? 'Connection'
}

function ConnectionsInner({ embedded = false }: { embedded?: boolean }): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const fs = getScaledFontSize
  const fw = getScaledFontWeight
  const qc = useQueryClient()

  const [email, setEmail] = React.useState('')
  const [searched, setSearched] = React.useState(false)
  const [found, setFound] = React.useState<DiscoverableProfile | null>(null)
  const [category, setCategory] = React.useState<string>('friend')
  const [notice, setNotice] = React.useState<string | null>(null)
  // Which connected peer, if any, has its category picker open (peerId).
  const [editingCategory, setEditingCategory] = React.useState<string | null>(null)

  const discoverability = useQuery({
    queryKey: ['discoverability'],
    queryFn: getDiscoverability,
    retry: false,
  })

  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: listConnections,
    retry: false,
  })

  const featureOff =
    isFeatureOff(discoverability.error) || isFeatureOff(connections.error)

  const toggleDiscoverable = useMutation({
    mutationFn: (v: boolean) => setDiscoverability(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discoverability'] }),
  })

  const search = useMutation({
    mutationFn: (e: string) => searchByEmail(e),
    onSuccess: (result) => {
      setFound(result)
      setSearched(true)
    },
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['connections'] })
  }

  const sendRequest = useMutation({
    mutationFn: (peerId: string) => requestConnection(peerId, category),
    onSuccess: () => {
      setNotice('Request sent.')
      setFound(null)
      setSearched(false)
      setEmail('')
      invalidate()
    },
    onError: () => setNotice('Could not send that request.'),
  })

  const accept = useMutation({
    mutationFn: (peerId: string) => acceptConnection(peerId),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (peerId: string) => removeConnection(peerId),
    onSuccess: invalidate,
  })

  // Re-file an accepted connection under a different sub-category (SCRUM-691).
  const recategorize = useMutation({
    mutationFn: (v: { peerId: string; category: string }) => updateCategory(v.peerId, v.category),
    onSuccess: () => {
      setEditingCategory(null)
      invalidate()
    },
  })

  // Add / remove an accepted connection from my circle (SCRUM-692).
  const addCircle = useMutation({
    mutationFn: (peerId: string) => addToCircle(peerId),
    onSuccess: invalidate,
  })
  const removeCircle = useMutation({
    mutationFn: (peerId: string) => removeFromCircle(peerId),
    onSuccess: invalidate,
  })

  const all = connections.data ?? []
  const incoming = all.filter((c) => c.status === 'pending_incoming')
  const outgoing = all.filter((c) => c.status === 'pending_outgoing')
  const accepted = all.filter((c) => c.status === 'accepted')
  // "Add them in circle" is the culmination of Ken's flow — circle members
  // graduate into their own section; the rest stay under "Connected".
  const circle = accepted.filter((c) => c.inCircle)
  const others = accepted.filter((c) => !c.inCircle)

  const section = (t: string) => (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.subtext,
        fontSize: fs(11),
        fontWeight: fw(700) as never,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginTop: 22,
        marginBottom: 8,
      }}
    >
      {t}
    </Text>
  )

  const card = (children: React.ReactNode, key?: string) => (
    <View
      key={key}
      style={[styles.card, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border as string }]}
    >
      {children}
    </View>
  )

  // An accepted connection: its category (tap "Change" to re-file it), an
  // add/remove-circle toggle, and disconnect. Used by both the "Your circle"
  // and "Connected" sections so the two stay identical.
  const connectedCard = (c: Connection) => {
    const inCircle = c.inCircle === true
    const circleBusy = addCircle.isPending || removeCircle.isPending
    return card(
      <View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={{ color: colors.text, fontSize: fs(14), fontWeight: fw(600) as never }}>
              {labelFor(c.category)}
            </Text>
          </View>
          <Pressable
            onPress={() => remove.mutate(c.peerId)}
            style={styles.plainBtn}
            accessibilityRole="button"
            accessibilityLabel="Disconnect"
          >
            <Text style={{ color: colors.subtext, fontSize: fs(13) }}>Disconnect</Text>
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => (inCircle ? removeCircle.mutate(c.peerId) : addCircle.mutate(c.peerId))}
            disabled={circleBusy}
            style={[
              styles.pill,
              {
                borderColor: inCircle ? (colors.tint as string) : (colors.border as string),
                backgroundColor: inCircle ? (colors.tint as string) + '1F' : 'transparent',
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: inCircle }}
            accessibilityLabel={inCircle ? 'Remove from your circle' : 'Add to your circle'}
          >
            <MaterialIcons
              name={inCircle ? 'check-circle' : 'add-circle-outline'}
              size={fs(16)}
              color={inCircle ? (colors.tint as string) : (colors.subtext as string)}
            />
            <Text
              style={{
                color: inCircle ? (colors.tint as string) : colors.text,
                fontSize: fs(12),
                fontWeight: fw(inCircle ? 700 : 500) as never,
              }}
            >
              {inCircle ? 'In your circle' : 'Add to circle'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setEditingCategory(editingCategory === c.peerId ? null : c.peerId)}
            style={[styles.pill, { borderColor: colors.border as string }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: editingCategory === c.peerId }}
            accessibilityLabel="Change category"
          >
            <MaterialIcons name="edit" size={fs(15)} color={colors.subtext as string} />
            <Text style={{ color: colors.text, fontSize: fs(12) }}>Change</Text>
          </Pressable>
        </View>

        {editingCategory === c.peerId ? (
          <View style={[styles.chips, { marginTop: 10 }]}>
            {ALL_CATEGORIES.map((cat) => {
              const on = cat.id === c.category
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => recategorize.mutate({ peerId: c.peerId, category: cat.id })}
                  disabled={recategorize.isPending}
                  style={[
                    styles.chip,
                    {
                      borderColor: on ? (colors.tint as string) : (colors.border as string),
                      backgroundColor: on ? (colors.tint as string) + '1F' : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    style={{
                      color: on ? (colors.tint as string) : colors.text,
                      fontSize: fs(12),
                      fontWeight: fw(on ? 700 : 500) as never,
                    }}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </View>,
      c.peerId,
    )
  }

  const body = (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {embedded ? null : (
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              style={styles.back}
            >
              <MaterialIcons name="arrow-back" size={fs(24)} color={colors.text as string} />
            </Pressable>
            <Text style={{ flex: 1, color: colors.text, fontSize: fs(22), fontWeight: fw(700) as never }}>
              People
            </Text>
          </View>
        )}

        {featureOff ? (
          <Text style={{ color: colors.subtext, fontSize: fs(13), lineHeight: 20, marginTop: 20 }}>
            Connecting with other people isn&apos;t switched on for your account yet.
          </Text>
        ) : (
          <>
            {/* Someone is waiting at the other end of these. They go first. */}
            {incoming.length > 0 ? (
              <>
                {section('Waiting for you')}
                {incoming.map((c) =>
                  card(
                    <View style={styles.row}>
                      <View style={styles.rowText}>
                        <Text style={{ color: colors.text, fontSize: fs(14), fontWeight: fw(600) as never }}>
                          Someone wants to connect
                        </Text>
                        <Text style={{ color: colors.subtext, fontSize: fs(12), marginTop: 2 }}>
                          As {labelFor(c.category).toLowerCase()}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => accept.mutate(c.peerId)}
                        style={[styles.smallBtn, { backgroundColor: colors.tint as string }]}
                        accessibilityRole="button"
                        accessibilityLabel="Accept this request"
                      >
                        <Text style={{ color: '#fff', fontSize: fs(13), fontWeight: fw(700) as never }}>
                          Accept
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => remove.mutate(c.peerId)}
                        style={styles.plainBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Decline this request"
                      >
                        <Text style={{ color: colors.subtext, fontSize: fs(13) }}>Decline</Text>
                      </Pressable>
                    </View>,
                    c.peerId,
                  ),
                )}
              </>
            ) : null}

            {/* Before search can work in either direction. */}
            {section('Your visibility')}
            {card(
              <View>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={{ color: colors.text, fontSize: fs(14), fontWeight: fw(600) as never }}>
                      Let people find me
                    </Text>
                  </View>
                  <Switch
                    value={discoverability.data === true}
                    onValueChange={(v) => toggleDiscoverable.mutate(v)}
                    disabled={discoverability.isLoading || toggleDiscoverable.isPending}
                    accessibilityLabel="Let people find me by email"
                  />
                </View>
                <Text style={{ color: colors.subtext, fontSize: fs(12), lineHeight: 18, marginTop: 6 }}>
                  When this is on, someone who already knows your email address can
                  find you here and send a connect request. Nobody can search by
                  name, and nobody can see any of your health information. It is off
                  until you turn it on.
                </Text>
              </View>,
            )}

            {section('Find someone')}
            {card(
              <View>
                <TextInput
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t)
                    setSearched(false)
                    setNotice(null)
                  }}
                  placeholder="Their full email address"
                  placeholderTextColor={colors.subtext as string}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  style={[
                    styles.input,
                    { color: colors.text, borderColor: colors.border as string, fontSize: fs(14) },
                  ]}
                  accessibilityLabel="Email address to search for"
                />
                <Text style={{ color: colors.subtext, fontSize: fs(11), marginTop: 6 }}>
                  You need their exact email — there is no search by name.
                </Text>

                <Pressable
                  onPress={() => search.mutate(email.trim())}
                  disabled={email.trim().length < 3 || search.isPending}
                  style={[
                    styles.wideBtn,
                    {
                      backgroundColor:
                        email.trim().length >= 3 ? (colors.tint as string) : (colors.subtext as string) + '55',
                    },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: '#fff', fontSize: fs(14), fontWeight: fw(700) as never }}>
                    {search.isPending ? 'Looking…' : 'Search'}
                  </Text>
                </Pressable>

                {searched && !found ? (
                  // Deliberately ambiguous: the backend cannot distinguish "no
                  // account" from "not discoverable", because doing so would
                  // leak membership. The copy does not pretend otherwise.
                  <Text style={{ color: colors.subtext, fontSize: fs(12), marginTop: 10, lineHeight: 18 }}>
                    No one to connect with at that address. They may not have an
                    account, or may not be findable.
                  </Text>
                ) : null}

                {found ? (
                  <View style={{ marginTop: 14 }}>
                    <Text style={{ color: colors.text, fontSize: fs(15), fontWeight: fw(700) as never }}>
                      {found.displayName}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: fs(12), marginTop: 8, marginBottom: 6 }}>
                      Connect them as
                    </Text>
                    <View style={styles.chips}>
                      {ALL_CATEGORIES.map((c) => {
                        const on = c.id === category
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => setCategory(c.id)}
                            style={[
                              styles.chip,
                              {
                                borderColor: on ? (colors.tint as string) : (colors.border as string),
                                backgroundColor: on ? (colors.tint as string) + '1F' : 'transparent',
                              },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                          >
                            <Text
                              style={{
                                color: on ? (colors.tint as string) : colors.text,
                                fontSize: fs(12),
                                fontWeight: fw(on ? 700 : 500) as never,
                              }}
                            >
                              {c.label}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>
                    <Pressable
                      onPress={() => sendRequest.mutate(found.userId)}
                      disabled={sendRequest.isPending}
                      style={[styles.wideBtn, { backgroundColor: colors.tint as string }]}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: '#fff', fontSize: fs(14), fontWeight: fw(700) as never }}>
                        {sendRequest.isPending ? 'Sending…' : 'Send request'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {notice ? (
                  <Text style={{ color: colors.subtext, fontSize: fs(12), marginTop: 10 }}>{notice}</Text>
                ) : null}
              </View>,
            )}

            {circle.length > 0 ? (
              <>
                {section('Your circle')}
                {circle.map((c) => connectedCard(c))}
              </>
            ) : null}

            {others.length > 0 ? (
              <>
                {section('Connected')}
                {others.map((c) => connectedCard(c))}
              </>
            ) : null}

            {outgoing.length > 0 ? (
              <>
                {section('Waiting on them')}
                {outgoing.map((c) =>
                  card(
                    <View style={styles.row}>
                      <View style={styles.rowText}>
                        <Text style={{ color: colors.text, fontSize: fs(14) }}>
                          Request sent · {labelFor(c.category).toLowerCase()}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => remove.mutate(c.peerId)}
                        style={styles.plainBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel this request"
                      >
                        <Text style={{ color: colors.subtext, fontSize: fs(13) }}>Cancel</Text>
                      </Pressable>
                    </View>,
                    c.peerId,
                  ),
                )}
              </>
            ) : null}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
  )
  return embedded ? body : <AppWrapper>{body}</AppWrapper>
}

export default function ConnectionsScreen(): React.JSX.Element {
  return <ConnectionsInner />
}

/**
 * Embeddable version for the Supports modal's Social tab: no AppWrapper, no
 * back button. Rendered as the TabScreen's SINGLE child so the react-native-
 * paper-tabs snapshot on iOS 26 doesn't crash (see COS-688).
 */
export function ConnectionsPanel(): React.JSX.Element {
  return <ConnectionsInner embedded />
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  rowText: { flex: 1 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, minHeight: 44, justifyContent: 'center' },
  plainBtn: { paddingHorizontal: 8, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  wideBtn: { marginTop: 12, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, minHeight: 44 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
})
