/**
 * Calendar settings screen — controls which calendars are visible in
 * the main calendar view. Useful for hiding noisy calendars (holidays /
 * sports / shared family) and for diagnosing missing calendars (Teams,
 * Outlook) — if a user expects to see those and they're not in the list,
 * the issue is upstream in iOS Settings → Calendar → Accounts (the
 * help text on this screen explains how to fix that).
 */

import React from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useCalendar } from '@/hooks/use-calendar'
import { useCalendarPermissions } from '@/hooks/use-calendar-permissions'
import { CalendarPermissionGate } from '@/components/calendar/CalendarPermissionGate'

export default function CalendarSettingsScreen() {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const permissions = useCalendarPermissions()
  const {
    calendars,
    hiddenCalendarIds,
    notificationDisabledCalendarIds,
    toggleCalendarVisibility,
    toggleCalendarNotifications,
    isLoading,
  } = useCalendar({ includeReminders: true })

  // Group by source ("iCloud", "Google", "Outlook", "Local", ...) so the
  // list reads like Apple's Settings → Calendar → Accounts view.
  const grouped = groupBySource(calendars)

  return (
    <AppWrapper showFooter showHamburgerIcon>
      <CalendarPermissionGate permissions={permissions}>
        <ScrollView
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
            Show or hide individual calendars. Hidden calendars won't appear in your views or trigger notifications.
          </Text>

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
                We can only see calendars from accounts you've added in iOS Settings.
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
              iOS Calendar can only see calendars from accounts you've added in iOS Settings. Microsoft Teams meetings
              and Outlook events sync through your Exchange or Outlook account.
              {'\n\n'}To add them:
              {'\n\n'}1. Open iOS Settings → Apps → Calendar → Calendar Accounts (or Mail → Accounts)
              {'\n'}2. Add Account → choose your provider (Outlook, Exchange, Google)
              {'\n'}3. Make sure the Calendar toggle is ON for that account
              {'\n\n'}Once that's done, return here and pull to refresh — your calendars will appear.
            </Text>
            <Pressable
              onPress={() => Linking.openSettings().catch(() => {})}
              style={({ pressed }) => [
                styles.helpBtn,
                { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open iOS Settings"
            >
              <Text style={[styles.helpBtnText, { fontSize: getScaledFontSize(14) }]}>Open iOS Settings</Text>
            </Pressable>
          </View>
        </ScrollView>
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
