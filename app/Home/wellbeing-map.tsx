/**
 * Wellbeing map route (COS-430, extended in COS-444).
 *
 * COS-430 shipped an SVG Venn of Ken's NovoPsych biopsychosocial diagram
 * with subdomain "dots" sized by goal count. COS-444 (SCRUM-580) extends it
 * per Ken's second-round diagram (bio-psycho-socio-environmental Venn with
 * named items INSIDE each region + overlap regions dedicated to cross-cutting
 * items). Same 13-subdomain taxonomy — visual language only.
 *
 * Additions over the original:
 *   - Coverage summary strip at top (3 tinted cards: X-of-N covered per domain)
 *   - Labeled Venn: subdomain names sit next to their marker (Ken-image style),
 *     not just dots
 *   - Overlap subdomains (crossDomain: true) positioned visually at the
 *     matching intersection (stress_reactivity in Bio∩Psy, coping in Psy∩Soc)
 *   - Central Wellbeing marker made smaller so labels breathe
 *   - "Your next move" card: concrete gap-filling suggestion or a celebration
 *
 * Purely presentational, no new endpoint — same useBiopsychosocialPlan cache.
 * OTA-safe (no native fingerprint change). Backend taxonomy expansion (Ken's
 * image has ~21 subdomains vs our 13) deferred to a follow-up after Ken sees
 * the visual redesign.
 */
import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg'
import { Stack } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan'
import { BPS_SUBDOMAINS, knownSubdomains, type BpsDomain } from '@/lib/bps-subdomains'

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

// Layout — 350×340 viewBox gives each subdomain label breathing room. Three
// circles arranged in the classic Venn triangle with generous overlap for
// the cross-domain items to sit at the intersections without collision.
const VBW = 350
const VBH = 340
const CIRCLE_R = 100
const BIO_C = { x: 120, y: 130 }
const PSY_C = { x: 230, y: 130 }
const SOC_C = { x: 175, y: 225 }
const CENTER = { x: 175, y: 170 }

type Anchor = 'start' | 'middle' | 'end'

interface LabelPos {
  /** Marker dot position. */
  dx: number
  dy: number
  /** Label text position — placed relative to dot to avoid overlap. */
  lx: number
  ly: number
  anchor: Anchor
}

// Positions tuned per Ken's image — items placed INSIDE their primary domain
// with labels aimed outward; overlap items sit at the intersection with the
// label centered above/beside so both circles read as sharing that concept.
const SUBDOMAIN_POS: Record<string, LabelPos> = {
  // Biological — top-left cluster
  genes:            { dx:  55, dy:  65, lx:  50, ly:  55, anchor: 'end'    },
  neurobiology:     { dx: 105, dy:  50, lx: 105, ly:  40, anchor: 'middle' },
  sleep:            { dx:  50, dy: 110, lx:  45, ly: 113, anchor: 'end'    },
  physical_health:  { dx:  60, dy: 155, lx:  55, ly: 158, anchor: 'end'    },
  // Bio ∩ Psy overlap — top center
  stress_reactivity:{ dx: 175, dy:  95, lx: 175, ly:  84, anchor: 'middle' },
  // Psychological — top-right cluster
  beliefs:          { dx: 300, dy:  70, lx: 305, ly:  73, anchor: 'start'  },
  thought_patterns: { dx: 305, dy: 115, lx: 310, ly: 118, anchor: 'start'  },
  emotions:         { dx: 295, dy: 160, lx: 300, ly: 163, anchor: 'start'  },
  // Psy ∩ Soc overlap — right side of intersection
  coping:           { dx: 240, dy: 215, lx: 285, ly: 218, anchor: 'start'  },
  // Social — bottom band
  relationships:    { dx:  85, dy: 250, lx:  80, ly: 253, anchor: 'end'    },
  social_support:   { dx: 125, dy: 300, lx: 125, ly: 315, anchor: 'middle' },
  life_stressors:   { dx: 215, dy: 300, lx: 215, ly: 315, anchor: 'middle' },
  socioeconomic_status:{ dx: 260, dy: 260, lx: 265, ly: 263, anchor: 'start'  },
}

interface SubdomainCoverage {
  key: string
  label: string
  domain: BpsDomain
  crossDomain: boolean
  count: number
}

export default function WellbeingMapRoute(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const planQuery = useBiopsychosocialPlan()

  const coverage = React.useMemo(() => computeCoverage(planQuery.data?.plan ?? null), [planQuery.data?.plan])
  const gaps = coverage.filter((c) => c.count === 0)
  const maxCount = coverage.reduce((m, c) => Math.max(m, c.count), 0)

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
          <Svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height={320}>
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

            {/* Domain headers — bold, offset so they don't collide with subdomain labels */}
            <SvgText x={40} y={25} fontSize={11} fontWeight="800" fill={DOMAIN_COLOR.biological} letterSpacing={0.4}>
              BIOLOGICAL
            </SvgText>
            <SvgText x={310} y={25} fontSize={11} fontWeight="800" fill={DOMAIN_COLOR.psychological} textAnchor="end" letterSpacing={0.4}>
              PSYCHOLOGICAL
            </SvgText>
            <SvgText x={175} y={335} fontSize={11} fontWeight="800" fill={DOMAIN_COLOR.social} textAnchor="middle" letterSpacing={0.4}>
              SOCIAL &amp; SPIRITUAL
            </SvgText>

            {/* Central wellbeing marker — subtler than before, doesn't dominate */}
            <Circle cx={CENTER.x} cy={CENTER.y} r={16} fill={isDark ? '#1C1C1E' : '#FFFFFF'} stroke={isDark ? '#48484A' : '#8E8E93'} strokeWidth={0.8} />
            <SvgText
              x={CENTER.x}
              y={CENTER.y - 1}
              fontSize={6.5}
              textAnchor="middle"
              fontWeight="800"
              fill={isDark ? '#F2F2F7' : '#1C1C1E'}
              letterSpacing={0.3}
            >
              WELLBEING
            </SvgText>
            <SvgText x={CENTER.x} y={CENTER.y + 8} fontSize={8} textAnchor="middle" fill="#FF3B30">
              ♥
            </SvgText>

            {/* Subdomain markers + labels */}
            {coverage.map((c) => {
              const pos = SUBDOMAIN_POS[c.key]
              if (!pos) return null
              const covered = c.count > 0
              const domainColor = DOMAIN_COLOR[c.domain]
              const labelFill = covered ? (isDark ? '#F2F2F7' : '#1C1C1E') : (isDark ? '#8E8E93' : '#8E8E93')
              return (
                <G key={c.key}>
                  <Circle
                    cx={pos.dx}
                    cy={pos.dy}
                    r={covered ? 5 : 4}
                    fill={covered ? domainColor : (isDark ? '#1C1C1E' : '#FFFFFF')}
                    stroke={domainColor}
                    strokeWidth={c.crossDomain ? 1.4 : 1}
                    strokeDasharray={c.crossDomain ? '2,2' : undefined}
                  />
                  <SvgText
                    x={pos.lx}
                    y={pos.ly}
                    fontSize={9}
                    fontWeight={covered ? '700' : '500'}
                    fontStyle={covered ? 'normal' : 'italic'}
                    fill={labelFill}
                    textAnchor={pos.anchor}
                  >
                    {c.label}
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

        {/* Coverage heatmap — drilldown grid, unchanged from COS-430 */}
        <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
          <Text
            style={[
              styles.cardHead,
              { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            Coverage by subdomain
          </Text>
          <View style={styles.heatGrid}>
            {coverage.map((c) => (
              <View
                key={c.key}
                style={[
                  styles.heatCell,
                  { backgroundColor: heatColor(c.count, maxCount, c.domain, colors.background as string) },
                ]}
              >
                <Text
                  style={{
                    color: c.count === 0 ? colors.subtext : (isLikelyDarkBg(colors.background as string) ? '#F2F2F7' : '#1C1C1E'),
                    fontSize: getScaledFontSize(10),
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                  numberOfLines={2}
                >
                  {c.label}
                </Text>
                <Text
                  style={{
                    color: c.count === 0 ? colors.subtext : (isLikelyDarkBg(colors.background as string) ? '#F2F2F7' : '#1C1C1E'),
                    fontSize: getScaledFontSize(11),
                    fontWeight: '700',
                    textAlign: 'center',
                    marginTop: 2,
                  }}
                >
                  {c.count}
                </Text>
              </View>
            ))}
          </View>

          {gaps.length > 0 ? (
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                lineHeight: 17,
                marginTop: 10,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>Gaps: </Text>
              {gaps.map((g) => g.label).join(', ')} — not yet addressed by any goal.
            </Text>
          ) : null}
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
 * goals with no `subdomains` field contribute nothing (they don't crash and
 * they don't skew the coverage view — they just aren't tagged yet).
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

function heatColor(count: number, maxCount: number, domain: BpsDomain, bg: string): string {
  if (count === 0) return isLikelyDarkBg(bg) ? '#2C2C2E' : '#F2F2F7'
  const intensity = maxCount > 0 ? count / maxCount : 0
  const light = {
    biological: ['#D6F0E0', '#86DAA8', '#199C4F'],
    psychological: ['#EBE0FD', '#BF9DFB', '#7B3FE4'],
    social: ['#FFE8CB', '#FFB84D', '#C97600'],
  }
  const dark = {
    biological: ['#0F2E1A', '#1F6E3B', '#34C759'],
    psychological: ['#2A1B48', '#4A3080', '#BF9DFB'],
    social: ['#3A2A0C', '#7A5615', '#FFB84D'],
  }
  const palette = (isLikelyDarkBg(bg) ? dark : light)[domain]
  const idx = intensity >= 0.66 ? 2 : intensity >= 0.34 ? 1 : 0
  return palette[idx]
}

function isLikelyDarkBg(bg: string | undefined): boolean {
  if (!bg || typeof bg !== 'string') return false
  const hex = bg.startsWith('#') ? bg.slice(1) : bg
  if (hex.length < 2) return false
  const r = parseInt(hex.slice(0, 2), 16)
  return Number.isFinite(r) && r < 0x80
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
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heatCell: {
    width: '22.5%',
    aspectRatio: 1.4,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attribution: {
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
})
