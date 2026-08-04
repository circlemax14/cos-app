/**
 * SCRUM-644 — Daily Read home-surface card (SKELETON).
 *
 * Pure primitive envelope (View / Text / Pressable / MaterialIcons /
 * StyleSheet) — iOS 26.5-hardened, no Animated, no LayoutAnimation,
 * no react-native-svg. Mirrors HealthAgeCard.tsx.
 *
 * HONEST-PLACEHOLDER STATE (per orchestrator brief + design brief):
 *   Final copy, headline tone taxonomy, pillar labels/CTAs, and band
 *   colors are BLOCKED on Ken clinical + design sign-off. This card
 *   ships as a design-in-progress skeleton so the flag-off path is
 *   byte-identical to today AND the wire is proven end-to-end for
 *   beta testers. Do NOT treat the copy on this card as production
 *   text.
 *
 * FLAG DISCIPLINE:
 *   Self-gated on `useDailyReadFlag()` (returns null when OFF) so a
 *   stray mount can't leak the surface — mirrors HabitCorrelationStrip
 *   discipline. Parent is ALSO expected to guard on the flag; both
 *   layers exist for defense in depth.
 *
 * States rendered when flag ON:
 *   - hidden           → flag OFF → return null (byte-identical)
 *   - loading          → em-dash "—" + "Pulling your read…" hint
 *                        (no shimmer; established repo precedent is
 *                        em-dash + hint per HealthAgeCard)
 *   - empty            → response.empty === true → onboarding CTA
 *                        ("Connect Apple Health to see your daily
 *                        read.") — this IS the first-run value moment
 *   - ready            → placeholder headline + placeholder body +
 *                        design-in-progress footer, pillars listed as
 *                        chips when present so beta testers can see
 *                        the wire is live
 *
 * PHI:
 *   Never renders raw numeric vitals — the backend aggregator's
 *   headline/oneLiner strings are already categorical-only per the
 *   design brief. This card just displays them verbatim.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { useDailyRead } from '@/hooks/use-daily-read'
import { useDailyReadFlag } from '@/hooks/use-daily-read-flag'
import type {
  DailyReadPillar,
  DailyReadPillarBand,
} from '@/services/api/daily-read'

// ─── Placeholder copy (HONEST — pending Ken clinical + design) ──────
//
// Do NOT rewrite these to sound production-final. The point is that
// beta testers, Ken, and design see a skeleton that clearly reads as
// "wire is live, copy is pending" rather than a finished tile.
const PLACEHOLDER_HEADLINE = 'Your daily read'
const PLACEHOLDER_BODY =
  'One honest summary of how today is trending across the signals we can see. No values shown — just direction and what to do next.'
const PLACEHOLDER_LOADING_HINT = 'Pulling your read…'
const PLACEHOLDER_EMPTY_BODY = 'Connect Apple Health to see your daily read.'
const PLACEHOLDER_EMPTY_CTA = 'Connect'
const PLACEHOLDER_FOOTER =
  'Design in progress — copy and layout pending Ken clinical + design review.'

/** Band token defaults. Final palette pending design sign-off; these
 *  match the HealthAgeCard neutral-forward palette so the skeleton
 *  reads as consistent with the surrounding daily-insights cluster. */
const BAND_TOKENS: Record<DailyReadPillarBand, { fg: string; bg: string }> = {
  good:      { fg: '#0F6B36', bg: '#E6F4EC' },
  fair:      { fg: '#0B6963', bg: '#E0F2F1' },
  attention: { fg: '#8A5100', bg: '#FDF3E4' },
}

export interface DailyReadCardProps {
  /** Called on tap — parent decides where (v1: read-only, no route). */
  onPress?: () => void
  testID?: string
}

function PillarChip({ pillar }: { pillar: DailyReadPillar }): React.JSX.Element {
  const tokens = pillar.band ? BAND_TOKENS[pillar.band] : undefined
  const label = pillar.label || pillar.key
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}${pillar.band ? `, ${pillar.band}` : ''}`}
      style={[
        styles.pillarChip,
        tokens ? { backgroundColor: tokens.bg } : styles.pillarChipNeutral,
      ]}
    >
      <Text
        style={[
          styles.pillarChipLabel,
          tokens ? { color: tokens.fg } : styles.pillarChipLabelNeutral,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

function DailyReadCardBase({
  onPress,
  testID = 'daily-read-card',
}: DailyReadCardProps): React.JSX.Element | null {
  const flagEnabled = useDailyReadFlag()
  const { data, isLoading, isError } = useDailyRead(flagEnabled)

  // Defensive backstop — parent should already gate, but never leak
  // the surface if the flag is OFF.
  if (!flagEnabled) return null

  // Hard error path: collapse silently. The aggregator NEVER throws on
  // partial signal failure, so an error here is transport/auth — the
  // dark-launch discipline is to hide, not surface a scary banner.
  if (isError) return null

  const isLoadingInitial = isLoading && !data
  const isEmpty = data?.empty === true
  const headlineText = data?.headline.text ?? PLACEHOLDER_HEADLINE
  const readyPillars = (data?.pillars ?? []).filter((p) => p.state === 'ready')

  const a11yLabel = isLoadingInitial
    ? 'Daily read loading'
    : isEmpty
      ? `Daily read. ${PLACEHOLDER_EMPTY_BODY}`
      : `Daily read. ${headlineText || PLACEHOLDER_HEADLINE}`

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Open your daily read"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      testID={testID}
    >
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>DAILY READ</Text>
        <MaterialIcons
          name="today"
          size={16}
          color="#687076"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      {isLoadingInitial ? (
        <>
          <Text style={styles.headlineDim} maxFontSizeMultiplier={1.3}>—</Text>
          <Text style={styles.hint} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {PLACEHOLDER_LOADING_HINT}
          </Text>
        </>
      ) : isEmpty ? (
        <>
          <Text style={styles.headline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {PLACEHOLDER_HEADLINE}
          </Text>
          <Text style={styles.body} numberOfLines={3} maxFontSizeMultiplier={1.3}>
            {PLACEHOLDER_EMPTY_BODY}
          </Text>
          <View style={styles.ctaRow}>
            <Text style={styles.ctaLabel} numberOfLines={1}>
              {PLACEHOLDER_EMPTY_CTA}
            </Text>
            <MaterialIcons name="chevron-right" size={16} color="#0B6963" />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.headline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {headlineText || PLACEHOLDER_HEADLINE}
          </Text>
          <Text style={styles.body} numberOfLines={3} maxFontSizeMultiplier={1.3}>
            {PLACEHOLDER_BODY}
          </Text>
          {readyPillars.length > 0 ? (
            <View style={styles.pillarRow}>
              {readyPillars.map((p) => (
                <PillarChip key={p.key} pillar={p} />
              ))}
            </View>
          ) : null}
        </>
      )}

      <Text style={styles.footer} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {PLACEHOLDER_FOOTER}
      </Text>
    </Pressable>
  )
}

export const DailyReadCard = React.memo(DailyReadCardBase)
DailyReadCard.displayName = 'DailyReadCard'
export default DailyReadCard

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    minHeight: 132,
  },
  cardPressed: { opacity: 0.7 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#687076',
  },
  headline: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: -0.2,
  },
  headlineDim: {
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '700',
    color: '#C7CACD',
    letterSpacing: -1,
  },
  body: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: '#3E4448',
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#687076',
  },
  ctaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0B6963',
    letterSpacing: 0.2,
  },
  pillarRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pillarChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  pillarChipNeutral: {
    backgroundColor: '#F1F3F5',
  },
  pillarChipLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  pillarChipLabelNeutral: {
    color: '#687076',
  },
  footer: {
    marginTop: 8,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    color: '#98A0A6',
    fontStyle: 'italic',
  },
})
