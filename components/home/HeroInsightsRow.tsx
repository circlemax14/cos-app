/**
 * components/home/HeroInsightsRow.tsx — 2026-08-05 design update
 *
 * Row of daily-insights tiles at the top of Home:
 *   Readiness  ·  Health Age  ·  Daily Read
 *
 * PERMISSION-ADAPTIVE LAYOUT (Vishal, 2026-08-05):
 *   - 0 enabled → returns null (row hidden entirely)
 *   - 1 enabled → renders as a single FULL-WIDTH CARD (variant='large')
 *   - 2 enabled → row of 2 tiles side-by-side (flex:1 splits width)
 *   - 3 enabled → row of 3 tiles side-by-side (current)
 *
 *   Enablement today = the tile's feature flag
 *   (readiness_score_enabled / health_age_enabled / daily_read_enabled),
 *   read via the existing hooks. Wiring these to per-user Care Plan
 *   entitlements is tracked separately (SCRUM-659 line + a follow-up).
 *   Swapping the source is a single line per tile.
 *
 * DATA:
 *   Each tile self-fetches via its existing hook. No new endpoints;
 *   this is a pure layout / visual redesign.
 *
 * TAP:
 *   Readiness → /Home/apple-health (existing "connect" surface).
 *   Health Age → /Home/health-age.
 *   Daily Read → /Home/daily-read.
 *
 * iOS 26.5-hardened envelope: pure View / Text / Pressable /
 * MaterialIcons / StyleSheet.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { useReadinessDerivation } from '@/hooks/use-readiness-derivation'
import { useReadinessScoreFlag } from '@/hooks/use-readiness-score-flag'
import { useHealthAge } from '@/hooks/use-health-age'
import { useHealthAgeFlag } from '@/hooks/use-health-age-flag'
import { useDailyRead } from '@/hooks/use-daily-read'
import { useDailyReadFlag } from '@/hooks/use-daily-read-flag'
import { useCanRender } from '@/hooks/use-entitlement'
import { useScoreCatalog } from '@/hooks/use-score-catalog'
import { pickWellbeingDisplayScore } from '@/lib/wellbeing-display-score'
import { useWellbeingScoreEndpoint } from '@/hooks/use-wellbeing-history'
import { ScoreRing } from '@/components/home/ScoreRing'
import { positionOf } from '@/lib/dial-geometry'
import { useWellbeingScoreWarmer } from '@/hooks/use-wellbeing-score-warmer'
import { useIsFeatureEnabled } from '@/hooks/use-feature-permissions'

type Variant = 'compact' | 'large'

// ─── Band-color tokens (WCAG-AA) ─────────────────────────────────────
const READINESS_BANDS: Record<string, { fg: string; bg: string; label: string }> = {
  optimal:      { fg: '#0F6B36', bg: '#E6F4EC', label: 'OPTIMAL' },
  developing:   { fg: '#0B6963', bg: '#E0F2F1', label: 'DEVELOPING' },
  foundational: { fg: '#8A5100', bg: '#FDF3E4', label: 'FOUNDATIONAL' },
  initial:      { fg: '#B23A48', bg: '#FBE7E9', label: 'INITIAL' },
}
const HEALTH_AGE_BANDS: Record<string, { fg: string; bg: string; label: string }> = {
  younger:    { fg: '#0F6B36', bg: '#E6F4EC', label: 'YOUNGER' },
  'on-track': { fg: '#0B6963', bg: '#E0F2F1', label: 'ON TRACK' },
  older:      { fg: '#8A5100', bg: '#FDF3E4', label: 'OLDER' },
}
const WELLBEING_BANDS: Record<string, { fg: string; bg: string; label: string }> = {
  optimal:      { fg: '#0F6B36', bg: '#E6F4EC', label: 'OPTIMAL' },
  developing:   { fg: '#0B6963', bg: '#E0F2F1', label: 'DEVELOPING' },
  foundational: { fg: '#8A5100', bg: '#FDF3E4', label: 'FOUNDATIONAL' },
  initial:      { fg: '#5A6270', bg: '#EEF0F2', label: 'INITIAL' },
}
const DAILY_READ_TONES: Record<string, { fg: string; bg: string; label: string }> = {
  positive:  { fg: '#0F6B36', bg: '#E6F4EC', label: 'POSITIVE' },
  steady:    { fg: '#0B6963', bg: '#E0F2F1', label: 'STEADY' },
  attention: { fg: '#8A5100', bg: '#FDF3E4', label: 'ATTENTION' },
  empty:     { fg: '#5A6270', bg: '#EEF0F2', label: 'EMPTY' },
}

// ─── Row shell ───────────────────────────────────────────────────────
function HeroInsightsRowBase(): React.JSX.Element | null {
  // SCRUM-660 (2026-08-05) — two-layer gate per tile:
  //   1. Global feature flag (readiness_score_enabled, ...) — dark-launch
  //      kill switch. Ops flips this OFF to disable the tile fleet-wide.
  //   2. Per-user feature permission (READINESS_SCORE, ...) — care-manager
  //      opts individual patients out even when the global flag is on.
  //   A tile is enabled ONLY when both layers say yes; either layer OFF
  //   hides the tile. This preserves ops kill-switch semantics while
  //   giving care managers per-patient control today AND leaves a clean
  //   swap path for SCRUM-659 plan-derived entitlements later.
  const readinessFlag = useReadinessScoreFlag()
  const healthAgeFlag = useHealthAgeFlag()
  const dailyReadFlag = useDailyReadFlag()
  const readinessPerm = useIsFeatureEnabled('READINESS_SCORE')
  const dailyReadPerm = useIsFeatureEnabled('DAILY_READ')

  /*
   * COS-748 — the two tiles Ken asked for are now PLAN-driven.
   *
   * They were gated on `cos-feature-permissions` (useIsFeatureEnabled), a
   * separate system from entitlements with its own table and its own admin
   * screen. So a plan could tick "Health Age" and nothing happened: the tile
   * was reading a different source entirely. The swap was always intended —
   * see the SCRUM-659 note at the top of this file.
   *
   * Wellbeing had NO permission layer at all and rendered unconditionally.
   *
   * `useCanRender` treats the wildcard as a grant, and the wildcard is exactly
   * what prod and staging return while plan_tier_enabled is unset there. So
   * this is inert everywhere enforcement is off and only bites on dev, which
   * is the point of migrating this way rather than in one cutover.
   */
  const healthAgePerm = useCanRender('home.health-age-dial')
  const wellbeingPerm = useCanRender('home.wellbeing-score')

  // Still computed so the two-layer gate stays visible in one place, and so
  // restoring the tile to the row is a one-line change (SCRUM-676).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const readinessEnabled = readinessFlag && readinessPerm
  const healthAgeEnabled = healthAgeFlag && healthAgePerm
  const dailyReadEnabled = dailyReadFlag && dailyReadPerm

  // 2026-08-05 — warm the server-side wellbeing-score cache so the
  // Daily Read wellbeing pillar has data to read.
  useWellbeingScoreWarmer(dailyReadEnabled)

  /**
   * Ken 2026-08-14: "we should have only 2 scores, wellbeing score and health
   * age, and in home screen we should have these at top and remove other."
   *
   * So this row is now the TWO SCORES. Readiness and Daily Read no longer sit
   * in it.
   *
   * Neither is deleted:
   *   - Readiness is gated OFF fleet-wide already (readiness_score_enabled),
   *     so it costs nothing to leave the tile in the file, and re-adding it is
   *     one line if Ken changes his mind.
   *   - Daily Read is NOT a score — it is a content card — so it moves to its
   *     own slot on Home rather than disappearing. Ken asked to remove other
   *     SCORES; dropping a daily content card on that basis would be reading
   *     more into the ask than it says.
   *
   * Wellbeing has no dark-launch flag of its own: it reads useScoreCatalog,
   * which is already live everywhere, and the tile renders its own empty
   * state. So it is gated on having something to say rather than on a flag.
   */
  const enabledCount = 1 + (healthAgeEnabled ? 1 : 0);

  const variant: Variant = enabledCount === 1 ? 'large' : 'compact'

  return (
    <View style={variant === 'large' ? styles.singleColumn : styles.row}>
      {wellbeingPerm && <WellbeingTile variant={variant} />}
      {healthAgeEnabled && <HealthAgeTile variant={variant} />}
    </View>
  )
}

export const HeroInsightsRow = React.memo(HeroInsightsRowBase)
HeroInsightsRow.displayName = 'HeroInsightsRow'
export default HeroInsightsRow

// ─── Readiness tile ──────────────────────────────────────────────────
// Kept deliberately after SCRUM-676 removed it from the row: readiness_score_enabled is OFF fleet-wide, so this costs nothing to keep and re-adding the tile to the row is one line.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReadinessTile({ variant }: { variant: Variant }): React.JSX.Element {
  const flag = useReadinessScoreFlag()
  const readiness = useReadinessDerivation(flag)
  const composite = readiness.score?.composite
  const hasScore = typeof composite === 'number' && Number.isFinite(composite)
  const band = readiness.score?.band
  const bandTokens = band ? READINESS_BANDS[band] : null

  return (
    <Tile
      variant={variant}
      label="Readiness"
      // Vishal 2026-08-05: tap → /Home/readiness info screen (was
      // /Home/apple-health which felt jarring — jumping to a raw
      // permissions surface from an insight card).
      onPress={() => router.push('/Home/readiness' as never)}
      accessibilityLabel={
        hasScore
          ? `Readiness ${composite}${bandTokens ? ', ' + bandTokens.label : ''}`
          : 'Readiness score not available yet'
      }
      body={
        hasScore ? (
          <Ready number={composite as number} chip={bandTokens} variant={variant} />
        ) : (
          <Empty
            hint={
              variant === 'large'
                ? 'Connect Apple Health so we can compute HRV, sleep, and heart-rate readings for your daily readiness score.'
                : 'Waiting for HRV / sleep'
            }
            variant={variant}
          />
        )
      }
    />
  )
}

// ─── Wellbeing tile ──────────────────────────────────────────────────
/**
 * Reads the SAME aggregator as WellbeingScoreTile (useScoreCatalog), so the
 * number here and the one on the wellbeing row can never disagree — a patient
 * seeing two different wellbeing scores on one screen would rightly distrust
 * both.
 */
function WellbeingTile({ variant }: { variant: Variant }): React.JSX.Element {
  const catalog = useScoreCatalog()
  const derived = pickWellbeingDisplayScore(catalog)
  /*
   * COS-1041 — THE HOME NUMBER AND THE DETAIL NUMBER WERE DIFFERENT NUMBERS.
   *
   * Ken 2026-09-18: Home read 60, the Wellbeing screen read 51 out of 100,
   * same user, same moment.
   *
   * The header above used to promise these "can never disagree", and it was
   * half right: this tile and WellbeingScoreTile share pickWellbeingDisplayScore,
   * so the two numbers ON HOME always matched. Nothing ever tied either of
   * them to the SCREEN THEY OPEN, and that screen resolves differently:
   *
   *   wellbeing-score.tsx : endpoint?.overall ?? derivation?.composite
   *   here (before)       : catalog.composite ?? mean(catalog.rows)
   *
   * Two independent paths, so two numbers. Worse, the fallback is not a
   * rounding difference — it is the unweighted MEAN of whatever catalog rows
   * happen to be numeric, which drifts further from the composite the more
   * sparse a patient's data is. A patient with three strong rows and no
   * composite sees a flattering average on Home and the real figure one tap
   * later.
   *
   * So Home now reads the SAME endpoint first, in the SAME precedence, and
   * keeps the derived value only as the offline/flag-off fallback that screen
   * also uses. Home already pays for this query — useWellbeingScoreWarmer
   * warms exactly this key above — so this is a cache read, not a new fetch.
   */
  const { data: endpoint } = useWellbeingScoreEndpoint()
  const authoritative =
    typeof endpoint?.overall === 'number' && Number.isFinite(endpoint.overall)
      ? endpoint.overall
      : derived.score
  const composite = authoritative
  const band = endpoint?.band ?? derived.band
  const hasScore = typeof composite === 'number' && Number.isFinite(composite)
  const bandTokens = band ? WELLBEING_BANDS[band] : null
  // COS-1020 — ScoreCatalog has carried `isLoading` all along; this tile just
  // never read it, so a cold derivation rendered as "no check-in yet".
  const isPendingFirstLoad = catalog.isLoading && !hasScore

  return (
    <Tile
      variant={variant}
      label="Wellbeing"
      onPress={() => router.push('/Home/wellbeing-score' as never)}
      accessibilityLabel={
        hasScore
          ? `Wellbeing score ${Math.round(composite as number)}${bandTokens ? ', ' + bandTokens.label : ''}`
          : isPendingFirstLoad
            ? 'Wellbeing score, checking'
            : 'Wellbeing score not available yet'
      }
      body={
        hasScore ? (
          <Ready
            number={Math.round(composite as number)}
            chip={bandTokens}
            variant={variant}
            // 0-100, so progress is the score itself. Matches the detail
            // screen's DialGauge, which uses center=50 span=50.
            ring={{
              progress: (composite as number) / 100,
              color: bandTokens?.fg ?? '#5CBF9A',
              trackColor: 'rgba(127,127,127,0.18)',
            }}
          />
        ) : isPendingFirstLoad ? (
          <Empty
            pending
            hint={variant === 'large' ? 'Checking your latest check-in…' : 'Checking…'}
            variant={variant}
          />
        ) : (
          <Empty
            hint={variant === 'large' ? 'Complete a check-in to see your wellbeing score.' : 'Take a check-in'}
            variant={variant}
          />
        )
      }
    />
  )
}

// ─── Health Age tile ─────────────────────────────────────────────────
function HealthAgeTile({ variant }: { variant: Variant }): React.JSX.Element {
  const flag = useHealthAgeFlag()
  // COS-1020 — `isLoading` (v5) is `isPending && isFetching`, so it is true
  // ONLY during a real first fetch. `isPending` alone would also be true for a
  // DISABLED query — flag off — and would pin this tile on "Checking…" forever.
  const { data, isLoading } = useHealthAge(flag)
  const overall = data?.overall ?? null
  const hasScore = typeof overall === 'number' && Number.isFinite(overall)
  const bandTokens = data?.band ? HEALTH_AGE_BANDS[data.band] : null

  /*
   * COS-1046 — the dial on this tile, matching the detail screen's scale.
   *
   * Health Age is an AGE IN YEARS, not a 0-100 score, so the wellbeing tile's
   * `score / 100` progress would be meaningless here — a health age of 44
   * would fill 44% of a ring whose full turn means nothing.
   *
   * The detail screen centres its DialGauge on the patient's CHRONOLOGICAL
   * age with a +/-10 year span, so half-full reads "your health age matches
   * your real age", and the arc shows how far either side you sit. This
   * reuses `positionOf` from lib/dial-geometry — the exact function that dial
   * calls — rather than re-deriving the mapping, so the two cannot disagree.
   *
   * DRAWN ONLY WHEN BOTH AGES ARE KNOWN. app/Home/health-age.tsx states the
   * rule and this follows it: "a scale with one endpoint missing is
   * decoration, not a measurement." With no chronological age the tile
   * renders the bare number exactly as it does today.
   */
  const chrono = data?.chronologicalAge ?? null
  const HEALTH_AGE_SPAN_YEARS = 10
  const ring =
    hasScore && typeof chrono === 'number' && Number.isFinite(chrono)
      ? {
          progress: positionOf(overall as number, chrono, HEALTH_AGE_SPAN_YEARS),
          color: bandTokens?.fg ?? '#5CBF9A',
          trackColor: 'rgba(127,127,127,0.18)',
        }
      : null

  return (
    <Tile
      variant={variant}
      label="Health Age"
      onPress={() => router.push('/Home/health-age' as never)}
      accessibilityLabel={
        hasScore
          ? `Health age ${Math.round(overall as number)}${bandTokens ? ', ' + bandTokens.label : ''}`
          : isLoading
            ? 'Health age, checking'
            : 'Health age not available yet'
      }
      body={
        hasScore ? (
          <Ready number={Math.round(overall as number)} chip={bandTokens} variant={variant} ring={ring} />
        ) : isLoading ? (
          <Empty
            pending
            hint={variant === 'large' ? 'Checking your latest results…' : 'Checking…'}
            variant={variant}
          />
        ) : (
          <Empty
            hint={
              variant === 'large'
                ? 'Connect your labs through Fasten so we can estimate your health age from recent biomarkers.'
                : 'Connect labs'
            }
            variant={variant}
          />
        )
      }
    />
  )
}

// ─── Daily Read tile ─────────────────────────────────────────────────
// Kept deliberately after SCRUM-676 removed it from the row: Daily Read moved to its own card on Home; this compact variant is kept so it can be put back in the row without rewriting it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DailyReadTile({ variant }: { variant: Variant }): React.JSX.Element {
  const flag = useDailyReadFlag()
  const { data, isError } = useDailyRead(flag)
  const readyCount = (data?.pillars ?? []).filter((p) => p.state === 'ready').length
  const totalCount = (data?.pillars ?? []).length
  const tone = data?.headline.tone ?? null
  const toneTokens = tone ? DAILY_READ_TONES[tone] : null
  const isEmpty = isError || !data || data.empty || totalCount === 0

  return (
    <Tile
      variant={variant}
      label="Daily Read"
      onPress={() => router.push('/Home/daily-read' as never)}
      accessibilityLabel={
        isEmpty
          ? 'Daily read not available yet'
          : `Daily read, ${toneTokens?.label.toLowerCase() ?? 'ready'}, ${readyCount} of ${totalCount} signals`
      }
      body={
        isEmpty ? (
          <Empty
            hint={
              variant === 'large'
                ? 'Once at least one of your signals has data, the daily read will summarize it for you.'
                : 'Connect a signal'
            }
            variant={variant}
          />
        ) : (
          <DailyReadBody
            toneTokens={toneTokens}
            readyCount={readyCount}
            totalCount={totalCount}
            headlineText={data?.headline.text}
            variant={variant}
          />
        )
      }
    />
  )
}

// ─── Shared tile shell ───────────────────────────────────────────────
interface TileProps {
  variant: Variant
  label: string
  onPress: () => void
  accessibilityLabel: string
  body: React.ReactNode
}
function Tile({ variant, label, onPress, accessibilityLabel, body }: TileProps): React.JSX.Element {
  const tileStyle = variant === 'large' ? styles.tileLarge : styles.tile
  const headerLabelStyle = variant === 'large' ? styles.headerLabelLarge : styles.headerLabel
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens details"
      hitSlop={4}
      style={({ pressed }) => [tileStyle, pressed && styles.tilePressed]}
    >
      <View style={styles.headerRow}>
        <Text style={headerLabelStyle} numberOfLines={1}>
          {label}
        </Text>
        <MaterialIcons
          name="chevron-right"
          size={variant === 'large' ? 20 : 16}
          color="#687076"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      {body}
    </Pressable>
  )
}

// ─── Body sub-components ─────────────────────────────────────────────
function Ready({
  number,
  chip,
  variant,
  ring,
}: {
  number: number
  chip: { fg: string; bg: string; label: string } | null
  variant: Variant
  /*
   * COS-1041 — when present, the number is drawn inside a dial instead of
   * bare. Optional rather than always-on because only the two 0-100 SCORES
   * have a meaningful full-circle position; a tile showing a count or an age
   * would be drawing a fraction of nothing.
   */
  ring?: { progress: number; color: string; trackColor: string } | null
}): React.JSX.Element {
  const scoreStyle = variant === 'large' ? styles.scoreNumberLarge : styles.scoreNumber
  const ringSize = variant === 'large' ? 92 : 64

  if (ring) {
    return (
      <View style={styles.body}>
        <ScoreRing
          progress={ring.progress}
          size={ringSize}
          stroke={Math.max(5, Math.round(ringSize * 0.09))}
          color={ring.color}
          trackColor={ring.trackColor}
        >
          <Text style={scoreStyle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {number}
          </Text>
        </ScoreRing>
        {chip && (
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <Text style={[styles.chipText, { color: chip.fg }]} numberOfLines={1} maxFontSizeMultiplier={1.1}>
              {chip.label}
            </Text>
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={styles.body}>
      <Text style={scoreStyle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {number}
      </Text>
      {chip && (
        <View style={[styles.chip, { backgroundColor: chip.bg }]}>
          <Text style={[styles.chipText, { color: chip.fg }]} numberOfLines={1} maxFontSizeMultiplier={1.1}>
            {chip.label}
          </Text>
        </View>
      )}
    </View>
  )
}

function DailyReadBody({
  toneTokens,
  readyCount,
  totalCount,
  headlineText,
  variant,
}: {
  toneTokens: { fg: string; bg: string; label: string } | null
  readyCount: number
  totalCount: number
  headlineText: string | undefined
  variant: Variant
}): React.JSX.Element {
  const toneStyle = variant === 'large' ? styles.toneWordLarge : styles.toneWord
  return (
    <View style={styles.body}>
      <Text style={toneStyle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {toneTokens?.label ?? 'READY'}
      </Text>
      {variant === 'large' && headlineText ? (
        <Text
          style={styles.headlineText}
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
        >
          {headlineText}
        </Text>
      ) : null}
      <Text style={styles.subtle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {readyCount} of {totalCount} signals
      </Text>
    </View>
  )
}

/**
 * COS-1020 — `pending` is the state this tile never had.
 *
 * The body was a BINARY: a score, or the empty state. While the first request
 * was still in flight `data` is undefined, so a patient on a cold Lambda or a
 * slow connection was shown "Connect labs" / "Take a check-in" — which is not
 * merely blank, it is WRONG. It tells someone who has labs that they have none,
 * and invites them to redo work they already did.
 *
 * Deliberately reuses this component rather than adding a skeleton: the iOS 26
 * envelope (ADR-0003) is why Home renders as few primitives as it does, and a
 * third state is a prop, not another wrapper. Same <View><Text><Text>.
 */
function Empty({
  hint,
  variant,
  pending = false,
}: {
  hint: string
  variant: Variant
  pending?: boolean
}): React.JSX.Element {
  const bigStyle = variant === 'large' ? styles.emptyBigLarge : styles.emptyBig
  return (
    <View style={styles.body}>
      <Text style={bigStyle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {pending ? '· · ·' : '—'}
      </Text>
      <Text style={styles.subtle} numberOfLines={variant === 'large' ? 3 : 2} maxFontSizeMultiplier={1.2}>
        {hint}
      </Text>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    // Vishal 2026-08-05: match Health Trends banner + appointments
    // section horizontal edge (16pt) so all Home cards align.
    marginHorizontal: 16,
    marginBottom: 12,
  },
  singleColumn: {
    // No flexDirection:row so the single tile stretches to fill container width.
    marginHorizontal: 16,
    marginBottom: 12,
  },
  tile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 118,
  },
  tileLarge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 180,
  },
  tilePressed: { opacity: 0.7 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#11181C',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  headerLabelLarge: {
    fontSize: 15,
    fontWeight: '600',
    color: '#11181C',
    letterSpacing: 0,
    flexShrink: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  scoreNumber: {
    fontSize: 34,
    fontWeight: '700',
    color: '#11181C',
    lineHeight: 40,
  },
  scoreNumberLarge: {
    fontSize: 56,
    fontWeight: '700',
    color: '#11181C',
    lineHeight: 64,
  },
  toneWord: {
    fontSize: 18,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  toneWordLarge: {
    fontSize: 26,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  headlineText: {
    fontSize: 14,
    color: '#3D444C',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  chip: {
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'center',
  },
  chipText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  emptyBig: {
    fontSize: 34,
    fontWeight: '700',
    color: '#C7CBD1',
    lineHeight: 40,
  },
  emptyBigLarge: {
    fontSize: 56,
    fontWeight: '700',
    color: '#C7CBD1',
    lineHeight: 64,
  },
  subtle: {
    fontSize: 11,
    color: '#687076',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 4,
  },
})
