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
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
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
  // Guard first: if no summary (bio-only cohort, cache miss, backend
  // disabled) render nothing — never a hollow card. Second layer of
  // defense alongside the parent kill-switch.
  if (!summary || !summary.trim()) return null;

  const tint = colors.tint;
  const text = colors.text;

  // Pre-computed tint tint-tinted card colors — legal-static rgba
  // envelope (no color-mix / interpolation).
  const cardBg = tint + '14';
  const cardBorder = tint + '33';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
      ]}
      accessible
      accessibilityLabel={`AI summary of your plan: ${summary}`}
    >
      <View style={styles.header}>
        <MaterialIcons name="auto-awesome" size={14} color={tint} />
        <Text
          style={[
            styles.eyebrow,
            {
              color: tint,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as any,
            },
          ]}
        >
          AI SUMMARY
        </Text>
      </View>

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

      {/*
        Apple Guideline 1.4.1 disclaimer + citations. Shipped on legacy
        V2 (PlanScreenRedesignedV2.tsx:431) since Apple Review 1.4.1
        (build 53). Compact mode tightens vertical rhythm inside this
        card. Do NOT gate — the footer is a review-bar requirement, not
        a UX enhancement.
      */}
      <AICitationsFooter compact />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radii.xl,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrow: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  body: {
    lineHeight: 22,
    marginTop: Spacing.sm,
  },
});
