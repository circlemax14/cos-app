/**
 * Apple-Calendar-style Day view: a vertically scrolling hour grid
 * (00:00 → 23:00) with event blocks sized + positioned by their actual
 * start/end times.
 *
 * v3 enhancements (matches calendar-mockups.html frame 5):
 *   - `‹ ›` day-nav arrows in the header
 *   - 7-day "week strip" with the selected day in black pill,
 *     today in red pill (matches Apple iOS Calendar's expanded day view)
 *   - Red "now line" with a small leading dot that slides down the
 *     timeline at the current minute
 *   - Auto-scroll to roughly the now-line on first mount so the user
 *     lands where the action is
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { IconSymbol } from '@/components/ui/icon-symbol'
import type { CalendarEvent } from '@/services/calendar'
import { hapticSelection, hapticImpact } from '@/utils/haptics'

const HOUR_HEIGHT = 56 // px per hour row
const HOUR_LABEL_WIDTH = 56
const TIMELINE_TOP_PAD = 8
const TIMELINE_BOTTOM_PAD = 80

interface Props {
  dateIso: string // YYYY-MM-DD (the day being shown)
  events: CalendarEvent[] // already filtered to this day
  onPressEvent: (event: CalendarEvent) => void
  /** Long-press an empty hour → "New Event" prefilled at that hour. */
  onLongPressEmptyHour?: (hour: number) => void
  /** Optional day-nav handlers — if omitted the arrows are hidden. */
  onPressPrevDay?: () => void
  onPressNextDay?: () => void
  /** Optional week-strip selector. Receives the new YYYY-MM-DD. */
  onSelectDate?: (iso: string) => void
}

export function CalendarDayTimeline({
  dateIso,
  events,
  onPressEvent,
  onLongPressEmptyHour,
  onPressPrevDay,
  onPressNextDay,
  onSelectDate,
}: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const scrollRef = useRef<ScrollView>(null)

  // Tick every minute so the now-line updates while the user has the
  // screen open. Cheap (one setState/min), and keeps the indicator honest.
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Bucket: all-day events render at the top; timed events render in the grid.
  const allDay = events.filter((e) => e.allDay)
  const timed = events.filter((e) => !e.allDay)

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

  // Now-line position: only render when viewing TODAY.
  const todayIso = new Date().toISOString().slice(0, 10)
  const isToday = dateIso === todayIso
  let nowTop: number | null = null
  if (isToday) {
    const now = new Date()
    nowTop = (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT
  }
  // Reference nowTick so the dependency array of useEffect below picks up
  // each minute's render — also satisfies linter without an extra var.
  void nowTick

  // Auto-scroll to a useful position once mounted.
  useEffect(() => {
    if (!scrollRef.current) return
    const target = (nowTop ?? (8 * HOUR_HEIGHT)) - 120 // 8am or now-120
    // Defer one frame so the layout is in place.
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(target, 0), animated: false })
    }, 60)
    return () => clearTimeout(id)
    // intentional: only on mount; subsequent date changes also scroll
    // via the parent re-keying the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateIso])

  return (
    <View style={{ flex: 1 }}>
      {/* ── Day-nav header ─────────────────────────────────────────── */}
      {(onPressPrevDay || onPressNextDay) && (
        <View style={[styles.dayNavRow, { borderBottomColor: colors.border }]}>
          {onPressPrevDay && (
            <Pressable
              onPress={() => { hapticSelection(); onPressPrevDay() }}
              hitSlop={10}
              style={({ pressed }) => [styles.dayNavBtn, { opacity: pressed ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <IconSymbol name="chevron.left" size={getScaledFontSize(20)} color={colors.tint} />
            </Pressable>
          )}
          <Text style={[styles.dayNavLabel, { color: colors.text, fontSize: getScaledFontSize(17) }]} numberOfLines={1}>
            {fmtDayHeader(dateIso)}
          </Text>
          {onPressNextDay && (
            <Pressable
              onPress={() => { hapticSelection(); onPressNextDay() }}
              hitSlop={10}
              style={({ pressed }) => [styles.dayNavBtn, { opacity: pressed ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <IconSymbol name="chevron.right" size={getScaledFontSize(20)} color={colors.tint} />
            </Pressable>
          )}
        </View>
      )}

      {/* ── Week strip — 7-day picker around the selected day ──────── */}
      {onSelectDate && (
        <View style={[styles.weekStrip, { borderBottomColor: colors.border }]}>
          {buildWeek(dateIso).map((d) => {
            const isSel = d.iso === dateIso
            const isTodayCell = d.iso === todayIso
            const pillBg = isSel && isTodayCell ? '#FF3B30' // Apple red
              : isSel ? colors.text
              : 'transparent'
            const numColor = (isSel) ? '#fff' : isTodayCell ? '#FF3B30' : colors.text
            return (
              <Pressable
                key={d.iso}
                onPress={() => { hapticSelection(); onSelectDate(d.iso) }}
                style={styles.weekDayCol}
                accessibilityRole="button"
                accessibilityLabel={`Select ${d.long}`}
              >
                <Text style={[styles.weekWd, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>
                  {d.wd}
                </Text>
                <View
                  style={[
                    styles.weekPill,
                    { backgroundColor: pillBg },
                  ]}
                >
                  <Text
                    style={{
                      color: numColor,
                      fontSize: getScaledFontSize(17),
                      fontWeight: isSel || isTodayCell ? '700' : '400',
                    }}
                  >
                    {d.num}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      )}

      {/* ── Scrollable timeline ────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: TIMELINE_BOTTOM_PAD }}
        showsVerticalScrollIndicator={false}
      >
        {/* All-day strip */}
        {allDay.length > 0 && (
          <View style={[styles.allDayStrip, { borderBottomColor: colors.border, backgroundColor: colors.cardBackground }]}>
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
                <Text style={[styles.allDayText, { fontSize: getScaledFontSize(13) }]} numberOfLines={1}>
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
              // Apple uses long-press to create at this hour. Short-tap
              // on an empty hour does nothing (so the user can scroll
              // without accidental creates).
              onLongPress={() => {
                if (!onLongPressEmptyHour) return
                hapticImpact('medium')
                onLongPressEmptyHour(h)
              }}
              delayLongPress={350}
              style={[styles.hourRow, { borderBottomColor: colors.border, height: HOUR_HEIGHT }]}
              accessibilityRole="button"
              accessibilityLabel={`${formatHourLabel(h)} slot`}
              accessibilityHint={onLongPressEmptyHour ? 'Long press to create event at this hour' : undefined}
            >
              <View style={[styles.hourLabel, { width: HOUR_LABEL_WIDTH }]}>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), textAlign: 'right' }}>
                  {formatHourLabel(h)}
                </Text>
              </View>
              <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
            </Pressable>
          ))}

          {/* Event blocks layered on top, with D6 concurrent-column
              layout: overlapping events sit side-by-side, each occupying
              1/N of the available column width. */}
          <View
            style={[styles.eventLayer, { left: HOUR_LABEL_WIDTH + 8, right: 8, top: TIMELINE_TOP_PAD }]}
            pointerEvents="box-none"
          >
            {layoutTimedEvents(timed, dateIso).map(({ event: e, layout, columnIndex, columnCount }) => {
              const widthPct = 100 / columnCount
              return (
                <Pressable
                  key={e.id}
                  onPress={() => onPressEvent(e)}
                  style={[
                    styles.eventBlock,
                    {
                      top: layout.top,
                      height: layout.height,
                      left: `${columnIndex * widthPct}%`,
                      width: `${widthPct}%`,
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
                  {layout.height >= 40 && columnCount === 1 && (
                    <Text style={[styles.eventTime, { color: colors.subtext, fontSize: getScaledFontSize(11) }]} numberOfLines={1}>
                      {layout.timeLabel}
                      {e.location ? ` · ${e.location}` : ''}
                    </Text>
                  )}
                </Pressable>
              )
            })}
          </View>

          {/* Now-line (red horizontal line + dot) — only when viewing today */}
          {nowTop !== null && (
            <View
              pointerEvents="none"
              style={[styles.nowLine, { top: TIMELINE_TOP_PAD + nowTop }]}
            >
              <View style={styles.nowDot} />
              <View style={styles.nowBar} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

function formatHourLabel(h: number): string {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  if (h < 12) return `${h} AM`
  return `${h - 12} PM`
}

function fmtDayHeader(dayIso: string): string {
  try {
    return new Date(`${dayIso}T00:00:00`).toLocaleString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dayIso
  }
}

/** Returns the 7 days (Sun-Sat) of the week containing dayIso. */
function buildWeek(dayIso: string): { iso: string; wd: string; num: number; long: string }[] {
  const d = new Date(`${dayIso}T00:00:00`)
  d.setDate(d.getDate() - d.getDay()) // back to Sunday
  const out: { iso: string; wd: string; num: number; long: string }[] = []
  const wdShort = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  for (let i = 0; i < 7; i++) {
    const day = new Date(d)
    day.setDate(d.getDate() + i)
    const iso = day.toISOString().slice(0, 10)
    out.push({
      iso,
      wd: wdShort[i],
      num: day.getDate(),
      long: day.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    })
  }
  return out
}

interface BlockLayout {
  top: number
  height: number
  timeLabel: string
}

interface PositionedEvent {
  event: CalendarEvent
  layout: BlockLayout
  columnIndex: number
  columnCount: number
}

/**
 * Lay out timed events for a day, handling concurrent events by
 * assigning each overlapping group a column index + total column count.
 * Implementation:
 *   1. Compute (top, bottom) y-pixel range per event.
 *   2. Sort by top, then by bottom.
 *   3. Scan top-to-bottom; events whose top is before any prior
 *      event's bottom belong to the same "cluster". Within the cluster,
 *      greedily assign each new event to the lowest free column.
 *   4. After the scan, every event in a cluster knows its column index
 *      and the cluster's total column count.
 */
function layoutTimedEvents(events: CalendarEvent[], dayIso: string): PositionedEvent[] {
  type Computed = { event: CalendarEvent; layout: BlockLayout; top: number; bottom: number }
  const computed: Computed[] = []
  for (const e of events) {
    const layout = computeLayout(e, dayIso)
    if (!layout) continue
    computed.push({ event: e, layout, top: layout.top, bottom: layout.top + layout.height })
  }
  computed.sort((a, b) => (a.top - b.top) || (a.bottom - b.bottom))

  // Greedy cluster + column assignment
  const result: PositionedEvent[] = []
  let cluster: Computed[] = []
  let clusterEnd = -1
  const flushCluster = () => {
    if (cluster.length === 0) return
    // Assign columns greedily by scanning sorted-by-top.
    // columnEnds[i] = bottom of last event placed in column i.
    const columnEnds: number[] = []
    const columnByIndex: number[] = []
    for (let i = 0; i < cluster.length; i++) {
      const item = cluster[i]
      let placed = false
      for (let c = 0; c < columnEnds.length; c++) {
        if (columnEnds[c] <= item.top) {
          columnByIndex[i] = c
          columnEnds[c] = item.bottom
          placed = true
          break
        }
      }
      if (!placed) {
        columnByIndex[i] = columnEnds.length
        columnEnds.push(item.bottom)
      }
    }
    const columnCount = columnEnds.length
    for (let i = 0; i < cluster.length; i++) {
      const item = cluster[i]
      result.push({
        event: item.event,
        layout: item.layout,
        columnIndex: columnByIndex[i],
        columnCount,
      })
    }
    cluster = []
    clusterEnd = -1
  }

  for (const item of computed) {
    if (cluster.length === 0) {
      cluster.push(item)
      clusterEnd = item.bottom
    } else if (item.top < clusterEnd) {
      cluster.push(item)
      clusterEnd = Math.max(clusterEnd, item.bottom)
    } else {
      flushCluster()
      cluster.push(item)
      clusterEnd = item.bottom
    }
  }
  flushCluster()
  return result
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
    const height = Math.max(22, (durMins / 60) * HOUR_HEIGHT)
    const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const timeLabel = `${fmt(s)} – ${fmt(e)}`
    return { top, height, timeLabel }
  } catch {
    return null
  }
}

const styles = StyleSheet.create({
  // Day-nav header
  dayNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayNavBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  dayNavLabel: { fontWeight: '600', flex: 1, textAlign: 'center', letterSpacing: -0.1 },
  // Week strip
  weekStrip: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekDayCol: { flex: 1, alignItems: 'center' },
  weekWd: { fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  weekPill: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Timeline
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
  // Now-line
  nowLine: {
    position: 'absolute',
    left: HOUR_LABEL_WIDTH + 2,
    right: 0,
    height: 1,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 5,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30', // Apple system red
    marginLeft: -4,
  },
  nowBar: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#FF3B30',
  },
})
