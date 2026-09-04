/**
 * One self-assessment, in detail — SCRUM-675 (3 of 3) and a dead end closed.
 *
 * Tapping a self-assessment card on Health Trends previously did NOTHING:
 * SelfAssessmentTrends took an optional `onOpenInstrument`, and nothing ever
 * passed it. So the cards looked tappable, were tappable, and went nowhere.
 * This is where they go.
 *
 * WHAT IT SHOWS, in order of what a patient actually wants:
 *   1. the latest result, in words before numbers
 *   2. the SUBSCALE breakdown, when the instrument has one — the reason
 *      SCRUM-675 exists. "High on avoidance, low on planning" is actionable;
 *      one total across 28 items is not.
 *   3. previous results, oldest information last
 *
 * The subscale block renders only when the record carries subscales, which is
 * no instrument today — Brief-COPE is the first and is still `comingSoon`. So
 * this screen has to be worth opening WITHOUT it, and it is: before today a
 * patient had no way to see their own history at all.
 *
 * INCOMPLETE SUBSCALES ARE SHOWN AS INCOMPLETE, never as a number. A two-item
 * subscale answered once is a different quantity wearing the same label, and
 * putting it beside properly scored rows would invite exactly the comparison
 * it cannot support.
 *
 * iOS 26.5 envelope: View / Text / Pressable / ScrollView / MaterialIcons /
 * StyleSheet. No ActivityIndicator, no Animated.
 */

import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { AppWrapper } from '@/components/app-wrapper'
import { useCanRender } from '@/hooks/use-entitlement'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { getWarmerInstrumentLabel } from '@/lib/instrument-labels'
import { CrisisSupportCard } from '@/components/assessments/CrisisSupportCard'
import { isHeavySubject, shouldOfferSupportOnResult } from '@/lib/crisis-support'
import {
  fetchAssessmentHistory,
  type AssessmentRecord,
  type InstrumentId,
  type SubscaleScore,
} from '@/services/api/assessments'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AssessmentDetailScreen(): React.JSX.Element {
  const canView = useCanRender('assessment-detail.view')
  const params = useLocalSearchParams<{ instrumentId?: string }>()
  const instrumentId = String(params.instrumentId ?? '')
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const fs = getScaledFontSize
  const fw = getScaledFontWeight

  const label = getWarmerInstrumentLabel(instrumentId, instrumentId)

  const { data, isLoading } = useQuery({
    queryKey: ['assessment-history', instrumentId],
    queryFn: () => fetchAssessmentHistory(instrumentId as InstrumentId),
    enabled: instrumentId !== '',
    staleTime: 5 * 60 * 1000,
  })

  // Newest first. Do NOT trust the API's ordering — the trends carousel learned
  // that the hard way, where an oldest-first response reported an improving
  // patient as worsening.
  const records: AssessmentRecord[] = React.useMemo(
    () =>
      [...(data ?? [])]
        .filter((r) => !!r?.completedAt)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [data],
  )
  const latest = records[0]
  const subscales: SubscaleScore[] = latest?.subscales ?? []

  const heavySubject = isHeavySubject(instrumentId)
  const showSupport =
    !!latest &&
    (heavySubject ||
      shouldOfferSupportOnResult({
        instrumentId,
        responses: latest.responses,
        severity: latest.band?.severity,
        careAction: latest.band?.careAction,
      }))

  const sectionLabel = (t: string) => (
    <Text
      style={{
        color: colors.subtext,
        fontSize: fs(11),
        fontWeight: fw(700) as never,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginTop: 22,
        marginBottom: 8,
      }}
    >
      {t}
    </Text>
  )

  return (
    <AppWrapper>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            style={styles.back}
          >
            <MaterialIcons name="arrow-back" size={fs(24)} color={colors.text as string} />
          </Pressable>
          <Text
            numberOfLines={2}
            style={{ flex: 1, color: colors.text, fontSize: fs(22), fontWeight: fw(700) as never }}
          >
            {label}
          </Text>
        </View>

        {canView && (isLoading ? (
          <Text style={{ color: colors.subtext, fontSize: fs(13), marginTop: 20 }}>
            Loading your results…
          </Text>
        ) : records.length === 0 ? (
          <Text style={{ color: colors.subtext, fontSize: fs(13), marginTop: 20, lineHeight: 20 }}>
            You haven&apos;t completed this check-in yet. Once you do, your result and how it
            changes over time will appear here.
          </Text>
        ) : (
          <>
            {/* BEFORE the result, when the result is one that warrants it.
                Three independent triggers: the patient endorsed a risk item,
                the band came back high, or the band carries a careAction --
                the field that until today was written to every record and read
                by nothing. Also always shown for ACE and PCL-5, where a score
                of zero does not mean answering was easy. */}
            {showSupport ? (
              <CrisisSupportCard
                intro={
                  heavySubject
                    ? 'That covered some hard ground. If any of it stayed with you, someone is available.'
                    : 'Support is available right now, any time of day.'
                }
              />
            ) : null}

            {/* Words before numbers: the band is what the patient can act on. */}
            {sectionLabel('Your latest result')}
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: (colors.card as string) + 'D9' }]}>
              {latest?.band?.label ? (
                <Text style={{ color: colors.text, fontSize: fs(18), fontWeight: fw(700) as never }}>
                  {latest.band.label}
                </Text>
              ) : null}
              <Text style={{ color: colors.subtext, fontSize: fs(12), marginTop: 4 }}>
                {formatDate(latest?.completedAt)}
              </Text>
            </View>

            {subscales.length > 0 ? (
              <>
                {sectionLabel('Breakdown')}
                <View style={[styles.card, { borderColor: colors.border, backgroundColor: (colors.card as string) + 'D9' }]}>
                  {subscales.map((s, i) => (
                    <View
                      key={s.key}
                      style={[
                        styles.row,
                        i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border as string } : null,
                      ]}
                    >
                      <Text style={{ flex: 1, color: colors.text, fontSize: fs(14) }}>{s.label}</Text>
                      {s.complete ? (
                        <Text
                          style={{ color: colors.text, fontSize: fs(15), fontWeight: fw(700) as never }}
                          accessibilityLabel={`${s.label}: ${s.score}`}
                        >
                          {s.score}
                        </Text>
                      ) : (
                        /* Never a number. A two-item subscale answered once is a
                           different quantity wearing the same label. */
                        <Text
                          style={{ color: colors.subtext, fontSize: fs(12), fontStyle: 'italic' }}
                          accessibilityLabel={`${s.label}: ${s.answered} of ${s.total} answered`}
                        >
                          {`${s.answered} of ${s.total} answered`}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {records.length > 1 ? (
              <>
                {sectionLabel('Previous results')}
                <View style={[styles.card, { borderColor: colors.border, backgroundColor: (colors.card as string) + 'D9' }]}>
                  {records.slice(1).map((r, i) => (
                    <View
                      key={`${r.completedAt}-${i}`}
                      style={[
                        styles.row,
                        i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border as string } : null,
                      ]}
                    >
                      <Text style={{ flex: 1, color: colors.subtext, fontSize: fs(13) }}>
                        {formatDate(r.completedAt)}
                      </Text>
                      {r.band?.label ? (
                        <Text style={{ color: colors.text, fontSize: fs(13) }}>{r.band.label}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </AppWrapper>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  card: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
})
