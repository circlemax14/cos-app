/**
 * The patient's upcoming visits from their agency's staff. SCRUM-688.
 *
 * The sibling of AgencyTeamSection and the half its header said was missing:
 * that one answers WHO is on your care team, this one answers WHEN one of them
 * is coming to see you.
 *
 * Sits directly below the team list on agency-detail, because the two answer
 * halves of one question and reading them together is the point. It renders
 * nothing at all unless there is a visit to show, so a patient with an empty
 * calendar sees the screen exactly as it is today.
 *
 * ─── iOS 26.5 PRIMITIVE ENVELOPE (ADR-0003) ──────────────────────────
 *
 *   Allowed:    View / Text / MaterialIcons / StyleSheet
 *   Prohibited: Animated, LayoutAnimation, ActivityIndicator, Portal, Modal,
 *               gradient, blur, SVG, rotate transforms
 *
 * Non-negotiable on this surface. The root cause was never one bad component —
 * it was RENDER-PRIMITIVE DENSITY tripping the TurboModule bridge, so this card
 * also keeps its per-row primitive count low and caps the list rather than
 * rendering an unbounded number of rows.
 *
 * Note the host, app/agency-detail.tsx, is NOT itself envelope-compliant — it
 * uses react-native-paper and a Modal. That is not licence to relax here: the
 * host's Modal mounts on user action, while this card mounts during the screen's
 * cold render, which is the moment the envelope exists to protect.
 *
 * ─── WHY IT IS SILENT ON FAILURE ─────────────────────────────────────
 *
 * No spinner, no error banner, no empty state — matching AgencyTeamSection
 * exactly. An error banner over somebody's care schedule reads far more
 * alarming than a transient 500 deserves, and a patient who has no visits
 * booked is not experiencing a problem that needs explaining to them.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useQuery } from '@tanstack/react-query'

import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { apiClient } from '@/lib/api-client'
import { useAgencyVisitsFlag } from '@/hooks/use-agency-visits-flag'
import {
  formatVisitDay,
  formatVisitTime,
  spansMidnight,
  visitAccessibilityLabel,
} from '@/lib/visit-format'

/** Mirrors AgencyVisit in cos-backend/src/services/agency-visits.service.ts. */
export interface AgencyVisit {
  memberId: string
  name: string
  role: string
  startAt: string
  endAt: string
  notes?: string
}

/**
 * Rows rendered at most.
 *
 * Four, for a render-density reason rather than a product one: this card mounts
 * during agency-detail's cold render, and an unbounded list on a patient with
 * daily visits would put a large synchronous primitive count on exactly the
 * surface ADR-0003 is about. Four covers the next few days, which is the
 * question this panel answers.
 */
const MAX_ROWS = 4

async function fetchAgencyVisits(agencyId: string): Promise<AgencyVisit[]> {
  const res = await apiClient.get(`/v1/agencies/${encodeURIComponent(agencyId)}/visits`)
  const visits = res?.data?.data?.visits
  return Array.isArray(visits) ? (visits as AgencyVisit[]) : []
}

export function AgencyVisitsSection({ agencyId }: { agencyId: string }): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const fs = getScaledFontSize
  const fw = getScaledFontWeight
  const enabled = useAgencyVisitsFlag()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['agency-visits', agencyId],
    queryFn: () => fetchAgencyVisits(agencyId),
    // Two gates. The flag stops the request being made at all while dark; the
    // route would 404 anyway, but a request we know will fail is still a
    // request on a cold screen.
    enabled: !!agencyId && enabled,
    // Shorter than the team's 5 minutes: a roster changes rarely, a schedule
    // changes the moment somebody reschedules. Two minutes keeps a cancelled
    // visit from lingering on screen for most of a session.
    staleTime: 2 * 60 * 1000,
    // 403 (not assigned) and 404 (feature off) are both settled answers.
    retry: false,
  })

  if (!enabled) return null
  if (isLoading) return null
  if (isError) return null

  const visits = (data ?? []).slice(0, MAX_ROWS)
  if (visits.length === 0) return null

  // One clock reading for the whole render, so two rows can never disagree
  // about what "Today" means because midnight fell between them.
  const nowIso = new Date().toISOString()

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <MaterialIcons name="event" size={fs(18)} color={colors.tint as string} />
        <Text
          accessibilityRole="header"
          style={[styles.header, { color: colors.text, fontSize: fs(15), fontWeight: fw(700) as never }]}
        >
          Upcoming visits
        </Text>
      </View>

      <Text style={[styles.subtitle, { color: colors.subtext, fontSize: fs(12) }]}>
        {visits.length === 1 ? '1 visit scheduled' : `${visits.length} visits scheduled`}
      </Text>

      <View style={styles.list}>
        {visits.map((v) => {
          const day = formatVisitDay(v.startAt, nowIso)
          const time = formatVisitTime(v.startAt, v.endAt)
          // An overnight visit shown as "11:00 PM – 1:00 AM" under one day
          // heading reads as ending before it began.
          const endDay = spansMidnight(v.startAt, v.endAt)
            ? formatVisitDay(v.endAt, nowIso)
            : null

          return (
            <View
              key={`${v.memberId}-${v.startAt}`}
              style={styles.row}
              accessible
              accessibilityLabel={visitAccessibilityLabel(v.name, v.role, v.startAt, v.endAt, nowIso)}
            >
              {/* Inner nodes hidden from the reader so it announces the one
                  composed label above rather than five disconnected fragments. */}
              <View
                style={[styles.dayChip, { backgroundColor: `${colors.tint as string}1F` }]}
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={[styles.dayText, { color: colors.tint as string, fontSize: fs(11), fontWeight: fw(700) as never }]}>
                  {day}
                </Text>
              </View>

              <View style={styles.rowBody} importantForAccessibility="no-hide-descendants">
                <Text
                  numberOfLines={1}
                  style={[styles.name, { color: colors.text, fontSize: fs(14), fontWeight: fw(600) as never }]}
                >
                  {v.name}
                </Text>
                <Text numberOfLines={1} style={[styles.meta, { color: colors.subtext, fontSize: fs(12) }]}>
                  {v.role}
                </Text>
                <Text numberOfLines={1} style={[styles.time, { color: colors.text, fontSize: fs(13) }]}>
                  {endDay ? `${time} (ends ${endDay})` : time}
                </Text>
                {v.notes ? (
                  <Text numberOfLines={2} style={[styles.notes, { color: colors.subtext, fontSize: fs(12) }]}>
                    {v.notes}
                  </Text>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  header: {},
  subtitle: { marginTop: 2 },
  list: { marginTop: 10, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44 },
  dayChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, minWidth: 62, alignItems: 'center' },
  dayText: {},
  rowBody: { flex: 1 },
  name: {},
  meta: { marginTop: 1 },
  time: { marginTop: 2 },
  notes: { marginTop: 3, fontStyle: 'italic' },
})

export default AgencyVisitsSection
