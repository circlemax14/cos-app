/**
 * components/health-plan/BpsHeroTileRow.tsx — SCRUM-655
 *
 * Compact tile-row replacement for the BPS surface's two hero cards
 * (BpsWellbeingScoreCard + BpsTodayHeroCard). Renders both as small
 * side-by-side tiles by default; tapping a tile expands the full-fat
 * shipped card below with a subtle fade.
 *
 * Why this exists (user feedback 2026-07-31):
 *   The two hero cards were dominating the Plan surface's above-the-fold
 *   real-estate but only ~30% of that pixel-count is the signal a user
 *   scans for ("what's my score?" / "how much did I finish?"). The rest
 *   is decoration + drill-down affordances. Home-page pattern (SCRUM-653
 *   WellbeingRow) already proved a 2-tile summary lands well; the Plan
 *   surface benefits from the same discipline while keeping the full
 *   card one tap away for the deeper details Ken tuned into the shipped
 *   cards.
 *
 * ANIMATION:
 *   Opacity fade on the expanded card, useNativeDriver:true so the
 *   animation runs on the native side (SAFE on the iOS 26.5 BPS
 *   surface — the primitive envelope prohibits LayoutAnimation / Portal
 *   / Animated LAYOUT, not native-driver opacity). Duration 220ms —
 *   short enough to feel responsive, long enough to read as intentional.
 *   No transform, no interpolation, no scale — the simplest safe
 *   Animated pattern.
 *
 * PRIMITIVE ENVELOPE (iOS 26.5):
 *   View / Text / Pressable / MaterialIcons / StyleSheet / Animated
 *   (opacity, native driver). NO Portal / LayoutAnimation / rotate
 *   transforms / gradient / blur / ActivityIndicator.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { BpsWellbeingScoreCard } from './BpsWellbeingScoreCard'
import { BpsTodayHeroCard } from './BpsTodayHeroCard'
import { ScoreBandChip } from '@/components/home/ScoreBandChip'
import { scoreToBand } from '@/hooks/use-score-catalog'
import type { WellbeingDerivation } from '@/lib/wellbeing-score'
import type { TaskOccurrence } from '@/services/api/types'

type ColorMap = Record<string, string>

export interface BpsHeroTileRowProps {
  colors: ColorMap
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string | number
  /** Passed through to BpsWellbeingScoreCard when the wellbeing tile is expanded. */
  onPressWellbeingDetails?: () => void
  /** Parent-hoisted wellbeing derivation — shared with the expanded card. */
  derivation: WellbeingDerivation
  isLoading?: boolean
  isEmpty?: boolean
  /**
   * COS-802 — per-tile entitlement gates, resolved by the PARENT.
   *
   * They default to true so this component renders exactly as before for any
   * call site that does not pass them, and so the gate lives in one place
   * (BiopsychosocialPlanScreen) rather than this component growing its own
   * dependency on the entitlement hook.
   */
  showWellbeing?: boolean
  showToday?: boolean
  /** Today's task occurrences — shared with the expanded card. */
  tasks: TaskOccurrence[]
}

export function BpsHeroTileRow({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onPressWellbeingDetails,
  derivation,
  isLoading,
  isEmpty,
  tasks,
  showWellbeing = true,
  showToday = true,
}: BpsHeroTileRowProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<'wellbeing' | 'today' | null>(null)
  const fadeAnim = useRef(new Animated.Value(0)).current

  // Drive the opacity fade on expansion changes. Native-driver-only so
  // the animation is a GPU commit, not a JS layout mutation — safe on
  // the iOS 26.5 BPS surface. Duration 220ms matches other subtle
  // transitions in the app (feels crisp, not sluggish).
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [expanded, fadeAnim])

  const toggle = (which: 'wellbeing' | 'today') => {
    setExpanded((prev) => (prev === which ? null : which))
  }

  // --- Derived summaries for the tile faces ---

  const composite =
    typeof derivation.composite === 'number' && Number.isFinite(derivation.composite)
      ? Math.round(derivation.composite)
      : undefined
  const compositeBand = scoreToBand(composite)

  const totalToday = tasks.length
  const completedToday = tasks.filter((t) => t.status === 'completed').length
  const percentToday = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0

  const wellbeingActive = expanded === 'wellbeing'
  const todayActive = expanded === 'today'

  // COS-802 — a plan may grant neither tile. Returning the wrap anyway would
  // leave an empty row with its own spacing above the map, which reads as a
  // loading state that never resolves.
  if (!showWellbeing && !showToday) return <></>

  return (
    <View style={styles.wrap}>
      {/* --- Tile row --- */}
      <View style={styles.row}>
        {/* Wellbeing tile */}
        {showWellbeing && (
        <Pressable
          onPress={() => toggle('wellbeing')}
          accessibilityRole="button"
          accessibilityState={{ expanded: wellbeingActive }}
          accessibilityLabel={
            composite === undefined
              ? 'Wellbeing score, not available yet. Tap for details.'
              : `Wellbeing score, ${composite} out of 100${compositeBand ? `, ${compositeBand}` : ''}. Tap to ${wellbeingActive ? 'collapse' : 'expand'} details.`
          }
          hitSlop={4}
          style={({ pressed }) => [
            styles.tile,
            { borderColor: wellbeingActive ? (colors.tint as string) : 'rgba(0,0,0,0.08)' },
            wellbeingActive && { backgroundColor: (colors.tint as string) + '10' },
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={styles.tileHeader}>
            <Text
              style={[styles.tileLabel, { color: colors.subtext as string, fontSize: getScaledFontSize(11) }]}
              numberOfLines={1}
            >
              WELLBEING
            </Text>
            <MaterialIcons
              name={wellbeingActive ? 'expand-less' : 'expand-more'}
              size={18}
              color={(colors.subtext as string) ?? '#687076'}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </View>
          <View style={styles.tileBody}>
            {composite === undefined ? (
              <Text
                style={[styles.tileBigMuted, { color: (colors.subtext as string) ?? '#687076', fontSize: getScaledFontSize(36) }]}
                maxFontSizeMultiplier={1.3}
              >
                —
              </Text>
            ) : (
              <View style={styles.scoreLine}>
                <Text
                  style={[
                    styles.tileBig,
                    {
                      color: colors.text as string,
                      fontSize: getScaledFontSize(36),
                      fontWeight: getScaledFontWeight(800) as any,
                    },
                  ]}
                  maxFontSizeMultiplier={1.3}
                >
                  {composite}
                </Text>
                <Text
                  style={[styles.scale, { color: (colors.subtext as string) ?? '#687076', fontSize: getScaledFontSize(13) }]}
                  maxFontSizeMultiplier={1.3}
                >
                  /100
                </Text>
              </View>
            )}
            <View style={styles.chipRow}>
              <ScoreBandChip band={compositeBand} />
            </View>
          </View>
        </Pressable>
        )}

        {/* Today tile */}
        {showToday && (
        <Pressable
          onPress={() => toggle('today')}
          accessibilityRole="button"
          accessibilityState={{ expanded: todayActive }}
          accessibilityLabel={
            totalToday === 0
              ? 'Today, no tasks scheduled. Tap for details.'
              : `Today, ${percentToday} percent complete, ${completedToday} of ${totalToday} tasks done. Tap to ${todayActive ? 'collapse' : 'expand'} details.`
          }
          hitSlop={4}
          style={({ pressed }) => [
            styles.tile,
            { borderColor: todayActive ? (colors.tint as string) : 'rgba(0,0,0,0.08)' },
            todayActive && { backgroundColor: (colors.tint as string) + '10' },
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={styles.tileHeader}>
            <Text
              style={[styles.tileLabel, { color: colors.subtext as string, fontSize: getScaledFontSize(11) }]}
              numberOfLines={1}
            >
              TODAY
            </Text>
            <MaterialIcons
              name={todayActive ? 'expand-less' : 'expand-more'}
              size={18}
              color={(colors.subtext as string) ?? '#687076'}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </View>
          <View style={styles.tileBody}>
            {totalToday === 0 ? (
              <Text
                style={[styles.tileBigMuted, { color: (colors.subtext as string) ?? '#687076', fontSize: getScaledFontSize(36) }]}
                maxFontSizeMultiplier={1.3}
              >
                —
              </Text>
            ) : (
              <View style={styles.scoreLine}>
                <Text
                  style={[
                    styles.tileBig,
                    {
                      color: colors.text as string,
                      fontSize: getScaledFontSize(36),
                      fontWeight: getScaledFontWeight(800) as any,
                    },
                  ]}
                  maxFontSizeMultiplier={1.3}
                >
                  {percentToday}
                </Text>
                <Text
                  style={[styles.scale, { color: (colors.subtext as string) ?? '#687076', fontSize: getScaledFontSize(13) }]}
                  maxFontSizeMultiplier={1.3}
                >
                  %
                </Text>
              </View>
            )}
            <Text
              style={[styles.tileSub, { color: (colors.subtext as string) ?? '#687076', fontSize: getScaledFontSize(11) }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {totalToday === 0
                ? 'No tasks today'
                : `${completedToday}/${totalToday} done`}
            </Text>
          </View>
        </Pressable>
        )}
      </View>

      {/* --- Expanded card (fade-in via native-driver opacity) --- */}
      {expanded && (expanded === 'wellbeing' ? showWellbeing : showToday) && (
        <Animated.View style={{ opacity: fadeAnim, marginTop: 12 }}>
          {expanded === 'wellbeing' ? (
            <BpsWellbeingScoreCard
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              onPressDetails={onPressWellbeingDetails}
              derivation={derivation}
              isLoading={isLoading}
              isEmpty={isEmpty}
            />
          ) : (
            <BpsTodayHeroCard
              tasks={tasks}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          )}
        </Animated.View>
      )}
    </View>
  )
}

export default BpsHeroTileRow

const styles = StyleSheet.create({
  wrap: {
    // Sit above the BpsWelcomeBanner. Own its own bottom-margin so the
    // expanded card's fade-in doesn't collide with the next section.
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    // borderColor overridden per-tile based on active state
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 128,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tileLabel: {
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  tileBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tileBig: {
    letterSpacing: -1,
  },
  tileBigMuted: {
    fontWeight: '700',
    letterSpacing: -1,
  },
  scale: {
    marginLeft: 2,
    fontWeight: '500',
  },
  chipRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  tileSub: {
    marginTop: 8,
    fontWeight: '500',
  },
})
