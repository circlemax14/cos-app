/**
 * BpsTodayHeroCard (CHUNK 47) — port of the SCRUM-252 legacy "Today" hero
 * card into the BPS plan surface.
 *
 * The BPS screen (BiopsychosocialPlanScreen) previously had no overall
 * progress hero — patients could tell what tasks existed inside each
 * SectionCard, but not the at-a-glance "how am I doing today" signal
 * that the legacy Plan tab surfaces via the "TODAY <percent>%" card
 * (health-plan.tsx ~line 1010). This is a faithful port of that visual:
 *
 *   - TODAY eyebrow (11pt small caps)
 *   - 40pt focal percent-complete number
 *   - "X of N tasks done" subtitle
 *   - 56x56 tinted circular badge (green check on 100%)
 *   - Thick 8px static progress bar (dynamic width, no animation)
 *   - Done / To go / Skipped triplet with colored dots
 *
 * iOS 26.5 hardening (chunks 21/26/39/40):
 *   - Only View / Text / MaterialIcons / StyleSheet primitives.
 *   - The 8px progress bar is a static View with an inline width string
 *     computed per render — NO Animated.Value, NO width interpolation,
 *     NO LayoutAnimation, NO shimmer/pulse/fade.
 *   - The 100% badge glyph swap ('today' → 'check-circle') is a static
 *     re-render, never a cross-fade.
 *
 * Data source: parent passes today's task occurrences (with `.status`)
 * fetched via `fetchTasksForDate(todayIso())` under the shared
 * ['plan-tasks', todayIso()] cache key (matches auth-prefetch.ts:96 and
 * use-notification-categories.ts:78, so warmed reads share the same
 * cache entry). If the count is zero, the card renders null — matches
 * the legacy `tasks.length > 0` guard.
 *
 * OTA-safe (no native fingerprint change).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import type { TaskOccurrence } from '@/services/api/types';

// Match the shape BiopsychosocialPlanScreen already casts `colors` to
// (Record<string, string>) so this drop-in component types cleanly at
// the call site without extra casts.
type ColorMap = Record<string, string>;

export interface BpsTodayHeroCardProps {
  /**
   * Today's task occurrences (with completion `.status`). Parent owns
   * the fetch so the hero and any sibling surfaces stay on a single
   * cache entry.
   */
  tasks: TaskOccurrence[];
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string | number;
}

const DONE_COLOR = '#16A34A';
const SKIPPED_COLOR = '#9CA3AF';

export function BpsTodayHeroCard({
  tasks,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: BpsTodayHeroCardProps): React.JSX.Element | null {
  const totalToday = tasks.length;
  // Legacy guard: no card when there's nothing to summarize. Matches
  // health-plan.tsx:1010 (`tasks.length > 0 && …`).
  if (totalToday === 0) return null;

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const skippedCount = tasks.filter((t) => t.status === 'skipped').length;
  const toGoCount = Math.max(0, totalToday - completedCount - skippedCount);
  const progressPct = completedCount / totalToday;
  const percentInt = Math.round(progressPct * 100);
  const isComplete = progressPct === 1;

  // colors.tint is a plain hex string in constants/theme.ts (#008080) —
  // 2-char hex-alpha suffixes ('14', '18', '33') produce valid rgba.
  const tint = colors.tint ?? '#0D9488';
  const accent = isComplete ? DONE_COLOR : tint;
  const badgeBg = isComplete ? DONE_COLOR + '18' : tint + '18';
  const trackBg = tint + '14';

  // Static width computed each render — no interpolation. `Math.max(2, …)`
  // preserves a visible sliver of the fill even at 0% so users can see
  // the bar exists (matches legacy hero at health-plan.tsx:1048).
  const fillWidth: `${number}%` = `${Math.max(2, progressPct * 100)}%`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: (colors.card ?? '#ffffff') + 'D9',
          borderColor: colors.border ?? '#e0e0e0',
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`Today: ${percentInt} percent complete. ${completedCount} of ${totalToday} tasks done.`}
    >
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text
            style={[
              styles.eyebrow,
              {
                color: colors.subtext ?? '#687076',
                fontSize: getScaledFontSize(11),
                fontWeight: getScaledFontWeight(700) as any,
              },
            ]}
          >
            TODAY
          </Text>
          <Text
            style={{
              color: colors.text ?? '#11181C',
              fontSize: getScaledFontSize(40),
              fontWeight: getScaledFontWeight(800) as any,
              letterSpacing: -0.5,
              marginTop: 4,
            }}
            // Belt-and-suspenders vs. Dynamic Type at max scale: allow the
            // focal number to shrink one step rather than push off-card.
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {percentInt}%
          </Text>
          <Text
            style={{
              color: colors.subtext ?? '#687076',
              fontSize: getScaledFontSize(13),
              marginTop: 2,
            }}
          >
            {completedCount} of {totalToday} task{totalToday === 1 ? '' : 's'} done
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <MaterialIcons
            name={isComplete ? 'check-circle' : 'today'}
            size={getScaledFontSize(28)}
            color={accent}
          />
        </View>
      </View>

      {/* Static progress bar — dynamic width, no animation (chunks 21/26). */}
      <View style={[styles.progressBar, { backgroundColor: trackBg }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: accent, width: fillWidth },
          ]}
        />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <View style={[styles.dot, { backgroundColor: DONE_COLOR }]} />
          <Text
            style={{
              color: colors.text ?? '#11181C',
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            {completedCount}
          </Text>
          <Text style={{ color: colors.subtext ?? '#687076', fontSize: getScaledFontSize(11), marginLeft: 4 }}>
            done
          </Text>
        </View>
        <View style={styles.stat}>
          <View style={[styles.dot, { backgroundColor: tint }]} />
          <Text
            style={{
              color: colors.text ?? '#11181C',
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            {toGoCount}
          </Text>
          <Text style={{ color: colors.subtext ?? '#687076', fontSize: getScaledFontSize(11), marginLeft: 4 }}>
            to go
          </Text>
        </View>
        <View style={styles.stat}>
          <View style={[styles.dot, { backgroundColor: SKIPPED_COLOR }]} />
          <Text
            style={{
              color: colors.text ?? '#11181C',
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            {skippedCount}
          </Text>
          <Text style={{ color: colors.subtext ?? '#687076', fontSize: getScaledFontSize(11), marginLeft: 4 }}>
            skipped
          </Text>
        </View>
      </View>
    </View>
  );
}

export default BpsTodayHeroCard;

const styles = StyleSheet.create({
  card: {
    // CHUNK 57 alignment: padding 18 → Spacing.md (16) and borderRadius
    // 20 → Radii.xl (16). Matches every sibling BPS card
    // (BpsWelcomeBanner / BpsAiSummaryBanner / BpsNotificationCategoriesCard
    // / TodaysMedicationsCard / SectionCard / mapCard) so radii and
    // internal spacing read as one system across the surface. Legacy
    // heroCard sat inside a horizontally-padded ScrollView; the BPS
    // ScrollView already contentContainer-pads by Spacing.md, so we don't
    // add marginHorizontal here — matches how BpsWelcomeBanner /
    // TodaysMedicationsCard sit within the same container. Component is
    // BPS-only (grep for BpsTodayHeroCard — only mounted in
    // BiopsychosocialPlanScreen).
    padding: Spacing.md,
    borderRadius: Radii.xl,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  topLeft: { flex: 1, minWidth: 0, paddingRight: Spacing.sm },
  eyebrow: { letterSpacing: 0.6, textTransform: 'uppercase' },
  badge: {
    width: 56,
    height: 56,
    borderRadius: Radii.xl + 2, // ~18 — matches legacy heroBadge borderRadius:18
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingHorizontal: 2,
  },
  stat: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
});
