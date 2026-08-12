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
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { CalendarWeekTimeline } from '@/components/calendar/CalendarWeekTimeline'
import { EventListItem } from '@/components/calendar/EventListItem'
import { useCalendar } from '@/hooks/use-calendar'
import { useCalendarPermissions } from '@/hooks/use-calendar-permissions'
import {
  deleteEvent,
  getReminderPermissionStatus,
  requestReminderPermission,
  virtualEventFromAppEntity,
  type CalendarEvent,
} from '@/services/calendar'
import { buildAndUploadSnapshot, registerCalendarSync } from '@/services/calendar-sync'
import { reconcileEventNotifications } from '@/services/calendar-notifications'
import { useAppointments } from '@/hooks/use-appointments'
import { hapticSelection, hapticImpact } from '@/utils/haptics'
import { addRecentSearch } from '@/services/calendar-recents'
import { getCalendarPreferences } from '@/services/calendar-preferences'
import { todayLocalIso } from '@/lib/day-key';

// Year / Month / Week / Day / List — Week was added in v7 at Ken's
// request (Apple's iPad + Mac Calendar both include Week; iPhone's
// doesn't because of screen width, but we support it everywhere now).
type CalendarViewMode = 'year' | 'month' | 'week' | 'day' | 'list'

/** Shift an ISO date by N weeks. UTC math — see addDays comment. */
function addWeeks(dayIso: string, delta: number): string {
  const d = new Date(`${dayIso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta * 7)
  return d.toISOString().slice(0, 10)
}

/** Returns the Sun..Sat ISO range for the week containing dayIso. */
function weekRangeForDay(dayIso: string): { startIso: string; endIso: string } {
  const start = new Date(`${dayIso}T00:00:00`)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { startIso: start.toISOString().slice(0, 10), endIso: end.toISOString().slice(0, 10) }
}

const SEARCH_HEIGHT = 44 // pixel height of the slide-in search bar

function todayIso(): string {
  return todayLocalIso()
}

/**
 * Shift an ISO date by N days (positive or negative), returning ISO.
 *
 * IMPORTANT: uses UTC math (not local) so the result is stable across
 * timezones. The previous implementation parsed `${iso}T00:00:00` as
 * LOCAL time then sliced `toISOString()` (UTC) — which in any timezone
 * east of UTC would round back to the SAME ISO date for delta=+1,
 * silently no-op'ing the Day-view forward arrow. Ken reported this 4
 * times on build 25, 26, 27, 28 — this was the actual root cause, not
 * the chevron Pressable hit area.
 */
function addDays(dayIso: string, delta: number): string {
  const d = new Date(`${dayIso}T12:00:00Z`)  // mid-day UTC to avoid DST + boundary issues
  d.setUTCDate(d.getUTCDate() + delta)
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

/** Returns a small day-of-week subtitle that complements the big title. */
function fmtDaySubtitle(dayIso: string, view: CalendarViewMode): string {
  if (view === 'day' || view === 'list') return '' // already in main title
  try {
    const d = new Date(`${dayIso}T00:00:00`)
    if (view === 'month') {
      // Apple shows "Today, June 1" or "Selected: June 1" — we keep
      // it compact: only show when selected day != today.
      const todayD = new Date()
      if (d.toDateString() === todayD.toDateString()) return 'Today'
      return d.toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    }
    if (view === 'year') {
      const now = new Date()
      if (d.getFullYear() === now.getFullYear()) return 'This year'
      if (d.getFullYear() === now.getFullYear() + 1) return 'Next year'
      if (d.getFullYear() === now.getFullYear() - 1) return 'Last year'
      return ''
    }
    return ''
  } catch { return '' }
}

/** Is the currently-selected day today? Drives the "Today" button visibility. */
function isViewingToday(dayIso: string, view: CalendarViewMode): boolean {
  try {
    const today = new Date()
    const d = new Date(`${dayIso}T00:00:00`)
    if (view === 'day') return d.toDateString() === today.toDateString()
    if (view === 'month') {
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
    }
    if (view === 'week') {
      // True if today falls in the same Sun–Sat range as selectedDay.
      const dayStart = new Date(d)
      dayStart.setDate(d.getDate() - d.getDay())
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayStart.getDate() + 6)
      const t = today.getTime()
      return t >= dayStart.getTime() && t <= dayEnd.getTime() + 24 * 60 * 60_000
    }
    if (view === 'year') return d.getFullYear() === today.getFullYear()
    // List view always shows upcoming events; "Today" is always relevant.
    return false
  } catch { return false }
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
  const [showRemindersPref, setShowRemindersPref] = useState(true)
  // Density dropdown state lifted to screen so the popover can be
  // absolutely positioned over the grid instead of pushing it down.
  const [showDensityMenu, setShowDensityMenu] = useState(false)
  // Measured position of the density icon trigger, so the dropdown
  // anchors right below it instead of at a fixed top:120 guess.
  const [densityAnchor, setDensityAnchor] = useState<{ top: number; right: number }>({ top: 96, right: 16 })
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

  // SCRUM-279 (2026-06-08): Ken asked for the calendar to stay
  // visible when the search bar opens with no query (was showing
  // a blank "Recent" list before). Recents-related state removed;
  // we just persist the query for future analytics use.
  useEffect(() => {
    if (!showSearch || searchQuery.trim().length < 2) return
    const id = setTimeout(() => {
      void addRecentSearch(searchQuery).catch(() => { /* non-fatal */ })
    }, 800)
    return () => clearTimeout(id)
  }, [searchQuery, showSearch])

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

  const { events, calendars, hiddenCalendarIds, isLoading, isRefreshing, refresh, notificationDisabledCalendarIds } =
    useCalendar({ appEvents, includeReminders: showRemindersPref })
  const filteredEvents = useMemo(() => applySearch(events, searchQuery), [events, searchQuery])

  // SCRUM-279 (build 45): expose reminder permission state so we can
  // surface a "Reminders denied — open Settings" banner. iOS only
  // prompts once; if the user denied that one chance, we must
  // explicitly help them recover via Settings.
  const [reminderPermDenied, setReminderPermDenied] = useState(false)
  useEffect(() => {
    void (async () => {
      const r = await getReminderPermissionStatus()
      setReminderPermDenied(r.prompted && !r.granted)
    })()
  }, [events.length])

  useEffect(() => {
    if (permissions.state.granted) void registerCalendarSync()
  }, [permissions.state.granted])

  // One-shot Reminders permission prompt for users who already granted
  // Calendar in a prior build (build 22 shipped without this prompt).
  // iOS only shows the dialog once; if reminders was never asked we ask
  // now, otherwise this no-ops.
  useEffect(() => {
    if (!permissions.state.granted) return
    void (async () => {
      const r = await getReminderPermissionStatus()
      if (!r.prompted) {
        try { await requestReminderPermission(); void refresh() } catch { /* non-fatal */ }
      }
    })()
    // refresh ref is stable from useCalendar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions.state.granted])

  useEffect(() => {
    if (permissions.state.granted && events.length > 0) {
      void reconcileEventNotifications(events, notificationDisabledCalendarIds)
    }
  }, [permissions.state.granted, events, notificationDisabledCalendarIds])

  const refreshPermissions = permissions.refresh
  useFocusEffect(useCallback(() => {
    void refreshPermissions()
    // Re-read the prefs every time the screen focuses (so toggling the
    // "Show Reminders" pref in Calendar Settings takes effect when the
    // user comes back here).
    void getCalendarPreferences().then((p) => setShowRemindersPref(p.showReminders))
    // SCRUM-279: re-fetch the calendar events.
    void refresh()
    // SCRUM-279 (2026-06-08): also push a fresh snapshot to cos-backend
    // on focus, in addition to the 30-min bg fetch. Ken's "iPad
    // doesn't show iPhone reminders" was caused by iOS not running
    // the bg task often enough — explicit foreground upload makes
    // cross-device parity work after one app open per device.
    void buildAndUploadSnapshot().catch(() => { /* non-fatal */ })
    // refresh is stable from useCalendar's useCallback wrap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshPermissions]))

  const eventsForSelectedDay = useMemo(
    () => filteredEvents.filter((e) => e.startDate.slice(0, 10) === selectedDay),
    [filteredEvents, selectedDay],
  )

  const handleDeleteEvent = useCallback(async (ev: CalendarEvent) => {
    Alert.alert(
      'Delete event?',
      `"${ev.title}" will be removed from your calendar. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            hapticImpact('medium')
            const ok = await deleteEvent(ev.id)
            if (ok) {
              hapticImpact('light')
              void refresh()
            } else {
              Alert.alert('Could not delete', 'Check your calendar permissions and try again.')
            }
          },
        },
      ],
    )
  }, [refresh])

  const dayGroups = useMemo(() => groupByDay(filteredEvents), [filteredEvents])

  const headerLabel = useMemo(() => {
    switch (activeView) {
      case 'year': return String(new Date(`${selectedDay}T00:00:00`).getFullYear())
      case 'month': return fmtMonthYear(selectedDay)
      case 'week': {
        // "Sep 7 – Sep 13, 2026" or "September 7–13, 2026" if same month
        const { startIso, endIso } = weekRangeForDay(selectedDay)
        const s = new Date(`${startIso}T00:00:00`)
        const e = new Date(`${endIso}T00:00:00`)
        const sameMonth = s.getMonth() === e.getMonth()
        if (sameMonth) return `${s.toLocaleString(undefined, { month: 'long' })} ${s.getDate()}–${e.getDate()}`
        return `${s.toLocaleString(undefined, { month: 'short' })} ${s.getDate()} – ${e.toLocaleString(undefined, { month: 'short' })} ${e.getDate()}`
      }
      case 'day': return fmtDayHeader(selectedDay)
      case 'list': return 'All Events'
    }
  }, [activeView, selectedDay])

  const headerSubtitle = useMemo(
    () => fmtDaySubtitle(selectedDay, activeView),
    [selectedDay, activeView],
  )

  const viewingToday = useMemo(
    () => isViewingToday(selectedDay, activeView),
    [selectedDay, activeView],
  )

  return (
    <AppWrapper showFooter showHamburgerIcon showBellIcon>
      <CalendarPermissionGate permissions={permissions}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <CalendarHeader
            activeView={activeView}
            onChangeView={setActiveView}
            label={headerLabel}
            subtitle={headerSubtitle}
            viewingToday={viewingToday}
            onJumpToday={() => setSelectedDay(todayIso())}
            onToggleSearch={() => setShowSearch((p) => !p)}
            onOpenSettings={() => router.push('/Home/calendar-settings' as never)}
            showSearch={showSearch}
            searchAnim={searchAnim}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClearSearch={() => { setSearchQuery(''); setShowSearch(false) }}
            density={monthDensity}
            onChangeDensity={setMonthDensity}
            showDensityToggle={activeView === 'month'}
            showDensityMenu={showDensityMenu}
            onToggleDensityMenu={(measured) => {
              if (measured) setDensityAnchor(measured)
              setShowDensityMenu((p) => !p)
            }}
          />
          {/* SCRUM-279 (build 45): diagnostic banner. Ken reported
              reminders + Zoom calls not appearing. Most common
              causes are (a) Reminders permission was denied at first
              prompt (iOS doesn't re-ask) — surface a tap-to-fix CTA;
              (b) the calendar was hidden via in-app toggles —
              surface count + open settings. */}
          {(reminderPermDenied || hiddenCalendarIds.size > 0) ? (
            <View style={{
              marginHorizontal: 16,
              marginTop: 8,
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#F59E0B55',
              backgroundColor: '#FFFBEB',
            }}>
              {reminderPermDenied ? (
                <Pressable
                  onPress={() => Linking.openSettings()}
                  accessibilityRole="button"
                  accessibilityLabel="Open Settings to grant Reminders access"
                >
                  <Text style={{ color: '#92400E', fontSize: getScaledFontSize(13), fontWeight: '600' }}>
                    Reminders aren’t showing
                  </Text>
                  <Text style={{ color: '#92400E', fontSize: getScaledFontSize(12), marginTop: 2 }}>
                    iOS Reminders access is denied. Tap to open Settings → CSH → Reminders.
                  </Text>
                </Pressable>
              ) : null}
              {hiddenCalendarIds.size > 0 ? (
                <Pressable
                  onPress={() => router.push('/Home/calendar-settings' as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${hiddenCalendarIds.size} calendars hidden — tap to manage`}
                  style={{ marginTop: reminderPermDenied ? 8 : 0 }}
                >
                  <Text style={{ color: '#92400E', fontSize: getScaledFontSize(13), fontWeight: '600' }}>
                    {hiddenCalendarIds.size} of {calendars.length} calendars hidden
                  </Text>
                  <Text style={{ color: '#92400E', fontSize: getScaledFontSize(12), marginTop: 2 }}>
                    Some events (Zoom, work) may be missing. Tap to manage visibility.
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : showSearch && searchQuery.trim().length > 0 ? (
            // F2: Flat search-results list — date-grouped, sticky day
            // headers, NOT scoped to the current view. Apple's behavior.
            (() => {
              const flat: Array<{ type: 'header'; day: string } | { type: 'event'; ev: CalendarEvent }> = []
              const stickyIndices: number[] = []
              for (const g of dayGroups) {
                stickyIndices.push(flat.length)
                flat.push({ type: 'header', day: g.day })
                for (const ev of g.items) flat.push({ type: 'event', ev })
              }
              return (
                <FlatList
                  data={flat}
                  keyExtractor={(it, i) => it.type === 'header' ? `h:${it.day}` : `e:${it.ev.id}:${i}`}
                  stickyHeaderIndices={stickyIndices}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    if (item.type === 'header') {
                      const isToday = item.day === todayIso()
                      return (
                        <View style={[styles.dayHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                          <Text style={[styles.dayHeaderText, { color: isToday ? '#FF3B30' : colors.subtext, fontSize: getScaledFontSize(12) }]}>
                            {(isToday ? 'TODAY · ' : '') + fmtDayHeader(item.day).toUpperCase()}
                          </Text>
                        </View>
                      )
                    }
                    return <EventListItem event={item.ev} onPress={() => openDetail(item.ev)} />
                  }}
                  ListEmptyComponent={
                    <View style={styles.emptyView}>
                      <IconSymbol name="magnifyingglass" size={getScaledFontSize(56)} color={colors.subtext} />
                      <Text style={[styles.emptyText, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
                        No events matching "{searchQuery}"
                      </Text>
                    </View>
                  }
                />
              )
            })()
          ) : activeView === 'year' ? (
            <CalendarYearView
              year={new Date(`${selectedDay}T00:00:00`).getFullYear()}
              events={filteredEvents}
              onJumpToMonth={(iso) => {
                hapticImpact('light')
                setSelectedDay(iso)
                setActiveView('month')
              }}
              onLongPressMonth={(iso) => {
                hapticImpact('medium')
                openEditor(iso)
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
                  onMonthChange={(iso) => setSelectedDay(iso)}
                  density={monthDensity}
                  onLongPressDate={(iso) => openEditor(iso)}
                  onJumpToDayView={(iso) => { setSelectedDay(iso); setActiveView('day') }}
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
            <CalendarWeekTimeline
              key={selectedDay}
              dateIso={selectedDay}
              events={filteredEvents}
              onPressEvent={openDetail}
              onLongPressEmptyHour={(dayIso, h) => openEditor(dayIso, h)}
              onPressPrevWeek={() => setSelectedDay(addWeeks(selectedDay, -1))}
              onPressNextWeek={() => setSelectedDay(addWeeks(selectedDay, 1))}
              onSelectDate={(iso) => { setSelectedDay(iso); setActiveView('day') }}
            />
          ) : activeView === 'day' ? (
            <CalendarDayTimeline
              key={selectedDay} // re-mount on day change so auto-scroll re-runs
              dateIso={selectedDay}
              events={eventsForSelectedDay}
              onPressEvent={openDetail}
              onLongPressEmptyHour={(h) => openEditor(selectedDay, h)}
              onPressPrevDay={() => setSelectedDay(addDays(selectedDay, -1))}
              onPressNextDay={() => setSelectedDay(addDays(selectedDay, 1))}
              onSelectDate={setSelectedDay}
            />
          ) : (
            // ── List view ─────────────────────────────────────────────
            // E1: sticky day headers via stickyHeaderIndices over a
            // flattened (header + items) array so each header pins as
            // you scroll past it (Apple behavior).
            // E2: TODAY's section header is rendered in red.
            // E3: empty state uses a large gray icon.
            // E5: writable device events expose swipe-left → Delete.
            (() => {
              const flat: Array<{ type: 'header'; day: string } | { type: 'event'; ev: CalendarEvent }> = []
              const stickyIndices: number[] = []
              const today = todayIso()
              for (const g of dayGroups) {
                stickyIndices.push(flat.length)
                flat.push({ type: 'header', day: g.day })
                for (const ev of g.items) flat.push({ type: 'event', ev })
              }
              const isWritableDevice = (e: CalendarEvent) =>
                e.origin === 'device' && (e.source.allowsWrite ?? false)
              return (
                <FlatList
                  data={flat}
                  keyExtractor={(it, i) => it.type === 'header' ? `h:${it.day}` : `e:${it.ev.id}:${i}`}
                  stickyHeaderIndices={stickyIndices}
                  renderItem={({ item }) => {
                    if (item.type === 'header') {
                      const isToday = item.day === today
                      return (
                        <View style={[
                          styles.dayHeader,
                          {
                            backgroundColor: colors.background,
                            borderBottomColor: colors.border,
                          },
                        ]}>
                          <Text style={[
                            styles.dayHeaderText,
                            {
                              color: isToday ? '#FF3B30' : colors.subtext,
                              fontSize: getScaledFontSize(12),
                            },
                          ]}>
                            {(isToday ? 'TODAY · ' : '') + fmtDayHeader(item.day).toUpperCase()}
                          </Text>
                        </View>
                      )
                    }
                    const ev = item.ev
                    return (
                      <EventListItem
                        event={ev}
                        onPress={() => openDetail(ev)}
                        onDelete={isWritableDevice(ev) ? () => handleDeleteEvent(ev) : undefined}
                      />
                    )
                  }}
                  ListEmptyComponent={
                    <View style={styles.emptyView}>
                      <IconSymbol name="calendar" size={getScaledFontSize(56)} color={colors.subtext} />
                      <Text style={[styles.emptyText, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
                        {searchQuery ? `No events matching "${searchQuery}"` : 'No upcoming events'}
                      </Text>
                    </View>
                  }
                  refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.tint} />}
                />
              )
            })()
          )}

          <Pressable
            onPress={() => openEditor(selectedDay)}
            style={({ pressed }) => [styles.fab, { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Create new calendar event"
          >
            <Text style={styles.fabPlus}>+</Text>
          </Pressable>

          {/* Density dropdown — FLOATING overlay over content (was
              previously inline in the header which pushed the grid
              down). Backdrop fills the whole screen so tap-outside
              dismisses; the menu itself is anchored under the trigger
              icon at the top-right. */}
          {/* SCRUM-279 (2026-06-08 build 35): Modal in build 34 still
              wasn't visible on iPhone. presentationStyle="overFullScreen"
              + statusBarTranslucent ensures the modal renders ABOVE
              the entire app chrome including the status bar / nav.
              animationType="none" so the menu appears instantly when
              the user taps the trigger (matches Apple Calendar). */}
          <Modal
            visible={showDensityMenu && activeView === 'month'}
            transparent
            animationType="none"
            presentationStyle="overFullScreen"
            statusBarTranslucent
            onRequestClose={() => setShowDensityMenu(false)}
          >
            <Pressable
              onPress={() => setShowDensityMenu(false)}
              style={StyleSheet.absoluteFillObject as never}
              accessibilityLabel="Dismiss density menu"
            />
            <View
              style={[
                styles.densityMenuFloater,
                { top: densityAnchor.top, right: densityAnchor.right },
              ]}
              pointerEvents="box-none"
            >
              <DensityMenu
                density={monthDensity}
                onChange={setMonthDensity}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                onClose={() => setShowDensityMenu(false)}
              />
            </View>
          </Modal>
        </View>
      </CalendarPermissionGate>
    </AppWrapper>
  )
}

/**
 * Apple Calendar's Month-density dropdown. Apple opens it via a chevron
 * next to the search icon — we mirror that placement. The menu is an
 * absolutely-positioned popover anchored to the trigger button.
 */
function DensityMenu({
  density, onChange, colors, getScaledFontSize, onClose,
}: {
  density: MonthDensityMode
  onChange: (m: MonthDensityMode) => void
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  onClose: () => void
}) {
  const modes: { id: MonthDensityMode; label: string; sublabel: string }[] = [
    { id: 'compact', label: 'Compact', sublabel: 'Day numbers only' },
    { id: 'stacked', label: 'Stacked', sublabel: 'Color bars by event' },
    { id: 'details', label: 'Details', sublabel: 'Event titles' },
  ]
  return (
    <View style={[styles.densityMenu, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      {modes.map((m, i) => {
        const active = m.id === density
        return (
          <Pressable
            key={m.id}
            onPress={() => { onChange(m.id); onClose() }}
            style={({ pressed }) => [
              styles.densityMenuRow,
              i < modes.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
              { opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="menuitem"
            accessibilityLabel={`Switch to ${m.label} density`}
            accessibilityState={{ selected: active }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: active ? '700' : '500' }}>
                {m.label}
              </Text>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 1 }}>
                {m.sublabel}
              </Text>
            </View>
            {active && (
              <Text style={{ color: colors.tint, fontSize: getScaledFontSize(16), fontWeight: '700' }}>✓</Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

function openDetail(event: CalendarEvent) {
  // Route by origin + appKind. After v8 the app-origin event pool grew
  // beyond just appointments — it now includes server-stored events
  // (CM-created appointments) and health-plan tasks. Routing every
  // `app:` event to /Home/appointment-detail caused "appointment not
  // found" for server + health-plan events whose IDs aren't in the
  // appointments table.
  if (event.origin === 'app') {
    if (event.appKind === 'appointment' || event.appKind === 'past-visit') {
      // SCRUM-279 (2026-06-10 build 40): virtualEventFromAppEntity
      // produces ids shaped `app:<kind>:<uuid>` (two colons), not
      // `app:<uuid>`. Build 39 stripped only "app:" — leaving
      // "appointment:<uuid>" — which the backend 404'd on, giving
      // Ken's "Could not load appointment". Strip the full prefix.
      const prefix = `app:${event.appKind}:`
      const apptId = event.id.startsWith(prefix)
        ? event.id.slice(prefix.length)
        : event.id.startsWith('app:')
          ? event.id.slice(4)
          : event.id
      router.push({ pathname: '/Home/appointment-detail', params: { id: apptId } } as never)
      return
    }
    // appKind === 'task' (health plan) OR no appKind (server event):
    // use the unified detail popover which will fetch from backend.
    // event.id is "app:<serverId>" or "app:healthplan:<taskId>:<date>".
    router.push({ pathname: '/calendar-event-detail', params: { eventId: event.id } } as never)
    return
  }
  // origin = device | reminder
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
  subtitle: string
  viewingToday: boolean
  onJumpToday: () => void
  onToggleSearch: () => void
  onOpenSettings: () => void
  showSearch: boolean
  searchAnim: Animated.Value
  searchQuery: string
  onSearchChange: (q: string) => void
  onClearSearch: () => void
  density: MonthDensityMode
  onChangeDensity: (m: MonthDensityMode) => void
  showDensityToggle: boolean
  showDensityMenu: boolean
  /** Called when the user taps the density icon. Receives the icon's
   *  measured screen position so the parent can anchor the dropdown. */
  onToggleDensityMenu: (anchor?: { top: number; right: number }) => void
}

function CalendarHeader({
  activeView, onChangeView, label, subtitle, viewingToday,
  onJumpToday, onToggleSearch, onOpenSettings,
  showSearch, searchAnim, searchQuery, onSearchChange, onClearSearch,
  density, onChangeDensity, showDensityToggle,
  showDensityMenu, onToggleDensityMenu,
}: HeaderProps) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const densityTriggerRef = useRef<View>(null)
  // intentionally read these to silence unused-arg lints when the
  // dropdown is rendered by the parent — the props are still needed
  // for the trigger button's accessibility state.
  void density; void onChangeDensity
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
        <View style={styles.headerTitleCol}>
          <Text
            // Title size 22pt (was 28pt) — Ken reported the title was
            // still too big and the action icons looked tiny next to
            // it. adjustsFontSizeToFit auto-scales down for very long
            // labels (e.g. "Saturday, September 13"). Icons paired at
            // 22pt for visual balance.
            style={[styles.headerLabel, { color: colors.text, fontSize: getScaledFontSize(22) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {label}
          </Text>
          {subtitle.length > 0 && (
            <Text
              style={[styles.headerSubtitle, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => { hapticSelection(); onToggleSearch() }}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Toggle search"
            accessibilityState={{ selected: showSearch }}
          >
            <IconSymbol name="magnifyingglass" size={getScaledFontSize(22)} color={colors.tint} />
          </Pressable>
          {showDensityToggle && (
            <Pressable
              ref={densityTriggerRef}
              onPress={() => {
                hapticSelection()
                // SCRUM-279 (2026-06-08 build 36): the prior `??`
                // pattern had a side effect — measureInWindow returns
                // undefined, so `undefined ?? onToggleDensityMenu()`
                // ALWAYS fired the fallback toggle, then the async
                // measure callback toggled AGAIN. Menu opened and
                // immediately closed. Now: synchronous ref check,
                // toggle exactly once.
                const ref = densityTriggerRef.current
                if (ref) {
                  ref.measureInWindow((x, y, width, height) => {
                    const screenW = Dimensions.get('window').width
                    const right = Math.max(8, screenW - (x + width))
                    const top = y + height + 6
                    onToggleDensityMenu({ top, right })
                  })
                } else {
                  onToggleDensityMenu()
                }
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Month view density"
              accessibilityState={{ expanded: showDensityMenu }}
            >
              <IconSymbol name="square.grid.2x2" size={getScaledFontSize(22)} color={colors.tint} />
            </Pressable>
          )}
          {/* "Today" only renders when you're NOT already on today —
              Apple hides it as a small visual cue you're in the current
              context. Saves header space too. */}
          {!viewingToday && (
            <Pressable
              onPress={() => { hapticSelection(); onJumpToday() }}
              hitSlop={6}
              style={({ pressed }) => [styles.todayBtn, { borderColor: colors.tint, opacity: pressed ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
            >
              <Text style={[styles.todayText, { color: colors.tint, fontSize: getScaledFontSize(13) }]}>Today</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => { hapticSelection(); onOpenSettings() }}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Calendar settings"
          >
            <IconSymbol name="gear" size={getScaledFontSize(22)} color={colors.tint} />
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Title column: flex-shrink so the icons row keeps its space.
  // Ken's iPad testing surfaced the title at 34pt eating the action
  // icons. Bumped down to 28pt with adjustsFontSizeToFit so long
  // labels auto-scale rather than truncating; icons always render.
  headerTitleCol: { flex: 1, flexShrink: 1, minWidth: 0 },
  headerLabel: { fontWeight: '700', letterSpacing: -0.5 },
  headerSubtitle: { fontWeight: '400', marginTop: 1 },
  // Action row: never shrinks; aligned center; consistent inter-icon
  // spacing so the row reads as a single group.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', minWidth: 36, minHeight: 36 },
  todayBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
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
  emptyView: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { textAlign: 'center', paddingHorizontal: 32 },
  dayHeader: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dayHeaderText: { fontWeight: '700', letterSpacing: 0.5 },
  // FAB sits just above the bottom nav. Dropped from 70 → 24 per Ken's
  // 4th request — the FAB now hugs the bottom of the calendar content
  // area, with the tab bar sitting just below in the OS chrome.
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  fabPlus: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 32 },
  // Density dropdown — anchored under the header trigger icon.
  densityMenu: {
    marginTop: 4,
    minWidth: 200,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  densityMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  // Absolute-positioned floating container — sits over the grid so the
  // dropdown doesn't push content down. Anchored top-right just below
  // the header (header is ~120pt tall including the title row + view
  // switcher; that's our top offset).
  densityMenuFloater: {
    position: 'absolute',
    top: 120,
    right: 16,
    zIndex: 100,
    elevation: 12,
  },
})
