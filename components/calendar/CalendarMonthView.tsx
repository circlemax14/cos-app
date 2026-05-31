/**
 * Month grid with colored dots per day showing how many calendars have
 * events that day. Uses `react-native-calendars` <Calendar>. Selecting
 * a day notifies the parent so it can render the day's event list below.
 */

import React, { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Calendar } from 'react-native-calendars'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import type { CalendarEvent } from '@/services/calendar'

interface Props {
  events: CalendarEvent[]
  selectedDate: string // YYYY-MM-DD
  onSelectDate: (dateIso: string) => void
}

interface Marking {
  marked?: boolean
  dots?: { key: string; color: string }[]
  selected?: boolean
  selectedColor?: string
}

export function CalendarMonthView({ events, selectedDate, onSelectDate }: Props) {
  const { settings } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const marked = useMemo<Record<string, Marking>>(() => {
    const out: Record<string, Marking> = {}
    // group events per day and produce up-to-3 dots in the day's source
    // colors (Apple Calendar caps at ~3 visible dots per cell).
    for (const e of events) {
      const day = e.startDate.slice(0, 10)
      const cell = out[day] ?? { dots: [] }
      const dotKey = `${e.source.id}:${e.id}`
      const sameColorExists = cell.dots?.some((d) => d.color === e.source.color)
      if (!sameColorExists && (cell.dots?.length ?? 0) < 3) {
        cell.dots!.push({ key: dotKey, color: e.source.color })
      }
      cell.marked = true
      out[day] = cell
    }
    if (out[selectedDate]) {
      out[selectedDate] = { ...out[selectedDate], selected: true, selectedColor: colors.tint }
    } else {
      out[selectedDate] = { selected: true, selectedColor: colors.tint }
    }
    return out
  }, [events, selectedDate, colors.tint])

  return (
    <View style={styles.wrap}>
      <Calendar
        theme={{
          backgroundColor: colors.background,
          calendarBackground: colors.background,
          textSectionTitleColor: colors.subtext,
          dayTextColor: colors.text,
          monthTextColor: colors.text,
          todayTextColor: colors.tint,
          arrowColor: colors.tint,
          selectedDayBackgroundColor: colors.tint,
          selectedDayTextColor: '#fff',
          textDayFontWeight: '500',
          textMonthFontWeight: '700',
          textDayHeaderFontWeight: '600',
        }}
        markingType="multi-dot"
        markedDates={marked}
        onDayPress={(d) => onSelectDate(d.dateString)}
        firstDay={0}
        enableSwipeMonths
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 8 },
})
