/**
 * SCRUM-279 / COS-308 — event detail popover.
 *
 * Apple-Calendar-style: a translucent card centered over a dimmed
 * backdrop instead of a full-screen view. Tapping outside the card
 * dismisses; tapping Edit opens the full editor; tapping Delete prompts
 * confirmation.
 *
 * Route is presented as a transparent modal (see app/_layout.tsx where
 * `presentation: 'transparentModal'` is set) so the underlying screen
 * shows through the dim.
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

  const handleEdit = () => {
    if (!event) return
    router.replace({ pathname: '/calendar-event-editor', params: { eventId: event.id } } as never)
  }

  const dismiss = () => router.back()

  if (isLoading) {
    return (
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.tint} />
        </View>
      </View>
    )
  }

  if (!event) {
    return (
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center' }}>
            Event not found
          </Text>
        </View>
      </Pressable>
    )
  }

  const canModify = event.origin === 'device' && event.source.allowsWrite

  return (
    <Pressable
      style={styles.backdrop}
      onPress={dismiss}
      accessibilityRole="button"
      accessibilityLabel="Dismiss event detail"
    >
      {/* Inner Pressable swallows the press so taps inside the card don't dismiss */}
      <Pressable
        onPress={(e) => e.stopPropagation?.()}
        style={[styles.card, { backgroundColor: colors.background }]}
      >
        {/* Title row — color bar + title */}
        <View style={styles.titleRow}>
          <View style={[styles.colorBar, { backgroundColor: event.source.color }]} />
          <Text
            style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22) }]}
            selectable
            numberOfLines={3}
          >
            {event.title}
          </Text>
        </View>

        {/* Source — small line under title (Apple shows "iCloud · Personal" etc.) */}
        <Text style={[styles.source, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
          {event.source.title} · {event.source.source}
        </Text>

        <ScrollView
          style={{ maxHeight: 280 }}
          contentContainerStyle={{ paddingVertical: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Time */}
          <Text style={[styles.bigLine, { color: colors.text, fontSize: getScaledFontSize(17) }]}>
            {fmtRange(event)}
          </Text>

          {/* Location */}
          {event.location && (
            <Text style={[styles.subLine, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
              📍 {event.location}
            </Text>
          )}

          {/* Alarms */}
          {event.alarms.length > 0 && (
            <Text style={[styles.subLine, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
              🔔 {event.alarms.map((m) => fmtAlarm(m)).join(', ')}
            </Text>
          )}

          {/* Notes */}
          {event.notes && (
            <Text
              style={[styles.notes, { color: colors.text, fontSize: getScaledFontSize(15) }]}
              selectable
            >
              {event.notes}
            </Text>
          )}

          {/* App-source badge */}
          {event.origin === 'app' && (
            <View style={[styles.appBadge, { backgroundColor: colors.cardBackground }]}>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), textAlign: 'center' }}>
                From Circle Support Health — not stored in your device calendar.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Action row — Edit | Delete (or just Done if read-only) */}
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          {canModify ? (
            <>
              <Pressable
                onPress={handleEdit}
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Edit event"
              >
                <Text style={[styles.actionText, { color: colors.tint, fontSize: getScaledFontSize(16) }]}>
                  Edit
                </Text>
              </Pressable>
              <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Delete event"
              >
                <Text style={[styles.actionText, { color: '#FF3B30', fontSize: getScaledFontSize(16) }]}>
                  Delete
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={dismiss}
              style={({ pressed }) => [styles.action, { opacity: pressed ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={[styles.actionText, { color: colors.tint, fontSize: getScaledFontSize(16) }]}>
                Done
              </Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    </Pressable>
  )
}

function fmtRange(e: CalendarEvent): string {
  try {
    const s = new Date(e.startDate)
    const en = new Date(e.endDate)
    if (e.allDay) {
      return `${s.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} (all-day)`
    }
    const sd = s.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 0,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  colorBar: { width: 4, height: 24, borderRadius: 2, marginTop: 4 },
  title: { fontWeight: '700', flex: 1, letterSpacing: -0.3 },
  source: { marginBottom: 14, marginLeft: 14 },
  bigLine: { fontWeight: '500', marginBottom: 4 },
  subLine: { marginBottom: 4 },
  notes: { marginTop: 12, lineHeight: 21 },
  appBadge: { padding: 10, borderRadius: 8, marginTop: 12 },
  actionsRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16 },
  action: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  actionDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  actionText: { fontWeight: '500' },
})
