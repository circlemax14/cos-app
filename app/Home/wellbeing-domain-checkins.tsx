/**
 * app/Home/wellbeing-domain-checkins.tsx — CHUNK 67 (2026-07-23)
 *
 * Domain-scoped check-in picker that resolves Ken's 2026-07-23 dogfood
 * complaint on chunk 66: he tapped the empty pill CTA, was auto-routed
 * to a single instrument, completed it, was dumped on the catalog with
 * only a "Build my plan" button, and eventually had to force-close the
 * app to see the updated data. Verbatim ask:
 *   "ideally i should see a list of available check-ins for that pill
 *    which has 0 completed... i can select any to move ahead... once 1
 *    check-in is completed then i will be shown list of available
 *    check-ins again and so on... after all check-ins are done then we
 *    will initiate a process which will update plan."
 *
 * This screen owns that flow: shows all DOMAIN_MEMBERS[domain] rows
 * with their "Not taken" / "Take now" / "Completed 2d ago · Retake" /
 * "Coming soon" status. Tapping a row deep-links to the stepper with
 * `returnTo=domain-checkins-<domain>` so all four stepper exit paths
 * bounce the user BACK HERE instead of to the catalog. When every
 * member is fresh-completed, the bottom "Refresh my plan" primary
 * button fires useRegenerateBiopsychosocialPlan().mutate() and
 * router.replaces the user onto the BPS surface, where the pill
 * renders "Processing…" during the regen window (see chunk 67 patch
 * to BpsWellbeingScoreCard).
 *
 * iOS 26.5 safe primitives: View, ScrollView, Pressable, Text,
 * MaterialIcons, AppWrapper (which wraps a react-native-safe-area-context
 * SafeAreaView). No Modal, no Animated, no LayoutAnimation, no
 * ActivityIndicator — matches BpsWellbeingScoreCard's discipline on
 * iPhone 14 iOS 26.5 build 62.
 *
 * Route registered as `href: null` in app/Home/_layout.tsx per chunk 67
 * constraints. Reachable only via CTA deep-link.
 */
import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchAssessments,
  type AssessmentRecord,
} from '@/services/api/assessments'
import { fetchInstruments, type InstrumentSummary } from '@/services/api/instruments'
import {
  DOMAIN_MEMBERS,
  type BpsDomain,
} from '@/lib/wellbeing-score'
import { useRegenerateBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan'

type RowStatus = 'not-taken' | 'coming-soon' | 'retake' | 'completed'

interface CheckinRow {
  id: string
  name: string
  status: RowStatus
  pillLabel: string
  tappable: boolean
}

const DOMAIN_TITLE: Record<BpsDomain, string> = {
  bio: 'Physical health',
  mind: 'Mental health',
  social: 'Social & faith',
}

const VALID_DOMAINS: readonly BpsDomain[] = ['bio', 'mind', 'social']

function isValidDomain(d: string | undefined): d is BpsDomain {
  return !!d && (VALID_DOMAINS as readonly string[]).includes(d)
}

function formatAgoLabel(completedMs: number): string {
  if (!Number.isFinite(completedMs)) return ''
  const days = Math.floor((Date.now() - completedMs) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

export default function WellbeingDomainCheckinsScreen(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const params = useLocalSearchParams<{ domain?: string; source?: string }>()
  const rawDomain = typeof params.domain === 'string' ? params.domain : undefined

  // Guard invalid/missing domain BEFORE any list render so we never
  // paint an "undefined check-ins" title frame. Same silent-kick
  // pattern biopsychosocial-plan.tsx uses when the bio plan record is
  // missing (see file header there). Effect + return null AT the end
  // of the render — hooks below still run every render so the
  // rules-of-hooks invariant holds even during the redirect frame.
  const domainValid = isValidDomain(rawDomain)
  React.useEffect(() => {
    if (!domainValid) {
      router.replace('/Home/biopsychosocial-plan' as never)
    }
  }, [domainValid])

  // Resolve to a safe placeholder for the derivation path when domain
  // is invalid — we return null before rendering, so this value is
  // never observable to the user. The picked default is deterministic
  // so hooks below have stable inputs and don't churn.
  const domain: BpsDomain = domainValid ? (rawDomain as BpsDomain) : 'bio'

  // Reuse the SAME cache keys the wellbeing card + stepper use so React
  // Query dedupes to one round-trip per (endpoint, session). The
  // stepper's onSuccess (patched by chunk 67 to also invalidate
  // ['assessments-trends']) refreshes both keys, so returning to this
  // screen post-submit shows the freshly-completed row without a
  // hot reload.
  const instrumentsQuery = useQuery({
    queryKey: ['instruments'],
    queryFn: fetchInstruments,
    staleTime: 5 * 60 * 1000,
  })
  const summaryQuery = useQuery({
    queryKey: ['assessments-trends'],
    queryFn: fetchAssessments,
    staleTime: 60 * 1000,
  })

  const regen = useRegenerateBiopsychosocialPlan()

  const { rows, allDone } = React.useMemo(() => {
    const members = DOMAIN_MEMBERS[domain]
    const byInstrumentId = new Map<string, InstrumentSummary>()
    for (const inst of instrumentsQuery.data ?? []) {
      if (inst?.instrumentId) byInstrumentId.set(String(inst.instrumentId), inst)
    }
    const byRecordId = new Map<string, AssessmentRecord>()
    for (const rec of summaryQuery.data ?? []) {
      if (rec?.instrumentId && rec.completedAt) {
        byRecordId.set(String(rec.instrumentId), rec)
      }
    }

    const now = Date.now()
    const built: CheckinRow[] = []
    let everyMemberFresh = true
    let anyMember = false

    for (const id of members) {
      const idStr = String(id)
      const inst = byInstrumentId.get(idStr)
      if (!inst) {
        // Catalog-missing member — skip the row (no crash, no unknown
        // pill). Also don't gate the "all done" state on it since the
        // user can't reasonably complete something they can't see.
        continue
      }
      anyMember = true
      const rec = byRecordId.get(idStr)
      const completedMs = rec ? Date.parse(rec.completedAt) : NaN
      const expMs = rec ? Date.parse(rec.expiresAt ?? '') : NaN
      const expired = Number.isFinite(expMs) && expMs <= now
      const ago = Number.isFinite(completedMs) ? formatAgoLabel(completedMs) : ''

      let status: RowStatus
      let pillLabel: string
      if (inst.comingSoon) {
        status = 'coming-soon'
        pillLabel = 'Coming soon'
      } else if (!rec) {
        status = 'not-taken'
        pillLabel = 'Take now'
      } else if (expired) {
        status = 'retake'
        pillLabel = ago ? `Completed ${ago} · Retake` : 'Retake'
      } else {
        status = 'completed'
        pillLabel = ago ? `Completed ${ago}` : 'Completed'
      }

      // "All fresh" excludes coming-soon (uncompletable) — treat those
      // as neutral. For any non-coming-soon member, we need a
      // non-expired record for the domain to count as fully done.
      if (status !== 'completed' && status !== 'coming-soon') {
        everyMemberFresh = false
      }

      built.push({
        id: idStr,
        name: inst.name,
        status,
        pillLabel,
        tappable: status !== 'coming-soon',
      })
    }

    return {
      rows: built,
      allDone: anyMember && everyMemberFresh,
    }
  }, [domain, instrumentsQuery.data, summaryQuery.data])

  const isLoading =
    (instrumentsQuery.isLoading && !instrumentsQuery.data) ||
    (summaryQuery.isLoading && !summaryQuery.data)
  const isError = !isLoading && (instrumentsQuery.error || summaryQuery.error)

  const bg = colors.background
  const text = colors.text
  const subtext = colors.subtext
  const border = colors.border
  const tint = colors.tint as string

  const onPressRow = (row: CheckinRow) => {
    if (!row.tappable) return
    router.push({
      pathname: '/Home/assessment-stepper',
      params: { instrumentId: row.id, returnTo: `domain-checkins-${domain}` },
    } as never)
  }

  const onPressRefreshPlan = () => {
    // Fire-and-forget regen (chunk 40 pattern — do not await). Same-tick
    // router.replace is safe: no awaited response, no Modal is mounted
    // by this screen, so iOS 26.5 turbomodule queue is not stressed.
    regen.mutate()
    router.replace('/Home/biopsychosocial-plan' as never)
  }

  // Deferred early-return so all hooks above ran (rules-of-hooks). The
  // useEffect above kicks off the redirect on the same render.
  if (!domainValid) return null

  return (
    <AppWrapper>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={text} />
        </Pressable>
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(16),
            fontWeight: getScaledFontWeight(700) as any,
            marginLeft: 12,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {DOMAIN_TITLE[domain]} check-ins
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      >
        <Text
          style={{
            color: subtext,
            fontSize: getScaledFontSize(13),
            marginBottom: 12,
            lineHeight: getScaledFontSize(18),
          }}
        >
          {allDone
            ? 'You have completed every check-in in this area. Refresh your plan to see the updates.'
            : 'Pick a check-in to complete. Your plan updates once you have finished this area.'}
        </Text>

        {/* Loading / error / list share a min-height sentinel so the
            initial paint doesn't jump when rows arrive. */}
        <View style={{ minHeight: 220 }}>
          {isLoading ? (
            <View style={styles.loadingBlock} />
          ) : isError ? (
            <Text
              style={{
                color: '#DC2626',
                fontSize: getScaledFontSize(13),
                textAlign: 'center',
                marginTop: 24,
              }}
            >
              We couldn&apos;t load check-ins. Please try again.
            </Text>
          ) : rows.length === 0 ? (
            <Text
              style={{
                color: subtext,
                fontSize: getScaledFontSize(13),
                textAlign: 'center',
                marginTop: 24,
              }}
            >
              No check-ins are available for this area yet.
            </Text>
          ) : (
            rows.map((row) => {
              const pillStyle = PILL_STYLE_FOR_STATUS[row.status]
              return (
                <Pressable
                  key={row.id}
                  onPress={() => onPressRow(row)}
                  disabled={!row.tappable}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.name}, ${row.pillLabel}`}
                  accessibilityHint={row.tappable ? 'Opens this check-in' : undefined}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: (colors.card as string) + 'D9',
                      borderColor: border,
                      opacity: !row.tappable ? 0.6 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: text,
                        fontSize: getScaledFontSize(15),
                        fontWeight: getScaledFontWeight(600) as any,
                        marginBottom: 6,
                      }}
                      numberOfLines={2}
                    >
                      {row.name}
                    </Text>
                    <View
                      style={[
                        styles.pill,
                        {
                          backgroundColor: pillStyle.bg,
                          borderColor: pillStyle.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: pillStyle.fg,
                          fontSize: getScaledFontSize(11),
                          fontWeight: getScaledFontWeight(700) as any,
                          letterSpacing: 0.3,
                        }}
                      >
                        {row.pillLabel}
                      </Text>
                    </View>
                  </View>
                  {row.tappable ? (
                    <MaterialIcons
                      name="chevron-right"
                      size={getScaledFontSize(22)}
                      color={subtext}
                      style={{ marginLeft: 8 }}
                    />
                  ) : null}
                </Pressable>
              )
            })
          )}
        </View>
      </ScrollView>

      {/* "Refresh my plan" footer only mounts when every non-coming-soon
          member is fresh-completed. Conditional-null so it doesn't eat
          layout on the take-a-check-in state. */}
      {allDone ? (
        <View style={[styles.footer, { borderTopColor: border, backgroundColor: bg }]}>
          <Pressable
            onPress={onPressRefreshPlan}
            disabled={regen.isPending}
            accessibilityRole="button"
            accessibilityLabel={regen.isPending ? 'Refreshing your plan' : 'Refresh my plan'}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: tint,
                opacity: regen.isPending ? 0.6 : pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: '#ffffff',
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(700) as any,
              }}
            >
              {regen.isPending ? 'Refreshing…' : 'Refresh my plan'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </AppWrapper>
  )
}

const PILL_STYLE_FOR_STATUS: Record<
  RowStatus,
  { bg: string; border: string; fg: string }
> = {
  'not-taken': { bg: '#0D948814', border: '#0D9488', fg: '#0D9488' },
  'retake': { bg: '#F59E0B14', border: '#F59E0B', fg: '#B45309' },
  'completed': { bg: '#10B98114', border: '#10B981', fg: '#047857' },
  'coming-soon': { bg: '#6B728014', border: '#9CA3AF', fg: '#6B7280' },
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  loadingBlock: {
    // Deliberately empty visual — matches wellbeing card's discipline
    // (no spinner). Occupies the min-height sentinel above.
    minHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    minHeight: 64,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
})
