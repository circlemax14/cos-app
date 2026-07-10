/**
 * Wellbeing map route (COS-430).
 *
 * Read-only visualization of Ken's NovoPsych biopsychosocial diagram over
 * the user's current bio plan: 3 overlapping domain circles, a
 * WELLBEING ♥ marker at the intersection, subdomain "dots" sized by the
 * number of goals hitting each subdomain, and a coverage heatmap below the
 * SVG that flags subdomains not yet addressed.
 *
 * Purely presentational, no new endpoint — derived from `useBiopsychosocialPlan`
 * (same query the plan screen uses) so opening this route is free (cache-hit)
 * once the plan is loaded. Uses `react-native-svg` (already a dep) — same
 * SVG surface used by TrendLineChart, SelfReportedMetricsCard, EntityIcon.
 * No reanimated, no Modal.
 */
import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg'
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

// Layout constants — 300×260 viewBox with three overlapping circles arranged
// in the classic biopsychosocial Venn triangle. Radii + centres chosen so all
// three circles overlap at the middle (WELLBEING).
const VBW = 300
const VBH = 260
const CIRCLE_R = 85
const BIO_C = { x: 105, y: 110 }
const PSY_C = { x: 195, y: 110 }
const SOC_C = { x: 150, y: 180 }
const CENTER = { x: 150, y: 140 }

// Subdomain positions on the Venn — chosen visually so every subdomain sits
// inside its domain circle (or at the overlap for cross-domain items).
const SUBDOMAIN_POS: Record<string, { x: number; y: number }> = {
  genes: { x: 55, y: 75 },
  neurobiology: { x: 90, y: 60 },
  sleep: { x: 65, y: 100 },
  physical_health: { x: 55, y: 130 },
  stress_reactivity: { x: 150, y: 78 },
  beliefs: { x: 235, y: 75 },
  thought_patterns: { x: 250, y: 105 },
  emotions: { x: 240, y: 135 },
  coping: { x: 195, y: 158 },
  relationships: { x: 100, y: 210 },
  social_support: { x: 155, y: 220 },
  life_stressors: { x: 205, y: 200 },
  socioeconomic_status: { x: 200, y: 235 },
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
            Where your goals cluster across the NovoPsych model. Gaps highlight
            subdomains not yet addressed by your plan.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
          <Svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" height={260}>
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

            {/* Domain labels */}
            <SvgText x={35} y={30} fontSize={10} fontWeight="700" fill={DOMAIN_COLOR.biological}>
              BIOLOGICAL
            </SvgText>
            <SvgText x={205} y={30} fontSize={10} fontWeight="700" fill={DOMAIN_COLOR.psychological}>
              PSYCHOLOGICAL
            </SvgText>
            <SvgText x={125} y={255} fontSize={10} fontWeight="700" fill={DOMAIN_COLOR.social}>
              SOCIAL
            </SvgText>

            {/* Central wellbeing marker */}
            <Circle cx={CENTER.x} cy={CENTER.y} r={22} fill="#FFFFFF" stroke="#333" strokeWidth={1} />
            <SvgText
              x={CENTER.x}
              y={CENTER.y - 2}
              fontSize={7}
              textAnchor="middle"
              fontWeight="700"
              fill="#1C1C1E"
            >
              WELLBEING
            </SvgText>
            <SvgText x={CENTER.x} y={CENTER.y + 8} fontSize={9} textAnchor="middle" fill="#FF3B30">
              ♥
            </SvgText>

            {/* Subdomain dots — sized by how many goals hit them */}
            {coverage.map((c) => {
              const pos = SUBDOMAIN_POS[c.key]
              if (!pos) return null
              const r = c.count === 0 ? 3 : 4 + Math.min(6, c.count)
              const fill = c.count === 0 ? DOMAIN_FILL[c.domain] : DOMAIN_COLOR[c.domain]
              const stroke = DOMAIN_COLOR[c.domain]
              return (
                <G key={c.key}>
                  <Circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={c.crossDomain ? 1.2 : 0}
                    strokeDasharray={c.crossDomain ? '2,2' : undefined}
                  />
                </G>
              )
            })}
          </Svg>
        </View>

        {/* Coverage heatmap */}
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
              {gaps.map((g) => g.label).join(', ')} — not yet addressed by any goal. Consider a
              refresh with wider coverage.
            </Text>
          ) : (
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                lineHeight: 17,
                marginTop: 10,
              }}
            >
              Every subdomain has at least one goal. Nicely balanced across the model.
            </Text>
          )}
        </View>

        <Text
          style={[
            styles.attribution,
            { color: colors.subtext, fontSize: getScaledFontSize(10) },
          ]}
        >
          Assessment framework by NovoPsych
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
