/**
 * SCRUM-279 / COS-308 — event create / edit modal.
 *
 * Apple-Calendar-style new-event form:
 *   - Title
 *   - All-day toggle
 *   - Start / End date+time (uses @react-native-community/datetimepicker)
 *   - Calendar picker (only calendars where allowsWrite=true)
 *   - Location, notes
 *   - Reminder offsets (multi-select chips: 5m, 15m, 30m, 1h, 1d before)
 *
 * On save:
 *   - Shows the HIPAA disclosure modal on first write (gated by
 *     AsyncStorage key) so the user is informed the event will sync to
 *     their other calendar apps via the source calendar's cloud account.
 *   - Calls createEvent() and pops back to the calendar screen.
 *
 * Route params:
 *   - day: string — YYYY-MM-DD to seed the start date.
 *   - eventId?: string — if present, loads the event and prefills for edit.
 *     (For v1 we open a new editor for editing too; full edit-in-place is
 *     a follow-up.)
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { router, useLocalSearchParams } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  createEvent,
  listCalendars,
  readEvents,
  updateEvent,
  type CalendarSource,
} from '@/services/calendar'
import {
  createServerCalendarEvent,
  updateServerCalendarEvent,
} from '@/services/api/calendar'
import {
  getCalendarPreferences,
  setCalendarPreferences,
} from '@/services/calendar-preferences'
import {
  SelectionPicker,
  TimeZonePicker,
  REPEAT_OPTIONS,
  TRAVEL_TIME_OPTIONS,
  labelForRepeat,
  labelForTravelTime,
  type RepeatValue,
  type TravelTimeValue,
} from '@/components/calendar/pickers'
import { useCanRender } from '@/hooks/use-entitlement'
import { hapticSelection, hapticNotify } from '@/utils/haptics'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

const HIPAA_ACK_KEY = 'csh-calendar-hipaa-ack-v1'

const ALARM_OPTIONS: { label: string; minutes: number }[] = [
  { label: 'At time', minutes: 0 },
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 60 * 24 },
]

function startOfNextHour(seed: Date): Date {
  const d = new Date(seed)
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}

/**
 * Convert the editor state into a server-side create / update payload
 * and call cos-backend. Returns a promise that the caller can ignore —
 * this is best-effort; the device-side save has already succeeded by
 * the time we're called.
 *
 * Edits to existing app events route to updateServerCalendarEvent
 * (the eventId is the same on both sides for app-origin events). New
 * events use a clientId so a retry idempotently upserts.
 */
async function mirrorToBackend(args: {
  isEdit: boolean
  existingId?: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  location: string
  notes: string
  url: string
  showAs: 'busy' | 'free'
  repeatValue: RepeatValue
  timeZone: string
  travelTimeValue: TravelTimeValue
  alarms: number[]
}): Promise<void> {
  const payload = {
    title: args.title,
    startDate: args.start.toISOString(),
    endDate: args.end.toISOString(),
    allDay: args.allDay,
    location: args.location.trim() || undefined,
    notes: args.notes.trim() || undefined,
    url: args.url.trim() || undefined,
    showAs: args.showAs,
    alarms: args.alarms,
    recurrenceRule: args.repeatValue === 'never' ? undefined : repeatToRrule(args.repeatValue),
    timeZone: args.timeZone,
    travelTimeMinutes: args.travelTimeValue === 'none' ? undefined : parseInt(args.travelTimeValue, 10),
    visibility: 'device_sync' as const,
  }
  if (args.isEdit && args.existingId && args.existingId.startsWith('app:')) {
    const serverId = args.existingId.slice(4)
    await updateServerCalendarEvent(serverId, payload)
    return
  }
  // For new events (or edits of device-origin events), create on the
  // server. clientId stabilizes against duplicate creates on retry.
  await createServerCalendarEvent({
    ...payload,
    clientId: `${args.start.toISOString()}-${args.title.slice(0, 32)}`,
  })
}

function repeatToRrule(v: RepeatValue): string | undefined {
  switch (v) {
    case 'daily': return 'FREQ=DAILY'
    case 'weekly': return 'FREQ=WEEKLY'
    case 'biweekly': return 'FREQ=WEEKLY;INTERVAL=2'
    case 'monthly': return 'FREQ=MONTHLY'
    case 'yearly': return 'FREQ=YEARLY'
    default: return undefined
  }
}

export default function CalendarEventEditor() {
  const canView = useCanRender('calendar-event-editor.view')
  const canCreateEvent = useCanRender('calendar-event-editor.create-event')
  const canEditEvent = useCanRender('calendar-event-editor.edit-event')
  const canSetReminder = useCanRender('calendar-event-editor.set-reminder')
  const canRecurringEvent = useCanRender('calendar-event-editor.recurring-event')
  const { day, eventId } = useLocalSearchParams<{ day?: string; eventId?: string }>()
  const isEditMode = !!eventId && !eventId.startsWith('app:') && !eventId.startsWith('reminder:')
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  // Seed start date from `day` param if present (so "+" from a chosen
  // day pre-fills correctly); fallback to next hour from now. In edit
  // mode this is overwritten once the existing event loads.
  const seedDate = useMemo(() => {
    if (day) {
      const d = new Date(`${day}T00:00:00`)
      if (!Number.isNaN(d.getTime())) return startOfNextHour(d)
    }
    return startOfNextHour(new Date())
  }, [day])

  const deviceTimeZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
  }, [])

  const [title, setTitle] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [start, setStart] = useState<Date>(seedDate)
  const [end, setEnd] = useState<Date>(new Date(seedDate.getTime() + 60 * 60_000))
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [calendars, setCalendars] = useState<CalendarSource[]>([])
  const [chosenCalendarId, setChosenCalendarId] = useState<string | null>(null)
  const [selectedAlarms, setSelectedAlarms] = useState<number[]>([15])
  // H10: optional second alert offset; null = "None"
  const [secondAlarm, setSecondAlarm] = useState<number | null>(null)
  const [url, setUrl] = useState('')
  const [showAs, setShowAs] = useState<'busy' | 'free'>('busy')
  const [repeatValue, setRepeatValue] = useState<RepeatValue>('never')
  const [travelTimeValue, setTravelTimeValue] = useState<TravelTimeValue>('none')
  const [timeZone, setTimeZone] = useState<string>(deviceTimeZone)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingExisting, setIsLoadingExisting] = useState(isEditMode)

  // Date picker visibility (iOS uses inline; Android uses native dialogs)
  const [showStartPicker, setShowStartPicker] = useState(false)
  const [showEndPicker, setShowEndPicker] = useState(false)

  // Picker modal visibility flags
  const [showTzPicker, setShowTzPicker] = useState(false)
  const [showRepeatPicker, setShowRepeatPicker] = useState(false)
  const [showTravelPicker, setShowTravelPicker] = useState(false)

  // HIPAA disclosure
  const [showHipaa, setShowHipaa] = useState(false)

  useEffect(() => {
    void (async () => {
      const [cals, prefs] = await Promise.all([
        listCalendars(),
        getCalendarPreferences(),
      ])
      const writable = cals.filter((c) => c.allowsWrite)
      setCalendars(writable)

      // H16: prefer the saved default calendar; otherwise first writable.
      const preferred = writable.find((c) => c.id === prefs.defaultCalendarId)
      const initialCal = preferred ?? writable[0]
      if (initialCal && !chosenCalendarId) setChosenCalendarId(initialCal.id)

      // H16: prefill alarms + repeat + travel + TZ from last-used (when
      // creating a new event — edits get overwritten below).
      if (!isEditMode) {
        setSelectedAlarms(prefs.defaultAlertMinutes)
        setRepeatValue(prefs.lastUsedRepeat as RepeatValue)
        setTravelTimeValue(prefs.lastUsedTravelTime as TravelTimeValue)
        if (prefs.lastUsedTimeZone) setTimeZone(prefs.lastUsedTimeZone)
      }

      // Prefill from existing event when editing
      if (isEditMode && eventId) {
        const all = await readEvents()
        const found = all.find((e) => e.id === eventId)
        if (found) {
          setTitle(found.title)
          setAllDay(found.allDay)
          setStart(new Date(found.startDate))
          setEnd(new Date(found.endDate))
          setLocation(found.location ?? '')
          setNotes(found.notes ?? '')
          setChosenCalendarId(found.calendarId)
          setSelectedAlarms(found.alarms.length > 0 ? found.alarms : [15])
        }
        setIsLoadingExisting(false)
      }
    })()
    // intentionally one-shot; calendar list is stable mid-edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleAlarm = (m: number) => {
    setSelectedAlarms((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    )
  }

  const canSave =
    title.trim().length > 0 && chosenCalendarId !== null && end.getTime() > start.getTime() && !isSaving

  const handleSave = async () => {
    if (!canSave || !chosenCalendarId) return
    const acked = await AsyncStorage.getItem(HIPAA_ACK_KEY)
    if (!acked) {
      setShowHipaa(true)
      return
    }
    await commitSave()
  }

  const commitSave = async () => {
    if (!chosenCalendarId) return
    setIsSaving(true)
    // Combine primary + optional second alarm into the alarms array
    const allAlarms = secondAlarm !== null
      ? Array.from(new Set([...selectedAlarms, secondAlarm])).sort((a, b) => a - b)
      : selectedAlarms
    try {
      let ok = false
      if (isEditMode && eventId) {
        ok = await updateEvent({
          id: eventId,
          title: title.trim(),
          startDate: start,
          endDate: end,
          allDay,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
          alarms: allAlarms,
        })
      } else {
        const newId = await createEvent({
          title: title.trim(),
          startDate: start,
          endDate: end,
          allDay,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
          calendarId: chosenCalendarId,
          alarms: allAlarms,
        })
        ok = !!newId
      }
      if (ok) {
        hapticNotify('success')
        // H16: remember picks for next-time defaults (non-blocking).
        void setCalendarPreferences({
          defaultCalendarId: chosenCalendarId,
          defaultAlertMinutes: selectedAlarms,
          lastUsedTimeZone: timeZone,
          lastUsedRepeat: repeatValue,
          lastUsedTravelTime: travelTimeValue,
        })
        // Mirror to cos-backend so care managers see this event. Best-
        // effort, non-blocking — local device write already succeeded.
        // ClientId = device event id so a retry on the next save
        // (e.g. for an edit) upserts in place instead of duplicating.
        void mirrorToBackend({
          isEdit: isEditMode,
          existingId: eventId,
          title: title.trim(),
          start, end, allDay, location, notes, url,
          showAs, repeatValue, timeZone, travelTimeValue,
          alarms: allAlarms,
        }).catch(() => {})
        router.back()
      } else {
        hapticNotify('error')
        Alert.alert(
          'Could not save',
          isEditMode
            ? 'The event could not be updated. Please check your calendar permissions and try again.'
            : 'The event could not be saved. Please check your calendar permissions and try again.',
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  const acceptHipaa = async () => {
    await AsyncStorage.setItem(HIPAA_ACK_KEY, new Date().toISOString())
    setShowHipaa(false)
    await commitSave()
  }

  return (
    // SafeAreaView (top edge only) guarantees the header always sits
    // below the iOS status bar / dynamic island. KeyboardAvoidingView
    // wraps the inner content so the keyboard pushes the form up while
    // the header stays anchored at the top.
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      {/* Header — 56pt tall, Cancel on left, Save/Add on right, title
          centered. Always visible (SafeAreaView protects from status
          bar). 8pt extra paddingTop to give it visual breathing room
          inside the modal. */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            paddingTop: 16,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.headerSide, { opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={[styles.headerBtn, { color: colors.tint, fontSize: getScaledFontSize(17) }]}>
            Cancel
          </Text>
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(17) }]}
          numberOfLines={1}
        >
          {isEditMode ? 'Edit Event' : 'New Event'}
        </Text>
        {(isEditMode ? canEditEvent : canCreateEvent) && (
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          hitSlop={10}
          style={({ pressed }) => [
            styles.headerSide,
            styles.headerSideRight,
            { opacity: !canSave ? 1 : pressed ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save event"
        >
          <Text
            style={[
              styles.headerBtn,
              styles.headerBtnPrimary,
              { color: canSave ? colors.tint : colors.disabled, fontSize: getScaledFontSize(17) },
            ]}
          >
            {isSaving ? 'Saving…' : isEditMode ? 'Save' : 'Add'}
          </Text>
        </Pressable>
        )}
      </View>

      {canView && (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* H1: Combined Title + Location field — Apple's signature
            first-card pattern. Title on top, hairline, location below. */}
        <Field colors={colors}>
          <TextInput
            style={[styles.titleInput, { color: colors.text, fontSize: getScaledFontSize(20) }]}
            placeholder="Title"
            placeholderTextColor={colors.subtext}
            value={title}
            onChangeText={setTitle}
            autoFocus
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <TextInput
            style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(15) }]}
            placeholder="Location or Video Call"
            placeholderTextColor={colors.subtext}
            value={location}
            onChangeText={setLocation}
            autoCorrect
            autoCapitalize="words"
          />
        </Field>

        {/* All-day */}
        <Field colors={colors}>
          <Row colors={colors} label="All-day" labelSize={getScaledFontSize(15)}>
            <Switch value={allDay} onValueChange={setAllDay} />
          </Row>
        </Field>

        {/* Start */}
        <Field colors={colors}>
          <Pressable onPress={() => setShowStartPicker((p) => !p)}>
            <Row colors={colors} label="Starts" labelSize={getScaledFontSize(15)}>
              <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15) }}>
                {fmtDateLabel(start, allDay)}
              </Text>
            </Row>
          </Pressable>
          {showStartPicker && (
            <DateTimePicker
              value={start}
              mode={allDay ? 'date' : 'datetime'}
              onChange={(_, d) => {
                if (Platform.OS === 'android') setShowStartPicker(false)
                if (d) {
                  setStart(d)
                  if (end.getTime() <= d.getTime()) setEnd(new Date(d.getTime() + 60 * 60_000))
                }
              }}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            />
          )}
        </Field>

        {/* End */}
        <Field colors={colors}>
          <Pressable onPress={() => setShowEndPicker((p) => !p)}>
            <Row colors={colors} label="Ends" labelSize={getScaledFontSize(15)}>
              <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15) }}>
                {fmtDateLabel(end, allDay)}
              </Text>
            </Row>
          </Pressable>
          {showEndPicker && (
            <DateTimePicker
              value={end}
              mode={allDay ? 'date' : 'datetime'}
              minimumDate={start}
              onChange={(_, d) => {
                if (Platform.OS === 'android') setShowEndPicker(false)
                if (d) setEnd(d)
              }}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            />
          )}
          {/* H4: Time Zone picker — tappable, opens searchable list */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable onPress={() => { hapticSelection(); setShowTzPicker(true) }}>
            <Row colors={colors} label="Time Zone" labelSize={getScaledFontSize(15)}>
              <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15) }}>
                {timeZone.replace(/_/g, ' ')} ›
              </Text>
            </Row>
          </Pressable>
        </Field>

        {/* H5/H6: Repeat + Travel Time — full pickers */}
        <Field colors={colors}>
          {canRecurringEvent && (
          <Pressable onPress={() => { hapticSelection(); setShowRepeatPicker(true) }}>
            <Row colors={colors} label="Repeat" labelSize={getScaledFontSize(15)}>
              <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15) }}>
                {labelForRepeat(repeatValue)} ›
              </Text>
            </Row>
          </Pressable>
          )}
          {canRecurringEvent && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
          <Pressable onPress={() => { hapticSelection(); setShowTravelPicker(true) }}>
            <Row colors={colors} label="Travel Time" labelSize={getScaledFontSize(15)}>
              <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15) }}>
                {labelForTravelTime(travelTimeValue)} ›
              </Text>
            </Row>
          </Pressable>
        </Field>

        {/* Calendar picker */}
        <Field colors={colors}>
          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
            CALENDAR
          </Text>
          {calendars.length === 0 ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), paddingVertical: 12 }}>
              No writable calendars found. Add a calendar account in iOS Settings to create events here.
            </Text>
          ) : (
            calendars.map((c) => {
              const selected = c.id === chosenCalendarId
              return (
                <Pressable
                  key={c.id}
                  onPress={() => { hapticSelection(); setChosenCalendarId(c.id) }}
                  style={({ pressed }) => [
                    styles.calRow,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${c.title} (${c.source})`}
                >
                  <View style={[styles.calDot, { backgroundColor: c.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500' }}>
                      {c.title}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>{c.source}</Text>
                  </View>
                  {selected && (
                    <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15), fontWeight: '700' }}>✓</Text>
                  )}
                </Pressable>
              )
            })
          )}
        </Field>

        {/* H17: Non-default-calendar banner — shown when the picked
            calendar is from a non-iCloud / non-local account so the user
            understands the event will appear in (and sync to) that
            account's calendar app. */}
        {(() => {
          const chosen = calendars.find((c) => c.id === chosenCalendarId)
          if (!chosen) return null
          const lower = (chosen.source ?? '').toLowerCase()
          const isNonLocal = lower && lower !== 'local' && lower !== 'icloud' && lower !== 'default'
          if (!isNonLocal) return null
          return (
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                marginTop: -8,
                marginBottom: 14,
                marginHorizontal: 4,
                lineHeight: 17,
              }}
            >
              This event will be added to {chosen.source} and will appear in your other {chosen.source} apps.
            </Text>
          )
        })()}

        {/* Show As (Free / Busy) */}
        <Field colors={colors}>
          <Pressable onPress={() => setShowAs((p) => p === 'busy' ? 'free' : 'busy')}>
            <Row colors={colors} label="Show As" labelSize={getScaledFontSize(15)}>
              <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15), textTransform: 'capitalize' }}>
                {showAs} ›
              </Text>
            </Row>
          </Pressable>
        </Field>

        {/* URL */}
        <Field colors={colors}>
          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
            URL
          </Text>
          <TextInput
            style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(15) }]}
            placeholder="https://"
            placeholderTextColor={colors.subtext}
            value={url}
            onChangeText={setUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>

        {/* Notes */}
        <Field colors={colors}>
          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
            NOTES
          </Text>
          <TextInput
            style={[styles.input, styles.multiline, { color: colors.text, fontSize: getScaledFontSize(15) }]}
            placeholder="Add notes"
            placeholderTextColor={colors.subtext}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </Field>

        {/* Alert (first) */}
        {canSetReminder && (
        <Field colors={colors}>
          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
            ALERT — minutes before
          </Text>
          <View style={styles.chips}>
            {ALARM_OPTIONS.map((opt) => {
              const sel = selectedAlarms.includes(opt.minutes)
              return (
                <Pressable
                  key={opt.minutes}
                  onPress={() => { hapticSelection(); toggleAlarm(opt.minutes) }}
                  style={[
                    styles.chip,
                    { borderColor: sel ? colors.tint : colors.border, backgroundColor: sel ? colors.tint : 'transparent' },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${opt.label} alert`}
                >
                  <Text
                    style={{
                      color: sel ? '#fff' : colors.text,
                      fontSize: getScaledFontSize(12),
                      fontWeight: '600',
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Field>

        )}

        {/* H10: Second Alert — single-select picker (None + the same
            ALARM_OPTIONS). Apple's "Second Alert" pattern. */}
        {canSetReminder && (
        <Field colors={colors}>
          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
            SECOND ALERT
          </Text>
          <View style={styles.chips}>
            {/* "None" chip */}
            <Pressable
              onPress={() => { hapticSelection(); setSecondAlarm(null) }}
              style={[
                styles.chip,
                {
                  borderColor: secondAlarm === null ? colors.tint : colors.border,
                  backgroundColor: secondAlarm === null ? colors.tint : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: secondAlarm === null }}
            >
              <Text
                style={{
                  color: secondAlarm === null ? '#fff' : colors.text,
                  fontSize: getScaledFontSize(12),
                  fontWeight: '600',
                }}
              >
                None
              </Text>
            </Pressable>
            {ALARM_OPTIONS.map((opt) => {
              const sel = secondAlarm === opt.minutes
              return (
                <Pressable
                  key={opt.minutes}
                  onPress={() => { hapticSelection(); setSecondAlarm(opt.minutes) }}
                  style={[
                    styles.chip,
                    { borderColor: sel ? colors.tint : colors.border, backgroundColor: sel ? colors.tint : 'transparent' },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${opt.label} second alert`}
                >
                  <Text
                    style={{
                      color: sel ? '#fff' : colors.text,
                      fontSize: getScaledFontSize(12),
                      fontWeight: '600',
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Field>
        )}
      </ScrollView>
      )}

      <HipaaDisclosureModal
        visible={showHipaa}
        onAccept={acceptHipaa}
        onCancel={() => setShowHipaa(false)}
      />

      {/* Picker modals */}
      <TimeZonePicker
        visible={showTzPicker}
        selectedZone={timeZone}
        onSelect={setTimeZone}
        onClose={() => setShowTzPicker(false)}
      />
      <SelectionPicker
        visible={showRepeatPicker}
        title="Repeat"
        options={REPEAT_OPTIONS}
        selectedValue={repeatValue}
        onSelect={setRepeatValue}
        onClose={() => setShowRepeatPicker(false)}
      />
      <SelectionPicker
        visible={showTravelPicker}
        title="Travel Time"
        options={TRAVEL_TIME_OPTIONS}
        selectedValue={travelTimeValue}
        onSelect={setTravelTimeValue}
        onClose={() => setShowTravelPicker(false)}
      />
    </KeyboardAvoidingView>

    {/* SCRUM-279 (build 50): Ken asked for a clear loading indicator
        when creating an event so it's obvious the save is in flight.
        The "Saving…" button label alone wasn't visible enough on the
        full-screen editor. Full-screen overlay with spinner + label,
        sits on top of the SafeAreaView so it covers the form. */}
    {isSaving ? (
      <View pointerEvents="auto" style={editorStyles.savingOverlay}>
        <View style={editorStyles.savingCard}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(15),
              fontWeight: '600',
              marginTop: 12,
              letterSpacing: 0.3,
            }}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {isEditMode ? 'Saving event…' : 'Adding event…'}
          </Text>
        </View>
      </View>
    ) : null}
    </SafeAreaView>
  )
}

const editorStyles = StyleSheet.create({
  savingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  savingCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
})

function fmtDateLabel(d: Date, allDay: boolean): string {
  try {
    if (allDay) {
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    }
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return d.toString()
  }
}

interface FieldProps { colors: typeof Colors.light; children: React.ReactNode }
function Field({ colors, children }: FieldProps) {
  return (
    <View style={[styles.field, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      {children}
    </View>
  )
}

interface RowProps { colors: typeof Colors.light; label: string; labelSize: number; children: React.ReactNode }
function Row({ colors, label, labelSize, children }: RowProps) {
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.text, fontSize: labelSize, fontWeight: '500' }}>{label}</Text>
      {children}
    </View>
  )
}

interface HipaaProps { visible: boolean; onAccept: () => void; onCancel: () => void }
function HipaaDisclosureModal({ visible, onAccept, onCancel }: HipaaProps) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
          <Text style={[styles.modalTitle, { color: colors.text, fontSize: getScaledFontSize(17) }]}>
            Before saving
          </Text>
          <Text style={[styles.modalBody, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
            Events you create in Circle Support Health are saved to the calendar you selected. That calendar may sync to your other devices and cloud services (iCloud, Google, Microsoft / Exchange) based on your existing account setup.{'\n\n'}
            If this event contains medical or other sensitive details, choose a calendar that is local-only or not synced to a cloud service.
          </Text>
          <View style={styles.modalActions}>
            <Pressable onPress={onCancel} style={styles.modalBtn} accessibilityRole="button" accessibilityLabel="Go back">
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(15) }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onAccept}
              style={[styles.modalBtn, { backgroundColor: colors.tint, borderRadius: 10, paddingHorizontal: 16 }]}
              accessibilityRole="button"
              accessibilityLabel="I understand, save the event"
            >
              <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: '600' }}>I understand</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Left + right halves get equal width so the title can truly center
  // even when the labels differ ("Cancel" vs "Save"). Apple's iOS UIKit
  // navbar does the same.
  headerSide: { flex: 1, alignItems: 'flex-start', paddingVertical: 4 },
  headerSideRight: { alignItems: 'flex-end' },
  headerTitle: { fontWeight: '700', textAlign: 'center', flexShrink: 1, letterSpacing: -0.2 },
  headerBtn: { paddingVertical: 2 },
  headerBtnPrimary: { fontWeight: '600' },
  field: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { fontWeight: '700', letterSpacing: 0.6, marginTop: 8, marginBottom: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: -14 },
  titleInput: { fontWeight: '700', paddingVertical: 12 },
  input: { paddingVertical: 12 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  calDot: { width: 14, height: 14, borderRadius: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 },
  modalTitle: { fontWeight: '700', marginBottom: 12 },
  modalBody: { lineHeight: 20, marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 12 },
})
