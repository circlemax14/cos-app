/**
 * DetailsAccordion (COS-479 / D1 Hero + Wellbeing-Map Glimpse, 2026-07-23) —
 * senior-mode "See details ▾" collapsible that hosts the entire
 * pre-existing BiopsychosocialPlanScreen render tree verbatim when the
 * new D1 hero layout is on.
 *
 * WHY THIS COMPONENT EXISTS:
 *   Ken approved Direction 1 of the D1 explorations: a big composite
 *   score up top, a single "one thing today" action, a mini wellbeing-
 *   map glimpse, and everything else (SelfAssessmentTrends,
 *   MedicationsSection, BpsPlanFocusBanner, the three SectionCards,
 *   etc.) hidden behind a lightweight "See details" toggle. Chunks
 *   82-124 shipped the a11y contract on those inner components; the
 *   safest way to keep that contract intact is to render them
 *   BIT-IDENTICALLY as children of this accordion. This file is a
 *   *shell only* — no prop editing, no wrapper divs that break flex,
 *   no accessibility overrides on the children.
 *
 * KILL-SWITCH SYMMETRY:
 *   BiopsychosocialPlanScreen.tsx gates this component behind a
 *   module-const BPS_HERO_LAYOUT_ENABLED (default false). When false
 *   the parent falls back to today's layout verbatim (no accordion,
 *   no hero). When true this component wraps the shipped children.
 *
 * iOS 26.5 HARDENING (per the 2026-07-13 build-62 crash post-mortem):
 *   - Only static View / Text / Pressable / MaterialIcons + StyleSheet.
 *   - No Animated / LayoutAnimation / Portal / Modal / gradient / blur
 *     / ActivityIndicator / rotate transform on cold-mount paths.
 *   - Expand/collapse is a straight conditional render — mirrors
 *     BpsWellbeingScoreCard's chunk-63 how-expanded panel (line 1011).
 *   - Chevron flips by icon-name swap (expand-more <-> expand-less),
 *     NOT a rotate transform. Same pattern chunk 59 shipped.
 *
 * A11Y CONTRACT (respects the shipped chunks 82-124 semantics):
 *   - Header Pressable exposes accessibilityRole="button" +
 *     accessibilityState.expanded so VoiceOver announces the collapsed/
 *     expanded state without extra label churn.
 *   - accessibilityLabel is patient-facing plain English so the
 *     announcement reads "See details. Expand." / "See details.
 *     Collapse." — matches the tone of the shipped a11y labels on
 *     BpsWellbeingScoreCard + BpsPlanFocusBanner.
 *   - On toggle we fire AccessibilityInfo.announceForAccessibility
 *     so the state change is heard immediately (Pressable-role state
 *     change alone is not consistently announced on iOS 26.5 —
 *     verified against the shipped how-explanation pattern).
 *   - Screen-reader-first default: on mount we probe
 *     AccessibilityInfo.isScreenReaderEnabled(); when VoiceOver is
 *     active we auto-expand so the linear reading order surfaces the
 *     full plan for blind/low-vision patients (Ken's a11y ask from
 *     chunk 82). Uses a mounted-guard so a fast unmount can't setState.
 *
 * KEEP THIS FILE SMALL: it is intentionally a dumb shell. No data
 * hooks, no query subscriptions, no derivation. Anything data-shaped
 * belongs in the parent (BiopsychosocialPlanScreen owns the single
 * useWellbeingDerivation call per the chunk 59/60 "compute once"
 * contract; see BpsWellbeingScoreCardProps.derivation for the mirror
 * pattern).
 */
import React from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { Spacing } from '@/constants/design-system'

// Match the shape BiopsychosocialPlanScreen already casts `colors` to
// (Record<string, string>) so this drop-in component types cleanly at
// the call site without extra casts — same pattern chunks 59/60 shipped.
type ColorMap = Record<string, string>

export interface DetailsAccordionProps {
  /**
   * Everything from today's layout — SelfAssessmentTrends,
   * MedicationsSection, BpsPlanFocusBanner, three SectionCards, etc.
   * Rendered verbatim below the header when expanded. NO edits, NO
   * wrappers — chunks 82-124 a11y contract lives here.
   */
  children: React.ReactNode
  /**
   * Default expansion for sighted users. VoiceOver users always get
   * expanded=true on mount regardless of this default (see mount
   * effect below).
   */
  defaultExpanded?: boolean
  /**
   * Override the header label. Defaults to "See details" — Ken's
   * approved copy on the D1 mock.
   */
  headerLabel?: string
  /**
   * Palette overrides. Optional so the component stays drop-in usable
   * outside the BiopsychosocialPlanScreen palette wiring — falls back
   * to the warm-neutral defaults BpsWellbeingScoreCard shipped with
   * (chunks 59/62/66 baseline). When rendered inside the plan screen,
   * pass the parent's derived `colors` map so light/dark stays synced
   * with the rest of the BPS surface.
   */
  colors?: ColorMap
  /**
   * Optional accessibility scaler. When supplied, the header label
   * scales with Ken's shipped iOS text-scale wiring (parent hook
   * useAccessibilityFont). When absent we render at the design's 15pt
   * baseline — the shell stays legible without the scaler for standalone
   * previews / storybook use.
   */
  getScaledFontSize?: (n: number) => number
  /**
   * Optional weight scaler — mirrors BpsWellbeingScoreCardProps so the
   * plan-screen bold-text preference propagates through the header
   * label. Falls back to '500' when absent (design spec).
   */
  getScaledFontWeight?: (n: number) => string | number
  /**
   * onLayout hook so the parent (BiopsychosocialPlanScreen) can measure
   * the accordion header's Y position and implement the three-dot row's
   * "scroll to See details" tap — mirrors the shipped
   * scrollToSelfAssessments pattern (BiopsychosocialPlanScreen lines
   * 930-933). Passing it through is a light contract: the parent stashes
   * the y-coord and later calls scrollRef.current?.scrollTo({ y: ... }).
   */
  onLayoutHeader?: (y: number) => void
}

/**
 * A "See details ▾" collapsible whose sole job is hosting the shipped
 * BPS render tree without editing it. Static primitives only.
 */
export function DetailsAccordion({
  children,
  defaultExpanded,
  headerLabel,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onLayoutHeader,
}: DetailsAccordionProps): React.JSX.Element {
  const label = headerLabel ?? 'See details'

  // Sighted default — false unless the caller opts in. VoiceOver users
  // get expanded=true from the mount effect below regardless.
  const [expanded, setExpanded] = React.useState<boolean>(defaultExpanded ?? false)

  // VoiceOver-first: probe once on mount. If the reader is active,
  // auto-expand so the linear reading order surfaces the full plan.
  // Mounted-guard defends against fast unmount → async resolve race
  // (unmount during initial network hydration is a real path when the
  // patient background-taps a push notification).
  React.useEffect(() => {
    let mounted = true
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (!mounted) return
        if (enabled) setExpanded(true)
      })
      // Swallow — a11y probe failure must never crash the plan screen.
      // React Native's implementation is essentially non-throwing today,
      // but future OS updates have surprised us before (see the iOS 26.5
      // Portal crash post-mortem).
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const onPress = React.useCallback(() => {
    setExpanded((prev) => {
      const next = !prev
      // Announce the state change so VoiceOver users hear
      // "Details expanded" / "Details collapsed" immediately. Pressable-
      // role state changes don't reliably announce on iOS 26.5 — verified
      // against the chunk 63 how-panel a11y ship.
      AccessibilityInfo.announceForAccessibility(
        `Details ${next ? 'expanded' : 'collapsed'}`,
      )
      return next
    })
  }, [])

  // Palette — warm-neutral defaults mirror BpsWellbeingScoreCard's
  // chunks 59/62/66 baseline. Prefixing the destructure with fallbacks
  // keeps the shell drop-in usable outside the plan screen.
  const border = colors?.border ?? '#e0e0e0'
  const subtext = colors?.subtext ?? '#687076'

  const fontSize = getScaledFontSize ? getScaledFontSize(15) : 15
  const fontWeight = (
    getScaledFontWeight ? getScaledFontWeight(500) : '500'
  ) as unknown as '500'

  return (
    <View>
      <Pressable
        onPress={onPress}
        onLayout={
          onLayoutHeader
            ? (e) => onLayoutHeader(e.nativeEvent.layout.y)
            : undefined
        }
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${label}. ${expanded ? 'Collapse' : 'Expand'}`}
        // 44pt tap target at default text scale — the header itself is
        // 48pt tall, but hitSlop gives us margin at larger dynamic-type
        // scales too. Matches the "one thing today" 44pt Pressable
        // sibling in the D1 hero stack so the whole surface reads as a
        // uniform tap-target rhythm.
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.header,
          { borderTopColor: border },
          // Subtle press feedback — no gradient, no blur, no Animated.
          // Opacity dip is a static style change, iOS 26.5 primitive-safe.
          pressed ? { opacity: 0.6 } : null,
        ]}
      >
        <Text
          style={[
            styles.headerLabel,
            { color: subtext, fontSize, fontWeight },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={subtext}
          // The icon repeats the state the accessibilityLabel already
          // announces — hide it from the screen reader so VoiceOver
          // doesn't double-speak the chevron glyph name.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </Pressable>

      {/* Straight conditional render — no LayoutAnimation, no Animated.
          Mirrors BpsWellbeingScoreCard's chunk-63 how-expanded panel
          (lines 1011-1030). Children render EXACTLY as they would in
          the parent's own tree — no wrapper View here would break
          flexbox / marginBottom rhythm on the shipped SectionCards. */}
      {expanded ? children : null}
    </View>
  )
}

export default DetailsAccordion

const styles = StyleSheet.create({
  // 48pt tall header with a subtle top divider — sits flush against
  // whatever wellbeing-map glimpse renders above it in the D1 stack.
  // marginTop leaves breathing room from the map strip; marginBottom
  // stays 0 so the shipped children below own their own top spacing
  // (chunks 47/48 layout-shift discipline).
  header: {
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.sm,
  },
  headerLabel: {
    // flexShrink so the label ellipsizes rather than pushing the
    // chevron off-screen at 130% dynamic type on iPhone SE.
    flexShrink: 1,
    marginRight: 8,
  },
})
