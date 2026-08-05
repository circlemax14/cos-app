/**
 * components/home/HeroInsightsRow.tsx — 2026-08-05 design update
 *
 * Compact row of three daily-insights tiles at the top of Home:
 *   Readiness  ·  Health Age  ·  Daily Read
 *
 * Replaces the three full-width cards that lived stacked at the top of
 * Home. Each tile mirrors the WellbeingScoreTile pattern (big number +
 * band chip + tiny label + chevron) so the visual language across all
 * hero tiles on Home is uniform.
 *
 * DATA:
 *   Each tile self-fetches via its existing hook — ReadinessScoreTile
 *   uses useReadinessDerivation, HealthAgeTile uses useHealthAge,
 *   DailyReadTile uses useDailyRead. No new endpoints; this is a pure
 *   layout / visual redesign.
 *
 * TAP:
 *   Readiness → /Home/apple-health (existing "connect" surface — no
 *               dedicated readiness detail yet).
 *   Health Age → /Home/health-age.
 *   Daily Read → /Home/daily-read.
 *
 * FLAG GATING:
 *   Each tile is individually flag-gated; when its flag is off the tile
 *   renders nothing and the row lays out the remaining tiles evenly
 *   (flex:1 per tile). The parent Home is responsible for hiding the
 *   whole row if every tile inside would be off.
 *
 * iOS 26.5-hardened envelope: pure View / Text / Pressable /
 * MaterialIcons / StyleSheet. No Animated / LayoutAnimation /
 * ActivityIndicator.
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
  const readinessEnabled = useReadinessScoreFlag()
  const healthAgeEnabled = useHealthAgeFlag()
  const dailyReadEnabled = useDailyReadFlag()

  const anyEnabled = readinessEnabled || healthAgeEnabled || dailyReadEnabled
  if (!anyEnabled) return null

  return (
    <View style={styles.row}>
      {readinessEnabled && <ReadinessTile />}
      {healthAgeEnabled && <HealthAgeTile />}
      {dailyReadEnabled && <DailyReadTile />}
    </View>
  )
}

export const HeroInsightsRow = React.memo(HeroInsightsRowBase)
HeroInsightsRow.displayName = 'HeroInsightsRow'
export default HeroInsightsRow

// ─── Readiness compact tile ──────────────────────────────────────────
function ReadinessTile(): React.JSX.Element {
  const flag = useReadinessScoreFlag()
  const readiness = useReadinessDerivation(flag)
  const composite = readiness.score?.composite
  const hasScore = typeof composite === 'number' && Number.isFinite(composite)
  const band = readiness.score?.band
  const bandTokens = band ? READINESS_BANDS[band] : null

  return (
    <Tile
      label="Readiness"
      onPress={() => router.push('/Home/apple-health' as never)}
      accessibilityLabel={
        hasScore
          ? `Readiness ${composite}${bandTokens ? ', ' + bandTokens.label : ''}`
          : 'Readiness score not available yet'
      }
      body={
        hasScore ? (
          <Ready number={composite as number} chip={bandTokens} />
        ) : (
          <Empty hint="Waiting for HRV / sleep" />
        )
      }
    />
  )
}

// ─── Health Age compact tile ─────────────────────────────────────────
function HealthAgeTile(): React.JSX.Element {
  const flag = useHealthAgeFlag()
  const { data } = useHealthAge(flag)
  const overall = data?.overall ?? null
  const hasScore = typeof overall === 'number' && Number.isFinite(overall)
  const bandTokens = data?.band ? HEALTH_AGE_BANDS[data.band] : null

  return (
    <Tile
      label="Health Age"
      onPress={() => router.push('/Home/health-age' as never)}
      accessibilityLabel={
        hasScore
          ? `Health age ${Math.round(overall as number)}${bandTokens ? ', ' + bandTokens.label : ''}`
          : 'Health age not available yet'
      }
      body={
        hasScore ? (
          <Ready number={Math.round(overall as number)} chip={bandTokens} />
        ) : (
          <Empty hint="Connect labs" />
        )
      }
    />
  )
}

// ─── Daily Read compact tile ─────────────────────────────────────────
function DailyReadTile(): React.JSX.Element {
  const flag = useDailyReadFlag()
  const { data, isError } = useDailyRead(flag)
  // Ready count = pillars whose state === 'ready'
  const readyCount = (data?.pillars ?? []).filter((p) => p.state === 'ready').length
  const totalCount = (data?.pillars ?? []).length
  const tone = data?.headline.tone ?? null
  const toneTokens = tone ? DAILY_READ_TONES[tone] : null
  const isEmpty = isError || !data || data.empty || totalCount === 0

  return (
    <Tile
      label="Daily Read"
      onPress={() => router.push('/Home/daily-read' as never)}
      accessibilityLabel={
        isEmpty
          ? 'Daily read not available yet'
          : `Daily read, ${toneTokens?.label.toLowerCase() ?? 'ready'}, ${readyCount} of ${totalCount} signals`
      }
      body={
        isEmpty ? (
          <Empty hint="Connect a signal" />
        ) : (
          <DailyReadBody toneTokens={toneTokens} readyCount={readyCount} totalCount={totalCount} />
        )
      }
    />
  )
}

// ─── Shared tile shell ───────────────────────────────────────────────
interface TileProps {
  label: string
  onPress: () => void
  accessibilityLabel: string
  body: React.ReactNode
}
function Tile({ label, onPress, accessibilityLabel, body }: TileProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens details"
      hitSlop={4}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel} numberOfLines={1}>
          {label}
        </Text>
        <MaterialIcons
          name="chevron-right"
          size={16}
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
function Ready({ number, chip }: { number: number; chip: { fg: string; bg: string; label: string } | null }): React.JSX.Element {
  return (
    <View style={styles.body}>
      <Text style={styles.scoreNumber} numberOfLines={1} maxFontSizeMultiplier={1.3}>
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
}: {
  toneTokens: { fg: string; bg: string; label: string } | null
  readyCount: number
  totalCount: number
}): React.JSX.Element {
  return (
    <View style={styles.body}>
      <Text style={styles.toneWord} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {toneTokens?.label ?? 'READY'}
      </Text>
      <Text style={styles.subtle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {readyCount} of {totalCount} signals
      </Text>
    </View>
  )
}

function Empty({ hint }: { hint: string }): React.JSX.Element {
  return (
    <View style={styles.body}>
      <Text style={styles.emptyBig} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        —
      </Text>
      <Text style={styles.subtle} numberOfLines={2} maxFontSizeMultiplier={1.2}>
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
  toneWord: {
    fontSize: 18,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: 0.4,
    marginBottom: 4,
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
  subtle: {
    fontSize: 11,
    color: '#687076',
    textAlign: 'center',
    marginTop: 4,
  },
})
