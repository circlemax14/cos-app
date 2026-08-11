/**
 * BpsAiSummaryBanner (Chunk 48) — port of the legacy AI-summary card
 * from `PlanScreenRedesignedV2.tsx:422-433` onto the biopsychosocial
 * plan surface.
 *
 * Legacy V2 renders a teal-tinted card carrying:
 *   1. an "AI SUMMARY" eyebrow
 *   2. the Bedrock-generated overall plan summary (`plan.summary`)
 *   3. `<AICitationsFooter compact />` — the Apple Review 1.4.1
 *      disclaimer + authoritative-sources link list
 *
 * The BPS surface (`BiopsychosocialPlanScreen`) shipped without any of
 * that until now — patients could see their bio/psy/soc plan but had
 * no in-app rationale (the AI-generated "why this plan") and, more
 * critically, no in-app disclaimer or citations under the AI-generated
 * bullets. That's a latent Apple Guideline 1.4.1 exposure for the day
 * the BPS default-flip re-lands post iOS 26 fixes (see
 * `project_plan_bps_unification.md` — Phase 4 rolled back 2026-07-18).
 * Rendering `<AICitationsFooter compact />` inline here closes that
 * gap on the BPS surface today.
 *
 * DATA SOURCE COUPLING
 * --------------------
 * `summary` comes from `useAiHealthPlan()` (the legacy AI plan record)
 * — NOT from `useBiopsychosocialPlan()`. `BiopsychosocialPlanRecord`
 * has no `summary` field today. Per COS-438 legacy is dual-written for
 * all BPS users, so this is safe: chunk 47 already made the same
 * coupling for the Today hero. Paired follow-up ticket is filed to
 * mirror the summary onto the bio-native record via a Bedrock prompt
 * update + schema v2→v3 in-lockstep (HS-3a pattern). When that ships,
 * swap the `summary` prop source at the call site — this component
 * stays unchanged.
 *
 * iOS 26.5 CONSTRAINT ENVELOPE
 * ----------------------------
 * Primitives ONLY: View / Text / MaterialIcons / StyleSheet + static
 * hex+alpha strings. No Animated / Reanimated / LayoutAnimation, no
 * Modal / Portal, no gradient, no blur, no ActivityIndicator. The
 * embedded `<AICitationsFooter compact />` internally uses Pressable +
 * Linking + MaterialIcons + View + Text — audited leaf-safe.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Spacing } from '@/constants/design-system';
import { AICitationsFooter } from '@/components/ai/ai-citations-footer';

export interface BpsAiSummaryBannerProps {
  /** Bedrock-generated overall summary. Undefined/empty → null-render. */
  summary: string | undefined;
  /** Themed color palette resolved by the parent (matches sibling banners
   *  — parent hands us a `Record<string, string>` cast of the Colors
   *  palette, so we accept the same shape for prop-shape compatibility
   *  with BpsWelcomeBanner / BpsTodayHeroCard / TodaysMedicationsCard). */
  colors: Record<string, string>;
  /** Kept for API symmetry with sibling banners; not currently branched on
   *  because the tint-alpha strings render acceptably in both modes. */
  isDark: boolean;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (w: number) => string;
}

export function BpsAiSummaryBanner({
  summary,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: BpsAiSummaryBannerProps): React.JSX.Element | null {
  const [expanded, setExpanded] = React.useState(false);

  // Guard first: if no summary (bio-only cohort, cache miss, backend
  // disabled) render nothing — never a hollow card. Second layer of
  // defense alongside the parent kill-switch.
  if (!summary || !summary.trim()) return null;

  const tint = colors.tint;
  const text = colors.text;

  // Pre-computed tint tint-tinted card colors — legal-static rgba
  // envelope (no color-mix / interpolation).
  // 1F / 55 — the wash Nutrition and Medications share.
  const cardBg = tint + '1F';
  const cardBorder = tint + '55';

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={[
        styles.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
      ]}
      accessible
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel="AI summary of your plan"
      accessibilityHint={
        expanded ? 'Tap to collapse the summary' : 'Tap to read the full summary'
      }
    >
      {/* Vishal 2026-08-11: "AI summary ... format is not matching with
          nutrition and medication card". Was an 11pt uppercase eyebrow with a
          14pt inline icon — a different class of header entirely. Now the
          same 48pt solid icon well + 16/700 title + chevron the other three
          use, so all four read as one stack. */}
      <View style={styles.header}>
        <View
          style={[styles.iconWrap, { backgroundColor: tint, borderColor: tint }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <MaterialIcons name="auto-awesome" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.textCol}>
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(700) as any,
            }}
            numberOfLines={1}
          >
            AI summary
          </Text>
        </View>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={getScaledFontSize(20)}
          color={tint}
        />
      </View>

      {/* Vishal 2026-08-11: "ai summary card is still showing too much, it
          should show all with accordion only". The two-line teaser was still
          a paragraph on a screen whose job is the plan. Collapsed now shows
          the header alone; expanded shows the whole summary, uncapped. */}
      {expanded && (
        <Text
          style={[
            styles.body,
            {
              color: text,
              fontSize: getScaledFontSize(15),
            },
          ]}
          accessibilityRole="text"
        >
          {summary}
        </Text>
      )}

      {/*
        Apple Guideline 1.4.1 disclaimer + citations. Shipped on legacy
        V2 (PlanScreenRedesignedV2.tsx:431) since Apple Review 1.4.1
        (build 53). Compact mode tightens vertical rhythm inside this
        card. Do NOT gate — the footer is a review-bar requirement, not
        a UX enhancement.
      */}
      {expanded && <AICitationsFooter compact />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    // CHUNK 57 alignment: dropped `marginHorizontal: Spacing.md`. The
    // parent BPS ScrollView already contributes contentContainer
    // padding: Spacing.md=16 horizontally, so this card's own mH:16
    // stacked to a 32pt inset from the screen edge — visibly farther in
    // than sibling BPS cards (BpsWelcomeBanner, BpsTodayHeroCard,
    // TodaysMedicationsCard, SectionCard) which sit at the 16pt padding
    // boundary. Component is BPS-only (grep for BpsAiSummaryBanner —
    // only mounted in BiopsychosocialPlanScreen), so removing mH here
    // has no back-compat impact.
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  // Shape shared with HabitsBanner / NutritionPlanSection / MedicationsBanner
  // so the four cards read as one system.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: { flex: 1, marginRight: 8 },
  body: {
    lineHeight: 22,
    marginTop: Spacing.sm,
  },
});
