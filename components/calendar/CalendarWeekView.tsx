/**
 * 7-column week view — Sunday → Saturday with an hour grid. Events
 * positioned by their actual start/end times within each day column.
 *
 * Apple's iOS Calendar week view (landscape only on iPhone) follows the
 * same hour-grid + day-column layout. Portrait users typically use
 * "Day" view instead — but this is here for parity.
 */

import React, { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import type { CalendarEvent } from '@/services/calendar'

const HOUR_HEIGHT = 48
const HOUR_LABEL_WIDTH = 40
const HEADER_HEIGHT = 36

interface Props {
  weekStart: string // YYYY-MM-DD of Sunday
  events: CalendarEvent[]
  selectedDate: string
  onSelectDate: (iso: string) => void
  onPressEvent: (event: CalendarEvent) => void
}

export function CalendarWeekView({ weekStart, events, selectedDate, onSelectDate, onPressEvent }: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const { width } = useWindowDimensions()
  const dayColWidth = (width - HOUR_LABEL_WIDTH - 8) / 7

  const days = useMemo(() => {
    const base = new Date(`${weekStart}T00:00:00`)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      return d
    })
  }, [weekStart])

  const eventsPerDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const k = e.startDate.slice(0, 10)
      const bucket = map.get(k)
      if (bucket) bucket.push(e)
      else map.set(k, [e])
    }
    return map
  }, [events])

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <View style={{ flex: 1 }}>
      {/* Day-column headers (S M T W T F S + date numbers) */}
      <View style={[styles.headerRow, { borderBottomColor: colors.border, height: HEADER_HEIGHT }]}>
        <View style={{ width: HOUR_LABEL_WIDTH }} />
        {days.map((d) => {
          const iso = isoLocal(d)
          const isToday = iso === todayIso
          const isSelected = iso === selectedDate
          return (
            <Pressable
              key={iso}
              style={[styles.dayHeader, { width: dayColWidth }]}
              onPress={() => onSelectDate(iso)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
            >
              <Text style={[styles.dayName, { color: colors.subtext, fontSize: getScaledFontSize(10) }]}>
                {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </Text>
              <View
                style={[
                  styles.dayNumWrap,
                  isSelected ? { backgroundColor: colors.tint } : isToday ? { borderColor: colors.tint, borderWidth: 1 } : null,
                ]}
              >
                <Text
                  style={{
                    color: isSelected ? '#fff' : colors.text,
                    fontSize: getScaledFontSize(13),
                    fontWeight: '600',
                  }}
                >
                  {d.getDate()}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.grid}>
          {/* Hour rows */}
          {hours.map((h) => (
            <View key={h} style={[styles.hourRow, { borderBottomColor: colors.border, height: HOUR_HEIGHT }]}>
              <View style={{ width: HOUR_LABEL_WIDTH, paddingRight: 4 }}>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(9), textAlign: 'right' }}>
                  {formatHourLabel(h)}
                </Text>
              </View>
              <View style={[styles.hourGridLine, { backgroundColor: colors.border }]} />
            </View>
          ))}

          {/* Day-column event layers */}
          {days.map((d, idx) => {
            const iso = isoLocal(d)
            const dayEvents = (eventsPerDay.get(iso) ?? []).filter((e) => !e.allDay)
            return (
              <View
                key={iso}
                style={[
                  styles.dayCol,
                  { left: HOUR_LABEL_WIDTH + idx * dayColWidth, width: dayColWidth - 2, top: 0 },
                ]}
                pointerEvents="box-none"
              >
                {dayEvents.map((e) => {
                  const layout = computeLayout(e, iso)
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
                      <Text style={[styles.eventTitle, { color: colors.text, fontSize: getScaledFontSize(10) }]} numberOfLines={1}>
                        {e.title}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatHourLabel(h: number): string {
  if (h === 0) return '12'
  if (h === 12) return '12'
  if (h < 12) return `${h}`
  return `${h - 12}`
}

function computeLayout(event: CalendarEvent, dayIso: string): { top: number; height: number; timeLabel: string } | null {
  try {
    const dayStart = new Date(`${dayIso}T00:00:00`)
    const dayEnd = new Date(`${dayIso}T23:59:59.999`)
    const s = new Date(event.startDate)
    const e = new Date(event.endDate)
    const cs = s.getTime() < dayStart.getTime() ? dayStart : s
    const ce = e.getTime() > dayEnd.getTime() ? dayEnd : e
    if (ce.getTime() <= cs.getTime()) return null
    const startMins = (cs.getTime() - dayStart.getTime()) / 60_000
    const durMins = (ce.getTime() - cs.getTime()) / 60_000
    const top = (startMins / 60) * HOUR_HEIGHT
    const height = Math.max(16, (durMins / 60) * HOUR_HEIGHT)
    const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return { top, height, timeLabel: `${fmt(s)} – ${fmt(e)}` }
  } catch {
    return null
  }
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  dayHeader: { alignItems: 'center' },
  dayName: { fontWeight: '600', letterSpacing: 0.5 },
  dayNumWrap: { marginTop: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, minWidth: 22, alignItems: 'center' },
  grid: { position: 'relative' },
  hourRow: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth },
  hourGridLine: { flex: 1, height: StyleSheet.hairlineWidth, marginTop: 6 },
  dayCol: { position: 'absolute' },
  eventBlock: { position: 'absolute', left: 1, right: 1, borderLeftWidth: 2, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1, overflow: 'hidden' },
  eventTitle: { fontWeight: '600' },
})
