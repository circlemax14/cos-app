/**
 * SCRUM-279 / COS-308 — event detail modal.
 *
 * Read-only display of an event, with Delete action for device-owned
 * events the user can modify. Past visits / app-virtual events render
 * the same fields but the Delete action is hidden (they're not stored
 * in the OS calendar).
 *
 * To find the event we re-read the day's events from the OS rather than
 * passing the full event through the URL — keeps the route URL clean
 * and avoids stale data.
 */

import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { deleteEvent, readEvents, type CalendarEvent } from '@/services/calendar'

export default function CalendarEventDetail() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>()
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const [event, setEvent] = useState<CalendarEvent | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      if (!eventId) {
        setIsLoading(false)
        return
      }
      const all = await readEvents()
      const found = all.find((e) => e.id === eventId) ?? null
      setEvent(found)
      setIsLoading(false)
    })()
  }, [eventId])

  const handleDelete = () => {
    if (!event) return
    Alert.alert(
      'Delete event?',
      'This will remove the event from your calendar and any synced devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteEvent(event.id)
            if (ok) router.back()
            else Alert.alert('Could not delete', 'Check your calendar permissions and try again.')
          },
        },
      ],
    )
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    )
  }

  if (!event) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>Event not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15) }}>Back</Text>
        </Pressable>
      </View>
    )
  }

  const canDelete = event.origin === 'device' && event.source.allowsWrite

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={[styles.headerBtn, { color: colors.tint, fontSize: getScaledFontSize(15) }]}>Done</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(16) }]} numberOfLines={1}>
          Event
        </Text>
        {event && event.origin === 'device' && event.source.allowsWrite ? (
          <Pressable
            onPress={() => router.push({ pathname: '/calendar-event-editor', params: { eventId: event.id } } as never)}
            accessibilityRole="button"
            accessibilityLabel="Edit event"
          >
            <Text style={[styles.headerBtn, styles.headerBtnPrimary, { color: colors.tint, fontSize: getScaledFontSize(15) }]}>
              Edit
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={[styles.titleRow]}>
          <View style={[styles.colorBar, { backgroundColor: event.source.color }]} />
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22) }]} selectable>
            {event.title}
          </Text>
        </View>

        <Detail colors={colors} label="When" value={fmtRange(event)} size={getScaledFontSize(15)} />
        {event.location && (
          <Detail colors={colors} label="Location" value={event.location} size={getScaledFontSize(15)} />
        )}
        <Detail colors={colors} label="Calendar" value={`${event.source.title} · ${event.source.source}`} size={getScaledFontSize(15)} />
        {event.alarms.length > 0 && (
          <Detail
            colors={colors}
            label="Reminders"
            value={event.alarms.map((m) => fmtAlarm(m)).join(', ')}
            size={getScaledFontSize(15)}
          />
        )}
        {event.notes && (
          <Detail colors={colors} label="Notes" value={event.notes} size={getScaledFontSize(15)} multiline />
        )}
        {event.origin === 'app' && (
          <View style={[styles.appBadge, { backgroundColor: colors.cardBackground }]}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>
              From Circle Support Health — not stored in your device calendar.
            </Text>
          </View>
        )}

        {canDelete && (
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Delete event"
          >
            <Text style={[styles.deleteText, { fontSize: getScaledFontSize(15) }]}>Delete Event</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  )
}

function fmtRange(e: CalendarEvent): string {
  try {
    const s = new Date(e.startDate)
    const en = new Date(e.endDate)
    if (e.allDay) return `${s.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })} (all-day)`
    const sd = s.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' })
    const st = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const et = en.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const sameDay = s.toDateString() === en.toDateString()
    if (sameDay) return `${sd} · ${st} – ${et}`
    const ed = en.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' })
    return `${sd} ${st} → ${ed} ${et}`
  } catch {
    return ''
  }
}

function fmtAlarm(minutes: number): string {
  if (minutes === 0) return 'At time of event'
  if (minutes < 60) return `${minutes} min before`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h before`
  return `${Math.round(minutes / 60 / 24)} d before`
}

interface DetailProps { colors: typeof Colors.light; label: string; value: string; size: number; multiline?: boolean }
function Detail({ colors, label, value, size, multiline }: DetailProps) {
  return (
    <View style={[styles.detailBlock, { borderBottomColor: colors.border }]}>
      <Text style={{ color: colors.subtext, fontSize: size * 0.8, fontWeight: '700', letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
      <Text
        style={{ color: colors.text, fontSize: size, marginTop: 4, lineHeight: multiline ? size * 1.4 : undefined }}
        selectable
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backBtn: { marginTop: 16, padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  headerBtn: { fontWeight: '600', minWidth: 60 },
  headerBtnPrimary: { fontWeight: '700', textAlign: 'right' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 24 },
  colorBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  title: { fontWeight: '700', flex: 1 },
  detailBlock: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  appBadge: { padding: 12, borderRadius: 8, marginTop: 16, alignItems: 'center' },
  deleteBtn: { marginTop: 32, paddingVertical: 14, alignItems: 'center' },
  deleteText: { color: '#D04E4E', fontWeight: '600' },
})
