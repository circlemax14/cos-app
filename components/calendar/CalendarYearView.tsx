/**
 * Apple-Calendar-style Year view.
 *
 * Layout:
 *   - One section per year, stacked vertically. Continuous scroll.
 *   - Each year: bold year header + responsive month-card grid:
 *       iPhone (width < 600pt): 2 columns × 6 rows
 *       iPad   (width ≥ 600pt): 3 columns × 4 rows
 *   - Each month card is one tap target → opens Month view at that
 *     month. Long-press anywhere on the card → opens the editor with
 *     that month's first day prefilled. Individual day cells inside
 *     the mini grid are NOT separate tap targets (B3 from prior round
 *     was creating ambiguity — tapping the card area landed on a day
 *     cell and routed to Day view instead of Month).
 *
 * Perf:
 *   - YearSection + MonthMiniCard are React.memo so unchanged years
 *     don't re-render when daysWithEvents shifts a few entries.
 *   - FlatList virtualizes off-screen years.
 *
 * Scroll positioning:
 *   - Instead of initialScrollIndex (which interacted poorly with
 *     maintainVisibleContentPosition on iPad — content would render
 *     then snap back to year 0 ≈ 1998), we mount the list at the
 *     natural top and call scrollToIndex once after first layout.
 */

import React, { memo, useEffect, useMemo, useRef } from 'react'
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
import { hapticImpact } from '@/utils/haptics'

interface Props {
  year: number
  events: CalendarEvent[]
  onJumpToMonth: (yyyyMmDd: string) => void
  /** Long-press a month card → "New Event" prefilled at the month's first day. */
  onLongPressMonth?: (yyyyMmDd: string) => void
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// ±5 years (was ±50). 101 years was overkill — almost no one needs
// half a century of pre-mounted sections, the virtualization estimates
// drift further with more sections, and FlatList lays the whole list
// before first paint which contributed to the white flash. 11 years is
// plenty for normal use (we can extend later with onEndReached).
const YEAR_RANGE = 5

// Section height estimate per device. iPad 3-col grids and iPhone 2-col
// grids both work out near 1100pt with current cellSize math
// (title ~50 + 4 or 6 rows × ~250pt mini-month cards + padding).
// Better-fit estimates dramatically improve scrollToIndex accuracy —
// previously 520pt on iPad meant scrollToIndex(5) landed 3 years short.
function estimatedSectionHeight(width: number): number {
  const isPad = width >= 600
  if (isPad) return 1100 // 3-col × 4-row × ~232pt cells + chrome
  return 1100            // 2-col × 6-row × ~172pt cells + chrome
}

export function CalendarYearView({ year, events, onJumpToMonth, onLongPressMonth }: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const { width } = useWindowDimensions()
  const isPad = width >= 600
  const numCols = isPad ? 3 : 2

  const yearList = useMemo<number[]>(() => {
    const list: number[] = []
    for (let y = year - YEAR_RANGE; y <= year + YEAR_RANGE; y++) list.push(y)
    return list
  }, [year])

  const initialIndex = YEAR_RANGE
  const sectionHeight = estimatedSectionHeight(width)

  const daysWithEvents = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) set.add(e.startDate.slice(0, 10))
    return set
  }, [events])

  const todayIso = new Date().toISOString().slice(0, 10)
  const listRef = useRef<FlatList<number>>(null)
  const didInitialScroll = useRef(false)

  // Scroll to the current year on mount AND whenever `year` prop
  // changes (e.g. user navigated to Month then back to Year for a
  // different year). Uses scrollToOffset with our height estimate so
  // we don't depend on FlatList having actually rendered item N yet
  // (scrollToIndex with a small windowSize was the cause of Ken's
  // "Year scroll lands 3 years short" bug — index 5 needed item 5
  // measured, but only items 0-3 were rendered, so it fell through to
  // onScrollToIndexFailed which estimated incorrectly).
  useEffect(() => {
    const id = setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: initialIndex * sectionHeight,
        animated: false,
      })
      didInitialScroll.current = true
    }, 50)
    return () => clearTimeout(id)
  }, [initialIndex, sectionHeight, year])

  const renderItem = ({ item: y }: { item: number }) => (
    <YearSection
      year={y}
      numCols={numCols}
      daysWithEvents={daysWithEvents}
      todayIso={todayIso}
      onJumpToMonth={onJumpToMonth}
      onLongPressMonth={onLongPressMonth}
      getScaledFontSize={getScaledFontSize}
      textColor={colors.text}
      subColor={colors.subtext}
      accentColor={colors.tint}
      borderColor={colors.border}
    />
  )

  return (
    // Background-colored wrapper kills the white flash Ken saw on
    // iPhone — without it, the system background showed through
    // during virtualization windows where no items were laid out yet.
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        ref={listRef}
        data={yearList}
        keyExtractor={(y) => String(y)}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: sectionHeight,
          offset: sectionHeight * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          const id = setTimeout(() => {
            listRef.current?.scrollToOffset({
              offset: info.index * sectionHeight,
              animated: false,
            })
          }, 120)
          return () => clearTimeout(id)
        }}
        contentContainerStyle={{ paddingBottom: 60, backgroundColor: colors.background }}
        style={{ backgroundColor: colors.background }}
        removeClippedSubviews
        // 11-year YEAR_RANGE means windowSize 3 is enough to cover the
        // visible year + neighbors without paying for distant offscreen.
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        updateCellsBatchingPeriod={50}
        showsVerticalScrollIndicator
      />
    </View>
  )
}

interface YearSectionProps {
  year: number
  numCols: number
  daysWithEvents: Set<string>
  todayIso: string
  onJumpToMonth: (yyyyMmDd: string) => void
  onLongPressMonth?: (yyyyMmDd: string) => void
  getScaledFontSize: (n: number) => number
  textColor: string
  subColor: string
  accentColor: string
  borderColor: string
}

const YearSection = memo(function YearSection({
  year, numCols, daysWithEvents, todayIso, onJumpToMonth, onLongPressMonth,
  getScaledFontSize, textColor, subColor, accentColor,
}: YearSectionProps) {
  const { width } = useWindowDimensions()
  const isCurrentYear = year === new Date().getFullYear()
  // Cap content width on very wide screens (iPad landscape) so the
  // grid centers and doesn't leave dead air on the right.
  const MAX_CONTENT_WIDTH = 760
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH)
  const HORIZ_PAD = 16
  const GUTTER = 16
  const cardWidth = (contentWidth - HORIZ_PAD * 2 - GUTTER * (numCols - 1)) / numCols

  return (
    <View
      style={{
        alignSelf: 'center',
        width: contentWidth,
        paddingHorizontal: HORIZ_PAD,
        paddingVertical: 20,
      }}
    >
      <Text
        style={{
          color: isCurrentYear ? accentColor : textColor,
          fontSize: getScaledFontSize(34),
          fontWeight: '700',
          marginBottom: 16,
          letterSpacing: -0.5,
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
            onPress={() => onJumpToMonth(`${year}-${String(idx + 1).padStart(2, '0')}-01`)}
            onLongPress={onLongPressMonth ? () => {
              hapticImpact('medium')
              onLongPressMonth(`${year}-${String(idx + 1).padStart(2, '0')}-01`)
            } : undefined}
          />
        ))}
      </View>
    </View>
  )
})

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
  onPress: () => void
  onLongPress?: () => void
}

const MonthMiniCard = memo(function MonthMiniCard({
  name, longName, year, monthIndex, width, daysWithEvents, todayIso,
  getScaledFontSize, textColor, subColor, accentColor, onPress, onLongPress,
}: MonthMiniCardProps) {
  const grid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex])
  const isCurrentMonth = year === new Date().getFullYear() && monthIndex === new Date().getMonth()
  // Cell size scales with card width so the grid looks balanced on
  // both 2-col iPhone (wider cards) and 3-col iPad (narrower cards).
  // 2pt of horizontal gap accounts for tiny rounding gaps.
  const cellSize = Math.floor((width - 2) / 7)

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => ({
        width,
        opacity: pressed ? 0.6 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={`Open ${longName} ${year}`}
    >
      <Text
        style={{
          color: isCurrentMonth ? accentColor : textColor,
          fontSize: getScaledFontSize(17),
          fontWeight: '700',
          marginBottom: 6,
          letterSpacing: -0.2,
        }}
      >
        {name}
      </Text>
      <View>
        {/* Weekday header */}
        <View style={{ flexDirection: 'row' }}>
          {WEEKDAY_LETTERS.map((w, i) => (
            <View
              key={`${w}-${i}`}
              style={{ width: cellSize, height: cellSize * 0.7, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text
                style={{
                  color: subColor,
                  fontSize: getScaledFontSize(10),
                  fontWeight: '500',
                }}
                allowFontScaling={false}
              >
                {w}
              </Text>
            </View>
          ))}
        </View>
        {/* Day cells — display-only (not individually tappable; the
            whole card is one tap target). Day numbers sized to fit
            comfortably inside the cell — iPhone Year was clipping with
            the previous 10pt + 70% pill combination. */}
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
                      // Pill exactly equals cell minus a tiny margin so
                      // the number always has vertical breathing room.
                      width: cellSize - 2,
                      height: cellSize - 2,
                      borderRadius: cellSize,
                      backgroundColor: isToday ? '#FF3B30' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: isToday ? '#fff' : textColor,
                        // Slightly smaller than before (was 10) so even
                        // narrow iPhone cells fit two-digit days.
                        fontSize: Math.min(cellSize * 0.5, 12),
                        fontWeight: isToday ? '700' : '500',
                      }}
                      allowFontScaling={false}
                    >
                      {cell}
                    </Text>
                  </View>
                  {hasEvents && !isToday && (
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 1,
                        width: 3,
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: subColor,
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
})

/** Returns a 6×7 matrix of day numbers; cells outside the month are 0. */
function buildMonthGrid(year: number, monthIndex: number): number[][] {
  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)
  const startCol = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  const cells: number[] = []
  for (let i = 0; i < startCol; i++) cells.push(0)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(0)
  while (cells.length < 42) cells.push(0)
  const rows: number[][] = []
  for (let i = 0; i < 6; i++) rows.push(cells.slice(i * 7, (i + 1) * 7))
  return rows
}
