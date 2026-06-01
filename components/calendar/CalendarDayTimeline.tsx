/**
 * Apple-Calendar-style day timeline: a vertically scrolling hour grid
 * (00:00 → 23:00) with event blocks sized + positioned by their actual
 * start / end times. Tap a block to open detail; tap empty space at an
 * hour to start a new event at that time.
 *
 * Designed for the "Day" view of the calendar screen.
 */

import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import type { CalendarEvent } from '@/services/calendar'

const HOUR_HEIGHT = 56 // px per hour row
const HOUR_LABEL_WIDTH = 56
const TIMELINE_TOP_PAD = 8
const TIMELINE_BOTTOM_PAD = 24

interface Props {
  dateIso: string // YYYY-MM-DD
  events: CalendarEvent[]
  onPressEvent: (event: CalendarEvent) => void
  onPressEmptyHour?: (hour: number) => void
}

export function CalendarDayTimeline({ dateIso, events, onPressEvent, onPressEmptyHour }: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  // Bucket: all-day events render at the top; timed events render in the grid.
  const allDay = events.filter((e) => e.allDay)
  const timed = events.filter((e) => !e.allDay)

  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: TIMELINE_BOTTOM_PAD }}>
      {/* All-day strip */}
      {allDay.length > 0 && (
        <View style={[styles.allDayStrip, { borderBottomColor: colors.border }]}>
          {allDay.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => onPressEvent(e)}
              style={({ pressed }) => [
                styles.allDayPill,
                { backgroundColor: e.source.color + (pressed ? 'AA' : 'DD') },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${e.title}, all-day event`}
            >
              <Text style={[styles.allDayText, { fontSize: getScaledFontSize(12) }]} numberOfLines={1}>
                {e.title}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Hour grid */}
      <View style={[styles.grid, { paddingTop: TIMELINE_TOP_PAD }]}>
        {hours.map((h) => (
          <Pressable
            key={h}
            onPress={() => onPressEmptyHour?.(h)}
            style={[styles.hourRow, { borderBottomColor: colors.border, height: HOUR_HEIGHT }]}
            accessibilityRole="button"
            accessibilityLabel={`Create event at ${formatHourLabel(h)}`}
          >
            <View style={[styles.hourLabel, { width: HOUR_LABEL_WIDTH }]}>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), textAlign: 'right' }}>
                {formatHourLabel(h)}
              </Text>
            </View>
            <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
          </Pressable>
        ))}

        {/* Event blocks layered on top, absolutely positioned by time */}
        <View style={[styles.eventLayer, { left: HOUR_LABEL_WIDTH + 8, right: 8, top: TIMELINE_TOP_PAD }]} pointerEvents="box-none">
          {timed.map((e) => {
            const layout = computeLayout(e, dateIso)
            if (!layout) return null
            return (
              <Pressable
                key={e.id}
                onPress={() => onPressEvent(e)}
                style={[
                  styles.eventBlock,
                  {
                    top: layout.top,
                    height: layout.height,
                    backgroundColor: e.source.color + '22',
                    borderLeftColor: e.source.color,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${e.title}, ${layout.timeLabel}`}
              >
                <Text
                  style={[styles.eventTitle, { color: colors.text, fontSize: getScaledFontSize(13) }]}
                  numberOfLines={layout.height < 40 ? 1 : 2}
                >
                  {e.title}
                </Text>
                {layout.height >= 40 && (
                  <Text style={[styles.eventTime, { color: colors.subtext, fontSize: getScaledFontSize(11) }]} numberOfLines={1}>
                    {layout.timeLabel}
                    {e.location ? ` · ${e.location}` : ''}
                  </Text>
                )}
              </Pressable>
            )
          })}
        </View>
      </View>
    </ScrollView>
  )
}

function formatHourLabel(h: number): string {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  if (h < 12) return `${h} AM`
  return `${h - 12} PM`
}

interface BlockLayout {
  top: number
  height: number
  timeLabel: string
}

function computeLayout(event: CalendarEvent, dayIso: string): BlockLayout | null {
  try {
    const dayStart = new Date(`${dayIso}T00:00:00`)
    const dayEnd = new Date(`${dayIso}T23:59:59.999`)
    const s = new Date(event.startDate)
    const e = new Date(event.endDate)
    // Clamp to day window (multi-day events get clipped to the visible day)
    const cs = s.getTime() < dayStart.getTime() ? dayStart : s
    const ce = e.getTime() > dayEnd.getTime() ? dayEnd : e
    if (ce.getTime() <= cs.getTime()) return null
    const startMins = (cs.getTime() - dayStart.getTime()) / 60_000
    const durMins = (ce.getTime() - cs.getTime()) / 60_000
    const top = (startMins / 60) * HOUR_HEIGHT
    const height = Math.max(22, (durMins / 60) * HOUR_HEIGHT)
    const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const timeLabel = `${fmt(s)} – ${fmt(e)}`
    return { top, height, timeLabel }
  } catch {
    return null
  }
}

const styles = StyleSheet.create({
  allDayStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  allDayPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  allDayText: { color: '#fff', fontWeight: '600' },
  grid: { position: 'relative' },
  hourRow: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth },
  hourLabel: { paddingRight: 8, paddingTop: 2 },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, marginTop: 8 },
  eventLayer: { position: 'absolute', bottom: 0 },
  eventBlock: { position: 'absolute', left: 0, right: 0, borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  eventTitle: { fontWeight: '600' },
  eventTime: { marginTop: 2 },
})
