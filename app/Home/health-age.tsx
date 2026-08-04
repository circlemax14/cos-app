/**
 * SCRUM-642 — Health Age detail screen.
 *
 * Gated by `useHealthAgeFlag()`. Flag OFF (dark launch) → this screen
 * is unreachable via any surface and direct-nav renders a "not
 * available" state (mirror of app/Home/glucose.tsx).
 *
 * Layout (top → bottom):
 *   1. Hero: Health Age number + band + chronological-age delta line
 *   2. Contributing biomarkers accordion — per-component PHI values
 *      (visible ONLY inside this drilldown, never on the Home tile)
 *   3. Methodology accordion — Legal-approved disclaimer copy
 *
 * Terminology (Legal): "Health Age" only. Never "Biological Age".
 * Do NOT rename copy without a Legal-cleared answer to the
 * disclaimer_copy.legal_ask in the DESIGN doc.
 *
 * iOS 26.5-hardened envelope: pure View / Text / Pressable /
 * MaterialIcons / StyleSheet. No Animated, no LayoutAnimation
 * (accordion is a plain conditional-render), no ActivityIndicator.
 */

import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useHealthAgeFlag } from '@/hooks/use-health-age-flag'
import { useHealthAge } from '@/hooks/use-health-age'
import type {
  HealthAgeBand,
  HealthAgeComponent,
  HealthAgeResult,
} from '@/services/api/health-age'

const DISCLAIMER =
  'Health Age is a wellness estimate derived from your recent labs and vitals compared to population norms. It is not a diagnosis, not a medical device output, and is not intended to detect, treat, cure, or prevent disease.'

const BAND_TOKENS: Record<HealthAgeBand, { fg: string; bg: string; label: string }> = {
  younger:    { fg: '#0F6B36', bg: '#E6F4EC', label: 'YOUNGER' },
  'on-track': { fg: '#0B6963', bg: '#E0F2F1', label: 'ON TRACK' },
  older:      { fg: '#8A5100', bg: '#FDF3E4', label: 'OLDER' },
}

const COMPONENT_LABELS: Record<string, string> = {
  chronologicalAge: 'Chronological age',
  albumin: 'Albumin',
  creatinine: 'Creatinine',
  glucose: 'Glucose',
  crp: 'C-reactive protein',
  lymphocytePercent: 'Lymphocyte %',
  meanCellVolume: 'Mean cell volume',
  redCellDistWidth: 'Red-cell distribution width',
  alkalinePhosphatase: 'Alkaline phosphatase',
  whiteBloodCellCount: 'White-blood-cell count',
  intercept: 'Baseline',
}

function labelFor(name: string): string {
  return COMPONENT_LABELS[name] ?? name
}

function statusChipStyle(status: HealthAgeComponent['status']): { fg: string; bg: string; label: string } {
  if (status === 'fresh') return { fg: '#0F6B36', bg: '#E6F4EC', label: 'FRESH' }
  if (status === 'stale') return { fg: '#8A5100', bg: '#FDF3E4', label: 'STALE' }
  return { fg: '#687076', bg: '#EEF0F2', label: 'MISSING' }
}

function contributionLabel(years: number | null): string {
  if (years == null || !Number.isFinite(years)) return '—'
  const rounded = Math.round(years * 10) / 10
  if (Math.abs(rounded) < 0.1) return 'Neutral'
  return rounded > 0 ? `+${rounded.toFixed(1)} yrs` : `${rounded.toFixed(1)} yrs`
}

function formatFreshness(iso: string | null): string {
  if (!iso) return 'no observations yet'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'no observations yet'
  const days = Math.max(0, Math.round((Date.now() - d.getTime()) / 86_400_000))
  if (days === 0) return 'updated today'
  if (days === 1) return 'updated yesterday'
  if (days < 60) return `updated ${days} days ago`
  const months = Math.round(days / 30)
  return `updated ~${months} mo ago`
}

// ─── Screen ─────────────────────────────────────────────────────────

export default function HealthAgeScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const flagEnabled = useHealthAgeFlag()
  const { data, isLoading } = useHealthAge()

  if (!flagEnabled) {
    return (
      <AppWrapper>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ScreenHeader
            title="Health Age"
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
          <View style={{ padding: 24 }}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>
              This feature is not available yet.
            </Text>
          </View>
        </View>
      </AppWrapper>
    )
  }

  return (
    <AppWrapper>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Health Age"
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <HeroTile
            result={data}
            isLoading={isLoading}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />

          <ContributorsAccordion
            result={data}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />

          <MethodologyAccordion
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />

          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              lineHeight: 16,
              marginTop: 16,
            }}
          >
            {DISCLAIMER}
          </Text>
        </ScrollView>
      </View>
    </AppWrapper>
  )
}

// ─── Header ─────────────────────────────────────────────────────────

interface HeaderProps {
  title: string
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function ScreenHeader({ title, colors, getScaledFontSize, getScaledFontWeight }: HeaderProps): React.JSX.Element {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
      </Pressable>
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(22),
          fontWeight: getScaledFontWeight(700) as any,
          marginLeft: 12,
          flex: 1,
        }}
      >
        {title}
      </Text>
    </View>
  )
}

// ─── Hero tile ──────────────────────────────────────────────────────

interface HeroProps {
  result: HealthAgeResult | undefined
  isLoading: boolean
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function HeroTile({ result, isLoading, colors, getScaledFontSize, getScaledFontWeight }: HeroProps): React.JSX.Element {
  const overall = result?.overall ?? null
  const chrono = result?.chronologicalAge ?? null
  const gap = result?.healthAgeGap ?? null
  const band = result?.band ?? null
  const tokens = band ? BAND_TOKENS[band] : undefined

  return (
    <View style={[styles.heroCard, { backgroundColor: colors.card as string }]}>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          fontWeight: getScaledFontWeight(700) as any,
          letterSpacing: 0.6,
        }}
      >
        YOUR HEALTH AGE
      </Text>
      {typeof overall === 'number' ? (
        <>
          <View style={styles.heroScoreRow}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(56),
                lineHeight: getScaledFontSize(60),
                fontWeight: getScaledFontWeight(800) as any,
                letterSpacing: -1,
              }}
              accessibilityLabel={`Your Health Age is ${Math.round(overall)} years`}
            >
              {Math.round(overall)}
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(16),
                marginLeft: 6,
                marginBottom: 8,
              }}
            >
              yrs
            </Text>
          </View>
          {tokens ? (
            <View style={[styles.chip, { backgroundColor: tokens.bg }]}>
              <Text style={[styles.chipLabel, { color: tokens.fg }]}>{tokens.label}</Text>
            </View>
          ) : null}
          {typeof chrono === 'number' ? (
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                marginTop: 8,
              }}
            >
              vs chronological age {Math.round(chrono)}
              {gap != null && Math.abs(gap) >= 0.1 ? (
                <>
                  {' · '}
                  <Text
                    style={{
                      color: gap > 0 ? '#8A5100' : '#0F6B36',
                      fontWeight: getScaledFontWeight(600) as any,
                    }}
                  >
                    {gap > 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)} yrs
                  </Text>
                </>
              ) : null}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(48),
              fontWeight: getScaledFontWeight(700) as any,
              marginTop: 4,
            }}
          >
            —
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              lineHeight: 19,
              marginTop: 6,
            }}
          >
            {isLoading
              ? 'Calculating your Health Age…'
              : 'Add biomarker data to see your Health Age. Connect a lab or health record so we can compute it.'}
          </Text>
        </>
      )}
    </View>
  )
}

// ─── Contributors accordion ────────────────────────────────────────

interface AccordionProps {
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

interface ContributorsProps extends AccordionProps {
  result: HealthAgeResult | undefined
}

function ContributorsAccordion({
  result,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: ContributorsProps): React.JSX.Element | null {
  const [open, setOpen] = React.useState(false)
  const components = result?.components ?? []
  if (components.length === 0) return null

  return (
    <View style={[styles.accordionCard, { backgroundColor: colors.card as string }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide contributing factors' : 'Show contributing factors'}
        style={styles.accordionHeader}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(600) as any,
            flex: 1,
          }}
        >
          Contributing factors
        </Text>
        <MaterialIcons
          name={open ? 'expand-less' : 'expand-more'}
          size={22}
          color={colors.subtext as string}
        />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {components.map((c) => {
            const chip = statusChipStyle(c.status)
            return (
              <View key={c.name} style={styles.componentRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: getScaledFontSize(13),
                      fontWeight: getScaledFontWeight(600) as any,
                    }}
                  >
                    {labelFor(c.name)}
                  </Text>
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(11),
                      marginTop: 2,
                    }}
                  >
                    {formatFreshness(c.freshness.newestObservationAt)} · {c.freshness.source}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: getScaledFontSize(13),
                      fontWeight: getScaledFontWeight(600) as any,
                    }}
                  >
                    {contributionLabel(c.contributionYears)}
                  </Text>
                  <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
                    <Text style={[styles.statusChipLabel, { color: chip.fg }]}>{chip.label}</Text>
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

// ─── Methodology accordion ─────────────────────────────────────────

function MethodologyAccordion({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: AccordionProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  return (
    <View style={[styles.accordionCard, { backgroundColor: colors.card as string }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide methodology' : 'How is this calculated?'}
        style={styles.accordionHeader}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(600) as any,
            flex: 1,
          }}
        >
          How is this calculated?
        </Text>
        <MaterialIcons
          name={open ? 'expand-less' : 'expand-more'}
          size={22}
          color={colors.subtext as string}
        />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(13),
              lineHeight: 20,
            }}
          >
            Your Health Age blends recent labs and vitals — such as HbA1c,
            albumin, C-reactive protein, and creatinine — with your
            chronological age, using population-scale coefficients derived
            from published aging research. The more fresh signals we have,
            the tighter the estimate.
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              lineHeight: 18,
              marginTop: 10,
            }}
          >
            {DISCLAIMER}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 12,
  },
  heroCard: {
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  chip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  accordionCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  componentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000015',
  },
  statusChip: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  statusChipLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
})
