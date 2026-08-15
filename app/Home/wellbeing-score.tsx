/**
 * app/Home/wellbeing-score.tsx — Ken 2026-08-06 (Wellbeing V2 Phase 2b).
 *
 * Dedicated detail screen for the composite wellbeing score. Reached
 * from WellbeingScoreTile on Home. Complements (does not replace) the
 * existing /Home/wellbeing-map screen, which visualizes BPS-subdomain
 * coverage — a different concern than the score's trend + drivers.
 *
 * Layout (top to bottom):
 *   1. Header row (back + "Wellbeing" title, aligned)
 *   2. Big score number + colored trend arrow + delta ("↑ +4")
 *   3. Band chip ("Developing")
 *   4. Range toggle (3d / 7d / 30d / 90d)
 *   5. Sparkline over the selected range
 *   6. "What's driving this" — per-component breakdown from the
 *      /wellbeing-score endpoint (self-assessments / sleep / adherence)
 *      with each component's score + weight + freshness caption
 *   7. "Why did it change" narrative — client-computed diff between
 *      current and oldest bucket in the range, plain-english
 *
 * Data sources (both failure-tolerant):
 *   - useWellbeingScoreEndpoint (fetchWellbeingScore) → components[]
 *   - useWellbeingHistory(rangeDays) → buckets[]
 *   - useWellbeingDerivation → trend arrow (client-side, works even
 *     when the endpoint 404s pre-flag-flip)
 *
 * iOS 26.5-safe primitive envelope (View / Text / Pressable /
 * MaterialIcons / StyleSheet / ScrollView). No SVG.
 */

import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { ScoreBandChip } from '@/components/home/ScoreBandChip'
import { ScoreHistorySparkline } from '@/components/home/ScoreHistorySparkline'
import { useWellbeingDerivation } from '@/hooks/use-wellbeing-derivation'
import {
  useWellbeingHistory,
  useWellbeingScoreEndpoint,
} from '@/hooks/use-wellbeing-history'
import type { WellbeingComponent } from '@/services/api/wellbeing-score'
import {
  trendIconName,
  trendTone,
  trendLabel,
  trendA11yLabel,
  TREND_TONE_COLOR,
} from '@/lib/wellbeing-trend'
import { scoreToBand } from '@/hooks/use-score-catalog'

const RANGE_OPTIONS: Array<{ label: string; days: number }> = [
  { label: '3d', days: 3 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

const COMPONENT_LABEL: Record<WellbeingComponent['name'], string> = {
  'self-assessments': 'Assessments',
  'sleep': 'Sleep',
  'adherence': 'Task adherence',
  'lab-results': 'Lab results',
  'wearables': 'Wearables',
  'wellness-wheel': 'Wellness wheel',
}

const COMPONENT_HINT: Record<WellbeingComponent['name'], string> = {
  'self-assessments': 'Your self-reported check-ins',
  'sleep': 'Rolling 7-day mean from Apple Health',
  'adherence': '% of care-plan tasks completed this week',
  'lab-results': 'Recent bloodwork and vitals — coming soon',
  'wearables': 'Steps, heart rate, and activity — coming soon',
  'wellness-wheel': '',
}

export default function WellbeingScoreDetailScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const [rangeDays, setRangeDays] = React.useState<number>(7)
  const { data: history } = useWellbeingHistory(rangeDays)
  const { data: endpoint } = useWellbeingScoreEndpoint()
  const { derivation } = useWellbeingDerivation()

  // The endpoint (V2) is authoritative for the composite score when
  // present. Client-side derivation is the fallback when the flag is
  // off or the endpoint fails — same graceful-degradation pattern the
  // Home tile uses.
  const composite = endpoint?.overall ?? derivation?.composite ?? undefined
  const band = endpoint?.band ?? scoreToBand(composite)
  const trend = derivation?.trend

  // Sparkline series from history buckets. Missing/null overalls are
  // dropped so a sparse cache doesn't misrepresent as a run of zeros.
  const seriesFromHistory = React.useMemo(() => {
    const buckets = history?.buckets ?? []
    return buckets
      .filter((b): b is typeof b & { overall: number } => typeof b.overall === 'number')
      .map((b) => b.overall)
  }, [history])

  // "Why did it change" — client-side compare of current vs oldest bucket
  // in the selected range. Only meaningful when we have both endpoints
  // (≥2 real points). Returns a short plain-english line or null.
  const whyLine = React.useMemo(() => {
    if (seriesFromHistory.length < 2) return null
    const oldest = seriesFromHistory[0]
    const newest = seriesFromHistory[seriesFromHistory.length - 1]
    const delta = Math.round(newest - oldest)
    if (Math.abs(delta) < 1) return null
    const rangeLabel =
      RANGE_OPTIONS.find((r) => r.days === rangeDays)?.label ?? `${rangeDays}d`
    if (delta > 0) return `Up ${delta} points across the last ${rangeLabel}.`
    return `Down ${Math.abs(delta)} points across the last ${rangeLabel}.`
  }, [seriesFromHistory, rangeDays])

  return (
    <AppWrapper>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            Wellbeing
          </Text>
        </View>

        {/* Hero — big number + trend arrow + band chip */}
        <View style={[styles.hero, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
          <View style={styles.heroTopRow}>
            <Text style={[styles.heroNumber, { color: colors.text }]} maxFontSizeMultiplier={1.3}>
              {typeof composite === 'number' ? composite : '—'}
            </Text>
            <Text style={[styles.heroScale, { color: colors.subtext }]} maxFontSizeMultiplier={1.3}>
              /100
            </Text>
          </View>
          {trend ? (
            <View
              style={styles.heroTrendRow}
              accessible
              accessibilityLabel={trendA11yLabel(trend.arrow, trend.delta)}
            >
              <MaterialIcons
                name={trendIconName(trend.arrow)}
                size={18}
                color={TREND_TONE_COLOR[trendTone(trend.arrow)]}
              />
              <Text
                style={[
                  styles.heroTrendLabel,
                  { color: TREND_TONE_COLOR[trendTone(trend.arrow)] },
                ]}
                maxFontSizeMultiplier={1.3}
              >
                {trendLabel(trend.arrow, trend.delta)}
              </Text>
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(12),
                  marginLeft: 8,
                }}
                maxFontSizeMultiplier={1.3}
              >
                vs last week
              </Text>
            </View>
          ) : null}
          <View style={styles.heroChipRow}>
            <ScoreBandChip band={band} />
          </View>
        </View>

        {/* Range toggle */}
        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((opt) => {
            const active = opt.days === rangeDays
            return (
              <Pressable
                key={opt.days}
                onPress={() => setRangeDays(opt.days)}
                style={({ pressed }) => [
                  styles.rangeBtn,
                  {
                    backgroundColor: active
                      ? (colors.tint as string) + '22'
                      : 'transparent',
                    borderColor: active ? (colors.tint as string) : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${opt.days}-day range`}
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={{
                    color: active ? (colors.tint as string) : colors.text,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(active ? 700 : 500) as any,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Sparkline */}
        <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
          <Text
            style={[
              styles.cardLabel,
              { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            LAST {rangeDays === 3 ? '3 DAYS' : `${rangeDays} DAYS`}
          </Text>
          {seriesFromHistory.length >= 2 ? (
            <>
              <View style={styles.chartWrap}>
                <ScoreHistorySparkline
                  series={seriesFromHistory}
                  accessibilityLabel={`Wellbeing score, last ${rangeDays} days`}
                  band={band}
                  // Reference zones behind the bars. The wellbeing score IS a
                  // 0-100 on the ScoreBands scale, so the four zones are
                  // literally its own bands made visible — a bar now says
                  // where you are, not just "taller than yesterday".
                  showBands
                />
              </View>
              {whyLine ? (
                <Text
                  style={{
                    marginTop: 10,
                    color: colors.text,
                    fontSize: getScaledFontSize(13),
                    lineHeight: 19,
                  }}
                >
                  {whyLine}
                </Text>
              ) : null}
            </>
          ) : (
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                lineHeight: 19,
                paddingVertical: 8,
              }}
            >
              Your history builds up as you check in. Come back tomorrow to see this fill in.
            </Text>
          )}
        </View>

        {/* What's driving this */}
        {endpoint?.components && endpoint.components.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card as string, borderColor: colors.border as string }]}>
            <Text
              style={[
                styles.cardLabel,
                { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any },
              ]}
            >
              WHAT'S DRIVING THIS
            </Text>
            {endpoint.components.map((comp) => {
              const label = COMPONENT_LABEL[comp.name] ?? comp.name
              const hint = COMPONENT_HINT[comp.name]
              const isActive = typeof comp.score === 'number'
              const weightPct = Math.round(comp.weight * 100)
              return (
                <View key={comp.name} style={styles.compRow}>
                  <View style={styles.compRowMain}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: getScaledFontSize(14),
                          fontWeight: getScaledFontWeight(600) as any,
                        }}
                      >
                        {label}
                      </Text>
                      {hint ? (
                        <Text
                          style={{
                            color: colors.subtext,
                            fontSize: getScaledFontSize(12),
                            marginTop: 2,
                          }}
                        >
                          {hint}
                        </Text>
                      ) : null}
                    </View>
                    {isActive ? (
                      <View style={styles.compScoreCol}>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: getScaledFontSize(18),
                            fontWeight: getScaledFontWeight(700) as any,
                          }}
                        >
                          {comp.score}
                        </Text>
                        <Text
                          style={{
                            color: colors.subtext,
                            fontSize: getScaledFontSize(11),
                          }}
                        >
                          {weightPct}% weight
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={{
                          color: colors.subtext,
                          fontSize: getScaledFontSize(12),
                          fontStyle: 'italic',
                          maxWidth: 130,
                          textAlign: 'right',
                        }}
                      >
                        No data yet
                      </Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        ) : null}

        {/* Entry points restored 2026-08-14.
            Removing the Home cards (SCRUM-676 follow-up) took away the ONLY
            live links to these two screens — they still existed and still
            worked, but nothing routed to them. This is where the wellbeing map
            belongs anyway: the patient is already looking at the score it
            breaks down. Daily Read sits here rather than nowhere. */}
        <View style={{ marginTop: 8, gap: 8 }}>
          {([
            { label: 'Explore your wellbeing map', hint: 'See the areas behind this score', to: '/Home/wellbeing-map', icon: 'donut-large' as const },
            { label: 'Your daily read', hint: 'Today’s short summary', to: '/Home/daily-read', icon: 'auto-stories' as const },
          ]).map((row) => (
            <Pressable
              key={row.to}
              onPress={() => router.push(row.to as never)}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              accessibilityHint={row.hint}
              hitSlop={6}
              style={({ pressed }) => [
                styles.navRow,
                { borderColor: colors.border, backgroundColor: (colors.card as string) + 'D9', opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <MaterialIcons name={row.icon} size={getScaledFontSize(20)} color={colors.tint as string} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as never }}>
                  {row.label}
                </Text>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 1 }}>
                  {row.hint}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={colors.subtext as string} />
            </Pressable>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </AppWrapper>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 14,
    marginLeft: -8,
    gap: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { letterSpacing: -0.4 },
  hero: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heroNumber: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  heroScale: {
    fontSize: 18,
    fontWeight: '500',
    marginLeft: 4,
  },
  heroTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  heroTrendLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
    fontVariant: ['tabular-nums'],
  },
  heroChipRow: {
    marginTop: 10,
    alignItems: 'center',
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardLabel: {
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  chartWrap: {
    paddingTop: 4,
  },
  compRow: {
    paddingVertical: 10,
  },
  compRowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  compScoreCol: {
    alignItems: 'flex-end',
  },
})
