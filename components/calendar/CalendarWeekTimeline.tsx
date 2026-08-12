/**
 * Apple-Calendar-style Week view (iPad / Mac parity).
 *
 * Layout:
 *   - Top: week-nav header (‹ › arrows) + 7-column weekday header row
 *     showing each day's short name + date number. Today gets a red
 *     filled circle around the number; the currently-selected day gets
 *     a tint pill.
 *   - Body: shared vertical timeline (00:00 → 23:00) with 7 day-columns
 *     side-by-side. Events render as positioned blocks inside their
 *     column, sized + placed by start/end time exactly like the Day
 *     timeline. Red now-line spans the column of the day that matches
 *     today.
 *   - All-day strip above the hourly grid, spanning the column(s) of
 *     each all-day event.
 *
 * The component is independent from CalendarDayTimeline so we don't
 * have to retrofit a "is this Day or Week?" branch into every line of
 * that file. Shared types (CalendarEvent) come from services/calendar.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { IconSymbol } from '@/components/ui/icon-symbol'
import type { CalendarEvent } from '@/services/calendar'
import { hapticSelection, hapticImpact } from '@/utils/haptics'
import { todayLocalIso } from '@/lib/day-key';

const HOUR_HEIGHT = 56
const HOUR_LABEL_WIDTH = 48
const TIMELINE_TOP_PAD = 8
const TIMELINE_BOTTOM_PAD = 80
const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

interface Props {
  /** Any day in the week to display — the component normalizes to Sunday. */
  dateIso: string
  /** All events; the component filters per-day internally. */
  events: CalendarEvent[]
  onPressEvent: (e: CalendarEvent) => void
  onSelectDate?: (iso: string) => void
  onLongPressEmptyHour?: (dayIso: string, hour: number) => void
  onPressPrevWeek?: () => void
  onPressNextWeek?: () => void
}

interface DayInWeek {
  iso: string
  num: number
  wd: string
  long: string
}

function buildWeek(dayIso: string): DayInWeek[] {
  const d = new Date(`${dayIso}T00:00:00`)
  d.setDate(d.getDate() - d.getDay()) // back to Sunday
  const out: DayInWeek[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(d)
    day.setDate(d.getDate() + i)
    const iso = day.toISOString().slice(0, 10)
    out.push({
      iso,
      num: day.getDate(),
      wd: WEEKDAY_SHORT[i],
      long: day.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    })
  }
  return out
}

function fmtWeekLabel(week: DayInWeek[]): string {
  if (week.length === 0) return ''
  const first = new Date(`${week[0].iso}T00:00:00`)
  const last = new Date(`${week[6].iso}T00:00:00`)
  const sameMonth = first.getMonth() === last.getMonth()
  const monthFmt = (d: Date) => d.toLocaleString(undefined, { month: 'long' })
  if (sameMonth) {
    return `${monthFmt(first)} ${first.getDate()}–${last.getDate()}, ${last.getFullYear()}`
  }
  return `${monthFmt(first).slice(0, 3)} ${first.getDate()} – ${monthFmt(last).slice(0, 3)} ${last.getDate()}, ${last.getFullYear()}`
}

export function CalendarWeekTimeline({
  dateIso, events, onPressEvent, onSelectDate, onLongPressEmptyHour,
  onPressPrevWeek, onPressNextWeek,
}: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const scrollRef = useRef<ScrollView>(null)

  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  void nowTick

  const week = useMemo(() => buildWeek(dateIso), [dateIso])
  const todayIso = todayLocalIso()

  // Bucket events per day for fast lookup.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const day = e.startDate.slice(0, 10)
      const bucket = map.get(day) ?? []
      bucket.push(e)
      map.set(day, bucket)
    }
    return map
  }, [events])

  const hasAnyAllDay = week.some((d) => (eventsByDay.get(d.iso) ?? []).some((e) => e.allDay))

  // Now-line position
  const todayIdx = week.findIndex((d) => d.iso === todayIso)
  let nowTop: number | null = null
  if (todayIdx >= 0) {
    const now = new Date()
    nowTop = (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT
  }

  // Auto-scroll on mount to ~120px above the now-line (or 8am).
  useEffect(() => {
    if (!scrollRef.current) return
    const target = (nowTop ?? (8 * HOUR_HEIGHT)) - 120
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(target, 0), animated: false })
    }, 60)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateIso])

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

  return (
    <View style={{ flex: 1 }}>
      {/* Week-nav header ─────────────────────────────────────────── */}
      {(onPressPrevWeek || onPressNextWeek) && (
        <View style={[styles.navRow, { borderBottomColor: colors.border }]}>
          <View style={styles.navSlot}>
            {onPressPrevWeek && (
              <Pressable
                onPress={() => { hapticSelection(); onPressPrevWeek() }}
                hitSlop={10}
                style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
              >
                <IconSymbol name="chevron.left" size={getScaledFontSize(20)} color={colors.tint} />
              </Pressable>
            )}
          </View>
          <Text
            style={[styles.navLabel, { color: colors.text, fontSize: getScaledFontSize(15) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {fmtWeekLabel(week)}
          </Text>
          <View style={[styles.navSlot, { alignItems: 'flex-end' }]}>
            {onPressNextWeek && (
              <Pressable
                onPress={() => { hapticSelection(); onPressNextWeek() }}
                hitSlop={10}
                style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Next week"
              >
                <IconSymbol name="chevron.right" size={getScaledFontSize(20)} color={colors.tint} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Day-header strip — 7 columns, today red, selected tint pill ── */}
      <View style={[styles.dayHeaderRow, { borderBottomColor: colors.border }]}>
        {/* Spacer aligned with the hour-label column on the body */}
        <View style={{ width: HOUR_LABEL_WIDTH }} />
        {week.map((d) => {
          const isSel = d.iso === dateIso
          const isTodayCell = d.iso === todayIso
          const pillBg = isSel && isTodayCell ? '#FF3B30' : isSel ? colors.text : 'transparent'
          const numColor = isSel ? '#fff' : isTodayCell ? '#FF3B30' : colors.text
          return (
            <Pressable
              key={d.iso}
              onPress={() => { hapticSelection(); onSelectDate?.(d.iso) }}
              style={styles.dayHeaderCol}
              accessibilityRole="button"
              accessibilityLabel={`Select ${d.long}`}
            >
              <Text style={[styles.weekWd, { color: colors.subtext, fontSize: getScaledFontSize(10) }]}>
                {d.wd}
              </Text>
              <View style={[styles.weekPill, { backgroundColor: pillBg }]}>
                <Text style={{ color: numColor, fontSize: getScaledFontSize(15), fontWeight: isSel || isTodayCell ? '700' : '400' }}>
                  {d.num}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>

      {/* All-day strip (one row per day, only if any day has all-day evts) */}
      {hasAnyAllDay && (
        <View style={[styles.allDayRow, { borderBottomColor: colors.border, backgroundColor: colors.cardBackground }]}>
          <View style={{ width: HOUR_LABEL_WIDTH }}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(9), textAlign: 'right', paddingRight: 6 }}>
              all-day
            </Text>
          </View>
          {week.map((d) => {
            const day = eventsByDay.get(d.iso) ?? []
            const allDay = day.filter((e) => e.allDay)
            return (
              <View key={d.iso} style={styles.allDayCol}>
                {allDay.slice(0, 2).map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => onPressEvent(e)}
                    style={[styles.allDayPill, { backgroundColor: e.source.color }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.title}, all-day event`}
                  >
                    <Text style={{ color: '#fff', fontSize: getScaledFontSize(10), fontWeight: '600' }} numberOfLines={1}>
                      {e.title}
                    </Text>
                  </Pressable>
                ))}
                {allDay.length > 2 && (
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(9), textAlign: 'center' }}>
                    +{allDay.length - 2}
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      )}

      {/* Scrollable hour grid ─────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: TIMELINE_BOTTOM_PAD }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: TIMELINE_TOP_PAD, position: 'relative' }}>
          {/* Hour rows — render once with 7-column horizontal divider */}
          {hours.map((h) => (
            <View key={h} style={[styles.hourRow, { borderBottomColor: colors.border, height: HOUR_HEIGHT }]}>
              <View style={{ width: HOUR_LABEL_WIDTH, alignItems: 'flex-end', paddingRight: 6 }}>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(10) }}>
                  {formatHourLabel(h)}
                </Text>
              </View>
              {week.map((d) => (
                <Pressable
                  key={d.iso}
                  onLongPress={() => {
                    if (!onLongPressEmptyHour) return
                    hapticImpact('medium')
                    onLongPressEmptyHour(d.iso, h)
                  }}
                  delayLongPress={350}
                  style={[styles.hourCol, { borderLeftColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.long} ${formatHourLabel(h)}`}
                  accessibilityHint={onLongPressEmptyHour ? 'Long press to create event' : undefined}
                />
              ))}
            </View>
          ))}

          {/* Event blocks layered over the grid, per day column */}
          {week.map((d, dayIdx) => (
            <DayColumn
              key={d.iso}
              dayIso={d.iso}
              dayIdx={dayIdx}
              events={(eventsByDay.get(d.iso) ?? []).filter((e) => !e.allDay)}
              onPressEvent={onPressEvent}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
            />
          ))}

          {/* Red now-line — only spans today's column. Built as a
              flex row so each non-today column gets a transparent
              segment of equal width. */}
          {nowTop !== null && todayIdx >= 0 && (
            <View
              pointerEvents="none"
              style={[styles.nowLineWrap, { top: TIMELINE_TOP_PAD + nowTop }]}
            >
              <View style={{ width: HOUR_LABEL_WIDTH }} />
              {week.map((d, i) => (
                <View
                  key={d.iso}
                  style={{
                    flex: 1,
                    height: 2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: i === todayIdx ? '#FF3B30' : 'transparent',
                  }}
                >
                  {i === todayIdx && <View style={styles.nowDot} />}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

interface DayColumnProps {
  dayIso: string
  dayIdx: number
  events: CalendarEvent[]
  onPressEvent: (e: CalendarEvent) => void
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
}

function DayColumn({ dayIso, dayIdx, events, onPressEvent, colors, getScaledFontSize }: DayColumnProps) {
  // Width of each day column = (100% - HOUR_LABEL_WIDTH) / 7
  // Use percentage left + width so RN flexbox computes correctly.
  // Each column is positioned absolutely on top of the hour grid.
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: TIMELINE_TOP_PAD,
        bottom: 0,
        // We can't trivially do `${100/7}%` math with offset; instead
        // use flex-like layout via a wrapping row positioned absolutely.
        left: HOUR_LABEL_WIDTH,
        right: 0,
        flexDirection: 'row',
      }}
    >
      {/* Phantom spacers occupy columns 0..dayIdx-1 so flex 1 works */}
      {Array.from({ length: dayIdx }).map((_, i) => (
        <View key={i} style={{ flex: 1 }} pointerEvents="none" />
      ))}
      <View style={{ flex: 1, position: 'relative' }} pointerEvents="box-none">
        {events.map((e) => {
          const layout = computeLayout(e, dayIso)
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
                style={{ color: colors.text, fontSize: getScaledFontSize(11), fontWeight: '600' }}
                numberOfLines={layout.height < 30 ? 1 : 2}
              >
                {e.title}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {/* Phantom spacers occupy columns dayIdx+1..6 */}
      {Array.from({ length: 6 - dayIdx }).map((_, i) => (
        <View key={i} style={{ flex: 1 }} pointerEvents="none" />
      ))}
    </View>
  )
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
    const cs = s.getTime() < dayStart.getTime() ? dayStart : s
    const ce = e.getTime() > dayEnd.getTime() ? dayEnd : e
    if (ce.getTime() <= cs.getTime()) return null
    const startMins = (cs.getTime() - dayStart.getTime()) / 60_000
    const durMins = (ce.getTime() - cs.getTime()) / 60_000
    const top = (startMins / 60) * HOUR_HEIGHT
    const height = Math.max(20, (durMins / 60) * HOUR_HEIGHT)
    const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const timeLabel = `${fmt(s)} – ${fmt(e)}`
    return { top, height, timeLabel }
  } catch {
    return null
  }
}

function formatHourLabel(h: number): string {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  if (h < 12) return `${h} AM`
  return `${h - 12} PM`
}

const styles = StyleSheet.create({
  navRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  navSlot: { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  navBtn: { paddingHorizontal: 10, paddingVertical: 6, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontWeight: '600', flex: 1, textAlign: 'center', letterSpacing: -0.1 },

  dayHeaderRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  dayHeaderCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 2, gap: 2 },
  weekWd: { fontWeight: '700', letterSpacing: 0.5 },
  weekPill: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  allDayRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 24 },
  allDayCol: { flex: 1, paddingHorizontal: 2, gap: 2 },
  allDayPill: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },

  hourRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  hourCol: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },

  eventBlock: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderRadius: 4,
    borderLeftWidth: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: 'hidden',
  },

  nowLineWrap: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
})
