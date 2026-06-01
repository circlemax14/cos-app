/**
 * Month grid built on top of `react-native-calendars`'s <Calendar>, with
 * support for Apple Calendar's three density modes:
 *
 *   - 'compact'  → single small color pill below the day number
 *                  (just signals "events exist", minimum chrome)
 *   - 'stacked'  → up to 3 full-width thin colored bars stacked
 *                  vertically — one per event by source color
 *   - 'details'  → up to 2 event titles rendered inline as small text
 *                  with a leading colored dot
 *
 * Selecting a day notifies the parent so the screen can render that
 * day's full event list below the grid. `onMonthChange` lets the
 * parent track which month is centered (so the title bar can update).
 *
 * `enableSwipeMonths` is on so horizontal swipe and the top arrows both
 * navigate between months — matches Apple's behavior.
 */

import React, { useMemo, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Calendar, type DateData } from 'react-native-calendars'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import type { CalendarEvent } from '@/services/calendar'
import { hapticSelection, hapticImpact } from '@/utils/haptics'

export type MonthDensityMode = 'compact' | 'stacked' | 'details'

interface Props {
  events: CalendarEvent[]
  selectedDate: string // YYYY-MM-DD
  onSelectDate: (dateIso: string) => void
  /**
   * Fires when the centered month changes via swipe or arrow.
   * The parent uses this to keep the title bar (e.g. "June 2026") in
   * sync with the visible month.
   */
  onMonthChange?: (dateIso: string) => void
  /** Display density. Defaults to 'compact' (Apple's default). */
  density?: MonthDensityMode
  /** Long-press a day → New Event at that day. */
  onLongPressDate?: (dateIso: string) => void
  /** Double-tap a day → jump to Day view at that day (Apple shortcut). */
  onJumpToDayView?: (dateIso: string) => void
}

interface DayEventSummary {
  /** Total events on this day (across all sources). */
  count: number
  /** Up to 3 sources represented on this day (color + title). */
  sources: { color: string; title: string }[]
  /** Up to 3 event titles (for Details mode). */
  titles: { color: string; title: string }[]
}

export function CalendarMonthView({
  events,
  selectedDate,
  onSelectDate,
  onMonthChange,
  density = 'compact',
  onLongPressDate,
  onJumpToDayView,
}: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  // Per-day rollup: counts, sources, titles. Done once per event-array
  // change and shared by every dayComponent render via closure.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEventSummary>()
    for (const e of events) {
      const day = e.startDate.slice(0, 10)
      const bucket = map.get(day) ?? { count: 0, sources: [], titles: [] }
      bucket.count += 1
      const colorAlreadyIn = bucket.sources.some((s) => s.color === e.source.color)
      if (!colorAlreadyIn && bucket.sources.length < 3) {
        bucket.sources.push({ color: e.source.color, title: e.source.title })
      }
      if (bucket.titles.length < 3) {
        bucket.titles.push({ color: e.source.color, title: e.title })
      }
      map.set(day, bucket)
    }
    return map
  }, [events])

  const todayIso = new Date().toISOString().slice(0, 10)

  // Calendar's `theme` covers the chrome. We do per-cell visuals
  // inside `dayComponent` so we have total control over the density modes.
  return (
    <View style={styles.wrap}>
      <Calendar
        current={selectedDate}
        theme={{
          backgroundColor: colors.background,
          calendarBackground: colors.background,
          textSectionTitleColor: colors.subtext,
          dayTextColor: colors.text,
          monthTextColor: colors.text,
          todayTextColor: '#FF3B30', // Apple red
          arrowColor: colors.tint,
          selectedDayBackgroundColor: colors.tint,
          selectedDayTextColor: '#fff',
          textDayFontWeight: '400',
          textMonthFontWeight: '700',
          textDayHeaderFontWeight: '600',
          textDayFontSize: 20,
          textDayHeaderFontSize: 11,
          textMonthFontSize: 17,
        }}
        firstDay={0}
        enableSwipeMonths
        onDayPress={(d: DateData) => onSelectDate(d.dateString)}
        onMonthChange={(d: DateData) => onMonthChange?.(d.dateString)}
        dayComponent={({ date, state }) => (
          <DayCell
            iso={date?.dateString ?? ''}
            day={date?.day ?? 0}
            disabled={state === 'disabled'}
            isToday={(date?.dateString ?? '') === todayIso}
            isSelected={(date?.dateString ?? '') === selectedDate}
            summary={eventsByDay.get(date?.dateString ?? '')}
            density={density}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            onLongPressDate={onLongPressDate}
            onJumpToDayView={onJumpToDayView}
          />
        )}
      />
    </View>
  )
}

interface DayCellProps {
  iso: string
  day: number
  disabled: boolean
  isToday: boolean
  isSelected: boolean
  summary: DayEventSummary | undefined
  density: MonthDensityMode
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  selectedDate: string
  onSelectDate: (iso: string) => void
  onLongPressDate?: (iso: string) => void
  onJumpToDayView?: (iso: string) => void
}

const DOUBLE_TAP_WINDOW_MS = 300

function DayCell(props: DayCellProps) {
  const {
    iso, day, disabled, isToday, isSelected, summary, density,
    colors, getScaledFontSize, selectedDate, onSelectDate,
    onLongPressDate, onJumpToDayView,
  } = props
  // Track time of last tap on this cell for the double-tap detector
  // (cheap per-instance ref; no global state).
  const lastTapAt = useRef(0)

  // Number-color logic:
  //  - today (whether selected or not) → red number on possibly-red pill
  //  - selected (non-today) → white on tint pill
  //  - other-month → grey
  //  - default → text
  // Apple highlights today's number in red even when selected; the
  // selection pill in that case is the same red, just slightly more
  // opaque.
  const isTodayAndSelected = isToday && isSelected
  const numColor = disabled
    ? colors.disabled
    : isTodayAndSelected
      ? '#fff'
      : isToday
        ? '#FF3B30'
        : isSelected
          ? '#fff'
          : colors.text
  const numWeight: '400' | '700' = isToday || isSelected ? '700' : '400'
  const pillBg = isTodayAndSelected
    ? '#FF3B30'
    : isSelected
      ? colors.tint
      : 'transparent'

  const cellHeight = density === 'details' ? 84 : density === 'stacked' ? 64 : 56

  const handlePress = () => {
    const now = Date.now()
    const isDouble = now - lastTapAt.current < DOUBLE_TAP_WINDOW_MS
    lastTapAt.current = now
    hapticSelection()
    if (isDouble && onJumpToDayView) {
      // Apple shortcut: tap day twice → Day view at that day.
      onJumpToDayView(iso)
      return
    }
    onSelectDate(iso)
  }

  const handleLongPress = () => {
    hapticImpact('medium')
    onLongPressDate?.(iso)
  }

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPressDate ? handleLongPress : undefined}
      delayLongPress={350}
      style={{
        width: '100%',
        height: cellHeight,
        alignItems: 'center',
        paddingTop: 4,
      }}
      accessibilityRole="button"
      accessibilityLabel={`${day}${isToday ? ', today' : ''}${summary ? `, ${summary.count} event${summary.count > 1 ? 's' : ''}` : ''}`}
      accessibilityHint={onLongPressDate ? 'Double tap to open day view, long press to create event' : undefined}
      accessibilityState={{ selected: isSelected }}
    >
      {/* Day number — pill background when selected or today */}
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: pillBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: numColor, fontSize: getScaledFontSize(20), fontWeight: numWeight }}>
          {day}
        </Text>
      </View>

      {/* Density-specific event indicators */}
      {!disabled && summary && (
        <View style={{ width: '100%', alignItems: 'center', paddingHorizontal: 4, marginTop: 2 }}>
          {density === 'compact' && (
            <View
              style={{
                width: 14,
                height: 4,
                borderRadius: 2,
                backgroundColor: summary.sources[0]?.color ?? colors.tint,
              }}
            />
          )}
          {density === 'stacked' && (
            <View style={{ width: '100%', gap: 2 }}>
              {summary.sources.slice(0, 3).map((s, i) => (
                <View
                  key={i}
                  style={{ width: '100%', height: 4, borderRadius: 2, backgroundColor: s.color }}
                />
              ))}
            </View>
          )}
          {density === 'details' && (
            <View style={{ width: '100%', gap: 2 }}>
              {summary.titles.slice(0, 2).map((t, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ width: 2, height: 9, borderRadius: 1, backgroundColor: t.color }} />
                  <Text
                    style={{
                      flex: 1,
                      color: colors.text,
                      fontSize: getScaledFontSize(9),
                      fontWeight: '500',
                    }}
                    numberOfLines={1}
                  >
                    {t.title}
                  </Text>
                </View>
              ))}
              {summary.count > 2 && (
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(8) }}>
                  +{summary.count - 2} more
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 8 },
})
