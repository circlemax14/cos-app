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
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg'
import { Stack } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan'
import {
  BPS_SUBDOMAINS,
  knownSubdomains,
  type BpsDomain,
  type BpsOverlap,
  type BpsSubdomain,
} from '@/lib/bps-subdomains'

const DOMAIN_COLOR: Record<BpsDomain, string> = {
  biological: '#199C4F',
  psychological: '#7B3FE4',
  social: '#C97600',
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
  social: 'Social & Spiritual',
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
  grief:                  { dx: 260, dy: 253, lx: 300, ly: 256, anchor: 'start'  },

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
  count: number
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

  const coverage = React.useMemo(() => computeCoverage(planQuery.data?.plan ?? null), [planQuery.data?.plan])

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
    const stats: Record<BpsDomain, { total: number; covered: number; gaps: SubdomainCoverage[] }> = {
      biological: { total: 0, covered: 0, gaps: [] },
      psychological: { total: 0, covered: 0, gaps: [] },
      social: { total: 0, covered: 0, gaps: [] },
    }
    for (const c of coverage) {
      stats[c.domain].total += 1
      if (c.count > 0) stats[c.domain].covered += 1
      else stats[c.domain].gaps.push(c)
    }
    return stats
  }, [coverage])

  const nextMove = React.useMemo(() => pickNextMove(domainStats), [domainStats])
  const isDark = settings.isDarkTheme

  return (
    <AppWrapper>
      <Stack.Screen options={{ title: 'Wellbeing map', headerBackTitle: 'Care Plan' }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
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
        <View style={styles.coverageRow}>
          {(['biological', 'psychological', 'social'] as BpsDomain[]).map((d) => {
            const s = domainStats[d]
            return (
              <View
                key={d}
                style={[
                  styles.coverageCard,
                  { backgroundColor: DOMAIN_BG[d], borderColor: DOMAIN_COLOR[d] },
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
        </View>

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

            {/* Subdomain markers + labels */}
            {coverage.map((c) => {
              const pos = SUBDOMAIN_POS[c.key]
              if (!pos) return null
              const covered = c.count > 0
              const domainColor = DOMAIN_COLOR[c.domain]
              const labelFill = covered ? (isDark ? '#F2F2F7' : '#1C1C1E') : (isDark ? '#8E8E93' : '#8E8E93')
              const shortLabel = SVG_LABEL_OVERRIDES[c.key] ?? c.label
              return (
                <G key={c.key}>
                  <Circle
                    cx={pos.dx}
                    cy={pos.dy}
                    r={covered ? 4 : 3}
                    fill={covered ? domainColor : (isDark ? '#1C1C1E' : '#FFFFFF')}
                    stroke={domainColor}
                    strokeWidth={c.crossDomain ? 1.2 : 0.9}
                    strokeDasharray={c.crossDomain ? '2,2' : undefined}
                  />
                  <SvgText
                    x={pos.lx}
                    y={pos.ly}
                    fontSize={7.5}
                    fontWeight={covered ? '700' : '500'}
                    fontStyle={covered ? 'normal' : 'italic'}
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
            Solid = at least one goal targets this subdomain. Dashed = no goal
            yet. Overlap groups show cross-cutting items shared between two
            circles of the Venn above.
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
                  {items.map((c) => renderChip(c, colors, getScaledFontSize, isDark))}
                </View>
              </View>
            )
          })}
        </View>

        <Text
          style={[
            styles.attribution,
            { color: colors.subtext, fontSize: getScaledFontSize(10) },
          ]}
        >
          Adapted from the NovoPsych biopsychosocial model
        </Text>
      </ScrollView>
    </AppWrapper>
  )
}

/**
 * Count how many goals hit each subdomain across all three sections. Legacy
 * subdomain keys are silently translated by knownSubdomains → existing goals
 * with pre-COS-445 keys keep counting under their new canonical subdomain.
 */
function computeCoverage(plan: import('@/services/api/biopsychosocial-plan').BiopsychosocialPlanRecord | null): SubdomainCoverage[] {
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
  return BPS_SUBDOMAINS.map((s) => ({
    key: s.key,
    label: s.label,
    domain: s.domain,
    crossDomain: !!s.crossDomain,
    overlap: s.overlap,
    count: counts[s.key] ?? 0,
  }))
}

function renderChip(
  c: SubdomainCoverage,
  colors: typeof Colors['light'],
  getScaledFontSize: (n: number) => number,
  isDark: boolean,
) {
  const color = DOMAIN_COLOR[c.domain]
  const bg = DOMAIN_BG[c.domain]
  const covered = c.count > 0
  return (
    <View
      key={c.key}
      style={[
        styles.chip,
        {
          backgroundColor: covered ? bg : 'transparent',
          borderColor: color,
          borderStyle: covered ? 'solid' : 'dashed',
        },
      ]}
    >
      <Text
        style={{
          color: covered ? color : (isDark ? '#8E8E93' : '#8E8E93'),
          fontSize: getScaledFontSize(11),
          fontWeight: covered ? '700' : '500',
          fontStyle: covered ? 'normal' : 'italic',
        }}
      >
        {c.label}
        {covered ? ` · ${c.count}` : ''}
      </Text>
    </View>
  )
}

/**
 * Pick one gap-filling suggestion. Ranks domains by gap count (most gaps
 * first) and picks the first gap in that domain. If everything is covered,
 * returns a celebration.
 */
function pickNextMove(
  stats: Record<BpsDomain, { total: number; covered: number; gaps: SubdomainCoverage[] }>,
): { tone: 'suggest' | 'celebrate'; domain?: BpsDomain; body: string } {
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
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
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
