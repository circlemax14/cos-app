/**
 * SCRUM-659 Story 4 (2026-08-05) — Routines CRUD screen.
 *
 * ─── NAMING (Ken 2026-08-06) — READ THIS BEFORE RENAMING ANYTHING ───
 * The DISPLAY name of this screen is "Routines". The TRANSPORT name
 * stays "habits" all the way down: this file is app/Home/habits.tsx,
 * the route is /Home/habits, the API is
 * `/v1/patients/me/plan/habits`, the stored field is `plan.habits[]`,
 * the flag is `habits_in_plan_enabled`, and the hooks/types are still
 * usePlanHabits / PlanHabit / UpsertHabitInput. That is deliberate:
 * there are live records and a live wire format, and renaming them is
 * a breaking change with zero user-visible benefit. Only strings a
 * patient can read were changed.
 *
 * WHY "Routines": this section had to be told apart from plan Tasks.
 * Routines are the scaffolding of a day — meals, activities of daily
 * living (showering, toothbrushing), shopping, going to classes. They
 * are NOT by definition positive behaviours, so copy here must never
 * congratulate the patient for having them or call them healthy.
 * Tasks are the positive coping behaviours we want to turn into
 * habits; that contrast is stated ONCE, in the caption under the
 * header, and nowhere else.
 *
 * NOTE: this is NOT the SCRUM-640 habit journal (app/Home/habit-journal
 * .tsx, the 6-habit daily check-in). That is a different feature and
 * keeps the word "habit" in its UI.
 *
 * Reached from the HabitsBanner on the Plan screen via
 * router.push('/Home/habits'). Lists plan.habits, offers Add / Edit /
 * Delete operations. Hidden from bottom nav via href:null Tabs.Screen
 * in app/Home/_layout.tsx (same pattern as Health Age / Daily Read
 * drilldowns).
 *
 * iOS 26.5-safe primitive envelope. No Animated / LayoutAnimation /
 * ActivityIndicator. Modal editing done via a plain overlaid <View>.
 *
 * Behavior when flag OFF: renders a "not available yet" placeholder
 * (defensive — the Banner won't route here when flag off, but a
 * direct-URL nav should still degrade gracefully).
 */

import React from 'react'
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { router } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  useAddHabit,
  useDeleteHabit,
  useHabitsInPlanFlag,
  usePlanHabits,
  useUpdateHabit,
  type UpsertHabitInput,
} from '@/hooks/use-plan-habits'
import type { PlanHabit } from '@/services/api/types'

type BpsDomain = PlanHabit['bpsDomain']

interface DraftHabit {
  habitId?: string
  label: string
  cadence: 'daily' | 'weekly'
  /** HH:MM 24h, or '' for "anytime today". */
  scheduledTime?: string
  /**
   * Does it also push at that hour? Absent/true = yes, false = placed
   * silently. Mirrors PlanHabit.remindersEnabled, where absent reads as true.
   */
  remindersEnabled?: boolean
  targetValue?: string
  unit?: string
  bpsDomain: BpsDomain
  rationale?: string
}

const EMPTY_DRAFT: DraftHabit = {
  label: '',
  cadence: 'daily',
  bpsDomain: 'bio',
  // A new routine the patient deliberately gave a time to should remind by
  // default — that is why they set the time. They can switch it off in place.
  remindersEnabled: true,
}

/**
 * 'HH:MM' -> a Date for the picker, defaulting to 08:00 when unset.
 *
 * The date part is irrelevant — only hours/minutes are read back — but it has
 * to be a REAL date or the picker renders blank on Android.
 */
function parseHHMM(hhmm: string | undefined): Date {
  const d = new Date()
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((hhmm ?? '').trim())
  d.setHours(m ? Number(m[1]) : 8, m ? Number(m[2]) : 0, 0, 0)
  return d
}

const CADENCE_OPTIONS: Array<{ key: 'daily' | 'weekly'; label: string }> = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
]

const BPS_OPTIONS: Array<{ key: BpsDomain; label: string }> = [
  { key: 'bio', label: 'Body' },
  { key: 'psycho', label: 'Mind' },
  { key: 'social', label: 'Social' },
  { key: 'spiritual', label: 'Spiritual' },
]

export default function HabitsScreen(): React.JSX.Element {
  const flag = useHabitsInPlanFlag()
  const { habits, isLoading, isError } = usePlanHabits()
  const addMutation = useAddHabit()
  const updateMutation = useUpdateHabit()
  const deleteMutation = useDeleteHabit()
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors.light

  const [editing, setEditing] = React.useState<DraftHabit | null>(null)
  // Closed by default so the card opens compact; the field above expands it.
  const [showTimePicker, setShowTimePicker] = React.useState(false)

  // Tracked so a backdrop tap can dismiss the KEYBOARD without also closing
  // the card and discarding what was typed. Keyboard.dismiss() alone gives us
  // no way to tell the two situations apart.
  const [keyboardOpen, setKeyboardOpen] = React.useState(false)
  React.useEffect(() => {
    // iOS reports Will*, Android only Did* — subscribe to both so this works
    // on either without a Platform branch.
    const subs = [
      Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true)),
      Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true)),
      Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false)),
      Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false)),
    ]
    return () => { subs.forEach((sub) => sub.remove()) }
  }, [])
  const isNew = editing !== null && !editing.habitId

  const openAdd = React.useCallback(() => {
    setShowTimePicker(false)
    setEditing({ ...EMPTY_DRAFT })
  }, [])
  const openEdit = React.useCallback((h: PlanHabit) => {
    setShowTimePicker(false)
    setEditing({
      habitId: h.habitId,
      label: h.label,
      cadence: h.cadence === 'weekly' ? 'weekly' : 'daily',
      // Prefill, or the edit form silently CLEARS a time the patient already
      // set — an omitted field on PATCH is indistinguishable from "remove it".
      scheduledTime: h.scheduledTime ?? '',
      // Prefilled for the same reason as the time: PATCH merges, so the form
      // must open showing the routine's ACTUAL reminder state, not a default.
      remindersEnabled: h.remindersEnabled,
      targetValue: typeof h.targetValue === 'number' ? String(h.targetValue) : undefined,
      unit: h.unit,
      bpsDomain: h.bpsDomain,
      rationale: h.rationale,
    })
  }, [])

  const closeEdit = React.useCallback(() => {
    setShowTimePicker(false)
    setEditing(null)
  }, [])

  const submitEdit = React.useCallback(async () => {
    if (!editing || !editing.label.trim()) return
    const payload: UpsertHabitInput = {
      label: editing.label.trim(),
      cadence: editing.cadence,
      bpsDomain: editing.bpsDomain,
    }
    // Ken 2026-08-11: "place a time on each routine so that it integrates
    // into the schedule flow and is not separate". Only sent when it parses
    // — a half-typed "7:" must not be persisted, and an empty box is the
    // legitimate "anytime today" state rather than an error.
    const time = editing.scheduledTime?.trim()
    if (time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      payload.scheduledTime = time
    } else if (editing.habitId && !time) {
      // Explicit clear. PATCH merges, so simply omitting the field would
      // PRESERVE the old time and "anytime today" would be unreachable once
      // a time had been chosen. Only sent when editing — there is nothing to
      // clear on a new routine.
      payload.scheduledTime = ''
    }
    // SCRUM-666 r2 — sent EXPLICITLY whenever a time exists, never omitted.
    // PATCH merges, so omitting it would preserve the previous value and the
    // toggle would appear to do nothing. Only meaningful alongside a time:
    // an "anytime" routine has no hour to remind at.
    if (payload.scheduledTime) {
      payload.remindersEnabled = editing.remindersEnabled !== false
    }
    const tv = editing.targetValue?.trim()
    if (tv && !Number.isNaN(Number(tv))) payload.targetValue = Number(tv)
    if (editing.unit?.trim()) payload.unit = editing.unit.trim().slice(0, 32)
    if (editing.rationale?.trim()) payload.rationale = editing.rationale.trim().slice(0, 200)
    try {
      if (editing.habitId) {
        await updateMutation.mutateAsync({ habitId: editing.habitId, patch: payload })
      } else {
        await addMutation.mutateAsync(payload)
      }
      closeEdit()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Alert.alert('Save failed', msg)
    }
  }, [editing, addMutation, updateMutation, closeEdit])

  const submitDelete = React.useCallback(
    (habitId: string, label: string) => {
      Alert.alert(
        'Remove routine',
        `Remove "${label}" from your plan?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteMutation.mutateAsync(habitId)
              } catch (err) {
                Alert.alert('Delete failed', err instanceof Error ? err.message : String(err))
              }
            },
          },
        ],
      )
    },
    [deleteMutation],
  )

  return (
    <AppWrapper>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              // SCRUM-659 (Vishal 2026-08-05): always route back to the
              // Care Plan screen — the only place from which the banner
              // launches this screen. router.back() would fall through
              // to the Home tab's root (index.tsx) because this route
              // is registered href:null in the tab layout, so we
              // explicitly replace with the plan route.
              router.replace('/Home/health-plan' as never)
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <MaterialIcons name="arrow-back-ios" size={20} color={colors.text as string} />
          </Pressable>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(700) as any,
              flex: 1,
            }}
          >
            Routines
          </Text>
          {flag && (
            <Pressable
              onPress={openAdd}
              accessibilityRole="button"
              accessibilityLabel="Add a routine"
              hitSlop={8}
              style={({ pressed }) => [styles.addPill, pressed && styles.pressed]}
            >
              <MaterialIcons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addPillText}>Add</Text>
            </Pressable>
          )}
        </View>

        {/*
          Ken 2026-08-06 — the ONE place the Routines/Tasks distinction is
          spelled out for the patient. Routines are structure and are not
          necessarily good behaviours; the tasks on the plan are the coping
          behaviours we want to grow into habits. Deliberately a caption,
          not an explainer card — say it once, then get out of the way.
        */}
        {flag && (
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              lineHeight: getScaledFontSize(19),
              marginBottom: 18,
            }}
          >
            Routines are the structure of your day — meals, washing, shopping, classes. The
            tasks on your plan are different: those are the behaviours you&apos;re building
            into habits.
          </Text>
        )}

        {!flag ? (
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 24 }}>
            This feature is not available yet.
          </Text>
        ) : isLoading ? (
          <View style={styles.centerBlock}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>Loading…</Text>
          </View>
        ) : isError ? (
          <View style={styles.centerBlock}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>
              We couldn&apos;t load your routines. Pull down to try again.
            </Text>
          </View>
        ) : habits.length === 0 ? (
          <View style={styles.centerBlock}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(600) as any,
                textAlign: 'center',
              }}
            >
              No routines yet
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              Tap the + button to add one — a meal, a shower, the school run, a class. Anything
              that already gives your day its shape.
            </Text>
          </View>
        ) : (
          habits.map((h) => (
            <View key={h.habitId} style={[styles.card, { backgroundColor: colors.card as string }]}>
              <Pressable
                onPress={() => openEdit(h)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${h.label}`}
                style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: getScaledFontSize(15),
                      fontWeight: getScaledFontWeight(600) as any,
                    }}
                  >
                    {h.label}
                  </Text>
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(12),
                      marginTop: 4,
                    }}
                  >
                    {cadenceLabel(h.cadence)}
                    {h.targetValue ? ` · ${h.targetValue}${h.unit ? ' ' + h.unit : ''}` : ''}
                    {' · '}
                    {bpsLabel(h.bpsDomain)}
                    {h.source ? ` · ${h.source === 'ai' ? 'AI' : 'Yours'}` : ''}
                  </Text>
                  {h.rationale ? (
                    <Text
                      style={{
                        color: colors.subtext,
                        fontSize: getScaledFontSize(12),
                        lineHeight: 16,
                        marginTop: 4,
                      }}
                      numberOfLines={2}
                    >
                      {h.rationale}
                    </Text>
                  ) : null}
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.subtext as string} />
              </Pressable>
              <Pressable
                onPress={() => submitDelete(h.habitId, h.label)}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${h.label}`}
                hitSlop={8}
                style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
              >
                <MaterialIcons name="delete-outline" size={20} color="#B23A48" />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      {/* Overlay editor */}
      {editing && (
        /* Ken 2026-08-14: "when i try to add routine and within input field and
           try to click outside of input field then keyboard is not moving
           away". The scrim was an inert View, so there was nothing to tap.

           One tap dismisses the KEYBOARD; a second closes the card. Doing both
           at once would throw away what the patient just typed the moment they
           tried to get the keyboard out of the way — which is the actual
           complaint, not a request to close the form. */
        <View style={styles.modalScrim}>
          {/* The backdrop is a SIBLING behind the card, not a parent of it.
              Wrapping the card in a Pressable (as this did on 2026-08-14)
              makes that Pressable intercept every touch inside it — the
              cadence and domain pills stopped responding and neither Target
              field could be focused. Ken: "i am not able to select or change
              cadance or domain ... no way to select anything". A backdrop
              only needs to cover the screen BEHIND the card to be tappable. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close"
            onPress={() => {
              if (keyboardOpen) { Keyboard.dismiss(); return }
              closeEdit()
            }}
          />
          <View style={[styles.modalCard, { backgroundColor: colors.card as string }]}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(17),
                fontWeight: getScaledFontWeight(700) as any,
              }}
            >
              {isNew ? 'New routine' : 'Edit routine'}
            </Text>

            {/* Body scrolls; the actions below do NOT, so Save stays reachable
                however large the text is set. keyboardShouldPersistTaps keeps
                the first tap on a control working while the keyboard is up
                instead of being eaten by the dismiss. */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >

            <Text style={styles.label}>Label</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.subtext as string }]}
              value={editing.label}
              // Ken 2026-08-06: the old placeholder ("Walk 30 minutes") was a
              // coping behaviour — i.e. a Task, not a Routine. The example
              // has to be something structural or patients will file their
              // exercise goals in here.
              placeholder="e.g. Eat breakfast"
              placeholderTextColor={colors.subtext as string}
              onChangeText={(v) => setEditing((e) => (e ? { ...e, label: v } : e))}
              maxLength={60}
            />

            {/* Ken 2026-08-11: "we have to be able to place a time on each
                routine so that it integrates into the schedule flow and is
                not separate." Without a time a routine lands in Today's
                Schedule under "Anytime today" instead of at its hour.

                A plain HH:MM field rather than a native picker: the picker is
                an extra native surface on a screen whose iOS 26.5 envelope is
                already tight, and the value is two numbers. Empty is a real
                answer — "stretch sometime today" is a legitimate routine — so
                the hint says so instead of treating blank as an error. */}
            <Text style={styles.label}>Time of day</Text>
            {/* Ken 2026-08-14: "very difficult to add time manually like 08:30
                — can we use some meters for selection". Typing HH:MM on a
                numeric keypad is a poor ask of anyone, and worse for this
                cohort: a half-typed "8:3" is invalid, the keypad covered the
                Save button, and tapping away did not dismiss it.

                A wheel removes all three problems at once — there is no
                keyboard to trap, and every value it can produce is already
                valid, so the format hint and its error state are gone too.
                Same picker the calendar event editor already uses. */}
            <Pressable
              onPress={() => { setShowTimePicker((v) => !v) }}
              style={[styles.timeField, { borderColor: colors.subtext as string }]}
              accessibilityRole="button"
              accessibilityLabel={
                editing.scheduledTime
                  ? `Time of day, ${editing.scheduledTime}. Tap to change.`
                  : 'Time of day, anytime. Tap to choose a time.'
              }
            >
              <MaterialIcons
                name="schedule"
                size={getScaledFontSize(18)}
                color={colors.subtext as string}
              />
              <Text
                style={{
                  flex: 1,
                  marginLeft: 10,
                  color: editing.scheduledTime ? colors.text : (colors.subtext as string),
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(editing.scheduledTime ? 600 : 400) as any,
                }}
              >
                {editing.scheduledTime ? editing.scheduledTime : 'Anytime'}
              </Text>
              {editing.scheduledTime ? (
                <Pressable
                  onPress={() => {
                    setShowTimePicker(false)
                    setEditing((e) => (e ? { ...e, scheduledTime: '' } : e))
                  }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Clear the time, make this anytime"
                >
                  <MaterialIcons
                    name="close"
                    size={getScaledFontSize(20)}
                    color={colors.subtext as string}
                  />
                </Pressable>
              ) : null}
            </Pressable>

            {showTimePicker ? (
              <View>
                <DateTimePicker
                  value={parseHHMM(editing.scheduledTime)}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => {
                    if (Platform.OS === 'android') setShowTimePicker(false)
                    if (!d) return
                    const hh = String(d.getHours()).padStart(2, '0')
                    const mm = String(d.getMinutes()).padStart(2, '0')
                    setEditing((e) => (e ? { ...e, scheduledTime: `${hh}:${mm}` } : e))
                  }}
                />
                {/* Ken 2026-08-14: "after selection i am stuck i am not able to
                    select or change cadance or domain".

                    An iOS spinner swallows vertical drags, so with it open
                    inside a ScrollView there was no way to scroll PAST it to
                    reach the fields below, and nothing to close it with — the
                    wheel emits a value on every tick, so there is no natural
                    "finished" moment to collapse on. An explicit Done gives
                    one. Full-width and 44pt so it cannot be missed. */}
                {Platform.OS === 'ios' ? (
                  <Pressable
                    onPress={() => setShowTimePicker(false)}
                    style={({ pressed }) => [styles.pickerDone, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Done choosing the time"
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: getScaledFontSize(15),
                        fontWeight: getScaledFontWeight(600) as any,
                      }}
                    >
                      Done
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Text
              style={{
                color: colors.subtext as string,
                fontSize: getScaledFontSize(12),
                marginTop: 6,
                marginBottom: 12,
              }}
            >
              Appears at this hour on Today\u2019s Schedule. Anytime means no set hour.
            </Text>

            {/* SCRUM-666 r2 \u2014 a time and a reminder are different questions.
                Only offered once a time exists: there is no hour to remind at
                otherwise, and a toggle that silently does nothing is the
                failure this whole feature exists to remove. */}
            {editing.scheduledTime &&
            /^([01]\d|2[0-3]):[0-5]\d$/.test(editing.scheduledTime.trim()) ? (
              <Pressable
                onPress={() =>
                  setEditing((e) =>
                    e ? { ...e, remindersEnabled: e.remindersEnabled === false } : e,
                  )
                }
                accessibilityRole="switch"
                accessibilityState={{ checked: editing.remindersEnabled !== false }}
                accessibilityLabel="Remind me at this time"
                style={styles.remindRow}
                hitSlop={6}
              >
                <MaterialIcons
                  name={
                    editing.remindersEnabled === false
                      ? 'notifications-off'
                      : 'notifications-active'
                  }
                  size={getScaledFontSize(20)}
                  color={
                    editing.remindersEnabled === false
                      ? (colors.subtext as string)
                      : (colors.tint as string)
                  }
                />
                <View style={styles.remindText}>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(15) }}>
                    Remind me at {editing.scheduledTime.trim()}
                  </Text>
                  <Text
                    style={{
                      color: colors.subtext as string,
                      fontSize: getScaledFontSize(12),
                      marginTop: 2,
                    }}
                  >
                    {editing.remindersEnabled === false
                      ? 'Off \u2014 it still shows on your schedule, it just won\u2019t buzz.'
                      : 'On \u2014 you\u2019ll get a notification at this time.'}
                  </Text>
                </View>
                <MaterialIcons
                  name={
                    editing.remindersEnabled === false ? 'toggle-off' : 'toggle-on'
                  }
                  size={getScaledFontSize(30)}
                  color={
                    editing.remindersEnabled === false
                      ? (colors.subtext as string)
                      : (colors.tint as string)
                  }
                />
              </Pressable>
            ) : null}

            <Text style={styles.label}>Cadence</Text>
            <View style={styles.pillRow}>
              {CADENCE_OPTIONS.map((opt) => {
                const active = editing.cadence === opt.key
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setEditing((e) => (e ? { ...e, cadence: opt.key } : e))}
                    style={[styles.pill, active && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={styles.label}>Domain</Text>
            <View style={styles.pillRow}>
              {BPS_OPTIONS.map((opt) => {
                const active = editing.bpsDomain === opt.key
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setEditing((e) => (e ? { ...e, bpsDomain: opt.key } : e))}
                    style={[styles.pill, active && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={styles.label}>Target (optional)</Text>
            {/* Ken 2026-08-14: "what is use of target". Fair — it was two
                unlabelled boxes. It IS used: the value and unit render on the
                routine itself ("Walk · 30 minutes", line ~383) and in the
                printed plan. Say so, rather than leaving the patient to
                deduce it from a placeholder. */}
            <Text
              style={{
                color: colors.subtext as string,
                fontSize: getScaledFontSize(12),
                marginBottom: 8,
              }}
            >
              Shown on the routine, like &ldquo;Walk · 30 minutes&rdquo;. Leave blank if
              there is nothing to count.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.subtext as string }]}
                value={editing.targetValue ?? ''}
                placeholder="30"
                placeholderTextColor={colors.subtext as string}
                keyboardType="numeric"
                onChangeText={(v) => setEditing((e) => (e ? { ...e, targetValue: v } : e))}
                maxLength={8}
              />
              <TextInput
                style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.subtext as string }]}
                value={editing.unit ?? ''}
                placeholder="minutes"
                placeholderTextColor={colors.subtext as string}
                onChangeText={(v) => setEditing((e) => (e ? { ...e, unit: v } : e))}
                maxLength={32}
              />
            </View>

            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={closeEdit}
                style={({ pressed }) => [styles.actionBtn, styles.actionBtnCancel, pressed && styles.pressed]}
              >
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(14) }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitEdit}
                disabled={!editing.label.trim() || addMutation.isPending || updateMutation.isPending}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.actionBtnSave,
                  (!editing.label.trim() || addMutation.isPending || updateMutation.isPending) && styles.actionBtnDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={{ color: '#FFFFFF', fontSize: getScaledFontSize(14), fontWeight: '600' }}>
                  {addMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </AppWrapper>
  )
}

function cadenceLabel(cadence: PlanHabit['cadence']): string {
  if (cadence === 'daily') return 'Daily'
  if (cadence === 'weekly') return 'Weekly'
  if (cadence && typeof cadence === 'object' && 'everyNDays' in cadence) {
    return `Every ${cadence.everyNDays} days`
  }
  return 'Custom'
}

function bpsLabel(d: BpsDomain): string {
  return BPS_OPTIONS.find((o) => o.key === d)?.label ?? String(d)
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { paddingRight: 8, paddingVertical: 4 },
  // Ken 2026-08-07: "in routines also we need to change plus icon to add
  // button." Was a bare "+" glyph on a pale tint square — the same defect
  // #7 fixed on Medications, where an unlabelled icon left patients unsure
  // what it would do. Now a labelled solid pill, matched to the Medications
  // screen's addPill so the two surfaces read as one system. 44pt min height
  // per iOS HIG.
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    minHeight: 44,
    backgroundColor: '#0B6963',
  },
  addPillText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, marginLeft: 5 },
  pressed: { opacity: 0.7 },
  centerBlock: { marginTop: 60, alignItems: 'center', paddingHorizontal: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  modalScrim: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    padding: 18,
    // Ken 2026-08-14, with Bold Text + a large text size on: the card grew
    // past the screen and the Save button went with it. Cap it and let the
    // body scroll; the actions live OUTSIDE that scroll so they are always
    // reachable no matter how large the text is set.
    maxHeight: '88%',
  },
  // marginTop 12 -> 16: at large accessibility sizes the previous gap let a
  // hint line sit flush against the field above it (Ken 2026-08-14).
  label: { color: '#687076', fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 6, letterSpacing: 0.3 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    // The OS scales this text; without a floor the box does not grow with it
    // and large type clips against the border.
    minHeight: 44,
  },
  pickerDone: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#1F6F63',
    marginTop: 4,
  },
  // Tappable time field — replaces the numeric TextInput (Ken 2026-08-14).
  // Row layout so the value and the clear affordance sit on one line, with the
  // same 44pt floor as every other tap target on this screen.
  timeField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
  },
  // SCRUM-666 r2 — reminder toggle. minHeight 44 keeps it on the app's tap
  // target floor; the whole row is pressable, not just the switch glyph.
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  remindText: { flex: 1 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    backgroundColor: '#FFFFFF',
  },
  pillActive: { backgroundColor: '#0B6963', borderColor: '#0B6963' },
  pillText: { fontSize: 13, color: '#11181C' },
  pillTextActive: { color: '#FFFFFF', fontWeight: '600' },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnCancel: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  actionBtnSave: {
    backgroundColor: '#0B6963',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
})
