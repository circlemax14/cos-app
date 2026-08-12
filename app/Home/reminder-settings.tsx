import React from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { Card } from 'react-native-paper'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchHealthPlanReminderPrefs,
  updateHealthPlanReminderPrefs,
  fetchTimezonePref,
  updateTimezonePref,
  type HealthPlanReminderPrefs,
} from '@/services/api/notification-prefs'
import {
  NOTIFICATION_CATEGORIES_ENABLED,
  NOTIFICATION_CATEGORY_KEYS,
  type NotificationCategory,
} from '@/lib/notification-categories'
import {
  useNotificationCategories,
  useUpdateNotificationCategories,
} from '@/hooks/use-notification-categories'
import { useProactiveNudgesFlag } from '@/hooks/use-proactive-nudges-flag'

// Top-30 IANA timezones surfaced in the picker. Anything outside this
// list falls back to the device-detected default — the picker can't
// cover the full 600+ IANA registry on a phone-sized screen, but
// these cover the vast majority of our users.
const TIMEZONE_OPTIONS: { id: string; label: string }[] = [
  { id: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { id: 'America/Denver',      label: 'Mountain Time (US)' },
  { id: 'America/Phoenix',     label: 'Arizona (US)' },
  { id: 'America/Chicago',     label: 'Central Time (US)' },
  { id: 'America/New_York',    label: 'Eastern Time (US)' },
  { id: 'America/Anchorage',   label: 'Alaska (US)' },
  { id: 'Pacific/Honolulu',    label: 'Hawaii (US)' },
  { id: 'America/Toronto',     label: 'Toronto' },
  { id: 'America/Vancouver',   label: 'Vancouver' },
  { id: 'America/Mexico_City', label: 'Mexico City' },
  { id: 'America/Sao_Paulo',   label: 'São Paulo' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { id: 'Europe/London',       label: 'London' },
  { id: 'Europe/Dublin',       label: 'Dublin' },
  { id: 'Europe/Paris',        label: 'Paris' },
  { id: 'Europe/Berlin',       label: 'Berlin' },
  { id: 'Europe/Madrid',       label: 'Madrid' },
  { id: 'Europe/Rome',         label: 'Rome' },
  { id: 'Europe/Amsterdam',    label: 'Amsterdam' },
  { id: 'Europe/Stockholm',    label: 'Stockholm' },
  { id: 'Europe/Athens',       label: 'Athens' },
  { id: 'Europe/Istanbul',     label: 'Istanbul' },
  { id: 'Africa/Cairo',        label: 'Cairo' },
  { id: 'Africa/Lagos',        label: 'Lagos' },
  { id: 'Asia/Dubai',          label: 'Dubai' },
  { id: 'Asia/Kolkata',        label: 'India (IST)' },
  { id: 'Asia/Bangkok',        label: 'Bangkok' },
  { id: 'Asia/Singapore',      label: 'Singapore' },
  { id: 'Asia/Hong_Kong',      label: 'Hong Kong' },
  { id: 'Asia/Tokyo',          label: 'Tokyo' },
  { id: 'Asia/Seoul',          label: 'Seoul' },
  { id: 'Australia/Sydney',    label: 'Sydney' },
  { id: 'Pacific/Auckland',    label: 'Auckland' },
]

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function timezoneDisplayLabel(tzId: string | null | undefined): string {
  if (!tzId) return 'Use device time'
  const known = TIMEZONE_OPTIONS.find((o) => o.id === tzId)
  return known ? known.label : tzId
}

interface SlotSpec {
  key: keyof HealthPlanReminderPrefs
  title: string
  subtitle: string
  iconName: keyof typeof MaterialIcons.glyphMap
}

const SLOTS: SlotSpec[] = [
  { key: 'am',     title: 'Morning kickoff', subtitle: 'Around 9:00 AM — what\'s on your plan today', iconName: 'wb-sunny' },
  { key: 'midday', title: 'Midday check-in', subtitle: 'Around 1:00 PM — pending tasks reminder', iconName: 'schedule' },
  { key: 'eod',    title: 'End of day', subtitle: 'Around 7:00 PM — final nudge before bed', iconName: 'nightlight-round' },
]

// COS-373: notification-category rows. Each maps to one server preference key.
// Only rendered when NOTIFICATION_CATEGORIES_ENABLED. "Other tasks" starts OFF
// (server default) so users aren't pinged for non-medication tasks by default.
interface CategorySpec {
  key: NotificationCategory
  title: string
  subtitle: string
  iconName: keyof typeof MaterialIcons.glyphMap
}

const CATEGORY_SPECS: Record<NotificationCategory, CategorySpec> = {
  appointments: {
    key: 'appointments',
    title: 'Appointments',
    subtitle: 'Reminders before your upcoming visits',
    iconName: 'local-hospital',
  },
  reminders: {
    key: 'reminders',
    title: 'Reminders',
    subtitle: 'General plan reminders and nudges',
    iconName: 'notifications',
  },
  medicationReminders: {
    key: 'medicationReminders',
    title: 'Medication reminders',
    subtitle: 'Refill and supply reminders for your medications',
    iconName: 'medication',
  },
  medicationTask: {
    key: 'medicationTask',
    title: 'Medication tasks',
    subtitle: 'Alerts when it\'s time to take a dose',
    iconName: 'alarm',
  },
  otherTask: {
    key: 'otherTask',
    title: 'Other tasks',
    subtitle: 'Alerts for non-medication plan tasks (exercise, check-ins)',
    iconName: 'check-circle-outline',
  },
  // SCRUM-641 (2026-08-04) — Proactive Nudges category toggle.
  nudges: {
    key: 'nudges',
    title: 'Proactive nudges',
    subtitle: 'AI-informed prompts when a signal drops (readiness, mood, streak breaks)',
    iconName: 'psychology',
  },
  // SCRUM-659 (2026-08-05) — Habit reminders. Cadence-driven dispatch
  // via a scheduled sweeper (SCRUM-666 follow-up wires the actual cron).
  habits: {
    key: 'habits',
    title: 'Routine reminders',
    // Re-voiced for #13: routines are the structure of the day, not the
    // positive behaviours (those are tasks). The old examples were tasks.
    subtitle: 'Reminders for the routines on your plan — meals, washing, appointments, classes.',
    iconName: 'repeat',
  },
  // 2026-08-12 — vitals rechecks, scheduled locally when a reading goes
  // amber/red. Its own row rather than folded into "Other tasks" (the only
  // category that defaults OFF, which would silence the most clinically
  // urgent alert we send) or "Proactive nudges" (which promises AI-informed
  // prompts; these are rule-based).
  healthAlerts: {
    key: 'healthAlerts',
    title: 'Health alerts',
    subtitle: 'A nudge to recheck a reading when blood pressure, glucose, heart rate or oxygen looks off.',
    iconName: 'favorite',
  },
}

/**
 * Settings screen for Health Plan reminder push notifications. Lets users
 * opt out of each daily slot (am / midday / eod). Default state is all-on
 * — server treats missing prefs as opted-in.
 *
 * Reachable from the side menu under My Health → Reminders.
 */
export default function ReminderSettingsScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['reminder-prefs'],
    queryFn: fetchHealthPlanReminderPrefs,
  })

  const mutation = useMutation({
    mutationFn: (partial: Partial<HealthPlanReminderPrefs>) => updateHealthPlanReminderPrefs(partial),
    onSuccess: (updated) => {
      queryClient.setQueryData(['reminder-prefs'], updated)
    },
  })

  // SCRUM-257: timezone preference for per-user reminder routing.
  const tzQuery = useQuery({
    queryKey: ['timezone-pref'],
    queryFn: fetchTimezonePref,
  })
  const tzMutation = useMutation({
    mutationFn: (timezone: string | null) => updateTimezonePref(timezone),
    onSuccess: (updated) => {
      queryClient.setQueryData(['timezone-pref'], updated)
      setPickerOpen(false)
    },
  })
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const storedTz = tzQuery.data?.timezone ?? null
  const effectiveTz = storedTz ?? deviceTimezone()

  // COS-373: notification-category preferences. The hooks always run (cheap +
  // defensive), but the section below only renders when the client kill-switch
  // is on AND the server reports the feature flagEnabled.
  const categoriesQuery = useNotificationCategories()
  const categoriesMutation = useUpdateNotificationCategories()
  const categoryPrefs = categoriesQuery.data?.preferences
  const showCategories =
    NOTIFICATION_CATEGORIES_ENABLED && categoriesQuery.data?.flagEnabled === true

  // SCRUM-641 — Proactive Nudges entry point. Only rendered when the
  // backend flag is ON (default-OFF while loading — see hook). Row nav's
  // to /Home/nudges. Not linked from Home/index.tsx to avoid discovery
  // before Ken tunes templates.
  const showProactiveNudgesRow = useProactiveNudgesFlag()

  // On first launch (and any time the user has no stored TZ), auto-write
  // the device-detected TZ so the new sweeper has something to work with
  // without forcing the user to discover the settings screen.
  React.useEffect(() => {
    if (tzQuery.isLoading) return
    if (tzQuery.data === undefined) return
    if (tzQuery.data.timezone) return
    const detected = deviceTimezone()
    if (!detected || detected === 'UTC') return
    tzMutation.mutate(detected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tzQuery.isLoading, tzQuery.data?.timezone])

  const prefs = query.data ?? { am: true, midday: true, eod: true }

  return (
    <AppWrapper>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              marginLeft: 12,
              flex: 1,
            }}
          >
            Reminders
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 14 }}>
            Daily push reminders for your Health Plan tasks. We&apos;ll only notify you when you have pending tasks — completed days won&apos;t trigger reminders.
          </Text>

          {SLOTS.map((slot) => {
            const enabled = prefs[slot.key]
            return (
              <Card key={slot.key} style={[styles.row, { backgroundColor: colors.card }]}>
                <Card.Content style={styles.rowContent}>
                  <View style={[styles.iconWrap, { backgroundColor: (colors.tint as string) + '22' }]}>
                    <MaterialIcons name={slot.iconName} size={20} color={colors.tint as string} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>
                      {slot.title}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                      {slot.subtitle}
                    </Text>
                  </View>
                  <Switch
                    value={enabled}
                    onValueChange={(value) => mutation.mutate({ [slot.key]: value })}
                    disabled={mutation.isPending}
                    accessibilityLabel={`${slot.title} ${enabled ? 'enabled' : 'disabled'}`}
                  />
                </Card.Content>
              </Card>
            )
          })}

          {/* SCRUM-257: timezone picker. Surfaces the effective TZ (stored
              if the user picked one, else the device-detected default) and
              lets the user override. */}
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any, marginTop: 22, marginBottom: 10, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Timezone
          </Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Change reminder timezone"
            style={({ pressed }) => [
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Card style={[styles.row, { backgroundColor: colors.card }]}>
              <Card.Content style={styles.rowContent}>
                <View style={[styles.iconWrap, { backgroundColor: (colors.tint as string) + '22' }]}>
                  <MaterialIcons name="public" size={20} color={colors.tint as string} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>
                    {timezoneDisplayLabel(effectiveTz)}
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                    Reminders will fire in your local morning / midday / evening
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={colors.subtext} />
              </Card.Content>
            </Card>
          </Pressable>

          {/* COS-373: notification categories. Lets the patient mute whole
              categories of notifications (Ken's "too many notifications"). Only
              rendered when the client kill-switch is on and the server reports
              the feature enabled — otherwise this section is absent and the
              screen looks exactly as before. */}
          {showCategories && categoryPrefs ? (
            <>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any, marginTop: 22, marginBottom: 10, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Notification categories
              </Text>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginBottom: 12, lineHeight: 18 }}>
                Choose which kinds of notifications you want to receive. Turn off any you don&apos;t need.
              </Text>
              {NOTIFICATION_CATEGORY_KEYS.map((key) => {
                const spec = CATEGORY_SPECS[key]
                const enabled = categoryPrefs[key]
                return (
                  <Card key={key} style={[styles.row, { backgroundColor: colors.card }]}>
                    <Card.Content style={styles.rowContent}>
                      <View style={[styles.iconWrap, { backgroundColor: (colors.tint as string) + '22' }]}>
                        <MaterialIcons name={spec.iconName} size={20} color={colors.tint as string} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>
                          {spec.title}
                        </Text>
                        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                          {spec.subtitle}
                        </Text>
                      </View>
                      <Switch
                        value={enabled}
                        onValueChange={(value) => categoriesMutation.mutate({ [key]: value })}
                        disabled={categoriesMutation.isPending}
                        accessibilityLabel={`${spec.title} ${enabled ? 'enabled' : 'disabled'}`}
                      />
                    </Card.Content>
                  </Card>
                )
              })}
            </>
          ) : null}

          {/* SCRUM-641: Proactive Nudges entry point. Flag-gated —
              default-OFF while loading, so the row is invisible during dark
              launch. Navigates to a dedicated /Home/nudges screen owning
              opt-in, quiet-hours, caps, and per-rule mute. Not surfaced on
              Home/index.tsx yet. */}
          {showProactiveNudgesRow ? (
            <>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any, marginTop: 22, marginBottom: 10, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Proactive check-ins
              </Text>
              <Pressable
                onPress={() => router.push('/Home/nudges')}
                accessibilityRole="button"
                accessibilityLabel="Open Proactive nudges settings"
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              >
                <Card style={[styles.row, { backgroundColor: colors.card }]}>
                  <Card.Content style={styles.rowContent}>
                    <View style={[styles.iconWrap, { backgroundColor: (colors.tint as string) + '22' }]}>
                      <MaterialIcons name="tips-and-updates" size={20} color={colors.tint as string} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>
                        Proactive nudges
                      </Text>
                      <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                        AI check-ins based on your trends
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color={colors.subtext} />
                  </Card.Content>
                </Card>
              </Pressable>
            </>
          ) : null}

          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 18, lineHeight: 18 }}>
            Reminders use device push notifications. Allow notifications in your iOS / Android settings to receive them.
          </Text>
        </ScrollView>

        {/* Timezone picker modal */}
        <Modal
          visible={pickerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPickerOpen(false)}
        >
          <View style={[{ flex: 1, backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(20),
                  fontWeight: getScaledFontWeight(700) as any,
                  flex: 1,
                }}
              >
                Choose timezone
              </Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <MaterialIcons name="close" size={getScaledFontSize(22)} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              {/* "Use device timezone" reset */}
              <Pressable
                onPress={() => tzMutation.mutate(null)}
                accessibilityRole="button"
                accessibilityLabel="Use device timezone"
                style={({ pressed }) => [styles.tzRow, { opacity: pressed ? 0.85 : 1, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>
                    Use device timezone
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                    Currently {deviceTimezone()}
                  </Text>
                </View>
                {storedTz === null ? (
                  <MaterialIcons name="check-circle" size={22} color={colors.tint as string} />
                ) : null}
              </Pressable>

              {TIMEZONE_OPTIONS.map((opt) => {
                const selected = storedTz === opt.id
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => tzMutation.mutate(opt.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${opt.label}`}
                    style={({ pressed }) => [styles.tzRow, { opacity: pressed ? 0.85 : 1, borderColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(selected ? 700 : 500) as any }}>
                        {opt.label}
                      </Text>
                      <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 2 }}>
                        {opt.id}
                      </Text>
                    </View>
                    {selected ? (
                      <MaterialIcons name="check-circle" size={22} color={colors.tint as string} />
                    ) : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </Modal>
      </View>
    </AppWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 12 },
  row: { marginBottom: 12, borderRadius: 12 },
  rowContent: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  tzRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
