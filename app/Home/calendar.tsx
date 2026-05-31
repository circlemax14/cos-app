/**
 * SCRUM-279 / COS-308 — main Calendar screen.
 *
 * Apple-Calendar-style screen with:
 *   - View switcher: Month / Day / List
 *   - Permission gate (request → settings deep-link)
 *   - Floating "+" button → opens event editor
 *   - Tap an event → opens detail screen
 *   - Pull-to-refresh
 *   - Past visits overlaid as virtual events (color-coded)
 *
 * Past visits come from `useAppointments` and are converted via
 * `virtualEventFromAppEntity` before being passed to `useCalendar`.
 * The merged stream is then split per-day for the selected-day list.
 *
 * Background sync registration happens on first mount once permission
 * is granted (idempotent — safe to call repeatedly).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { CalendarPermissionGate } from '@/components/calendar/CalendarPermissionGate'
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView'
import { EventListItem } from '@/components/calendar/EventListItem'
import { useCalendar } from '@/hooks/use-calendar'
import { useCalendarPermissions } from '@/hooks/use-calendar-permissions'
import { virtualEventFromAppEntity, type CalendarEvent } from '@/services/calendar'
import { registerCalendarSync } from '@/services/calendar-sync'
import { reconcileEventNotifications } from '@/services/calendar-notifications'
import { useAppointments } from '@/hooks/use-appointments'

type CalendarViewMode = 'month' | 'day' | 'list'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Combine a YYYY-MM-DD date string with an optional HH:mm[:ss] time into
 * a full ISO timestamp. Treats missing time as midnight local. Returns the
 * input as-is if parsing fails so downstream filters can reject it.
 */
function toIso(date: string, time?: string): string {
  if (!date) return ''
  const t = (time ?? '00:00').trim()
  // Normalize "9:00" → "09:00" and accept HH:mm or HH:mm:ss
  const m = /^(\d{1,2}):(\d{2})(:(\d{2}))?$/.exec(t)
  if (!m) return new Date(`${date}T00:00:00`).toISOString()
  const hh = m[1].padStart(2, '0')
  const mm = m[2]
  const ss = m[4] ?? '00'
  const d = new Date(`${date}T${hh}:${mm}:${ss}`)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

function fmtMonthYear(dayIso: string): string {
  try {
    const d = new Date(dayIso)
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  } catch {
    return dayIso
  }
}

function fmtDayHeader(dayIso: string): string {
  try {
    const d = new Date(dayIso)
    return d.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  } catch {
    return dayIso
  }
}

/**
 * Group merged events by YYYY-MM-DD so the List view can render day-section
 * headers like Apple Calendar. Sorted ascending.
 */
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

export default function CalendarScreen() {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const permissions = useCalendarPermissions()
  const [activeView, setActiveView] = useState<CalendarViewMode>('month')
  const [selectedDay, setSelectedDay] = useState<string>(todayIso())

  // Pull our app's past visits + future appointments from the existing
  // appointments hook so we can overlay them as virtual events.
  const { data: appointments } = useAppointments()
  const appEvents = useMemo<CalendarEvent[]>(() => {
    if (!appointments) return []
    const now = Date.now()
    return appointments
      .map((a) => {
        // Backend `Appointment` has split `date` + `time` strings — combine
        // them into a single ISO timestamp. Best-effort; falls back to date
        // only if `time` is missing or malformed.
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

  const { events, isLoading, isRefreshing, refresh } = useCalendar({ appEvents })

  // Register background sync + reconcile local notifications once permission
  // is granted. Both are idempotent.
  useEffect(() => {
    if (permissions.state.granted) {
      void registerCalendarSync()
    }
  }, [permissions.state.granted])

  useEffect(() => {
    if (permissions.state.granted && events.length > 0) {
      void reconcileEventNotifications(events)
    }
  }, [permissions.state.granted, events])

  // Re-read permissions when the screen comes back into focus (handles
  // the "user went to Settings to grant" round-trip). Extract refresh to
  // a stable local so the lint exhaustive-deps rule is happy without
  // depending on the whole permissions object (which is a new ref each render).
  const refreshPermissions = permissions.refresh
  useFocusEffect(useCallback(() => {
    void refreshPermissions()
  }, [refreshPermissions]))

  const eventsForSelectedDay = useMemo(
    () => events.filter((e) => e.startDate.slice(0, 10) === selectedDay),
    [events, selectedDay],
  )

  const dayGroups = useMemo(() => groupByDay(events), [events])

  return (
    <AppWrapper showFooter showHamburgerIcon showBellIcon>
      <CalendarPermissionGate permissions={permissions}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <CalendarHeader
            activeView={activeView}
            onChangeView={setActiveView}
            label={activeView === 'month' ? fmtMonthYear(selectedDay) : fmtDayHeader(selectedDay)}
            onJumpToday={() => setSelectedDay(todayIso())}
          />
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : activeView === 'month' ? (
            <FlatList
              data={eventsForSelectedDay}
              keyExtractor={(e) => e.id}
              renderItem={({ item }) => (
                <EventListItem
                  event={item}
                  compact
                  onPress={() => openDetail(item)}
                />
              )}
              ListHeaderComponent={
                <CalendarMonthView
                  events={events}
                  selectedDate={selectedDay}
                  onSelectDate={setSelectedDay}
                />
              }
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
                  No events on this day
                </Text>
              }
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.tint} />
              }
            />
          ) : activeView === 'day' ? (
            <FlatList
              data={eventsForSelectedDay}
              keyExtractor={(e) => e.id}
              renderItem={({ item }) => (
                <EventListItem event={item} onPress={() => openDetail(item)} />
              )}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
                  No events scheduled for {fmtDayHeader(selectedDay)}
                </Text>
              }
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.tint} />
              }
            />
          ) : (
            // List view — Apple Calendar's "Inbox"
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
                  No upcoming events
                </Text>
              }
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.tint} />
              }
            />
          )}

          {/* Floating + button — opens the event editor for the selected day */}
          <Pressable
            onPress={() => openEditor(selectedDay)}
            style={({ pressed }) => [
              styles.fab,
              { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 },
            ]}
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

function openEditor(dayIso: string) {
  router.push({ pathname: '/calendar-event-editor', params: { day: dayIso } } as never)
}

interface HeaderProps {
  activeView: CalendarViewMode
  onChangeView: (v: CalendarViewMode) => void
  label: string
  onJumpToday: () => void
}

function CalendarHeader({ activeView, onChangeView, label, onJumpToday }: HeaderProps) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const views: { id: CalendarViewMode; label: string }[] = [
    { id: 'month', label: 'Month' },
    { id: 'day', label: 'Day' },
    { id: 'list', label: 'List' },
  ]
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerLabel, { color: colors.text, fontSize: getScaledFontSize(20) }]}>
          {label}
        </Text>
        <Pressable
          onPress={onJumpToday}
          style={({ pressed }) => [styles.todayBtn, { borderColor: colors.tint, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Jump to today"
        >
          <Text style={[styles.todayText, { color: colors.tint, fontSize: getScaledFontSize(12) }]}>
            Today
          </Text>
        </Pressable>
      </View>
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
              <Text
                style={[
                  styles.viewBtnText,
                  { color: active ? '#fff' : colors.text, fontSize: getScaledFontSize(13) },
                ]}
              >
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
  headerLabel: { fontWeight: '700' },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  todayText: { fontWeight: '600' },
  viewSwitcher: { flexDirection: 'row', gap: 8, marginTop: 12 },
  viewBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  viewBtnText: { fontWeight: '600' },
  empty: { textAlign: 'center', padding: 32 },
  dayHeader: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dayHeaderText: { fontWeight: '700', letterSpacing: 0.5 },
  fab: { position: 'absolute', right: 20, bottom: 100, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  fabPlus: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 32 },
})
