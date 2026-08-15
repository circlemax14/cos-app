/**
 * The people at your agency.
 *
 * Ken/Vishal 2026-08-15: "when user clicks on agency then agency details will
 * open which will show assigned persons from agency and their schedule."
 *
 * This is the "assigned persons" half. The schedule half is not here and is not
 * hidden behind a spinner pretending to load — there is no staff-rota model in
 * any of the three repos, and its authoring surface is the dashboard (Ken,
 * 2026-06-19: "controlled by the proxy on the dashboard"). Shipping an empty
 * schedule panel would repeat today's most expensive lesson: a feature that
 * renders but has nothing behind it reads as broken, not as forthcoming.
 *
 * ONLY RENDERS WHEN ASSIGNED. The endpoint 403s for anyone not assigned to this
 * agency, so a browsing patient must never see this section at all — the parent
 * gates it on `requestStatus === 'approved'` rather than this component
 * swallowing a 403 and showing an empty list, which would look identical to "my
 * agency has no staff".
 *
 * Name and role only. The backend deliberately does not send staff emails or
 * platform ids; see agency-team.service.ts for why.
 *
 * iOS 26.5 envelope: View / Text / MaterialIcons / StyleSheet.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useQuery } from '@tanstack/react-query'

import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { apiClient } from '@/lib/api-client'

export interface AgencyTeamMember {
  memberId: string
  name: string
  role: string
}

async function fetchAgencyTeam(agencyId: string): Promise<AgencyTeamMember[]> {
  const res = await apiClient.get(`/v1/agencies/${encodeURIComponent(agencyId)}/team`)
  const team = res?.data?.data?.team
  return Array.isArray(team) ? (team as AgencyTeamMember[]) : []
}

/** Initials for the avatar bubble. Two letters at most, never a lone comma. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AgencyTeamSection({ agencyId }: { agencyId: string }): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const fs = getScaledFontSize
  const fw = getScaledFontWeight

  const { data, isLoading, isError } = useQuery({
    queryKey: ['agency-team', agencyId],
    queryFn: () => fetchAgencyTeam(agencyId),
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
    // A 403 here means "not assigned" and is not worth retrying.
    retry: false,
  })

  // Nothing to say yet. A skeleton for a list that is usually 2-5 rows costs
  // more layout churn than it saves.
  if (isLoading) return null

  // Silent on error, deliberately. The parent only mounts this once the patient
  // is assigned, so a failure here is a transient network problem — and an
  // error banner on somebody's care team reads far more alarming than it is.
  if (isError) return null

  const team = data ?? []
  if (team.length === 0) return null

  return (
    <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
      <View style={styles.headerRow}>
        <MaterialIcons name="groups" size={fs(18)} color={colors.tint as string} />
        <Text
          accessibilityRole="header"
          style={{ color: colors.text, fontSize: fs(15), fontWeight: fw(700) as never, marginLeft: 8 }}
        >
          Your care team
        </Text>
      </View>

      <Text style={{ color: colors.subtext, fontSize: fs(12), marginTop: 4 }}>
        {team.length === 1 ? '1 person' : `${team.length} people`} at this agency
      </Text>

      <View style={styles.list}>
        {team.map((m) => (
          <View
            key={m.memberId}
            style={styles.row}
            accessible
            accessibilityLabel={`${m.name}, ${m.role}`}
          >
            <View
              style={[styles.avatar, { backgroundColor: (colors.tint as string) + '1F' }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={{ color: colors.tint as string, fontSize: fs(13), fontWeight: fw(700) as never }}>
                {initials(m.name)}
              </Text>
            </View>
            <View style={styles.rowText}>
              <Text
                numberOfLines={1}
                style={{ color: colors.text, fontSize: fs(14), fontWeight: fw(600) as never }}
              >
                {m.name}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: fs(12), marginTop: 1 }}>
                {m.role}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  list: { marginTop: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
})
