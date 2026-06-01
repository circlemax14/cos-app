/**
 * Apple-Calendar-style Year view.
 *
 * Vertical infinite-feel scroll where each year section fills the screen
 * width. Within a year we render a 3 × 4 grid of month "mini-cards"
 * sized to use the full available width with light gutters — matching
 * Apple iOS Calendar's Year view layout.
 *
 * Behavior:
 *   - Initial render shows currentYear − 1, currentYear, currentYear + 1
 *   - Scrolling up past the top loads the previous year
 *   - Scrolling down past the bottom loads the next year
 *   - Today is highlighted with a filled red circle on its month card
 *   - Tap a month → jump to Month view at that month's first day
 */

import React, { useMemo, useRef } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import type { CalendarEvent } from '@/services/calendar'

interface Props {
  year: number
  events: CalendarEvent[]
  onJumpToMonth: (yyyyMmDd: string) => void
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Apple's Year view spans far past + far future as a single continuous
// scroll. We pre-seed a 100-year range (current ± 50) so the user just
// scrolls naturally to past or future years — no tap-to-load. FlatList's
// virtualization keeps memory low: only on-screen years actually render.
const YEAR_RANGE = 50

export function CalendarYearView({ year, events, onJumpToMonth }: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const yearList = useMemo<number[]>(() => {
    const list: number[] = []
    for (let y = year - YEAR_RANGE; y <= year + YEAR_RANGE; y++) list.push(y)
    return list
  }, [year])

  const initialScrollIndex = YEAR_RANGE // = position of `year` in yearList

  const daysWithEvents = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) set.add(e.startDate.slice(0, 10))
    return set
  }, [events])

  const todayIso = new Date().toISOString().slice(0, 10)
  const listRef = useRef<FlatList<number>>(null)

  return (
    <FlatList
      ref={listRef}
      data={yearList}
      keyExtractor={(y) => String(y)}
      renderItem={({ item: y }) => (
        <YearSection
          year={y}
          daysWithEvents={daysWithEvents}
          todayIso={todayIso}
          onJumpToMonth={onJumpToMonth}
          getScaledFontSize={getScaledFontSize}
          textColor={colors.text}
          subColor={colors.subtext}
          accentColor={colors.tint}
          borderColor={colors.border}
        />
      )}
      initialScrollIndex={initialScrollIndex}
      // Section heights are roughly the same (title + 4x3 grid), so we
      // can give FlatList a reasonable getItemLayout for fast jump-scroll.
      // The exact value is approximate — virtualization tolerates drift.
      getItemLayout={(_, index) => ({
        length: ESTIMATED_YEAR_HEIGHT,
        offset: ESTIMATED_YEAR_HEIGHT * index,
        index,
      })}
      onScrollToIndexFailed={(info) => {
        // Fallback for the rare case where layout hasn't measured yet.
        const wait = new Promise((r) => setTimeout(r, 100))
        wait.then(() => listRef.current?.scrollToIndex({ index: info.index, animated: false }))
      }}
      // Keep the visually-anchored year stable as cells layout in the bg.
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      contentContainerStyle={{ paddingBottom: 60 }}
      removeClippedSubviews
      windowSize={5}
    />
  )
}

// Year section ≈ title (50px) + 4 rows × ~110px (3-col mini cards) +
// padding. ~500px is a fine virtualization estimate.
const ESTIMATED_YEAR_HEIGHT = 500

interface YearSectionProps {
  year: number
  daysWithEvents: Set<string>
  todayIso: string
  onJumpToMonth: (yyyyMmDd: string) => void
  getScaledFontSize: (n: number) => number
  textColor: string
  subColor: string
  accentColor: string
  borderColor: string
}

function YearSection({
  year, daysWithEvents, todayIso, onJumpToMonth,
  getScaledFontSize, textColor, subColor, accentColor, borderColor,
}: YearSectionProps) {
  const { width } = useWindowDimensions()
  const isCurrentYear = year === new Date().getFullYear()
  // 3 columns × 4 rows; minimal gutter — Apple uses ~12px between cards
  const GUTTER = 12
  const HORIZ_PAD = 16
  const cardWidth = (width - HORIZ_PAD * 2 - GUTTER * 2) / 3

  return (
    <View style={{ paddingHorizontal: HORIZ_PAD, paddingVertical: 20 }}>
      <Text
        style={{
          color: isCurrentYear ? accentColor : textColor,
          fontSize: getScaledFontSize(34),
          fontWeight: '700',
          marginBottom: 12,
        }}
      >
        {year}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GUTTER }}>
        {MONTH_SHORT.map((name, idx) => (
          <MonthMiniCard
            key={name}
            name={name}
            longName={MONTH_NAMES[idx]}
            year={year}
            monthIndex={idx}
            width={cardWidth}
            daysWithEvents={daysWithEvents}
            todayIso={todayIso}
            getScaledFontSize={getScaledFontSize}
            textColor={textColor}
            subColor={subColor}
            accentColor={accentColor}
            borderColor={borderColor}
            onPress={() =>
              onJumpToMonth(`${year}-${String(idx + 1).padStart(2, '0')}-01`)
            }
          />
        ))}
      </View>
    </View>
  )
}

interface MonthMiniCardProps {
  name: string
  longName: string
  year: number
  monthIndex: number
  width: number
  daysWithEvents: Set<string>
  todayIso: string
  getScaledFontSize: (n: number) => number
  textColor: string
  subColor: string
  accentColor: string
  borderColor: string
  onPress: () => void
}

function MonthMiniCard({
  name, longName, year, monthIndex, width, daysWithEvents, todayIso,
  getScaledFontSize, textColor, subColor, accentColor, borderColor, onPress,
}: MonthMiniCardProps) {
  const grid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex])
  const currentMonth = year === new Date().getFullYear() && monthIndex === new Date().getMonth()
  // Cell sizing scales with card width so the grid breathes nicely on
  // every device size.
  const cellSize = Math.floor((width - 6) / 7)

  return (
    <Pressable
      onPress={onPress}
      style={{ width }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${longName} ${year}`}
    >
      <Text
        style={{
          color: currentMonth ? accentColor : textColor,
          fontSize: getScaledFontSize(15),
          fontWeight: '700',
          marginBottom: 4,
          letterSpacing: -0.2,
        }}
      >
        {name}
      </Text>
      <View>
        {/* Weekday header */}
        <View style={{ flexDirection: 'row' }}>
          {WEEKDAY_LETTERS.map((w, i) => (
            <View key={`${w}-${i}`} style={{ width: cellSize, height: cellSize * 0.7, alignItems: 'center', justifyContent: 'center' }}>
              <Text
                style={{
                  color: subColor,
                  fontSize: getScaledFontSize(9),
                  fontWeight: '500',
                }}
              >
                {w}
              </Text>
            </View>
          ))}
        </View>
        {/* Day cells */}
        {grid.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row' }}>
            {row.map((cell, ci) => {
              if (cell === 0) {
                return <View key={ci} style={{ width: cellSize, height: cellSize }} />
              }
              const dateIso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(cell).padStart(2, '0')}`
              const isToday = dateIso === todayIso
              const hasEvents = daysWithEvents.has(dateIso)
              return (
                <View
                  key={ci}
                  style={{ width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    style={{
                      width: cellSize * 0.7,
                      height: cellSize * 0.7,
                      borderRadius: cellSize,
                      backgroundColor: isToday ? '#FF3B30' : 'transparent', // Apple's "today" red
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: isToday ? '#fff' : textColor,
                        fontSize: getScaledFontSize(10),
                        fontWeight: isToday ? '700' : '500',
                      }}
                    >
                      {cell}
                    </Text>
                  </View>
                  {hasEvents && !isToday && (
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        width: 3,
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: accentColor,
                      }}
                    />
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
