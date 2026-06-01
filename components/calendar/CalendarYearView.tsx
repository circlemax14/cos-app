/**
 * Year view — Apple Calendar's 12-month overview. Each month is a small
 * grid with dots on days that have events. Tapping a month jumps to
 * Month view positioned at that month's first day.
 */

import React, { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import type { CalendarEvent } from '@/services/calendar'

interface Props {
  year: number
  events: CalendarEvent[]
  onJumpToMonth: (yyyyMmDd: string) => void
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function CalendarYearView({ year, events, onJumpToMonth }: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const { width } = useWindowDimensions()
  const monthCardWidth = (width - 32 - 16) / 3 // 3 columns, 16 gutter, 16 padding

  const daysWithEvents = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) set.add(e.startDate.slice(0, 10))
    return set
  }, [events])

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
      <Text style={[styles.yearLabel, { color: colors.text, fontSize: getScaledFontSize(28) }]}>{year}</Text>
      <View style={styles.grid}>
        {MONTH_NAMES.map((name, idx) => (
          <MonthCard
            key={name}
            name={name}
            year={year}
            monthIndex={idx}
            daysWithEvents={daysWithEvents}
            width={monthCardWidth}
            onPress={() => onJumpToMonth(`${year}-${String(idx + 1).padStart(2, '0')}-01`)}
          />
        ))}
      </View>
    </ScrollView>
  )
}

interface MonthCardProps {
  name: string
  year: number
  monthIndex: number
  daysWithEvents: Set<string>
  width: number
  onPress: () => void
}

function MonthCard({ name, year, monthIndex, daysWithEvents, width, onPress }: MonthCardProps) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const grid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex])
  const isCurrentMonth = year === new Date().getFullYear() && monthIndex === new Date().getMonth()
  const todayDay = new Date().getDate()

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { width, borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name} ${year}`}
    >
      <Text
        style={[
          styles.monthName,
          { color: isCurrentMonth ? colors.tint : colors.text, fontSize: getScaledFontSize(14) },
        ]}
      >
        {name}
      </Text>
      <View style={styles.monthGrid}>
        {grid.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((cell, ci) => {
              if (cell === 0) return <View key={ci} style={styles.cell} />
              const dateIso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(cell).padStart(2, '0')}`
              const hasEvents = daysWithEvents.has(dateIso)
              const isToday = isCurrentMonth && cell === todayDay
              return (
                <View key={ci} style={styles.cell}>
                  <Text
                    style={{
                      color: isToday ? '#fff' : colors.text,
                      backgroundColor: isToday ? colors.tint : 'transparent',
                      borderRadius: 99,
                      width: 16,
                      height: 16,
                      textAlign: 'center',
                      fontSize: 9,
                      lineHeight: 16,
                      fontWeight: isToday ? '700' : '400',
                    }}
                  >
                    {cell}
                  </Text>
                  {hasEvents && !isToday && (
                    <View style={[styles.dot, { backgroundColor: colors.tint }]} />
                  )}
                </View>
              )
            })}
          </View>
        ))}
      </View>
    </Pressable>
  )
}

/** Returns a 6×7 matrix of day numbers; cells outside the month are 0. */
function buildMonthGrid(year: number, monthIndex: number): number[][] {
  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)
  const startCol = firstDay.getDay() // 0 = Sun
  const daysInMonth = lastDay.getDate()
  const cells: number[] = []
  for (let i = 0; i < startCol; i++) cells.push(0)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(0)
  // Always 6 rows for visual stability
  while (cells.length < 42) cells.push(0)
  const rows: number[][] = []
  for (let i = 0; i < 6; i++) rows.push(cells.slice(i * 7, (i + 1) * 7))
  return rows
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  yearLabel: { fontWeight: '700', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: { padding: 8, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  monthName: { fontWeight: '700', marginBottom: 4, paddingLeft: 2 },
  monthGrid: {},
  row: { flexDirection: 'row' },
  cell: { width: 16, height: 18, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  dot: { position: 'absolute', bottom: 1, width: 3, height: 3, borderRadius: 2 },
})
