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
  const healthAgePerm = useIsFeatureEnabled('HEALTH_AGE')
  const dailyReadPerm = useIsFeatureEnabled('DAILY_READ')

  const readinessEnabled = readinessFlag && readinessPerm
  const healthAgeEnabled = healthAgeFlag && healthAgePerm
  const dailyReadEnabled = dailyReadFlag && dailyReadPerm

  // 2026-08-05 — warm the server-side wellbeing-score cache so the
  // Daily Read wellbeing pillar has data to read.
  useWellbeingScoreWarmer(dailyReadEnabled)

  const enabledCount =
    (readinessEnabled ? 1 : 0) + (healthAgeEnabled ? 1 : 0) + (dailyReadEnabled ? 1 : 0)

  if (enabledCount === 0) return null

  const variant: Variant = enabledCount === 1 ? 'large' : 'compact'

  return (
    <View style={variant === 'large' ? styles.singleColumn : styles.row}>
      {readinessEnabled && <ReadinessTile variant={variant} />}
      {healthAgeEnabled && <HealthAgeTile variant={variant} />}
      {dailyReadEnabled && <DailyReadTile variant={variant} />}
    </View>
  )
}

export const HeroInsightsRow = React.memo(HeroInsightsRowBase)
HeroInsightsRow.displayName = 'HeroInsightsRow'
export default HeroInsightsRow

// ─── Readiness tile ──────────────────────────────────────────────────
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

// ─── Health Age tile ─────────────────────────────────────────────────
function HealthAgeTile({ variant }: { variant: Variant }): React.JSX.Element {
  const flag = useHealthAgeFlag()
  const { data } = useHealthAge(flag)
  const overall = data?.overall ?? null
  const hasScore = typeof overall === 'number' && Number.isFinite(overall)
  const bandTokens = data?.band ? HEALTH_AGE_BANDS[data.band] : null

  return (
    <Tile
      variant={variant}
      label="Health Age"
      onPress={() => router.push('/Home/health-age' as never)}
      accessibilityLabel={
        hasScore
          ? `Health age ${Math.round(overall as number)}${bandTokens ? ', ' + bandTokens.label : ''}`
          : 'Health age not available yet'
      }
      body={
        hasScore ? (
          <Ready number={Math.round(overall as number)} chip={bandTokens} variant={variant} />
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
}: {
  number: number
  chip: { fg: string; bg: string; label: string } | null
  variant: Variant
}): React.JSX.Element {
  const scoreStyle = variant === 'large' ? styles.scoreNumberLarge : styles.scoreNumber
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

function Empty({ hint, variant }: { hint: string; variant: Variant }): React.JSX.Element {
  const bigStyle = variant === 'large' ? styles.emptyBigLarge : styles.emptyBig
  return (
    <View style={styles.body}>
      <Text style={bigStyle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        —
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
    marginBottom: 12,
  },
  singleColumn: {
    // No flexDirection:row so the single tile stretches to fill container width.
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
