/**
 * SCRUM-642 — Health Age detail screen.
 *
 * Gated by `useHealthAgeFlag()`. Flag OFF (dark launch) → this screen
 * is unreachable via any surface and direct-nav renders a "not
 * available" state (mirror of app/Home/glucose.tsx).
 *
 * Layout (top → bottom):
 *   1. Hero: Health Age number + band + chronological-age delta line
 *   2. Trend: range toggle (7d / 30d / 90d) + sparkline of the GAP
 *      between Health Age and actual age over time
 *   3. "How to improve your health age" — derived from the engine's own
 *      component output (what it used, what it's missing, what's adding
 *      years). Lifestyle framing only; never medication or diagnosis.
 *   4. Contributing biomarkers accordion — per-component PHI values
 *      (visible ONLY inside this drilldown, never on the Home tile)
 *   5. Methodology accordion — Legal-approved disclaimer copy
 *
 * Terminology (Legal): "Health Age" only. Never "Biological Age".
 * Do NOT rename copy without a Legal-cleared answer to the
 * disclaimer_copy.legal_ask in the DESIGN doc.
 *
 * iOS 26.5-hardened envelope: pure View / Text / Pressable /
 * MaterialIcons / StyleSheet. No Animated, no LayoutAnimation
 * (accordion is a plain conditional-render), no ActivityIndicator.
 * The sparkline reuses components/home/ScoreHistorySparkline.tsx, which
 * is plain <View> bars — no SVG, no new native dependency.
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
import { useHealthAgeHistoryBuckets } from '@/hooks/use-health-age-history'
import { ScoreHistorySparkline } from '@/components/home/ScoreHistorySparkline'
import type { ScoreBandName } from '@/constants/design-system'
import type { HealthAgeHistoryBucket } from '@/services/api/health-age-history'
import type {
  HealthAgeBand,
  HealthAgeComponent,
  HealthAgeResult,
} from '@/services/api/health-age'

const DISCLAIMER =
  'Health Age is a wellness estimate derived from your recent labs and vitals compared to population norms. It is not a diagnosis, not a medical device output, and is not intended to detect, treat, cure, or prevent disease.'

/**
 * Extra line that rides with the improvement section. The disclaimer
 * above covers "not a diagnosis"; this one covers the other half of the
 * Legal ask — that nothing here is medication guidance.
 */
const NO_MEDICATION_ADVICE =
  'These are general wellness ideas, not medical advice. Nothing here tells you to start, stop, or change any medicine — only your clinician can do that. Bring anything that concerns you to your care team.'

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

// ─── Trend (range toggle + delta sparkline) ─────────────────────────

const RANGE_OPTIONS: readonly { label: string; days: number; spoken: string }[] = [
  { label: '7d', days: 7, spoken: '7 days' },
  { label: '30d', days: 30, spoken: '30 days' },
  { label: '90d', days: 90, spoken: '90 days' },
]

/**
 * Half-width of the sparkline's y-axis, in years of gap.
 *
 * ScoreHistorySparkline speaks 0-100 (taller bar = bigger number), so we
 * project the gap into that space with 0 years of gap sitting at the
 * midpoint: gap -10y → bar 0, gap 0 → bar 50, gap +10y → bar 100.
 *
 * ±10 years covers essentially every real PhenoAge gap while keeping
 * ordinary movement (1-3 years) visible rather than squashed flat. Gaps
 * beyond the window clamp to the top/bottom bar instead of overflowing.
 *
 * NOTE THE DIRECTION: a TALLER bar means a HIGHER Health Age relative to
 * actual age, i.e. WORSE. That is the opposite of every other chart in
 * the app, which is exactly why the card carries an explicit
 * "shorter bars are better" sentence rather than relying on the shape.
 */
const DELTA_AXIS_YEARS = 10

function deltaToBarValue(delta: number): number {
  const v = ((delta + DELTA_AXIS_YEARS) / (DELTA_AXIS_YEARS * 2)) * 100
  if (v < 0) return 0
  if (v > 100) return 100
  return v
}

/**
 * ScoreHistorySparkline renders exactly SPARKLINE_BARS bars and, given a
 * longer array, keeps only the NEWEST that many. Handing it a raw 90-day
 * series would therefore draw the last 7 days no matter which range the
 * patient picked — the toggle would look broken.
 *
 * So we downsample to at most SPARKLINE_BARS evenly-spaced samples that
 * always include the oldest and newest points. The chart then genuinely
 * spans the chosen window. This is nearest-sample selection, not
 * averaging: every bar is a real day's reading, so nothing on screen is
 * a synthesised value.
 */
const SPARKLINE_BARS = 7

function downsample(values: number[], target: number = SPARKLINE_BARS): number[] {
  if (values.length <= target) return values
  const out: number[] = []
  const lastIndex = values.length - 1
  for (let i = 0; i < target; i += 1) {
    // i / (target - 1) walks 0 → 1 inclusive, so index 0 and the final
    // index are always sampled.
    const idx = Math.round((i / (target - 1)) * lastIndex)
    out.push(values[idx])
  }
  return out
}

/**
 * Colour band for the sparkline, chosen from the MOST RECENT gap. Used
 * for hue only — the band's own label ("Optimal" etc.) belongs to the
 * wellbeing vocabulary and is deliberately never shown here. Colour is
 * always paired with the written trend sentence below the chart, so a
 * patient who cannot distinguish these hues loses nothing.
 */
function bandForDelta(delta: number | null): ScoreBandName {
  if (delta == null) return 'developing'
  if (delta <= -2) return 'optimal'
  if (delta < 2) return 'developing'
  if (delta < 5) return 'foundational'
  return 'initial'
}

function formatYears(v: number): string {
  const abs = Math.abs(v)
  return `${abs.toFixed(1)} ${abs === 1 ? 'year' : 'years'}`
}

interface TrendNarrative {
  icon: 'arrow-downward' | 'arrow-upward' | 'trending-flat'
  tone: string
  /** Short headline, e.g. "Down 1.4 years". Always paired with `detail`. */
  headline: string
  detail: string
}

/**
 * Plain-English narrative for the change in gap across the window.
 *
 * Deliberately cautious wording on the "up" case: lab-driven scores move
 * slowly and a single new panel can shift the estimate. We say that out
 * loud rather than implying the patient got worse.
 */
function describeTrend(
  oldestDelta: number,
  newestDelta: number,
  rangeSpoken: string,
): TrendNarrative {
  const change = Math.round((newestDelta - oldestDelta) * 10) / 10
  if (change <= -0.1) {
    return {
      icon: 'arrow-downward',
      tone: '#0F6B36',
      headline: `Down ${formatYears(change)}`,
      detail: `Your gap narrowed by ${formatYears(change)} over the last ${rangeSpoken}. Down is the direction you want.`,
    }
  }
  if (change >= 0.1) {
    return {
      icon: 'arrow-upward',
      tone: '#8A5100',
      headline: `Up ${formatYears(change)}`,
      detail: `Your gap widened by ${formatYears(change)} over the last ${rangeSpoken}. Lab-based estimates move slowly, so one new result can shift this — it is a trend to watch, not a verdict.`,
    }
  }
  return {
    icon: 'trending-flat',
    tone: '#687076',
    headline: 'Steady',
    detail: `Your gap held steady over the last ${rangeSpoken}.`,
  }
}

// ─── "How to improve" levers ────────────────────────────────────────

/**
 * Per-biomarker lifestyle levers, keyed by the EXACT biomarker names the
 * scoring engine emits (see cos-backend scoring-engine.ts BiomarkerName
 * and coefficients.defaults.ts — albumin, creatinine, glucose, crp,
 * lymphocytePercent, meanCellVolume, redCellDistWidth,
 * alkalinePhosphatase, whiteBloodCellCount).
 *
 * COPY RULES (Legal + our patients skew older):
 *   - Plain English, short sentences, no jargon without a gloss.
 *   - Everyday actions only — food, movement, sleep, water, dentistry.
 *   - NO medication guidance of any kind, including "ask about a statin".
 *   - NO diagnostic claim: we never say a value is high, low, abnormal,
 *     or indicates a condition. We only say this marker is currently
 *     adding years to the estimate, which is arithmetic, not diagnosis.
 *   - Anything clinical routes to "mention it to your care team".
 */
const IMPROVEMENT_LEVERS: Record<string, { title: string; body: string }> = {
  glucose: {
    title: 'Blood sugar',
    body: 'A short walk after meals and swapping sweet drinks for water are the two changes people find easiest to keep up.',
  },
  crp: {
    title: 'Inflammation',
    body: 'Regular sleep, gentle daily movement, and looking after your teeth and gums all help settle this marker.',
  },
  albumin: {
    title: 'Protein in your blood',
    body: 'Try to include a protein food at every meal — eggs, fish, beans, yoghurt or cheese. Appetite often drops with age, so little and often works well.',
  },
  creatinine: {
    title: 'Kidney workload',
    body: 'Drinking water steadily through the day helps. This one is worth mentioning to your care team at your next visit.',
  },
  lymphocytePercent: {
    title: 'Immune cells',
    body: 'Steady sleep, gentle activity, and keeping up with the vaccinations your clinician recommends all support a stable immune picture.',
  },
  whiteBloodCellCount: {
    title: 'White blood cells',
    body: 'Sleep and gentle daily activity help here. If you have had a recent infection this can move on its own — mention it to your care team.',
  },
  meanCellVolume: {
    title: 'Red blood cell size',
    body: 'Foods rich in folate and vitamin B12 — leafy greens, beans, eggs, dairy, or fortified cereals — support healthy red blood cells.',
  },
  redCellDistWidth: {
    title: 'Red blood cell variation',
    body: 'Iron, folate and B12 from food matter here: leafy greens, beans, lean meat or fortified cereals. Worth raising with your care team too.',
  },
  alkalinePhosphatase: {
    title: 'Liver and bone marker',
    body: 'Weight-bearing walking supports bone, and keeping alcohol low supports the liver. Mention any change here to your care team.',
  },
}

/** Generic levers shown when nothing specific is adding years. */
const GENERAL_LEVERS: readonly { title: string; body: string }[] = [
  {
    title: 'Keep moving most days',
    body: 'Even a 10-minute walk counts. Regular gentle movement is the single most reliable thing people can do for these markers.',
  },
  {
    title: 'Protect your sleep',
    body: 'A steady bedtime and wake time does more for these numbers than any one night of long sleep.',
  },
  {
    title: 'Eat enough protein and vegetables',
    body: 'Protein at each meal and colour on the plate support several of the markers used in this estimate.',
  },
]

interface ImprovementItem {
  key: string
  title: string
  body: string
  /** Right-hand caption, e.g. "adds 1.2 yrs" or "not measured yet". */
  note: string
}

/**
 * Build the improvement list from what the ENGINE actually did, not from
 * a static content list:
 *
 *   1. Components the engine could not use ('missing' / 'stale') become a
 *      single "fill in the gaps" item — the highest-leverage action is
 *      always getting the estimate more data, since the engine needs at
 *      least three usable markers before it will return a number at all.
 *   2. Components it DID use whose contribution is positive (adding years
 *      to the estimate) become per-marker lifestyle items, biggest first,
 *      capped at three so the screen stays actionable.
 *   3. If nothing is adding years, fall back to the general levers with
 *      an explicit "nothing is pulling your estimate up right now".
 *
 * We never label a value high/low/abnormal — "adds N yrs" is a statement
 * about this arithmetic model, which is what the accordion above already
 * shows.
 */
function buildImprovementItems(result: HealthAgeResult | undefined): {
  items: ImprovementItem[]
  allGood: boolean
} {
  const components = result?.components ?? []
  const items: ImprovementItem[] = []

  const unusable = components.filter((c) => c.status !== 'fresh')
  if (unusable.length > 0) {
    const names = unusable.slice(0, 4).map((c) => labelFor(c.name).toLowerCase())
    const more = unusable.length > 4 ? `, and ${unusable.length - 4} more` : ''
    items.push({
      key: '__missing__',
      title: 'Fill in the missing results',
      body: `We do not have a recent ${names.join(', ')}${more}. Connecting your health records, or asking your care team about routine blood work at your next visit, gives this estimate more to work with.`,
      note: `${unusable.length} not counted`,
    })
  }

  const addingYears = components
    .filter(
      (c) =>
        c.status === 'fresh' &&
        typeof c.contributionYears === 'number' &&
        c.contributionYears > 0.1 &&
        IMPROVEMENT_LEVERS[c.name] !== undefined,
    )
    .sort((a, b) => (b.contributionYears ?? 0) - (a.contributionYears ?? 0))
    .slice(0, 3)

  for (const c of addingYears) {
    const lever = IMPROVEMENT_LEVERS[c.name]
    items.push({
      key: c.name,
      title: lever.title,
      body: lever.body,
      note: `adds ${(c.contributionYears ?? 0).toFixed(1)} yrs`,
    })
  }

  if (addingYears.length === 0) {
    for (const lever of GENERAL_LEVERS) {
      items.push({ key: lever.title, title: lever.title, body: lever.body, note: '' })
    }
  }

  return { items, allGood: addingYears.length === 0 && unusable.length === 0 }
}

// ─── Screen ─────────────────────────────────────────────────────────

export default function HealthAgeScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const flagEnabled = useHealthAgeFlag()
  const { data, isLoading } = useHealthAge()

  // Trend range. 30d is the default because Health Age is lab-driven —
  // 7d rarely contains two distinct lab draws, so a shorter default
  // would show a flat line to most patients on first open.
  const [rangeDays, setRangeDays] = React.useState<number>(30)
  const { data: history } = useHealthAgeHistoryBuckets(rangeDays)

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

          <TrendCard
            buckets={history?.buckets ?? []}
            rangeDays={rangeDays}
            onSelectRange={setRangeDays}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />

          {/* Reading order: what it is → how it has moved → WHAT IS DRIVING IT
              → what to do → how it is calculated. The driving factors were
              previously collapsed, which put the answer to the screen's
              obvious question behind a tap. */}
          <ContributorCards
            result={data}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />

          <ImprovementSection
            result={data}
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
    <View style={[styles.heroCard, styles.heroCentered, { backgroundColor: colors.card as string }]}>
      {/* CENTRED, and the date sits under the number. Both are Bevel's
          treatment and neither was here before: the hero was left-aligned and
          carried no date at all, so a patient had no idea whether they were
          looking at today's number or one from three weeks ago. On a figure
          that only moves slowly, "as of when" is not decoration. */}
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          fontWeight: getScaledFontWeight(700) as any,
          letterSpacing: 0.6,
          textAlign: 'center',
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
          {/* As-of date, derived from the newest observation feeding any
              component — the result has no top-level timestamp of its own.
              Omitted entirely rather than guessed when nothing is dated:
              a wrong date on a health figure is worse than no date. */}
          {(() => {
            const newest = (result?.components ?? [])
              .map((c) => c.freshness?.newestObservationAt)
              .filter((d): d is string => typeof d === 'string' && d !== '')
              .sort()
              .pop()
            if (!newest) return null
            const d = new Date(newest)
            if (Number.isNaN(d.getTime())) return null
            return (
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(12),
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {`as of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </Text>
            )
          })()}
          {typeof chrono === 'number' ? (
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                marginTop: 8,
                textAlign: 'center',
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

// ─── Trend card (range toggle + delta sparkline) ────────────────────

interface TrendCardProps {
  buckets: HealthAgeHistoryBucket[]
  rangeDays: number
  onSelectRange: (days: number) => void
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

/**
 * Plots the GAP between Health Age and actual age over the selected
 * window — not the Health Age itself. The gap is the number a patient
 * can actually move: chronological age only ever goes up, so a raw
 * Health Age line drifts upward even when someone is doing everything
 * right, which reads as failure. The gap holds still or falls instead.
 *
 * "Lower is better" is stated in words twice (caption + trend sentence)
 * because a descending line meaning "good" is the opposite of every
 * other chart in the app and of most charts anywhere.
 */
function TrendCard({
  buckets,
  rangeDays,
  onSelectRange,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: TrendCardProps): React.JSX.Element {
  const spoken = RANGE_OPTIONS.find((r) => r.days === rangeDays)?.spoken ?? `${rangeDays} days`

  // Drop days with no usable gap BEFORE plotting. A null day means "no
  // snapshot", not "gap of zero" — zero-filling would draw a fake
  // improvement down to the midline.
  const deltas = React.useMemo(
    () =>
      buckets
        .map((b) => b.delta)
        .filter((d): d is number => typeof d === 'number' && Number.isFinite(d)),
    [buckets],
  )

  const series = React.useMemo(
    () => downsample(deltas).map(deltaToBarValue),
    [deltas],
  )
  const newest = deltas.length > 0 ? deltas[deltas.length - 1] : null
  const oldest = deltas.length > 0 ? deltas[0] : null
  const narrative =
    deltas.length >= 2 && oldest != null && newest != null
      ? describeTrend(oldest, newest, spoken)
      : null

  return (
    <View style={[styles.accordionCard, { backgroundColor: colors.card as string }]}>
      <View style={styles.trendBody}>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as any,
            letterSpacing: 0.6,
          }}
        >
          YOUR GAP OVER TIME
        </Text>

        {/* Range toggle. 44pt minimum tap target per accessibility rules. */}
        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((opt) => {
            const active = opt.days === rangeDays
            return (
              <Pressable
                key={opt.days}
                onPress={() => onSelectRange(opt.days)}
                style={({ pressed }) => [
                  styles.rangeBtn,
                  {
                    backgroundColor: active ? `${colors.tint as string}22` : 'transparent',
                    borderColor: active ? (colors.tint as string) : (colors.border as string),
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Show the last ${opt.spoken}`}
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

        {series.length >= 2 ? (
          <>
            <View style={styles.chartWrap}>
              <ScoreHistorySparkline
                series={series}
                band={bandForDelta(newest)}
                // Your actual age. deltaToBarValue maps a zero gap to exactly
                // the midpoint of the axis, so 50 IS that line — it is not a
                // guess or a nice round number.
                //
                // This chart cannot use the score-band zones the wellbeing
                // sparkline uses: its axis runs the other way (taller = older
                // = worse), so higher-is-better bands would state the opposite
                // of the truth. One line answers the only question the chart
                // asks — am I above or below my real age.
                referenceAt={deltaToBarValue(0)}
                accessibilityLabel={`Gap between your Health Age and your actual age over the last ${spoken}. Most recent gap ${
                  newest != null && newest >= 0 ? 'plus' : 'minus'
                } ${newest != null ? formatYears(newest) : 'unknown'}. Lower is better.`}
              />
            </View>

            {/* Explicit direction copy — the chart alone reads backwards. */}
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                lineHeight: 18,
                marginTop: 8,
              }}
            >
              The line across the chart is your actual age. Bars below it mean
              your Health Age is younger than your real age; bars above it mean
              it is older. Shorter is better.
            </Text>

            {narrative ? (
              <View
                style={styles.trendNarrativeRow}
                accessible
                accessibilityLabel={narrative.detail}
              >
                <MaterialIcons
                  name={narrative.icon}
                  size={getScaledFontSize(18)}
                  color={narrative.tone}
                />
                <Text
                  style={{
                    color: narrative.tone,
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(700) as any,
                    marginLeft: 6,
                  }}
                >
                  {narrative.headline}
                </Text>
              </View>
            ) : null}

            {narrative ? (
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(13),
                  lineHeight: 19,
                  marginTop: 4,
                }}
              >
                {narrative.detail}
              </Text>
            ) : null}
          </>
        ) : (
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              lineHeight: 19,
              marginTop: 10,
            }}
          >
            Your trend builds up one day at a time. Once we have a couple of
            days of results, this chart will show whether the gap between your
            Health Age and your real age is narrowing.
          </Text>
        )}
      </View>
    </View>
  )
}

// ─── How to improve your health age ─────────────────────────────────

interface ImprovementProps {
  result: HealthAgeResult | undefined
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

/**
 * Actionable section derived from the engine's own component output —
 * see buildImprovementItems for the selection rules. Rendered open (not
 * an accordion) because it is the point of the screen: the number alone
 * gives a patient nothing to do.
 *
 * Carries BOTH required disclaimers: the standard non-diagnostic
 * DISCLAIMER that this feature already ships, plus NO_MEDICATION_ADVICE,
 * since "how to improve" is the one place a patient might read a
 * suggestion as a prescription.
 */
function ImprovementSection({
  result,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: ImprovementProps): React.JSX.Element | null {
  const { items, allGood } = React.useMemo(() => buildImprovementItems(result), [result])
  if (items.length === 0) return null

  return (
    <View style={[styles.accordionCard, { backgroundColor: colors.card as string }]}>
      <View style={styles.trendBody}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(17),
            fontWeight: getScaledFontWeight(700) as any,
          }}
        >
          How to improve your Health Age
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            lineHeight: 19,
            marginTop: 4,
          }}
        >
          {allGood
            ? 'Nothing is pulling your estimate up right now. These habits keep it that way.'
            : 'Based on the results this estimate actually used, here is where you have the most room.'}
        </Text>

        {items.map((item) => (
          <View key={item.key} style={styles.improveRow}>
            <View style={styles.improveHeaderRow}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(700) as any,
                  flex: 1,
                }}
              >
                {item.title}
              </Text>
              {item.note !== '' ? (
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(11),
                    marginLeft: 8,
                  }}
                >
                  {item.note}
                </Text>
              ) : null}
            </View>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(13),
                lineHeight: 20,
                marginTop: 4,
              }}
            >
              {item.body}
            </Text>
          </View>
        ))}

        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            lineHeight: 16,
            marginTop: 14,
          }}
        >
          {NO_MEDICATION_ADVICE}
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            lineHeight: 16,
            marginTop: 8,
          }}
        >
          {DISCLAIMER}
        </Text>
      </View>
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


/**
 * What is driving the number, as SCANNABLE CARDS rather than a hidden list.
 *
 * ─── WHY THIS EXISTS (2026-08-17) ────────────────────────────────────
 *
 * Vishal asked for this screen to match Bevel. What was shipped first was a
 * reference line on the trend chart (#404) — a real improvement, but a chart
 * detail, and the task was logged as done. It was not.
 *
 * The substantive difference is not the chart. Bevel's whole pattern is
 * "primary number, then the supporting metrics as compact widget cards, each
 * isolating one data point". Ours had the equivalent information — the
 * per-component contributions — collapsed behind an accordion tap, so the
 * answer to "why is my health age 47?" was invisible until you went looking
 * for it. A number nobody can interrogate is a number nobody trusts.
 *
 * ─── ORDERING IS THE DESIGN DECISION HERE ────────────────────────────
 *
 * Sorted by contribution DESCENDING, so whatever is adding the most years
 * comes first. That is the opposite of alphabetical and it is deliberate: the
 * top-left card is the thing most worth acting on, which is the only ordering
 * that makes a glance useful.
 *
 * Neutral and negative contributors still render — a component that is pulling
 * the number DOWN is good news and worth seeing — they simply sort below.
 *
 * ─── CAPPED, AND THE CAP IS NOT COSMETIC ─────────────────────────────
 *
 * Six cards. ADR-0003 traced the iOS 26.5 crashes to render-primitive DENSITY,
 * not to any one component, so an unbounded grid on a patient with a full lab
 * panel would recreate the original condition. The accordion below keeps the
 * complete list, so nothing is hidden — it is paged.
 *
 * iOS 26.5 envelope: View / Text / StyleSheet only.
 */
function ContributorCards({
  result,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: ContributorsProps): React.JSX.Element | null {
  const components = result?.components ?? []
  if (components.length === 0) return null

  const ranked = [...components]
    .sort((a, b) => (b.contributionYears ?? -Infinity) - (a.contributionYears ?? -Infinity))
    .slice(0, 6)

  return (
    <View style={styles.cardsBlock}>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          fontWeight: getScaledFontWeight(700) as any,
          letterSpacing: 0.6,
          marginBottom: 8,
        }}
      >
        WHAT IS DRIVING THIS
      </Text>

      <View style={styles.cardsGrid}>
        {ranked.map((c) => {
          const years = c.contributionYears
          const adds = typeof years === 'number' && years >= 0.1
          const subtracts = typeof years === 'number' && years <= -0.1
          // Colour carries the direction, so the sign is not the only cue —
          // a glance at a grid should not require reading every minus sign.
          const valueColor = adds
            ? '#B4441F'
            : subtracts
              ? '#0F6B36'
              : (colors.subtext as string)

          return (
            <View
              key={c.name}
              style={[styles.contribCard, { backgroundColor: colors.card as string }]}
              accessible
              accessibilityLabel={`${labelFor(c.name)}, ${contributionLabel(years)}${
                c.status === 'fresh' ? '' : `, ${statusChipStyle(c.status).label.toLowerCase()}`
              }`}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(12),
                }}
              >
                {labelFor(c.name)}
              </Text>
              <Text
                style={{
                  color: valueColor,
                  fontSize: getScaledFontSize(19),
                  fontWeight: getScaledFontWeight(700) as any,
                  marginTop: 2,
                }}
              >
                {contributionLabel(years)}
              </Text>
              {/* Only surfaced when it is NOT fresh. A "FRESH" badge on every
                  card is noise, and noise is what stops the one STALE badge
                  from being noticed. */}
              {c.status !== 'fresh' ? (
                <View
                  style={[styles.miniChip, { backgroundColor: statusChipStyle(c.status).bg }]}
                >
                  <Text
                    style={{
                      color: statusChipStyle(c.status).fg,
                      fontSize: getScaledFontSize(9),
                      fontWeight: getScaledFontWeight(700) as any,
                      letterSpacing: 0.4,
                    }}
                  >
                    {statusChipStyle(c.status).label}
                  </Text>
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )
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
  heroCentered: { alignItems: 'center' },
  heroCard: {
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
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
  // Shared padding block for the always-open cards (trend + improve).
  trendBody: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  rangeBtn: {
    // 44pt minimum tap target — our patients skew older and these are
    // the smallest controls on the screen.
    minHeight: 44,
    minWidth: 56,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartWrap: {
    marginTop: 12,
  },
  trendNarrativeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  improveRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000015',
  },
  // ── Contributor cards (Bevel-style widget grid) ──
  cardsBlock: { marginTop: 4, marginBottom: 12 },
  // Two-up via wrap rather than a fixed column count, so the cards reflow at
  // large accessibility text sizes instead of clipping their own values.
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  contribCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 150,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
  },
  miniChip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  improveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})
