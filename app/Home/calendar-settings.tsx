/**
 * Calendar settings screen — controls which calendars are visible in
 * the main calendar view. Useful for hiding noisy calendars (holidays /
 * sports / shared family) and for diagnosing missing calendars (Teams,
 * Outlook) — if a user expects to see those and they're not in the list,
 * the issue is upstream in iOS Settings → Calendar → Accounts (the
 * help text on this screen explains how to fix that).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Calendar from 'expo-calendar'
import { Platform } from 'react-native'
import { readReminders, readEvents } from '@/services/calendar'
import { clearAllAppNotifications } from '@/services/calendar-notifications'
import { buildAndUploadSnapshot } from '@/services/calendar-sync'
import { router } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useCalendar } from '@/hooks/use-calendar'
import { useCalendarPermissions } from '@/hooks/use-calendar-permissions'
import { useCanRender } from '@/hooks/use-entitlement'
import { CalendarPermissionGate } from '@/components/calendar/CalendarPermissionGate'
import {
  getCalendarPreferences,
  setCalendarPreferences,
  type CalendarPreferences,
  type StartWeekDay,
} from '@/services/calendar-preferences'
import {
  SelectionPicker,
  type SelectionOption,
} from '@/components/calendar/pickers'
import { hapticSelection } from '@/utils/haptics'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

const START_WEEK_OPTIONS: SelectionOption<string>[] = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '6', label: 'Saturday' },
]

const ALARM_OPTIONS: { label: string; minutes: number }[] = [
  { label: 'At time', minutes: 0 },
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 60 * 24 },
]

/**
 * SCRUM-279 (build 47): calendar diagnostic. Surfaces EXACTLY what
 * iOS exposes about the user's calendars and reminders so we (and
 * Ken) can see whether a missing-reminders symptom is:
 *   a) Reminders permission undetermined / denied
 *   b) The Reminders list isn't in iOS's accessible set
 *   c) iOS returned dueDate / dueDateComponents in a shape our
 *      mapper doesn't handle
 *   d) Render-side filtering elsewhere
 *
 * No PHI is logged or alert-rendered — only titles + counts + ISO
 * dates, in an opt-in user-initiated dialog. The Alert auto-dismisses
 * so nothing is persisted.
 */
async function showCalendarDiagnostic(): Promise<void> {
  const lines: string[] = []
  try {
    if (Platform.OS !== 'ios') {
      Alert.alert('Calendar diagnostic', 'iOS-only diagnostic (this is the only platform with Reminders).')
      return
    }
    const cal = await Calendar.getCalendarPermissionsAsync()
    const rem = await Calendar.getRemindersPermissionsAsync()
    lines.push(`Calendar permission: ${cal.status}`)
    lines.push(`Reminders permission: ${rem.status}`)

    let eventCals: Calendar.Calendar[] = []
    let reminderCals: Calendar.Calendar[] = []
    try { eventCals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT) } catch (e) {
      lines.push(`getCalendarsAsync(EVENT) failed: ${String(e).slice(0, 80)}`)
    }
    try { reminderCals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER) } catch (e) {
      lines.push(`getCalendarsAsync(REMINDER) failed: ${String(e).slice(0, 80)}`)
    }
    lines.push('')
    lines.push(`Event calendars (${eventCals.length}):`)
    for (const c of eventCals.slice(0, 10)) {
      lines.push(`  • ${c.title} (${c.source?.name ?? '?'})`)
    }
    if (eventCals.length > 10) lines.push(`  …and ${eventCals.length - 10} more`)

    lines.push('')
    lines.push(`Reminder lists (${reminderCals.length}):`)
    for (const c of reminderCals.slice(0, 10)) {
      lines.push(`  • ${c.title} (${c.source?.name ?? '?'})`)
    }
    if (reminderCals.length > 10) lines.push(`  …and ${reminderCals.length - 10} more`)

    // Pull what our mapper would produce, in a small window so the
    // dialog stays readable.
    const windowStart = new Date(Date.now() - 1 * 24 * 60 * 60_000)
    const windowEnd = new Date(Date.now() + 7 * 24 * 60 * 60_000)
    const [evs, rems] = await Promise.all([
      readEvents({ windowStart, windowEnd }).catch(() => []),
      readReminders({ windowStart, windowEnd }).catch(() => []),
    ])
    lines.push('')
    lines.push(`Events in ±7 day window: ${evs.length}`)
    lines.push(`Reminders in ±7 day window: ${rems.length}`)
    if (rems.length > 0) {
      lines.push('Sample reminders:')
      for (const r of rems.slice(0, 5)) {
        const tag = r.allDay ? 'all-day' : 'timed'
        lines.push(`  • ${r.title} [${tag}] @ ${r.startDate.slice(0, 16).replace('T', ' ')}`)
      }
    } else {
      lines.push('(No reminders returned. If you can see one in the iOS Reminders app, it may be in a list this app can\'t access — check Settings → CSH → Reminders → Full Access.)')
    }
  } catch (err) {
    lines.push('')
    lines.push(`Unhandled error: ${String(err).slice(0, 120)}`)
  }
  Alert.alert('Calendar diagnostic', lines.join('\n'))
}

export default function CalendarSettingsScreen() {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const permissions = useCalendarPermissions()
  // Entitlement gates — hooks, so unconditional and at the top.
  const canView = useCanRender('calendar-settings.view')
  const canSelectDefaultCalendar = useCanRender('calendar-settings.select-default-calendar')
  const canConnectGoogleCalendar = useCanRender('calendar-settings.connect-google-calendar')
  const {
    calendars,
    hiddenCalendarIds,
    notificationDisabledCalendarIds,
    toggleCalendarVisibility,
    toggleCalendarNotifications,
    isLoading,
  } = useCalendar({ includeReminders: true })

  // Preferences state. Load on mount, patch on each user action.
  const [prefs, setPrefs] = useState<CalendarPreferences | null>(null)
  useEffect(() => { void getCalendarPreferences().then(setPrefs) }, [])

  const updatePref = useCallback(async (patch: Partial<CalendarPreferences>) => {
    hapticSelection()
    const next = await setCalendarPreferences(patch)
    setPrefs(next)
  }, [])

  // Picker visibility
  const [showStartWeekPicker, setShowStartWeekPicker] = useState(false)
  const [showDefaultCalPicker, setShowDefaultCalPicker] = useState(false)

  // Group by source ("iCloud", "Google", "Outlook", "Local", ...) so the
  // list reads like Apple's Settings → Calendar → Accounts view.
  const grouped = groupBySource(calendars)

  const writableCalendars = calendars.filter((c) => c.allowsWrite)
  const defaultCalOptions: SelectionOption<string>[] = writableCalendars.map((c) => ({
    value: c.id,
    label: c.title,
    sublabel: c.source,
  }))
  const defaultCalLabel =
    prefs?.defaultCalendarId
      ? writableCalendars.find((c) => c.id === prefs.defaultCalendarId)?.title ?? 'Select…'
      : 'Use first available'

  // Show All / Hide All — toggle every calendar's visibility in one go.
  const toggleAll = async (show: boolean) => {
    hapticSelection()
    for (const c of calendars) {
      const isHidden = hiddenCalendarIds.has(c.id)
      if (show && isHidden) await toggleCalendarVisibility(c.id)
      else if (!show && !isHidden) await toggleCalendarVisibility(c.id)
    }
  }

  return (
    <AppWrapper showFooter showHamburgerIcon>
      <CalendarPermissionGate permissions={permissions}>
        {canView && <ScrollView
          style={[styles.root, { backgroundColor: colors.background }]}
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        >
          {/* router.back() from a hidden sibling tab falls through to the
              Home index, not to the Calendar tab. Route explicitly. */}
          <Pressable onPress={() => router.replace('/Home/appointments' as never)} style={styles.backRow}>
            <Text style={[styles.backText, { color: colors.tint, fontSize: getScaledFontSize(15) }]}>
              ← Back
            </Text>
          </Pressable>

          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22) }]}>
            Calendar settings
          </Text>
          <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
            Show or hide individual calendars. Hidden calendars won&apos;t appear in your views or trigger notifications.
          </Text>

          {/* ── PREFERENCES section (I3/I8/I9/I10/I11/J1) ─────────────── */}
          {prefs && (
            <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.sectionHeader, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>
                PREFERENCES
              </Text>

              {/* SCRUM-279 (2026-06-08): Sync now — pushes a snapshot
                  of this device's calendar + reminders to the backend
                  immediately. Diagnostic for cross-device parity
                  ("iPad doesn't see iPhone reminders"). */}
              <Pressable
                onPress={async () => {
                  try {
                    const written = await buildAndUploadSnapshot()
                    Alert.alert('Sync sent', `Uploaded ${written} events + reminders to the backend. Open the calendar on your other device and pull to refresh to see them merge in.`)
                  } catch (e) {
                    Alert.alert('Sync failed', String(e))
                  }
                }}
                style={[styles.prefRow, { borderBottomColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Sync calendar to backend now"
              >
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500', flex: 1 }}>
                  Sync now (cross-device)
                </Text>
                <Text style={{ color: colors.tint, fontSize: getScaledFontSize(13), fontWeight: '600' }}>
                  Upload ›
                </Text>
              </Pressable>

              {/* SCRUM-279 (build 47): Calendar diagnostic — shows
                  EXACTLY what iOS is returning so Ken can see if the
                  "missing reminders" problem is a permission state, a
                  Reminders-list visibility issue, or a render bug. */}
              <Pressable
                onPress={async () => { await showCalendarDiagnostic() }}
                style={[styles.prefRow, { borderBottomColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Show calendar diagnostic"
              >
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500', flex: 1 }}>
                  Calendar diagnostic
                </Text>
                <Text style={{ color: colors.tint, fontSize: getScaledFontSize(13), fontWeight: '600' }}>
                  Inspect ›
                </Text>
              </Pressable>

              {/* SCRUM-279: Clear notification queue — recovery for
                  full-queue state. iOS hard-caps local notifications
                  at 64; once saturated, all new schedules silently
                  drop. Tapping this wipes every csh-tagged
                  notification (calendar + test). */}
              <Pressable
                onPress={async () => {
                  const removed = await clearAllAppNotifications()
                  const all = await Notifications.getAllScheduledNotificationsAsync()
                  Alert.alert(
                    'Queue cleared',
                    `Removed ${removed} app-tagged notifications. ${all.length} remain in the queue (other apps / system).\n\nNew event notifications will schedule on the next calendar refresh.`,
                  )
                }}
                style={[styles.prefRow, { borderBottomColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Clear notification queue"
              >
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500', flex: 1 }}>
                  Clear notification queue
                </Text>
                <Text style={{ color: '#FF3B30', fontSize: getScaledFontSize(13), fontWeight: '600' }}>
                  Reset ›
                </Text>
              </Pressable>

              {/* J1: Show Reminders toggle */}
              <View style={[styles.prefRow, { borderBottomColor: colors.border }]}>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500', flex: 1 }}>
                  Show iOS Reminders
                </Text>
                <Switch
                  value={prefs.showReminders}
                  onValueChange={(v) => void updatePref({ showReminders: v })}
                  accessibilityLabel="Show iOS Reminders alongside events"
                />
              </View>

              {/* I6: Holidays toggle */}
              <View style={[styles.prefRow, { borderBottomColor: colors.border }]}>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500', flex: 1 }}>
                  Show Holidays
                </Text>
                <Switch
                  value={prefs.showHolidays}
                  onValueChange={(v) => void updatePref({ showHolidays: v })}
                  accessibilityLabel="Show holidays calendar"
                />
              </View>

              {/* I10: Start Week On */}
              <Pressable
                onPress={() => { hapticSelection(); setShowStartWeekPicker(true) }}
                style={[styles.prefRow, { borderBottomColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Choose start of week"
              >
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500', flex: 1 }}>
                  Start Week On
                </Text>
                <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15) }}>
                  {START_WEEK_OPTIONS.find((o) => o.value === String(prefs.startWeekDay))?.label ?? 'Sunday'} ›
                </Text>
              </Pressable>

              {/* I8: Default Calendar */}
              {canSelectDefaultCalendar && <Pressable
                onPress={() => { hapticSelection(); setShowDefaultCalPicker(true) }}
                style={[styles.prefRow, { borderBottomColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Choose default calendar"
              >
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500', flex: 1 }}>
                  Default Calendar
                </Text>
                <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15) }} numberOfLines={1}>
                  {defaultCalLabel} ›
                </Text>
              </Pressable>}

              {/* I11: Time Zone Override */}
              {/* 2026-08-14 — "Time Zone Override" REMOVED.
                  Its declared contract was "if set, render all event times in
                  this TZ". Nothing read it: the only three references were
                  this row, the picker, and the type. A traveller could set it
                  and every time on every screen stayed in device local.
                  Honouring it properly means threading a zone through every
                  time formatter in the app — a real feature, not a bug fix —
                  so the dead control is gone rather than left promising
                  something. Same call as the three digest switches. */}

              {/* I9: Default Alert Times */}
              <View style={[styles.prefRow, { borderBottomColor: 'transparent', paddingTop: 12, paddingBottom: 16, flexWrap: 'wrap', alignItems: 'flex-start' }]}>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500', width: '100%', marginBottom: 8 }}>
                  Default Alert Times
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {ALARM_OPTIONS.map((opt) => {
                    const sel = prefs.defaultAlertMinutes.includes(opt.minutes)
                    return (
                      <Pressable
                        key={opt.minutes}
                        onPress={() => {
                          const next = sel
                            ? prefs.defaultAlertMinutes.filter((m) => m !== opt.minutes)
                            : [...prefs.defaultAlertMinutes, opt.minutes].sort((a, b) => a - b)
                          void updatePref({ defaultAlertMinutes: next })
                        }}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: sel ? colors.tint : colors.border,
                          backgroundColor: sel ? colors.tint : 'transparent',
                        }}
                      >
                        <Text style={{ color: sel ? '#fff' : colors.text, fontSize: getScaledFontSize(11), fontWeight: '600' }}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            </View>
          )}

          {/* I3: Show All / Hide All quick actions */}
          {calendars.length > 0 && (
            <View style={styles.showAllRow}>
              <Pressable onPress={() => void toggleAll(true)} hitSlop={6}>
                <Text style={{ color: colors.tint, fontSize: getScaledFontSize(14), fontWeight: '600' }}>
                  Show All Calendars
                </Text>
              </Pressable>
              <Pressable onPress={() => void toggleAll(false)} hitSlop={6}>
                <Text style={{ color: colors.tint, fontSize: getScaledFontSize(14), fontWeight: '600' }}>
                  Hide All
                </Text>
              </Pressable>
            </View>
          )}

          {isLoading ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : grouped.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
                No calendars found
              </Text>
              <Text style={[styles.emptyBody, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
                We can only see calendars from accounts you&apos;ve added in iOS Settings.
              </Text>
            </View>
          ) : (
            grouped.map((group) => (
              <View key={group.source} style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <Text style={[styles.sectionHeader, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>
                  {group.source.toUpperCase()}
                </Text>
                {group.items.map((cal) => {
                  const hidden = hiddenCalendarIds.has(cal.id)
                  const notifOff = notificationDisabledCalendarIds.has(cal.id)
                  return (
                    <View
                      key={cal.id}
                      style={[styles.row, { borderBottomColor: colors.border }]}
                    >
                      <View style={[styles.dot, { backgroundColor: cal.color }]} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '500' }}>
                          {cal.title}
                        </Text>
                        {cal.allowsWrite ? null : (
                          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11) }}>
                            Read-only
                          </Text>
                        )}
                      </View>
                      <View style={styles.rowControls}>
                        <View style={styles.toggleColumn}>
                          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(10), fontWeight: '600' }}>
                            SHOW
                          </Text>
                          <Switch
                            value={!hidden}
                            onValueChange={() => void toggleCalendarVisibility(cal.id)}
                            accessibilityLabel={`Toggle visibility of ${cal.title}`}
                          />
                        </View>
                        <View style={styles.toggleColumn}>
                          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(10), fontWeight: '600' }}>
                            NOTIFY
                          </Text>
                          <Switch
                            value={!notifOff}
                            onValueChange={() => void toggleCalendarNotifications(cal.id)}
                            disabled={hidden}
                            accessibilityLabel={`Toggle notifications for ${cal.title}`}
                          />
                        </View>
                      </View>
                    </View>
                  )
                })}
              </View>
            ))
          )}

          {/* Help — Teams / Outlook / Google calendars missing? */}
          <View style={[styles.helpCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.helpTitle, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
              Missing Outlook, Teams, or Google calendars?
            </Text>
            <Text style={[styles.helpBody, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
              iOS Calendar can only see calendars from accounts you&apos;ve added in iOS Settings. Microsoft Teams meetings
              and Outlook events sync through your Exchange or Outlook account.
              {'\n\n'}To add them:
              {'\n\n'}1. Open iOS Settings → Apps → Calendar → Calendar Accounts (or Mail → Accounts)
              {'\n'}2. Add Account → choose your provider (Outlook, Exchange, Google)
              {'\n'}3. Make sure the Calendar toggle is ON for that account
              {'\n\n'}Once that&apos;s done, return here and pull to refresh — your calendars will appear.
            </Text>
            {/* Gate the shortcut only, not the copy above it — the numbered
                steps still tell an ungated user how to add the account by
                hand, so nobody is stranded with no calendars and no way in. */}
            {canConnectGoogleCalendar && <Pressable
              onPress={() => Linking.openSettings().catch(() => {})}
              style={({ pressed }) => [
                styles.helpBtn,
                { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open iOS Settings"
            >
              <Text style={[styles.helpBtnText, { fontSize: getScaledFontSize(14) }]}>Open iOS Settings</Text>
            </Pressable>}
          </View>
        </ScrollView>}

        {/* Picker modals (rendered outside the ScrollView so they
            present full-screen). */}
        <SelectionPicker
          visible={showStartWeekPicker}
          title="Start Week On"
          options={START_WEEK_OPTIONS}
          selectedValue={String(prefs?.startWeekDay ?? 0)}
          onSelect={(v) => void updatePref({ startWeekDay: parseInt(v, 10) as StartWeekDay })}
          onClose={() => setShowStartWeekPicker(false)}
        />
        <SelectionPicker
          visible={showDefaultCalPicker}
          title="Default Calendar"
          options={defaultCalOptions}
          selectedValue={prefs?.defaultCalendarId ?? ''}
          onSelect={(v) => void updatePref({ defaultCalendarId: v })}
          onClose={() => setShowDefaultCalPicker(false)}
        />
      </CalendarPermissionGate>
    </AppWrapper>
  )
}

interface SourceGroup {
  source: string
  items: ReturnType<typeof useCalendar>['calendars']
}

function groupBySource(calendars: ReturnType<typeof useCalendar>['calendars']): SourceGroup[] {
  const map = new Map<string, SourceGroup['items']>()
  for (const c of calendars) {
    const key = c.source
    const bucket = map.get(key)
    if (bucket) bucket.push(c)
    else map.set(key, [c])
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, items]) => ({ source, items }))
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingVertical: 8 },
  backText: { fontWeight: '600' },
  title: { fontWeight: '700', marginTop: 8 },
  subtitle: { marginTop: 6, marginBottom: 16, lineHeight: 18 },
  section: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 16, paddingTop: 8 },
  sectionHeader: { fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 14, paddingBottom: 4 },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  showAllRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleColumn: { alignItems: 'center', gap: 4 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  emptyCard: { padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 16 },
  emptyTitle: { fontWeight: '700', marginBottom: 4 },
  emptyBody: { lineHeight: 18 },
  helpCard: { padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  helpTitle: { fontWeight: '700', marginBottom: 6 },
  helpBody: { lineHeight: 18, marginBottom: 12 },
  helpBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignSelf: 'flex-start' },
  helpBtnText: { color: '#fff', fontWeight: '700' },
})
