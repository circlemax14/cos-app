/**
 * app/Home/wellbeing-domain-checkins.tsx — CHUNK 67 (2026-07-23) +
 * CHUNK 72 polish (2026-07-23) + CHUNK 76 polish (2026-07-23) +
 * CHUNK 108 polish (2026-07-23)
 *
 * CHUNK 108 layers row-level VoiceOver hygiene on the check-in picker
 * without any visual or behavioral change for sighted users:
 *   1. Each row Pressable now carries a pre-composed accessibilityLabel
 *      built once in the useMemo where `ago` is already computed:
 *        - "{Human name}. Take now. Tap to start."
 *        - "{Human name}. Completed N days ago. Tap to retake."
 *          (used for both fresh-completed and expired-retake rows —
 *           both are tappable and both re-open the stepper)
 *        - "{Human name}. Coming soon."
 *      The "N days ago" form is spoken (not the "2d ago" pill
 *      abbreviation, which VoiceOver reads as "two dee ago").
 *   2. The Pressable sets `accessible` explicitly to group descendants,
 *      and the two inner Text nodes (name + pill label) carry
 *      accessibilityElementsHidden=true + importantForAccessibility=
 *      "no-hide-descendants" so VoiceOver reads the parent label ONCE
 *      instead of name + pill as separate utterances.
 *   3. Coming-soon rows carry accessibilityState.disabled=true so
 *      VoiceOver appends "dimmed" and the user is told the row is not
 *      yet available. Behavior unchanged: onPress no-ops via the
 *      existing `!row.tappable` guard AND `disabled={!row.tappable}`
 *      on the Pressable.
 *   4. accessibilityHint dropped from the row — the composed label
 *      already carries the "Tap to start / Tap to retake" trailer, so
 *      the hint would double-announce.
 *
 * Protected regions preserved (do not touch):
 *   - Chunk 83 back-button accessibilityLabel at the header top.
 *   - Chunk 76 empty-state hourglass + accessible group + focus.
 *   - Chunk 72 "Refresh my plan" Pressable at the footer.
 *
 * CHUNK 76 layers two additive polish items on top of chunk 72:
 *   1. Empty-state friendliness — when the domain resolves to zero
 *      visible rows (extreme edge: every member coming-soon, or every
 *      member unknown to the instrument catalog), swap the flat
 *      "No check-ins are available for this area yet." line for a
 *      friendlier illustrated block: a subtle icon + a two-line
 *      "Nothing to take here yet, come back soon" message. Still
 *      lives inside the same min-height sentinel so the initial paint
 *      does not jump.
 *   2. VoiceOver focus-on-mount — after the picker screen mounts and
 *      lays out (deferred via requestAnimationFrame so RN has actually
 *      committed the header View), call
 *      AccessibilityInfo.setAccessibilityFocus(findNodeHandle(headerRef))
 *      so the rotor lands on the "<Domain> check-ins" title instead of
 *      wherever iOS decides. Guarded on isScreenReaderEnabled so we do
 *      not pay the RAF/native-bridge cost when nobody is using VO.
 *      try/catch around findNodeHandle + setAccessibilityFocus so this
 *      polish never crashes the screen (native handle can be null if
 *      the ref detaches mid-transition on iOS 26.5).
 *
 * CHUNK 72 layered three additive tweaks on the "Refresh my plan"
 * primary button already shipped in chunk 67 (retained verbatim below):
 * CHUNK 72 layers three additive tweaks on the "Refresh my plan"
 * primary button already shipped in chunk 67:
 *   1. disabled + opacity 0.6 + label change to "Refreshing…" while
 *      the regen mutation is in-flight (guards a double-tap racing
 *      the router.replace).
 *   2. VoiceOver announcement fired via
 *      AccessibilityInfo.announceForAccessibilityWithOptions with
 *      { queue: true } BEFORE regen.mutate() + router.replace so the
 *      utterance is queued while the button is still on-screen and
 *      does not preempt any in-flight announcement. Graceful fallback
 *      to announceForAccessibility on platforms without the queued
 *      variant; try/catch so this polish never crashes the CTA.
 *   3. accessibilityState.busy so screen readers describe the button
 *      as busy during the ~150ms between tap and router.replace
 *      instead of merely "dimmed".
 * No ActivityIndicator — matches the iOS 26.5 crash-class discipline
 * enforced elsewhere in the file.
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
import {
  AccessibilityInfo,
  findNodeHandle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
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

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

type RowStatus = 'not-taken' | 'coming-soon' | 'retake' | 'completed'

interface CheckinRow {
  id: string
  name: string
  status: RowStatus
  pillLabel: string
  tappable: boolean
  /**
   * Chunk 108: pre-composed VoiceOver label for the row Pressable.
   * Built once in the useMemo where `ago` is already computed so the
   * render path stays cheap and we never leak the pill's abbreviated
   * "2d ago" form to screen-reader users.
   */
  a11yLabel: string
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

/**
 * Chunk 108: VoiceOver-friendly form of the ago label. The visual pill
 * uses the compact "2d ago" form to fit the row layout, but a screen
 * reader announcing "two dee ago" is nonsense — expand to the spoken
 * form "N days ago" (with "today" and "1 day ago" specials).
 */
function formatAgoA11yLabel(completedMs: number): string {
  if (!Number.isFinite(completedMs)) return ''
  const days = Math.floor((Date.now() - completedMs) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
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

  // Chunk 76 polish: land VoiceOver rotor on the header title after the
  // screen has actually laid out, instead of wherever iOS decides
  // (usually the back chevron, which reads "Back" — not useful context
  // for the screen the user just navigated into). Deferred via RAF so
  // RN has committed the header View, wrapped in try/catch because
  // findNodeHandle can return null on a torn-down ref during a fast
  // back-swipe and setAccessibilityFocus is a no-op on Android — a
  // best-effort polish must never crash the picker.
  const headerRef = React.useRef<View | null>(null)
  React.useEffect(() => {
    if (!domainValid) return
    let cancelled = false
    let rafId: number | null = null
    ;(async () => {
      try {
        const enabled = await AccessibilityInfo.isScreenReaderEnabled()
        if (cancelled || !enabled) return
        rafId = requestAnimationFrame(() => {
          try {
            const node = headerRef.current ? findNodeHandle(headerRef.current) : null
            if (node != null) AccessibilityInfo.setAccessibilityFocus(node)
          } catch {
            // no-op — a11y focus is best-effort
          }
        })
      } catch {
        // isScreenReaderEnabled can reject on cold-start races; ignore.
      }
    })()
    return () => {
      cancelled = true
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [domainValid])

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
      const agoA11y = Number.isFinite(completedMs) ? formatAgoA11yLabel(completedMs) : ''

      let status: RowStatus
      let pillLabel: string
      let a11yLabel: string
      if (inst.comingSoon) {
        status = 'coming-soon'
        pillLabel = 'Coming soon'
        // Chunk 108: non-tappable row — announce as coming-soon, and
        // the Pressable itself carries accessibilityState.disabled=true
        // so VoiceOver appends "dimmed" and the rotor doesn't invite a
        // tap that would no-op.
        a11yLabel = `${inst.name}. Coming soon.`
      } else if (!rec) {
        status = 'not-taken'
        pillLabel = 'Take now'
        a11yLabel = `${inst.name}. Take now. Tap to start.`
      } else if (expired) {
        status = 'retake'
        pillLabel = ago ? `Completed ${ago} · Retake` : 'Retake'
        a11yLabel = agoA11y
          ? `${inst.name}. Completed ${agoA11y}. Tap to retake.`
          : `${inst.name}. Tap to retake.`
      } else {
        status = 'completed'
        pillLabel = ago ? `Completed ${ago}` : 'Completed'
        // Fresh-completed rows are still tappable (they open the
        // stepper for a re-take), so use the same "Tap to retake."
        // trailer as the expired-retake case above.
        a11yLabel = agoA11y
          ? `${inst.name}. Completed ${agoA11y}. Tap to retake.`
          : `${inst.name}. Tap to retake.`
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
        a11yLabel,
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
    // Guard against a rapid second tap that would double-fire the mutation
    // while the loading affordance is already up. Cheap belt-and-suspenders
    // on top of the Pressable's own `disabled={regen.isPending}`.
    if (regen.isPending) return

    // VoiceOver hand-off: announce BEFORE mutate() + router.replace so the
    // utterance is queued while we're still on this screen. `queue: true`
    // means it won't clobber any in-flight announcement (e.g. the pill
    // status change on BPS a moment later). Wrapped in try/catch because
    // announceForAccessibilityWithOptions is a no-op on some platforms and
    // an accessibility polish call must never crash the primary CTA.
    try {
      const info: any = AccessibilityInfo
      if (typeof info?.announceForAccessibilityWithOptions === 'function') {
        info.announceForAccessibilityWithOptions(
          'Refreshing your plan. You will be returned to your Care Plan.',
          { queue: true },
        )
      } else if (typeof info?.announceForAccessibility === 'function') {
        info.announceForAccessibility(
          'Refreshing your plan. You will be returned to your Care Plan.',
        )
      }
    } catch {
      // Swallow — a11y announcement is best-effort polish; do not block the
      // regen fire-and-forget on a screen-reader API hiccup.
    }

    // Fire-and-forget regen (chunk 40 pattern — do not await). Same-tick
    // router.replace is safe: no awaited response, no Modal is mounted
    // by this screen, so iOS 26.5 turbomodule queue is not stressed. Once
    // the replace lands on BPS, the Processing pill on BpsWellbeingScoreCard
    // (chunk 67) takes over as the visible loading affordance.
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
          accessibilityLabel="Back to Care Plan"
          accessibilityHint="Returns to your Care Plan"
        >
          <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={text} />
        </Pressable>
        <View
          ref={headerRef}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${DOMAIN_TITLE[domain]} check-ins`}
          style={{ marginLeft: 12, flex: 1 }}
        >
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(700) as any,
            }}
            numberOfLines={1}
          >
            {DOMAIN_TITLE[domain]} check-ins
          </Text>
        </View>
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
            /* Chunk 76: friendlier empty state. Extreme edge — hit only
               when every member of the domain is coming-soon OR unknown
               to the instrument catalog. Icon + two-line copy, all
               inside a single accessible group so VoiceOver reads it as
               one utterance instead of icon-then-text-then-text. */
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel="Nothing to take here yet. Come back soon."
              style={styles.emptyBlock}
            >
              <MaterialIcons
                name="hourglass-empty"
                size={getScaledFontSize(36)}
                color={subtext}
                style={{ marginBottom: 10 }}
              />
              <Text
                style={{
                  color: text,
                  fontSize: getScaledFontSize(15),
                  fontWeight: getScaledFontWeight(600) as any,
                  textAlign: 'center',
                  marginBottom: 4,
                }}
              >
                Nothing to take here yet
              </Text>
              <Text
                style={{
                  color: subtext,
                  fontSize: getScaledFontSize(13),
                  textAlign: 'center',
                  lineHeight: getScaledFontSize(18),
                }}
              >
                Come back soon — we&apos;re still building out check-ins for this area.
              </Text>
            </View>
          ) : (
            rows.map((row) => {
              const pillStyle = PILL_STYLE_FOR_STATUS[row.status]
              return (
                <Pressable
                  key={row.id}
                  onPress={() => onPressRow(row)}
                  disabled={!row.tappable}
                  /* Chunk 108: explicit `accessible` groups descendants so
                     VoiceOver reads the composed a11yLabel once instead of
                     name + pillLabel as two utterances. */
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={row.a11yLabel}
                  /* accessibilityHint intentionally omitted — the composed
                     label already includes the "Tap to start / Tap to
                     retake" trailer, so a duplicate hint would double the
                     announcement. Coming-soon rows announce as disabled
                     via accessibilityState below, which is the
                     recommended VoiceOver signal for "not yet
                     available". */
                  accessibilityState={{ disabled: !row.tappable }}
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
                      /* Chunk 108: name + pill Text nodes hidden from AT
                         so the parent Pressable's composed label is the
                         only utterance. iOS uses
                         accessibilityElementsHidden, Android uses
                         importantForAccessibility. */
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
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
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
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
            accessibilityHint={
              regen.isPending
                ? 'Waiting for the current refresh to finish'
                : 'Regenerates your care plan with your latest check-ins'
            }
            accessibilityState={{ disabled: regen.isPending, busy: regen.isPending }}
            hitSlop={8}
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
  emptyBlock: {
    // Chunk 76: centered friendly empty state. minHeight matches the
    // sentinel above so the block fills the reserved area cleanly.
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
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
