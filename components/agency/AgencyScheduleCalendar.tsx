import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView'
import { formatVisitTime, spansMidnight } from '@/lib/visit-format'
import { fetchAgencyVisits, type AgencyVisit } from '@/components/agency/AgencyVisitsSection'
import { useAgencyVisitsFlag } from '@/hooks/use-agency-visits-flag'
import type { CalendarEvent } from '@/services/calendar'

/**
 * COS-999 — the Scheduling tab, as a calendar.
 *
 * Vishal: "I was expecting scheduling will have a calendar like we have a
 * calendar screen ... I just want a replica of that calendar screen. It should
 * not have ALL the features that we have in the calendar, but all the required
 * features should be there."
 *
 * So this is the month mode of app/Home/appointments.tsx, and only that mode:
 * the same CalendarMonthView grid, with the selected day's visits listed under
 * it. That is the shape of the screen he already knows.
 *
 * ─── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────
 *
 * The calendar screen has five view modes, a search bar, a density menu and a
 * create FAB. None of them survive contact with this data:
 *
 *   - Week and day timelines draw 24 hour-rows to show at most one visit, and
 *     the day timeline runs a 60-second interval on a screen that is usually
 *     open for seconds.
 *   - Year view is eleven month grids of almost nothing.
 *   - Search over a handful of rows finds what the eye already found.
 *   - Create/edit/delete would be buttons that must fail: a patient cannot
 *     author their own visits, only agency staff can.
 *   - The device-calendar merge and its OS permission prompt are irrelevant —
 *     these visits come from our API, and asking for calendar access here would
 *     be an unexplained prompt for data we do not use.
 *
 * ─── THE HONEST CAVEAT ──────────────────────────────────────────────
 *
 * The endpoint returns UPCOMING visits only. So the grid has nothing to draw in
 * the past, and for a patient with no visits booked the month is empty. That is
 * the truth about the data rather than a fault in the view, and the empty state
 * says so instead of leaving a blank grid to be read as broken.
 *
 * ─── COLD-MOUNT NOTE ────────────────────────────────────────────────
 *
 * CalendarMonthView wraps react-native-calendars, which ADR-0003's rendering
 * envelope would keep off a cold mount. It is safe here because this component
 * only mounts when the patient TAPS "Scheduling" — the screen opens on "Your
 * team" — so it is never part of agency-detail's first render.
 */

/** Grey placeholder source; the grid only reads `color` for its dots. */
const VISIT_SOURCE = {
  id: 'agency-visits',
  title: 'Agency visits',
  source: 'Circle Support Health',
  color: '#2E7D32',
} as unknown as CalendarEvent['source']

/** A visit as the month grid wants it. Pure, so it is trivially testable. */
export function visitToCalendarEvent(visit: AgencyVisit): CalendarEvent {
  return {
    id: `app:agency-visit:${visit.memberId}:${visit.startAt}`,
    title: visit.name,
    startDate: visit.startAt,
    endDate: visit.endAt,
    allDay: false,
    notes: visit.notes,
    calendarId: 'agency-visits',
    source: VISIT_SOURCE,
    origin: 'app',
    appKind: 'appointment',
    alarms: [],
  }
}

/** Local YYYY-MM-DD. Deliberately not toISOString(), which converts to UTC and
 *  would file an early-morning visit on the previous day for western zones. */
function dayKey(iso: string): string {
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function AgencyScheduleCalendar({ agencyId }: { agencyId: string }): React.JSX.Element | null {
  const { settings, getScaledFontSize: fs, getScaledFontWeight: fw } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const enabled = useAgencyVisitsFlag()
  const [selected, setSelected] = useState<string>(() => dayKey(new Date().toISOString()))

  const { data, isLoading, isError } = useQuery({
    queryKey: ['agency-visits', agencyId],
    queryFn: () => fetchAgencyVisits(agencyId),
    enabled: !!agencyId && enabled,
    staleTime: 2 * 60 * 1000,
    retry: false,
  })

  /*
   * No MAX_ROWS here. The four-row cap on AgencyVisitsSection is a cold-render
   * density decision for a card stacked under the team list; this is a tab the
   * patient chose to open, and truncating their schedule to four would be the
   * wrong answer to "show me my calendar". The server already bounds the list.
   */
  const visits = useMemo(() => data ?? [], [data])
  const events = useMemo(() => visits.map(visitToCalendarEvent), [visits])

  const forSelectedDay = useMemo(
    () => visits.filter((v) => dayKey(v.startAt) === selected),
    [visits, selected],
  )

  // Same rule as the rest of this feature: silent while the flag is off,
  // loading, or errored. "Nothing booked" is a claim, and after a failed
  // request we do not know it.
  if (!enabled || isLoading || isError) return null

  const muted = (colors.text as string) + '99'

  return (
    <View>
      <CalendarMonthView
        events={events}
        selectedDate={selected}
        onSelectDate={setSelected}
        density="compact"
      />

      <View style={styles.list}>
        {visits.length === 0 ? (
          <Text style={[styles.empty, { color: muted, fontSize: fs(14), lineHeight: fs(20) }]}>
            No visits are booked yet. When your care team schedules one it will appear here, and on
            the calendar above.
          </Text>
        ) : forSelectedDay.length === 0 ? (
          <Text style={[styles.empty, { color: muted, fontSize: fs(14), lineHeight: fs(20) }]}>
            Nothing booked on this day. Days with a visit are marked on the calendar.
          </Text>
        ) : (
          forSelectedDay.map((v) => (
            <View
              key={`${v.memberId}-${v.startAt}`}
              style={[styles.row, { borderColor: (colors.border as string) ?? 'rgba(128,128,128,0.3)' }]}
              accessibilityLabel={`${v.name}, ${v.role}, ${formatVisitTime(v.startAt, v.endAt)}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text as string, fontSize: fs(15), fontWeight: fw(600) as never }}>
                  {v.name}
                </Text>
                <Text style={{ color: muted, fontSize: fs(13), marginTop: 2 }}>{v.role}</Text>
                {v.notes ? (
                  <Text style={{ color: muted, fontSize: fs(13), marginTop: 4 }}>{v.notes}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.text as string, fontSize: fs(13) }}>
                  {formatVisitTime(v.startAt, v.endAt)}
                </Text>
                {/* A visit running past midnight reads as ending "before" it
                    starts unless it is said out loud. */}
                {spansMidnight(v.startAt, v.endAt) ? (
                  <Text style={{ color: muted, fontSize: fs(11), marginTop: 2 }}>next day</Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  list: { marginTop: 8 },
  empty: { textAlign: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
