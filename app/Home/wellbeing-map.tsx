/**
 * Wellbeing map route (COS-430 → COS-444 → COS-445).
 *
 * COS-430 shipped the SVG Venn + subdomain-dots + coverage heatmap.
 * COS-444 added coverage summary cards, labeled Venn, and next-move card.
 * COS-445 (SCRUM-581) expands the taxonomy from 13 → 26 subdomains per
 * Ken's second Venn image (2026-07-13) and switches the map to Variant
 * 17b: the Venn shows the three domain headers only (no per-subdomain
 * label clutter), and the full 26 items live in a scrollable chip list
 * below grouped by domain + overlap type.
 *
 * Rationale: 26 labels on a phone-screen Venn caused density + WCAG
 * font-size failures (see Section 17a of the design artifact). Chips
 * preserve the covered/gap visual state and scale to any taxonomy
 * length; the Venn becomes a compact anchor for the model.
 *
 * Purely presentational, no new endpoint — same useBiopsychosocialPlan
 * cache. OTA-safe (no native fingerprint change). Backend Bedrock
 * prompt update deferred to a Track 2 story — until it ships, new goals
 * keep getting tagged with the older keys (LEGACY_ALIASES translates
 * them silently) and the 14 new subdomains render as gaps.
 */
import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Text as SvgText } from 'react-native-svg'
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

// Venn layout — 350×260 (shorter than COS-444 since we don't need label room)
const VBW = 350
const VBH = 260
const CIRCLE_R = 90
const BIO_C = { x: 120, y: 115 }
const PSY_C = { x: 230, y: 115 }
const SOC_C = { x: 175, y: 195 }
const CENTER = { x: 175, y: 145 }

interface SubdomainCoverage {
  key: string
  label: string
  domain: BpsDomain
  crossDomain: boolean
  overlap?: BpsOverlap
  count: number
}

// Chip-list groups — order matches Ken's Venn narrative (Bio pure →
// Bio∩Psy overlap → Psy pure → Psy∩Soc overlap → Bio∩Soc overlap →
// Social pure).
type GroupKey = 'bio_pure' | 'bio_psy' | 'psy_pure' | 'psy_soc' | 'bio_soc' | 'soc_pure'

interface GroupSpec {
  key: GroupKey
  header: string
  color: string
  fill: string
  italic: boolean
}

const GROUPS: GroupSpec[] = [
  { key: 'bio_pure', header: 'BIOLOGICAL', color: DOMAIN_COLOR.biological, fill: DOMAIN_BG.biological, italic: false },
  { key: 'bio_psy', header: '↔ shared with Psychological', color: DOMAIN_COLOR.biological, fill: DOMAIN_BG.psychological, italic: true },
  { key: 'psy_pure', header: 'PSYCHOLOGICAL', color: DOMAIN_COLOR.psychological, fill: DOMAIN_BG.psychological, italic: false },
  { key: 'psy_soc', header: '↔ shared with Social', color: DOMAIN_COLOR.psychological, fill: DOMAIN_BG.social, italic: true },
  { key: 'bio_soc', header: '↔ shared with Biological', color: DOMAIN_COLOR.social, fill: DOMAIN_BG.biological, italic: true },
  { key: 'soc_pure', header: 'SOCIAL & SPIRITUAL', color: DOMAIN_COLOR.social, fill: DOMAIN_BG.social, italic: false },
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
            The Venn shows the model; the list below shows every subdomain
            your goals could target. Solid = covered by a goal, dashed = gap.{'\n\n'}
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

        {/* Compact anchor Venn — domain headers + wellbeing center, no per-subdomain labels */}
        <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
          <Svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height={220}>
            <Circle cx={BIO_C.x} cy={BIO_C.y} r={CIRCLE_R} fill={DOMAIN_FILL.biological} stroke={DOMAIN_COLOR.biological} strokeWidth={1.5} />
            <Circle cx={PSY_C.x} cy={PSY_C.y} r={CIRCLE_R} fill={DOMAIN_FILL.psychological} stroke={DOMAIN_COLOR.psychological} strokeWidth={1.5} />
            <Circle cx={SOC_C.x} cy={SOC_C.y} r={CIRCLE_R} fill={DOMAIN_FILL.social} stroke={DOMAIN_COLOR.social} strokeWidth={1.5} />

            <SvgText x={40} y={25} fontSize={12} fontWeight="800" fill={DOMAIN_COLOR.biological} letterSpacing={0.4}>
              BIOLOGICAL
            </SvgText>
            <SvgText x={310} y={25} fontSize={12} fontWeight="800" fill={DOMAIN_COLOR.psychological} textAnchor="end" letterSpacing={0.4}>
              PSYCHOLOGICAL
            </SvgText>
            <SvgText x={175} y={253} fontSize={12} fontWeight="800" fill={DOMAIN_COLOR.social} textAnchor="middle" letterSpacing={0.4}>
              SOCIAL &amp; SPIRITUAL
            </SvgText>

            {/* Central wellbeing marker */}
            <Circle cx={CENTER.x} cy={CENTER.y} r={20} fill={isDark ? '#1C1C1E' : '#FFFFFF'} stroke={isDark ? '#48484A' : '#8E8E93'} strokeWidth={0.8} />
            <SvgText
              x={CENTER.x}
              y={CENTER.y - 2}
              fontSize={7}
              textAnchor="middle"
              fontWeight="800"
              fill={isDark ? '#F2F2F7' : '#1C1C1E'}
              letterSpacing={0.3}
            >
              WELLBEING
            </SvgText>
            <SvgText x={CENTER.x} y={CENTER.y + 8} fontSize={9} textAnchor="middle" fill="#FF3B30">
              ♥
            </SvgText>
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

        {/* Full 26-subdomain chip list, grouped by domain + overlap type */}
        <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
          <Text
            style={[
              styles.cardHead,
              { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            All subdomains
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
