/**
 * Wellbeing map route (COS-430 → COS-444 → COS-445).
 *
 * COS-430 shipped the SVG Venn + subdomain-dots + coverage heatmap.
 * COS-444 added coverage summary cards, labeled Venn (dot + text label
 * per subdomain), and next-move card.
 * COS-445 (SCRUM-581) expands the taxonomy from 13 → 26 subdomains per
 * Ken's second Venn image and keeps the COS-444 labeled-Venn layout.
 * Long labels get abbreviated visually so the density stays legible on a
 * phone screen. The coverage heatmap grid returns below the map (users
 * saw the chip-list variant briefly under an earlier revision of this
 * ticket and preferred the labeled Venn + heatmap).
 *
 * Purely presentational, no new endpoint — same useBiopsychosocialPlan
 * cache. OTA-safe (no native fingerprint change). Backend Bedrock prompt
 * update deferred to a Track 2 story — until it ships, new goals still
 * get tagged with the older 13-key vocabulary (translated silently by
 * LEGACY_ALIASES in lib/bps-subdomains.ts) and the 14 net-new subdomains
 * render as gaps.
 */
import React from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import Svg, { Circle, ClipPath, Defs, G, Rect, Text as SvgText } from 'react-native-svg'
import { Stack, router, useLocalSearchParams } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan'
import { useCanRender } from '@/hooks/use-entitlement'
import {
  BPS_SUBDOMAINS,
  knownSubdomains,
  type BpsDomain,
  type BpsOverlap,
  type BpsSubdomain,
} from '@/lib/bps-subdomains'
import type { PlanCoverageEntry, PlanCoverageFillLevel } from '@/services/api/biopsychosocial-plan'
import { WellbeingSubdomainSheet } from '@/components/health-plan/WellbeingSubdomainSheet'
import {
  UNIFIED_SECTION_ORDER,
  unifiedSectionToWellbeingMapDomain,
  type UnifiedSectionKey,
} from '@/components/unified-plan/section-labels'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

const DOMAIN_COLOR: Record<BpsDomain, string> = {
  biological: '#199C4F',
  psychological: '#7B3FE4',
  // Phase 0 fix (#5): #C97600 measured 3.1:1 on white — under WCAG AA for the
  // section header it colours. #A15E00 is 4.6:1 and reads as the same hue.
  social: '#A15E00',
}
const DOMAIN_FILL: Record<BpsDomain, string> = {
  biological: 'rgba(25,156,79,0.14)',
  psychological: 'rgba(123,63,228,0.14)',
  social: 'rgba(201,118,0,0.14)',
}
const DOMAIN_BG: Record<BpsDomain, string> = {
  biological: 'rgba(25,156,79,0.10)',
  psychological: 'rgba(123,63,228,0.10)',
  social: 'rgba(201,118,0,0.10)',
}
const DOMAIN_LABEL: Record<BpsDomain, string> = {
  biological: 'Biological',
  psychological: 'Psychological',
  social: 'Social & Faith',
}

// Larger viewBox to fit 26 subdomain labels + 3 circles + wellbeing center.
const VBW = 350
const VBH = 350
const CIRCLE_R = 95
const BIO_C = { x: 125, y: 130 }
const PSY_C = { x: 225, y: 130 }
const SOC_C = { x: 175, y: 215 }
const CENTER = { x: 175, y: 165 }

type Anchor = 'start' | 'middle' | 'end'

interface LabelPos {
  dx: number
  dy: number
  lx: number
  ly: number
  anchor: Anchor
}

// Some subdomain labels are too long for the phone-screen SVG; the map
// uses these compact versions, while the coverage heatmap grid below the
// map uses the full labels from BPS_SUBDOMAINS.
const SVG_LABEL_OVERRIDES: Record<string, string> = {
  metabolic_disorders: 'Metabolic Dis.',
  immune_stress_response: 'Immune/Stress',
  response_to_reward: 'Reward Resp.',
  interpersonal_relationships: 'Interp. Rel.',
  family_circumstances: 'Family Circ.',
  socioeconomic_status: 'Socio-econ.',
  faith_spiritual: 'Faith/Spirit',
}

// Positions tuned for the 26-subdomain taxonomy in the 350×350 viewBox.
// Grouped by region so the pattern of adjustments stays readable.
const SUBDOMAIN_POS: Record<string, LabelPos> = {
  // ── Biological pure (top-left quadrant of Bio circle) ─────────────
  genes:                  { dx:  60, dy:  55, lx:  55, ly:  57, anchor: 'end'    },
  neurobiology:           { dx: 100, dy:  40, lx: 100, ly:  32, anchor: 'middle' },
  sleep:                  { dx:  50, dy:  90, lx:  45, ly:  92, anchor: 'end'    },
  physical_health:        { dx:  45, dy: 128, lx:  40, ly: 130, anchor: 'end'    },
  metabolic_disorders:    { dx:  55, dy: 160, lx:  50, ly: 162, anchor: 'end'    },
  immune_stress_response: { dx:  95, dy: 180, lx:  95, ly: 193, anchor: 'middle' },

  // ── Bio ∩ Psy overlap (top center intersection) ───────────────────
  emotions:               { dx: 175, dy:  85, lx: 175, ly:  76, anchor: 'middle' },
  response_to_reward:     { dx: 175, dy: 110, lx: 175, ly: 122, anchor: 'middle' },

  // ── Psychological pure (top-right quadrant of Psy circle) ─────────
  attitudes_beliefs:      { dx: 285, dy:  55, lx: 290, ly:  57, anchor: 'start'  },
  perceptions:            { dx: 300, dy:  90, lx: 305, ly:  92, anchor: 'start'  },
  coping_skills:          { dx: 310, dy: 128, lx: 315, ly: 130, anchor: 'start'  },
  self_esteem:            { dx: 300, dy: 160, lx: 305, ly: 162, anchor: 'start'  },
  temperament:            { dx: 275, dy: 190, lx: 305, ly: 195, anchor: 'start'  },

  // ── Bio ∩ Soc overlap (bottom-left intersection) ──────────────────
  diet_lifestyle:         { dx: 115, dy: 200, lx: 115, ly: 192, anchor: 'middle' },
  substance_use:          { dx: 130, dy: 225, lx: 130, ly: 237, anchor: 'middle' },

  // ── Psy ∩ Soc overlap (bottom-right intersection) ─────────────────
  interpersonal_relationships: { dx: 235, dy: 205, lx: 290, ly: 208, anchor: 'start' },
  trauma:                 { dx: 250, dy: 230, lx: 295, ly: 233, anchor: 'start'  },
  // Phase 0 fix (#5): grief's hit circle overlapped socioeconomic_status
  // (280, 265) at 23.3 units. Both circles are r=12, so centres must be >= 24
  // apart or the later-rendered dot swallows the other's taps — Grief opened
  // Socioeconomic Status.
  //
  // The audit proposed dy 258. That is wrong: it moves grief TOWARD
  // socioeconomic (23.3 -> 21.2). Moving straight up fails too — grief is
  // boxed between socioeconomic below and trauma (250, 230) above, and NO dy
  // at dx 260 clears both. Solved in 2D instead: dx 259 is the nearest valid
  // point, one unit from the original, giving 24.2 to socioeconomic and 24.7
  // to trauma. Visually identical, and a test now proves all 26 dots are
  // mutually clear rather than trusting a hand-checked pair.
  grief:                  { dx: 259, dy: 253, lx: 300, ly: 256, anchor: 'start'  },

  // ── Social & Spiritual pure (bottom band around Soc circle) ───────
  social_support:         { dx: 155, dy: 285, lx: 155, ly: 275, anchor: 'middle' },
  family_circumstances:   { dx:  90, dy: 265, lx:  85, ly: 267, anchor: 'end'    },
  peer_group:             { dx:  70, dy: 295, lx:  65, ly: 297, anchor: 'end'    },
  work_school:            { dx: 195, dy: 285, lx: 200, ly: 275, anchor: 'middle' },
  culture:                { dx: 255, dy: 290, lx: 260, ly: 285, anchor: 'start'  },
  socioeconomic_status:   { dx: 280, dy: 265, lx: 285, ly: 267, anchor: 'start'  },
  life_events:            { dx: 120, dy: 305, lx: 120, ly: 317, anchor: 'middle' },
  faith_spiritual:        { dx: 225, dy: 315, lx: 225, ly: 327, anchor: 'middle' },
}

interface SubdomainCoverage {
  key: string
  label: string
  domain: BpsDomain
  crossDomain: boolean
  overlap?: BpsOverlap
  /** Number of measurable goals in the plan tagged with this subdomain. Same
   * value the goal-only reducer used to expose as `count`. */
  count: number
  /** Wave 2 — number of unique non-expired instruments the user has
   * completed touching this subdomain. `0` when the BE hasn't returned a
   * `coverage` payload yet (older BE) — the map falls back to goal-only
   * behavior in that case. */
  assessmentCount: number
  /** Wave 2 — tri-state fill derived by the BE (goal wins over assessment).
   * When the BE didn't return coverage, we derive from `count > 0 ? 'full'
   * : 'none'` so the rendering stays identical to pre-wave-2. */
  fillLevel: PlanCoverageFillLevel
}

// Chip-list groups — order matches the Ken Venn narrative
// (Bio pure → Bio∩Psy overlap → Psy pure → Psy∩Soc overlap → Bio∩Soc
// overlap → Social pure).
type GroupKey = 'bio_pure' | 'bio_psy' | 'psy_pure' | 'psy_soc' | 'bio_soc' | 'soc_pure'

interface GroupSpec {
  key: GroupKey
  header: string
  color: string
  italic: boolean
}

const GROUPS: GroupSpec[] = [
  { key: 'bio_pure', header: 'BIOLOGICAL', color: DOMAIN_COLOR.biological, italic: false },
  { key: 'bio_psy', header: '↔ shared with Psychological', color: DOMAIN_COLOR.biological, italic: true },
  { key: 'psy_pure', header: 'PSYCHOLOGICAL', color: DOMAIN_COLOR.psychological, italic: false },
  { key: 'psy_soc', header: '↔ shared with Social', color: DOMAIN_COLOR.psychological, italic: true },
  { key: 'bio_soc', header: '↔ shared with Biological', color: DOMAIN_COLOR.social, italic: true },
  { key: 'soc_pure', header: 'SOCIAL & SPIRITUAL', color: DOMAIN_COLOR.social, italic: false },
]

function groupOf(s: BpsSubdomain): GroupKey {
  if (s.overlap === 'bio_psy') return 'bio_psy'
  if (s.overlap === 'bio_soc') return 'bio_soc'
  if (s.overlap === 'psy_soc') return 'psy_soc'
  if (s.domain === 'biological') return 'bio_pure'
  if (s.domain === 'psychological') return 'psy_pure'
  return 'soc_pure'
}

export default function WellbeingMapRoute(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const planQuery = useBiopsychosocialPlan()
  // Entitlement gates. Hooks, so they sit with the others at the TOP of the
  // component, above every effect and any future early return.
  const canView = useCanRender('wellbeing-map.view')
  const canViewDomain = useCanRender('wellbeing-map.view-domain')
  const canTapSubdomain = useCanRender('wellbeing-map.tap-subdomain')

  // Chunk 28 (2026-07-21): domain-preselect deep-link from PlanScreenV2's
  // "View in wellbeing map" footer. Coerce params.section (string |
  // string[] | undefined per expo-router), validate against the canonical
  // UnifiedSectionKey list (rejects unknown / malicious values with a
  // silent no-op — never trust the raw URL param), and translate to the
  // wellbeing-map's internal BpsDomain via the single source of truth in
  // section-labels.ts (socialSpiritual → 'social' rename hop lives there
  // ONLY). All hooks below live at the TOP of the component, above any
  // future early return — chunk-22 Rules-of-Hooks discipline.
  const params = useLocalSearchParams<{ section?: string | string[] }>()
  const rawSection = Array.isArray(params.section) ? params.section[0] : params.section
  const translatedDomain: BpsDomain | null =
    rawSection && (UNIFIED_SECTION_ORDER as readonly string[]).includes(rawSection)
      ? unifiedSectionToWellbeingMapDomain(rawSection as UnifiedSectionKey)
      : null
  const scrollRef = React.useRef<ScrollView>(null)
  // MUST be useState (not useRef) so the scroll effect below re-fires
  // AFTER the coverage row's onLayout captures y. Ordering of the two
  // hook types is load-bearing — the one-shot sentinel below stays a ref.
  const [coverageRowY, setCoverageRowY] = React.useState<number | null>(null)
  const didScrollForParamRef = React.useRef(false)
  const spotlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [spotlightDomain, setSpotlightDomain] = React.useState<BpsDomain | null>(null)

  React.useEffect(() => {
    if (translatedDomain == null) return
    if (coverageRowY == null) return
    if (didScrollForParamRef.current) return
    // Set sentinel FIRST — guarantees one-shot semantics even if
    // translatedDomain and coverageRowY change in the same tick.
    didScrollForParamRef.current = true
    scrollRef.current?.scrollTo({ y: Math.max(0, coverageRowY - 8), animated: true })
    setSpotlightDomain(translatedDomain)
    // Clear-then-schedule — byte-identical to CareManagerToast's timer
    // discipline. Guards against a rapid re-navigation that arrives
    // mid-spotlight.
    if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current)
    spotlightTimerRef.current = setTimeout(() => setSpotlightDomain(null), 2500)
  }, [translatedDomain, coverageRowY])

  // Dedicated cleanup effect — mirrors CareManagerToast's unmount
  // discipline so a route pop mid-spotlight cannot leak the timer.
  React.useEffect(() => {
    return () => {
      if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current)
    }
  }, [])

  const coverage = React.useMemo(
    () => computeCoverage(planQuery.data?.plan ?? null, planQuery.data?.coverage),
    [planQuery.data?.plan, planQuery.data?.coverage],
  )

  // Titles of the goals targeting each subdomain — powers the "Your goals for this"
  // list in the drilldown sheet. Legacy keys resolved via knownSubdomains.
  const goalTitlesByKey = React.useMemo(() => {
    const out: Record<string, string[]> = {}
    const plan = planQuery.data?.plan
    if (!plan) return out
    const allGoals = [
      ...plan.sections.biological.goals,
      ...plan.sections.psychological.goals,
      ...plan.sections.social.goals,
    ]
    for (const g of allGoals) {
      const title = (g as any).title ?? (g as any).name ?? ''
      if (!title) continue
      for (const key of knownSubdomains(g.subdomains)) {
        if (!out[key]) out[key] = []
        out[key].push(title)
      }
    }
    return out
  }, [planQuery.data?.plan])

  // Drilldown sheet state.
  const [sheetKey, setSheetKey] = React.useState<string | null>(null)
  const openSheet = React.useCallback((key: string) => setSheetKey(key), [])
  const closeSheet = React.useCallback(() => setSheetKey(null), [])

  const activeSubdomain = React.useMemo(
    () => (sheetKey ? BPS_SUBDOMAINS.find((s) => s.key === sheetKey) ?? null : null),
    [sheetKey],
  )
  const activeCoverage = React.useMemo(
    () => (sheetKey ? coverage.find((c) => c.key === sheetKey) : undefined),
    [sheetKey, coverage],
  )

  const handleAddGoal = React.useCallback((sub: BpsSubdomain) => {
    closeSheet()
    // v1: navigate to the biopsychosocial-plan screen where the user
    // can add a goal in the right section. Deep-link auto-open of the
    // goal editor with subdomain pre-select is a follow-up.
    router.push('/Home/biopsychosocial-plan' as never)
  }, [closeSheet])

  const handleAiSuggest = React.useCallback((sub: BpsSubdomain) => {
    // Placeholder for v1 — real integration deferred to Track 2 (backend
    // Bedrock prompt update needed to focus regeneration on a subdomain).
    Alert.alert(
      'AI suggest a goal',
      `Coming soon — the AI will suggest a goal for "${sub.label}" based on your history and current plan.`,
      [{ text: 'OK' }],
    )
  }, [])

  // Wave 2 — "Take a check-in" CTA from the drilldown sheet. v1 routes to
  // the catalog; a follow-up will pre-filter the list by the tapped
  // subdomain (via ?subdomain=<key>) once AssessmentCatalogContent grows
  // the filter surface.
  const handleTakeAssessment = React.useCallback((_sub: BpsSubdomain) => {
    closeSheet()
    router.push('/Home/assessments-catalog' as never)
  }, [closeSheet])

  const grouped = React.useMemo(() => {
    const g: Record<GroupKey, SubdomainCoverage[]> = {
      bio_pure: [], bio_psy: [], psy_pure: [], psy_soc: [], bio_soc: [], soc_pure: [],
    }
    for (const c of coverage) {
      const sub = BPS_SUBDOMAINS.find((s) => s.key === c.key)
      if (sub) g[groupOf(sub)].push(c)
    }
    return g
  }, [coverage])

  const domainStats = React.useMemo(() => {
    // Wave 2 — a subdomain counts as "covered" for the header cards when
    // it has EITHER an assessment or a goal (fillLevel !== 'none'). Gaps
    // are strictly the untouched subdomains, keeping "Your next move"
    // suggestions focused on genuinely-empty areas.
    const stats: Record<BpsDomain, { total: number; covered: number; gaps: SubdomainCoverage[] }> = {
      biological: { total: 0, covered: 0, gaps: [] },
      psychological: { total: 0, covered: 0, gaps: [] },
      social: { total: 0, covered: 0, gaps: [] },
    }
    for (const c of coverage) {
      stats[c.domain].total += 1
      if (c.fillLevel !== 'none') stats[c.domain].covered += 1
      else stats[c.domain].gaps.push(c)
    }
    return stats
  }, [coverage])

  const nextMove = React.useMemo(() => pickNextMove(domainStats), [domainStats])
  const isDark = settings.isDarkTheme

  return (
    <AppWrapper>
      <Stack.Screen options={{ title: 'Wellbeing map', headerBackTitle: 'Care Plan' }} />
      {canView && <ScrollView
        ref={scrollRef}
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/*
          SCRUM-656 (2026-07-31): explicit back-button row above the
          header. Parent app/Home/_layout.tsx mounts this route under a
          Tabs navigator with `headerShown: false` + `href: null` — no
          Stack, no header, no automatic back affordance. The
          `<Stack.Screen>` above is a defensive no-op for this navigator
          shape. User: "same goes for well being map." Same pattern as
          app/Home/about.tsx: Pressable + arrow-back + router.back().
        */}
        <View style={styles.backHeader}>
          <Pressable
            onPress={() => {
              // SCRUM-657 (2026-07-31): router.back() pops the history
              // stack, but the Plan-tab entry point is a TAB SWITCH
              // (not a push), so back() falls through to whatever route
              // was pushed BEFORE the tab switch — usually Home. Use an
              // explicit router.replace to the Plan (BPS) route so the
              // destination is deterministic. Mirrors
              // wellbeing-domain-checkins.tsx's back-to-plan pattern.
              router.replace('/Home/biopsychosocial-plan' as never);
            }}
            style={styles.backBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back to care plan"
          >
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.header}>
          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                fontSize: getScaledFontSize(22),
                fontWeight: getScaledFontWeight(700) as any,
              },
            ]}
          >
            Wellbeing map
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: colors.subtext, fontSize: getScaledFontSize(13) },
            ]}
          >
            A visual overview of your plan across three overlapping wellness
            domains — biological, psychological, and social &amp; spiritual.
            Filled labels show what your goals already cover; outlined labels
            are gaps waiting to be addressed.{'\n\n'}
            <Text style={{ color: colors.text, fontWeight: getScaledFontWeight(600) as any }}>
              Why it matters:
            </Text>{' '}
            wellbeing improves fastest when goals span all three domains and
            the areas where they overlap.
          </Text>
        </View>

        {/* Coverage summary — three tinted cards, one per domain */}
        {canViewDomain && <View
          style={styles.coverageRow}
          onLayout={(e) => setCoverageRowY(e.nativeEvent.layout.y)}
        >
          {(['biological', 'psychological', 'social'] as BpsDomain[]).map((d) => {
            const s = domainStats[d]
            // Chunk 28: 2px "spotlight" ring on the preselected domain
            // card for 2.5s after a deep-link-triggered scroll. Plain
            // conditional width (1 ↔ 2) — NO Animated.timing, NO
            // LayoutAnimation (iOS 26.5 crash-class avoidance). borderColor
            // is unchanged (DOMAIN_COLOR[d] is the tint in both states);
            // only the width delta communicates focus.
            const isSpotlit = spotlightDomain === d
            return (
              <View
                key={d}
                // Phase 0 fix (#5): these are summary stats, not controls — but
                // the card treatment (fill + border) reads as tappable, and to
                // VoiceOver they were two unlabelled stops ("3", then
                // "Biological wellbeing") with no relationship between them.
                // Grouping into one element with a sentence label fixes the AT
                // reading; `accessibilityRole="text"` states plainly that there
                // is nothing to activate. Whether they SHOULD become tappable
                // (scroll to that group) is a design call for Ken, not Phase 0.
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${DOMAIN_LABEL[d]}: ${s.covered} of ${s.total} areas covered`}
                style={[
                  styles.coverageCard,
                  {
                    backgroundColor: DOMAIN_BG[d],
                    borderColor: DOMAIN_COLOR[d],
                    borderWidth: isSpotlit ? 2 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: DOMAIN_COLOR[d],
                    fontSize: getScaledFontSize(20),
                    fontWeight: getScaledFontWeight(700) as any,
                    lineHeight: 22,
                  }}
                >
                  {s.covered}/{s.total}
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(11),
                    fontWeight: getScaledFontWeight(600) as any,
                    marginTop: 2,
                    textAlign: 'center',
                  }}
                  numberOfLines={2}
                >
                  {DOMAIN_LABEL[d]}
                </Text>
              </View>
            )
          })}
        </View>}

        <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
          <Svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height={340}>
            {/* Domain circles */}
            <Circle
              cx={BIO_C.x}
              cy={BIO_C.y}
              r={CIRCLE_R}
              fill={DOMAIN_FILL.biological}
              stroke={DOMAIN_COLOR.biological}
              strokeWidth={1.5}
            />
            <Circle
              cx={PSY_C.x}
              cy={PSY_C.y}
              r={CIRCLE_R}
              fill={DOMAIN_FILL.psychological}
              stroke={DOMAIN_COLOR.psychological}
              strokeWidth={1.5}
            />
            <Circle
              cx={SOC_C.x}
              cy={SOC_C.y}
              r={CIRCLE_R}
              fill={DOMAIN_FILL.social}
              stroke={DOMAIN_COLOR.social}
              strokeWidth={1.5}
            />

            {/* Domain headers */}
            <SvgText x={40} y={20} fontSize={11} fontWeight="800" fill={DOMAIN_COLOR.biological} letterSpacing={0.4}>
              BIOLOGICAL
            </SvgText>
            <SvgText x={310} y={20} fontSize={11} fontWeight="800" fill={DOMAIN_COLOR.psychological} textAnchor="end" letterSpacing={0.4}>
              PSYCHOLOGICAL
            </SvgText>
            <SvgText x={175} y={345} fontSize={11} fontWeight="800" fill={DOMAIN_COLOR.social} textAnchor="middle" letterSpacing={0.4}>
              SOCIAL &amp; SPIRITUAL
            </SvgText>

            {/* Central wellbeing marker */}
            <Circle cx={CENTER.x} cy={CENTER.y} r={14} fill={isDark ? '#1C1C1E' : '#FFFFFF'} stroke={isDark ? '#48484A' : '#8E8E93'} strokeWidth={0.8} />
            <SvgText
              x={CENTER.x}
              y={CENTER.y - 1}
              fontSize={6}
              textAnchor="middle"
              fontWeight="800"
              fill={isDark ? '#F2F2F7' : '#1C1C1E'}
              letterSpacing={0.3}
            >
              WELLBEING
            </SvgText>
            <SvgText x={CENTER.x} y={CENTER.y + 7} fontSize={7} textAnchor="middle" fill="#FF3B30">
              ♥
            </SvgText>

            {/* Wave 2 — clip paths for half-fill dots. One clip per position so
                react-native-svg can address each subdomain's half independently. */}
            <Defs>
              {coverage.map((c) => {
                if (c.fillLevel !== 'half') return null
                const pos = SUBDOMAIN_POS[c.key]
                if (!pos) return null
                // Left half of the dot is the "assessment" side. Rect is
                // deliberately larger than the circle so the clip mask
                // doesn't fight sub-pixel rendering at the dot's edge.
                return (
                  <ClipPath key={`clip-half-${c.key}`} id={`clip-half-${c.key}`}>
                    <Rect x={pos.dx - 12} y={pos.dy - 12} width={12} height={24} />
                  </ClipPath>
                )
              })}
            </Defs>

            {/* Subdomain markers + labels — whole group is tappable, opens the drilldown sheet */}
            {canTapSubdomain && coverage.map((c) => {
              const pos = SUBDOMAIN_POS[c.key]
              if (!pos) return null
              const isFull = c.fillLevel === 'full'
              const isHalf = c.fillLevel === 'half'
              const isCovered = isFull || isHalf
              const domainColor = DOMAIN_COLOR[c.domain]
              // Phase 0 fix (#5): light-mode gap labels were #8E8E93 = 2.99:1 on
              // #f5f5f5, under the 4.5:1 WCAG AA floor. #5A5A5F is 5.4:1. Dark
              // mode keeps #8E8E93, which is already compliant on a dark ground.
              const labelFill = isCovered ? (isDark ? '#F2F2F7' : '#1C1C1E') : (isDark ? '#8E8E93' : '#5A5A5F')
              const shortLabel = SVG_LABEL_OVERRIDES[c.key] ?? c.label
              const emptyFill = isDark ? '#1C1C1E' : '#FFFFFF'
              // Radius: full=4, half=3.5, none=3 — gives 'half' a visual footprint
              // distinct from both extremes without shouting.
              const r = isFull ? 4 : isHalf ? 3.5 : 3
              const dashed = c.crossDomain ? '2,2' : undefined
              // Label weight/style: three tiers so the tri-state reads at a glance.
              const labelWeight = isFull ? '700' : isHalf ? '600' : '500'
              const labelItalic = !isFull  // both half and none stay italic
              // Phase 0 fix (#5): each dot was an unlabelled <G onPress>. VoiceOver
              // announced nothing, so all 26 areas of the map were invisible to
              // assistive tech even though every one is tappable. Same sentence
              // shape as the coverage chips below, so the two surfaces read
              // identically — a screen-reader user hearing "Grief, no goals or
              // assessments yet" gets the same information either way.
              const a11yState = isFull
                ? `${c.count} goal${c.count === 1 ? '' : 's'}`
                : isHalf
                  ? `${c.assessmentCount} assessment${c.assessmentCount === 1 ? '' : 's'}, no goal yet`
                  : 'no goals or assessments yet'
              // Position in the Venn is decorative and, per the audit, wrong for
              // 12 of 26 areas — so the label states the domain in words rather
              // than leaving it to be inferred from where the dot sits.
              const a11yLabel = `${c.label}, ${c.domain}, ${a11yState}. Tap to learn more.`
              return (
                <G
                  key={c.key}
                  onPress={() => openSheet(c.key)}
                  accessibilityRole="button"
                  accessibilityLabel={a11yLabel}
                >
                  {/* Invisible larger hit target for the dot so it's finger-friendly */}
                  <Circle cx={pos.dx} cy={pos.dy} r={12} fill="transparent" />
                  {isHalf ? (
                    <>
                      {/* Background empty circle */}
                      <Circle
                        cx={pos.dx}
                        cy={pos.dy}
                        r={r}
                        fill={emptyFill}
                        stroke={domainColor}
                        strokeWidth={c.crossDomain ? 1.2 : 0.9}
                        strokeDasharray={dashed}
                      />
                      {/* Filled left half (clipped) */}
                      <Circle
                        cx={pos.dx}
                        cy={pos.dy}
                        r={r}
                        fill={domainColor}
                        clipPath={`url(#clip-half-${c.key})`}
                      />
                    </>
                  ) : (
                    <Circle
                      cx={pos.dx}
                      cy={pos.dy}
                      r={r}
                      fill={isFull ? domainColor : emptyFill}
                      stroke={domainColor}
                      strokeWidth={c.crossDomain ? 1.2 : 0.9}
                      strokeDasharray={dashed}
                    />
                  )}
                  <SvgText
                    x={pos.lx}
                    y={pos.ly}
                    fontSize={7.5}
                    fontWeight={labelWeight}
                    fontStyle={labelItalic ? 'italic' : 'normal'}
                    fill={labelFill}
                    textAnchor={pos.anchor}
                  >
                    {shortLabel}
                  </SvgText>
                </G>
              )
            })}
          </Svg>
        </View>

        {/* Your next move — one concrete suggestion or a celebration */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card as string,
              borderColor: nextMove.tone === 'celebrate' ? DOMAIN_COLOR.biological : DOMAIN_COLOR[nextMove.domain ?? 'biological'],
              borderLeftWidth: 4,
            },
          ]}
        >
          <Text
            style={[
              styles.cardHead,
              {
                color: colors.text,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(700) as any,
              },
            ]}
          >
            {nextMove.tone === 'celebrate' ? 'Nicely balanced' : 'Your next move'}
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(13),
              lineHeight: 19,
            }}
          >
            {nextMove.body}
          </Text>
          {nextMove.tone === 'suggest' && nextMove.suggestedKey ? (
            <TouchableOpacity
              onPress={() => openSheet(nextMove.suggestedKey!)}
              activeOpacity={0.7}
              style={{
                marginTop: 12,
                backgroundColor: DOMAIN_COLOR[nextMove.domain ?? 'biological'],
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 14,
                alignSelf: 'flex-start',
              }}
              accessibilityRole="button"
            >
              <Text style={{ color: '#FFFFFF', fontSize: getScaledFontSize(13), fontWeight: '700' }}>
                Open {nextMove.suggestedLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Coverage by subdomain — chip list grouped by domain + overlap type.
            Shows the same coverage info as the map but with the overlap
            groupings explicit (Bio ∩ Psy, Bio ∩ Soc, Psy ∩ Soc). */}
        <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
          <Text
            style={[
              styles.cardHead,
              { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            Coverage by subdomain
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              marginBottom: 10,
              lineHeight: 15,
            }}
          >
            Solid = a goal targets this subdomain. Half-filled = you&#39;ve
            completed a check-in here but no goal yet. Hollow = untouched
            gap. On the map above, a dashed outline means the area spans two
            circles rather than sitting in one.
          </Text>

          {GROUPS.map((g) => {
            const items = grouped[g.key]
            if (!items || items.length === 0) return null
            return (
              <View key={g.key} style={{ marginTop: g.italic ? 8 : 12 }}>
                <Text
                  style={{
                    color: g.color,
                    fontSize: getScaledFontSize(g.italic ? 10 : 11),
                    fontWeight: g.italic ? ('500' as any) : ('800' as any),
                    fontStyle: g.italic ? 'italic' : 'normal',
                    letterSpacing: g.italic ? 0 : 0.4,
                    marginBottom: 6,
                    textTransform: g.italic ? 'none' : 'uppercase',
                  }}
                >
                  {g.header}
                </Text>
                <View style={styles.chipRow}>
                  {items.map((c) => renderChip(c, colors, getScaledFontSize, isDark, openSheet))}
                </View>
              </View>
            )
          })}
        </View>

      </ScrollView>}

      <WellbeingSubdomainSheet
        visible={sheetKey !== null && activeSubdomain !== null}
        subdomain={activeSubdomain}
        currentGoalCount={activeCoverage?.count ?? 0}
        currentGoalTitles={sheetKey ? (goalTitlesByKey[sheetKey] ?? []) : []}
        assessmentCount={activeCoverage?.assessmentCount ?? 0}
        fillLevel={activeCoverage?.fillLevel ?? 'none'}
        colors={colors}
        isDark={isDark}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
        onClose={closeSheet}
        onAddGoal={handleAddGoal}
        onAiSuggest={handleAiSuggest}
        onTakeAssessment={handleTakeAssessment}
      />
    </AppWrapper>
  )
}

/**
 * Wave 2 — produce the 26-row coverage snapshot the map + chips + sheet all
 * read from. Two modes:
 *
 *   1. BE payload present (post-2026-07-28 backend) — use `coverage[key]`
 *      directly. goalCount/assessmentCount/fillLevel all come from the
 *      server so the mobile and any future clinician view agree byte-for-
 *      byte on what a subdomain looks like.
 *   2. BE payload absent (older BE, cache miss, network degradation)
 *      — fall back to the pre-wave-2 client-side goal reducer. fillLevel
 *      degrades to `count > 0 ? 'full' : 'none'` and assessmentCount is
 *      always 0, matching today's rendering exactly.
 *
 * Legacy subdomain keys are silently translated by knownSubdomains → existing
 * goals with pre-COS-445 keys keep counting under their new canonical
 * subdomain (goal-only path only — BE has already canonicalized on the wire
 * path via its own `canonicalSubdomainKey`).
 */
function computeCoverage(
  plan: import('@/services/api/biopsychosocial-plan').BiopsychosocialPlanRecord | null,
  beCoverage: readonly PlanCoverageEntry[] | undefined,
): SubdomainCoverage[] {
  if (beCoverage && beCoverage.length > 0) {
    const beByKey: Record<string, PlanCoverageEntry> = Object.create(null)
    for (const row of beCoverage) beByKey[row.key] = row
    return BPS_SUBDOMAINS.map((s) => {
      const row = beByKey[s.key]
      const goalCount = row?.goalCount ?? 0
      const assessmentCount = row?.assessmentCount ?? 0
      // Prefer the server's fillLevel — matches the tie-break rule the BE
      // enforces in wellbeing-coverage.service.ts. Derive as a safety net
      // if a row is somehow missing fillLevel.
      const fillLevel: PlanCoverageFillLevel =
        row?.fillLevel ??
        (goalCount > 0 ? 'full' : assessmentCount > 0 ? 'half' : 'none')
      return {
        key: s.key,
        label: s.label,
        domain: s.domain,
        crossDomain: !!s.crossDomain,
        overlap: s.overlap,
        count: goalCount,
        assessmentCount,
        fillLevel,
      }
    })
  }

  // Fallback path — old BE, no coverage array. Reproduce the pre-wave-2
  // goal-only reducer exactly so the map still works.
  const counts: Record<string, number> = Object.create(null)
  if (plan) {
    const allGoals = [
      ...plan.sections.biological.goals,
      ...plan.sections.psychological.goals,
      ...plan.sections.social.goals,
    ]
    for (const g of allGoals) {
      for (const key of knownSubdomains(g.subdomains)) {
        counts[key] = (counts[key] ?? 0) + 1
      }
    }
  }
  return BPS_SUBDOMAINS.map((s) => {
    const count = counts[s.key] ?? 0
    return {
      key: s.key,
      label: s.label,
      domain: s.domain,
      crossDomain: !!s.crossDomain,
      overlap: s.overlap,
      count,
      assessmentCount: 0,
      fillLevel: count > 0 ? 'full' : 'none',
    }
  })
}

function renderChip(
  c: SubdomainCoverage,
  colors: typeof Colors['light'],
  getScaledFontSize: (n: number) => number,
  isDark: boolean,
  onPress: (key: string) => void,
) {
  const color = DOMAIN_COLOR[c.domain]
  const bg = DOMAIN_BG[c.domain]
  const isFull = c.fillLevel === 'full'
  const isHalf = c.fillLevel === 'half'

  // Trailing badge — full: "· N goals", half: "· 1 assessment", none: nothing.
  let trailing = ''
  if (isFull) trailing = ` · ${c.count}`
  else if (isHalf) trailing = ` · ${c.assessmentCount} assessment${c.assessmentCount === 1 ? '' : 's'}`

  // Accessibility copy that names the state, not just the count.
  const stateWord = isFull
    ? `${c.count} goal${c.count === 1 ? '' : 's'}`
    : isHalf
      ? `${c.assessmentCount} assessment${c.assessmentCount === 1 ? '' : 's'}, no goal yet`
      : 'no goals or assessments yet'

  return (
    <TouchableOpacity
      key={c.key}
      onPress={() => onPress(c.key)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${c.label}, ${stateWord}. Tap to learn more.`}
      style={[
        styles.chip,
        {
          backgroundColor: isFull ? bg : 'transparent',
          borderColor: color,
          borderStyle: isFull ? 'solid' : 'dashed',
        },
      ]}
    >
      <Text
        style={{
          color: isFull ? color : isHalf ? color : (isDark ? '#8E8E93' : '#5A5A5F'),
          fontSize: getScaledFontSize(11),
          fontWeight: isFull ? '700' : isHalf ? '600' : '500',
          fontStyle: isFull ? 'normal' : 'italic',
        }}
      >
        {c.label}
        {trailing}
      </Text>
    </TouchableOpacity>
  )
}

/**
 * Pick one gap-filling suggestion. Ranks domains by gap count (most gaps
 * first) and picks the first gap in that domain. If everything is covered,
 * returns a celebration.
 */
function pickNextMove(
  stats: Record<BpsDomain, { total: number; covered: number; gaps: SubdomainCoverage[] }>,
): {
  tone: 'suggest' | 'celebrate'
  domain?: BpsDomain
  body: string
  suggestedKey?: string
  suggestedLabel?: string
} {
  const domains: BpsDomain[] = ['biological', 'psychological', 'social']
  const ranked = domains
    .map((d) => ({ d, gapCount: stats[d].gaps.length }))
    .filter((x) => x.gapCount > 0)
    .sort((a, b) => b.gapCount - a.gapCount)

  if (ranked.length === 0) {
    return {
      tone: 'celebrate',
      body: 'Every subdomain has at least one goal supporting it. Your plan is well-balanced across body, mind, and social wellbeing.',
    }
  }

  const topDomain = ranked[0].d
  const firstGap = stats[topDomain].gaps[0]
  const domainNoun = DOMAIN_LABEL[topDomain].toLowerCase()
  const others = stats[topDomain].gaps.slice(1).map((g) => g.label)
  const extra = others.length > 0 ? ` (also open: ${others.slice(0, 2).join(', ')}${others.length > 2 ? '…' : ''})` : ''

  return {
    tone: 'suggest',
    domain: topDomain,
    body: `Try adding a goal that includes ${firstGap.label} to widen your ${domainNoun} coverage.${extra}`,
    suggestedKey: firstGap.key,
    suggestedLabel: firstGap.label,
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    padding: 8,
  },
  header: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 },
  title: { marginBottom: 4 },
  subtitle: { lineHeight: 18, marginBottom: 12 },
  coverageRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
  },
  coverageCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardHead: { marginBottom: 8 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  attribution: {
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
})
