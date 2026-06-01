/**
 * SCRUM-279 / COS-308 — main Calendar screen (replaces the old
 * appointments tab).
 *
 * Apple-iPhone-Calendar replica: Year, Month, Day, List views (we drop
 * Week view because iPhone's Apple Calendar doesn't have it — only iPad
 * and Mac do, and porting that hour-grid 5-column UX to iPhone is too
 * sophisticated for the screen real estate). Search bar slides in from
 * the top when the magnifying-glass is tapped. Past visits + iOS
 * Reminders are overlaid alongside device-calendar events. Settings cog
 * opens per-calendar visibility / notification preferences and the help
 * card that explains how to surface Outlook / Teams / Google calendars.
 *
 * Typography roughly tracks Apple iOS Calendar:
 *   - Top label (selected month / year): 28pt SF Pro Display bold
 *   - Tab labels (Year / Month / Day / List): 14pt SF Pro Text medium
 *   - Event titles: 15pt regular
 *   - Search input: 16pt regular
 * Accessibility scale (`getScaledFontSize`) is applied on top of these.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { CalendarPermissionGate } from '@/components/calendar/CalendarPermissionGate'
import { CalendarMonthView, type MonthDensityMode } from '@/components/calendar/CalendarMonthView'
import { CalendarYearView } from '@/components/calendar/CalendarYearView'
import { CalendarDayTimeline } from '@/components/calendar/CalendarDayTimeline'
import { EventListItem } from '@/components/calendar/EventListItem'
import { useCalendar } from '@/hooks/use-calendar'
import { useCalendarPermissions } from '@/hooks/use-calendar-permissions'
import { virtualEventFromAppEntity, type CalendarEvent } from '@/services/calendar'
import { registerCalendarSync } from '@/services/calendar-sync'
import { reconcileEventNotifications } from '@/services/calendar-notifications'
import { useAppointments } from '@/hooks/use-appointments'

// iPhone Apple Calendar has only these four — no Week view.
type CalendarViewMode = 'year' | 'month' | 'day' | 'list'

const SEARCH_HEIGHT = 44 // pixel height of the slide-in search bar

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Shift an ISO date by N days (positive or negative), returning ISO. */
function addDays(dayIso: string, delta: number): string {
  const d = new Date(`${dayIso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function toIso(date: string, time?: string): string {
  if (!date) return ''
  const t = (time ?? '00:00').trim()
  const m = /^(\d{1,2}):(\d{2})(:(\d{2}))?$/.exec(t)
  if (!m) return new Date(`${date}T00:00:00`).toISOString()
  const hh = m[1].padStart(2, '0')
  const mm = m[2]
  const ss = m[4] ?? '00'
  const d = new Date(`${date}T${hh}:${mm}:${ss}`)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

function fmtMonthYear(dayIso: string): string {
  try { return new Date(dayIso).toLocaleString(undefined, { month: 'long', year: 'numeric' }) }
  catch { return dayIso }
}

function fmtDayHeader(dayIso: string): string {
  try { return new Date(dayIso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }
  catch { return dayIso }
}

function groupByDay(events: CalendarEvent[]): { day: string; items: CalendarEvent[] }[] {
  const map = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const day = e.startDate.slice(0, 10)
    const bucket = map.get(day)
    if (bucket) bucket.push(e)
    else map.set(day, [e])
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => ({ day, items }))
}

function applySearch(events: CalendarEvent[], q: string): CalendarEvent[] {
  if (!q.trim()) return events
  const needle = q.trim().toLowerCase()
  return events.filter((e) =>
    e.title.toLowerCase().includes(needle)
    || (e.location ?? '').toLowerCase().includes(needle)
    || (e.notes ?? '').toLowerCase().includes(needle)
    || (e.source.title ?? '').toLowerCase().includes(needle),
  )
}

export default function CalendarScreen() {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const permissions = useCalendarPermissions()
  const [activeView, setActiveView] = useState<CalendarViewMode>('month')
  const [selectedDay, setSelectedDay] = useState<string>(todayIso())
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  // Apple's Month-view density toggle (pinch-to-zoom on Apple — we
  // expose it as a small chip in the title bar).
  const [monthDensity, setMonthDensity] = useState<MonthDensityMode>('compact')

  // Search-bar slide animation (Apple Calendar style: search field
  // animates down from beneath the header on tap, slides back up on
  // dismiss). 0 → hidden, SEARCH_HEIGHT → visible.
  const searchAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(searchAnim, {
      toValue: showSearch ? SEARCH_HEIGHT : 0,
      duration: 220,
      useNativeDriver: false,
    }).start()
  }, [showSearch, searchAnim])

  const { data: appointments } = useAppointments()
  const appEvents = useMemo<CalendarEvent[]>(() => {
    if (!appointments) return []
    const now = Date.now()
    return appointments
      .map((a) => {
        const startIso = toIso(a.date, a.time)
        const endIso = a.endDate
          ? toIso(a.endDate, a.endTime)
          : a.endTime
            ? toIso(a.date, a.endTime)
            : startIso
        return virtualEventFromAppEntity({
          id: a.id,
          title: a.doctorName ? `${a.type} — ${a.doctorName}` : a.type,
          startDate: startIso,
          endDate: endIso,
          location: a.clinicName,
          notes: a.notes,
          kind: new Date(startIso).getTime() < now ? 'past-visit' : 'appointment',
        })
      })
      .filter((e) => !Number.isNaN(new Date(e.startDate).getTime()))
  }, [appointments])

  const { events, isLoading, isRefreshing, refresh, notificationDisabledCalendarIds } =
    useCalendar({ appEvents, includeReminders: true })
  const filteredEvents = useMemo(() => applySearch(events, searchQuery), [events, searchQuery])

  useEffect(() => {
    if (permissions.state.granted) void registerCalendarSync()
  }, [permissions.state.granted])

  useEffect(() => {
    if (permissions.state.granted && events.length > 0) {
      void reconcileEventNotifications(events, notificationDisabledCalendarIds)
    }
  }, [permissions.state.granted, events, notificationDisabledCalendarIds])

  const refreshPermissions = permissions.refresh
  useFocusEffect(useCallback(() => {
    void refreshPermissions()
  }, [refreshPermissions]))

  const eventsForSelectedDay = useMemo(
    () => filteredEvents.filter((e) => e.startDate.slice(0, 10) === selectedDay),
    [filteredEvents, selectedDay],
  )

  const dayGroups = useMemo(() => groupByDay(filteredEvents), [filteredEvents])

  const headerLabel = useMemo(() => {
    switch (activeView) {
      case 'year': return String(new Date(`${selectedDay}T00:00:00`).getFullYear())
      case 'month': return fmtMonthYear(selectedDay)
      case 'day': return fmtDayHeader(selectedDay)
      case 'list': return 'All Events'
    }
  }, [activeView, selectedDay])

  return (
    <AppWrapper showFooter showHamburgerIcon showBellIcon>
      <CalendarPermissionGate permissions={permissions}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <CalendarHeader
            activeView={activeView}
            onChangeView={setActiveView}
            label={headerLabel}
            onJumpToday={() => setSelectedDay(todayIso())}
            onToggleSearch={() => setShowSearch((p) => !p)}
            onOpenSettings={() => router.push('/Home/calendar-settings' as never)}
            showSearch={showSearch}
            searchAnim={searchAnim}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClearSearch={() => { setSearchQuery(''); setShowSearch(false) }}
          />
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : activeView === 'year' ? (
            <CalendarYearView
              year={new Date(`${selectedDay}T00:00:00`).getFullYear()}
              events={filteredEvents}
              onJumpToMonth={(iso) => {
                setSelectedDay(iso)
                setActiveView('month')
              }}
            />
          ) : activeView === 'month' ? (
            <FlatList
              data={eventsForSelectedDay}
              keyExtractor={(e) => e.id}
              renderItem={({ item }) => (
                <EventListItem event={item} compact onPress={() => openDetail(item)} />
              )}
              ListHeaderComponent={
                <View>
                  <DensitySwitcher
                    density={monthDensity}
                    onChange={setMonthDensity}
                    colors={colors}
                    getScaledFontSize={getScaledFontSize}
                  />
                  <CalendarMonthView
                    events={filteredEvents}
                    selectedDate={selectedDay}
                    onSelectDate={setSelectedDay}
                    onMonthChange={(iso) => setSelectedDay(iso)}
                    density={monthDensity}
                  />
                </View>
              }
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
                  {searchQuery ? 'No matches for this day' : 'No events on this day'}
                </Text>
              }
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.tint} />}
            />
          ) : activeView === 'day' ? (
            <CalendarDayTimeline
              key={selectedDay} // re-mount on day change so auto-scroll re-runs
              dateIso={selectedDay}
              events={eventsForSelectedDay}
              onPressEvent={openDetail}
              onPressEmptyHour={(h) => openEditor(selectedDay, h)}
              onPressPrevDay={() => setSelectedDay(addDays(selectedDay, -1))}
              onPressNextDay={() => setSelectedDay(addDays(selectedDay, 1))}
              onSelectDate={setSelectedDay}
            />
          ) : (
            <FlatList
              data={dayGroups}
              keyExtractor={(g) => g.day}
              renderItem={({ item }) => (
                <View>
                  <View style={[styles.dayHeader, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.dayHeaderText, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                      {fmtDayHeader(item.day).toUpperCase()}
                    </Text>
                  </View>
                  {item.items.map((event) => (
                    <EventListItem key={event.id} event={event} onPress={() => openDetail(event)} />
                  ))}
                </View>
              )}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
                  {searchQuery ? `No events matching "${searchQuery}"` : 'No upcoming events'}
                </Text>
              }
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.tint} />}
            />
          )}

          <Pressable
            onPress={() => openEditor(selectedDay)}
            style={({ pressed }) => [styles.fab, { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Create new calendar event"
          >
            <Text style={styles.fabPlus}>+</Text>
          </Pressable>
        </View>
      </CalendarPermissionGate>
    </AppWrapper>
  )
}

/**
 * Apple Calendar's Month-density toggle. Apple uses pinch-to-zoom; we
 * surface it as a small segmented chip just above the grid because
 * pinch on a calendar grid is a non-obvious gesture.
 */
function DensitySwitcher({
  density, onChange, colors, getScaledFontSize,
}: {
  density: MonthDensityMode
  onChange: (m: MonthDensityMode) => void
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
}) {
  const modes: { id: MonthDensityMode; label: string }[] = [
    { id: 'compact', label: 'Compact' },
    { id: 'stacked', label: 'Stacked' },
    { id: 'details', label: 'Details' },
  ]
  return (
    <View style={styles.densityRow}>
      <View style={[styles.densityChip, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        {modes.map((m) => {
          const active = m.id === density
          return (
            <Pressable
              key={m.id}
              onPress={() => onChange(m.id)}
              style={[
                styles.densitySegment,
                { backgroundColor: active ? colors.background : 'transparent' },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${m.label} density`}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={{
                  color: active ? colors.text : colors.subtext,
                  fontSize: getScaledFontSize(12),
                  fontWeight: active ? '600' : '500',
                }}
              >
                {m.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function openDetail(event: CalendarEvent) {
  router.push({ pathname: '/calendar-event-detail', params: { eventId: event.id } } as never)
}

function openEditor(dayIso: string, hour?: number) {
  const params: Record<string, string> = { day: dayIso }
  if (hour !== undefined) params.hour = String(hour)
  router.push({ pathname: '/calendar-event-editor', params } as never)
}

interface HeaderProps {
  activeView: CalendarViewMode
  onChangeView: (v: CalendarViewMode) => void
  label: string
  onJumpToday: () => void
  onToggleSearch: () => void
  onOpenSettings: () => void
  showSearch: boolean
  searchAnim: Animated.Value
  searchQuery: string
  onSearchChange: (q: string) => void
  onClearSearch: () => void
}

function CalendarHeader({
  activeView, onChangeView, label, onJumpToday, onToggleSearch, onOpenSettings,
  showSearch, searchAnim, searchQuery, onSearchChange, onClearSearch,
}: HeaderProps) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const views: { id: CalendarViewMode; label: string }[] = [
    { id: 'year', label: 'Year' },
    { id: 'month', label: 'Month' },
    { id: 'day', label: 'Day' },
    { id: 'list', label: 'List' },
  ]

  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Text
          style={[styles.headerLabel, { color: colors.text, fontSize: getScaledFontSize(28) }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={onToggleSearch}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Toggle search"
            accessibilityState={{ selected: showSearch }}
          >
            <IconSymbol name="magnifyingglass" size={getScaledFontSize(20)} color={colors.tint} />
          </Pressable>
          <Pressable
            onPress={onJumpToday}
            hitSlop={6}
            style={({ pressed }) => [styles.todayBtn, { borderColor: colors.tint, opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Jump to today"
          >
            <Text style={[styles.todayText, { color: colors.tint, fontSize: getScaledFontSize(13) }]}>Today</Text>
          </Pressable>
          <Pressable
            onPress={onOpenSettings}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Calendar settings"
          >
            <IconSymbol name="gear" size={getScaledFontSize(20)} color={colors.tint} />
          </Pressable>
        </View>
      </View>

      {/* Animated search bar — slides down when activated. */}
      <Animated.View
        style={{
          height: searchAnim,
          overflow: 'hidden',
        }}
      >
        <View
          style={[
            styles.searchRow,
            { backgroundColor: colors.cardBackground, borderColor: colors.border },
          ]}
        >
          <IconSymbol name="magnifyingglass" size={getScaledFontSize(15)} color={colors.subtext} />
          <TextInput
            style={[styles.searchInput, { color: colors.text, fontSize: getScaledFontSize(16) }]}
            placeholder="Search events, locations, notes"
            placeholderTextColor={colors.subtext}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoFocus={showSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search calendar"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={onClearSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel search">
              <Text style={{ color: colors.tint, fontSize: getScaledFontSize(15), fontWeight: '500' }}>
                Cancel
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      <View style={styles.viewSwitcher}>
        {views.map((v) => {
          const active = v.id === activeView
          return (
            <Pressable
              key={v.id}
              onPress={() => onChangeView(v.id)}
              style={({ pressed }) => [
                styles.viewBtn,
                {
                  backgroundColor: active ? colors.tint : 'transparent',
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${v.label} view`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.viewBtnText, { color: active ? '#fff' : colors.text, fontSize: getScaledFontSize(14) }]}>
                {v.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Apple's title is 28pt SF Pro Display bold, tight letter spacing
  headerLabel: { fontWeight: '700', flex: 1, marginRight: 8, letterSpacing: -0.4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  todayBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  todayText: { fontWeight: '500', letterSpacing: -0.1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: SEARCH_HEIGHT - 8,
  },
  searchInput: { flex: 1, paddingVertical: 0 }, // paddingVertical 0 prevents extra height
  viewSwitcher: { flexDirection: 'row', gap: 4, marginTop: 10 },
  viewBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  viewBtnText: { fontWeight: '500', letterSpacing: -0.1 },
  empty: { textAlign: 'center', padding: 32 },
  dayHeader: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dayHeaderText: { fontWeight: '700', letterSpacing: 0.5 },
  fab: { position: 'absolute', right: 20, bottom: 100, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  fabPlus: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 32 },
  // Density switcher (Apple Month-view pinch alternative)
  densityRow: { alignItems: 'center', paddingVertical: 8 },
  densityChip: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
    gap: 2,
  },
  densitySegment: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
  },
})
