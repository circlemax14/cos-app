import React from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import type { CalendarEvent } from '@/services/calendar'

interface Props {
  event: CalendarEvent
  onPress?: () => void
  /** Hide the date — useful when the parent already shows the day header. */
  compact?: boolean
  /**
   * Swipe-left actions. If provided, the row becomes a Swipeable with
   * a red "Delete" button revealed on left swipe.
   * Only writable device-calendar events should expose this — virtual
   * app events / past visits should be hidden via the parent.
   */
  onDelete?: () => void
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDuration(start: string, end: string): string {
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms <= 0 || Number.isNaN(ms)) return ''
    const mins = Math.round(ms / 60_000)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    const remM = mins % 60
    return remM === 0 ? `${hrs}h` : `${hrs}h ${remM}m`
  } catch {
    return ''
  }
}

export function EventListItem({ event, onPress, compact, onDelete }: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const isAllDay = event.allDay
  const startTime = isAllDay ? 'all-day' : formatTime(event.startDate)
  const dur = isAllDay ? '' : formatDuration(event.startDate, event.endDate)

  const isReminder = event.origin === 'reminder'
  const isCompleted = !!event.completed

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    _drag: Animated.AnimatedInterpolation<number>,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
    })
    return (
      <Animated.View style={{ transform: [{ translateX }] }}>
        <Pressable
          onPress={onDelete}
          style={({ pressed }) => [
            styles.deleteAction,
            { backgroundColor: '#FF3B30', opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Delete event"
        >
          <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: '700' }}>
            Delete
          </Text>
        </Pressable>
      </Animated.View>
    )
  }

  const row = (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.cardBackground : 'transparent',
          borderBottomColor: colors.border,
          opacity: isCompleted ? 0.55 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${startTime}${event.location ? `, at ${event.location}` : ''}${isCompleted ? ', completed' : ''}`}
    >
      <View style={[styles.colorBar, { backgroundColor: event.source.color }]} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                fontSize: getScaledFontSize(15),
                textDecorationLine: isCompleted ? 'line-through' : 'none',
              },
            ]}
            numberOfLines={1}
          >
            {event.title}
          </Text>
          {isReminder && (
            <View style={[styles.badge, { backgroundColor: '#FFF4E5' }]}>
              <Text style={[styles.badgeText, { color: '#B25400', fontSize: getScaledFontSize(10) }]}>
                Reminder
              </Text>
            </View>
          )}
          {event.origin === 'app' && event.appKind && (
            <View style={[styles.badge, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.badgeText, { color: colors.subtext, fontSize: getScaledFontSize(10) }]}>
                {event.appKind === 'past-visit' ? 'Past Visit' : event.appKind === 'appointment' ? 'Appointment' : 'Task'}
              </Text>
            </View>
          )}
        </View>
        {!compact && (
          <Text style={[styles.meta, { color: colors.subtext, fontSize: getScaledFontSize(12) }]} numberOfLines={1}>
            {startTime}{dur ? ` · ${dur}` : ''}{event.location ? ` · ${event.location}` : ''} · {event.source.title}
          </Text>
        )}
        {compact && (
          <Text style={[styles.meta, { color: colors.subtext, fontSize: getScaledFontSize(12) }]} numberOfLines={1}>
            {startTime}{dur ? ` · ${dur}` : ''}{event.location ? ` · ${event.location}` : ''}
          </Text>
        )}
      </View>
    </Pressable>
  )

  if (!onDelete) return row

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
    >
      {row}
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: 16, minHeight: 56 },
  colorBar: { width: 3, marginRight: 12, borderRadius: 2, marginVertical: 8 },
  content: { flex: 1, paddingVertical: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontWeight: '600', flexShrink: 1 },
  meta: { marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontWeight: '600', letterSpacing: 0.3 },
  deleteAction: {
    width: 80,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
