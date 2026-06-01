/**
 * SCRUM-279 / COS-308 — main Calendar screen (replaces the old
 * appointments tab).
 *
 * Apple-Calendar-style with five views: Year, Month, Week, Day, List.
 * Search bar in the header filters across all view modes. Past visits
 * from our backend are overlaid as virtual events alongside device
 * calendar events AND iOS Reminders. Settings cog opens the per-calendar
 * visibility screen which also has help text for adding Outlook / Teams /
 * Google accounts.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
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
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView'
import { CalendarWeekView } from '@/components/calendar/CalendarWeekView'
import { CalendarYearView } from '@/components/calendar/CalendarYearView'
import { CalendarDayTimeline } from '@/components/calendar/CalendarDayTimeline'
import { EventListItem } from '@/components/calendar/EventListItem'
import { useCalendar } from '@/hooks/use-calendar'
import { useCalendarPermissions } from '@/hooks/use-calendar-permissions'
import { virtualEventFromAppEntity, type CalendarEvent } from '@/services/calendar'
import { registerCalendarSync } from '@/services/calendar-sync'
import { reconcileEventNotifications } from '@/services/calendar-notifications'
import { useAppointments } from '@/hooks/use-appointments'

type CalendarViewMode = 'year' | 'month' | 'week' | 'day' | 'list'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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

function fmtWeekRange(weekStartIso: string): string {
  try {
    const s = new Date(weekStartIso)
    const e = new Date(s)
    e.setDate(s.getDate() + 6)
    const sm = s.toLocaleString(undefined, { month: 'short', day: 'numeric' })
    const em = e.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return `${sm} – ${em}`
  } catch { return weekStartIso }
}

/** Sunday of the week containing the given YYYY-MM-DD. */
function weekStartOf(dayIso: string): string {
  const d = new Date(`${dayIso}T00:00:00`)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
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

  const { events, isLoading, isRefreshing, refresh } = useCalendar({ appEvents, includeReminders: true })
  const filteredEvents = useMemo(() => applySearch(events, searchQuery), [events, searchQuery])

  useEffect(() => {
    if (permissions.state.granted) void registerCalendarSync()
  }, [permissions.state.granted])

  useEffect(() => {
    if (permissions.state.granted && events.length > 0) {
      void reconcileEventNotifications(events)
    }
  }, [permissions.state.granted, events])

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
      case 'week': return fmtWeekRange(weekStartOf(selectedDay))
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
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
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
                <CalendarMonthView
                  events={filteredEvents}
                  selectedDate={selectedDay}
                  onSelectDate={setSelectedDay}
                />
              }
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
                  {searchQuery ? 'No matches for this day' : 'No events on this day'}
                </Text>
              }
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.tint} />}
            />
          ) : activeView === 'week' ? (
            <CalendarWeekView
              weekStart={weekStartOf(selectedDay)}
              events={filteredEvents}
              selectedDate={selectedDay}
              onSelectDate={setSelectedDay}
              onPressEvent={openDetail}
            />
          ) : activeView === 'day' ? (
            <CalendarDayTimeline
              dateIso={selectedDay}
              events={eventsForSelectedDay}
              onPressEvent={openDetail}
              onPressEmptyHour={(h) => openEditor(selectedDay, h)}
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
  searchQuery: string
  onSearchChange: (q: string) => void
}

function CalendarHeader({
  activeView, onChangeView, label, onJumpToday, onToggleSearch, onOpenSettings,
  showSearch, searchQuery, onSearchChange,
}: HeaderProps) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const views: { id: CalendarViewMode; label: string }[] = [
    { id: 'year', label: 'Year' },
    { id: 'month', label: 'Month' },
    { id: 'week', label: 'Week' },
    { id: 'day', label: 'Day' },
    { id: 'list', label: 'List' },
  ]

  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerLabel, { color: colors.text, fontSize: getScaledFontSize(20) }]} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={onToggleSearch}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Toggle search"
            accessibilityState={{ selected: showSearch }}
          >
            <IconSymbol name="magnifyingglass" size={getScaledFontSize(20)} color={colors.tint} />
          </Pressable>
          <Pressable
            onPress={onJumpToday}
            style={({ pressed }) => [styles.todayBtn, { borderColor: colors.tint, opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Jump to today"
          >
            <Text style={[styles.todayText, { color: colors.tint, fontSize: getScaledFontSize(12) }]}>Today</Text>
          </Pressable>
          <Pressable
            onPress={onOpenSettings}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Calendar settings"
          >
            <IconSymbol name="gear" size={getScaledFontSize(20)} color={colors.tint} />
          </Pressable>
        </View>
      </View>
      {showSearch && (
        <View style={[styles.searchRow, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={getScaledFontSize(14)} color={colors.subtext} />
          <TextInput
            style={[styles.searchInput, { color: colors.text, fontSize: getScaledFontSize(15) }]}
            placeholder="Search title, location, notes, calendar…"
            placeholderTextColor={colors.subtext}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search calendar events"
          />
        </View>
      )}
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
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${v.label} view`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.viewBtnText, { color: active ? '#fff' : colors.text, fontSize: getScaledFontSize(12) }]}>
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
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLabel: { fontWeight: '700', flex: 1, marginRight: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  todayBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  todayText: { fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1 },
  viewSwitcher: { flexDirection: 'row', gap: 4, marginTop: 10 },
  viewBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  viewBtnText: { fontWeight: '600' },
  empty: { textAlign: 'center', padding: 32 },
  dayHeader: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dayHeaderText: { fontWeight: '700', letterSpacing: 0.5 },
  fab: { position: 'absolute', right: 20, bottom: 100, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  fabPlus: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 32 },
})
