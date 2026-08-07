/**
 * The plan's AI summary, as a small card that expands on tap.
 *
 * Vishal 2026-08-07: "ai summary in plan screen needs to be a small card and
 * when we click on it it can be expanded".
 *
 * It previously rendered the full summary inline at the top of the plan, above
 * the category sections. The summary is 2-3 sentences by prompt contract, so
 * on a phone it pushed the actual plan — the tasks and goals people open this
 * screen to act on — most of a screen down. Collapsed to two lines it stays
 * available without being the first thing anyone has to scroll past.
 *
 * Stays inside the iOS 26.5 primitive envelope: View / Text / Pressable /
 * MaterialIcons / StyleSheet only. No layout-animation module — a height
 * animation here would be the kind of native dependency that has broken this
 * screen before, and the state toggle reads fine without one.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { AICitationsFooter } from '@/components/ai/ai-citations-footer';

export interface PlanSummaryCardProps {
  summary: string;
  colors: {
    card: string;
    border: string;
    text: string;
    subtext: string;
    tint: string;
  };
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  /** Test seam — lets a test render the expanded state directly. */
  initiallyExpanded?: boolean;
}

/** Lines shown while collapsed. Two keeps the card genuinely small. */
export const COLLAPSED_LINES = 2;

export function PlanSummaryCard({
  summary,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  initiallyExpanded = false,
}: PlanSummaryCardProps): React.ReactElement | null {
  const [expanded, setExpanded] = React.useState(initiallyExpanded);

  // An empty or whitespace-only summary renders nothing at all, rather than a
  // card whose body is blank — the caller's `!!plan.summary` check passes for
  // a string of spaces.
  if (summary.trim() === '') return null;

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel="Your plan, in short"
      accessibilityHint={expanded ? 'Tap to collapse the summary' : 'Tap to read the full summary'}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.header}>
        <Text
          style={[
            styles.eyebrow,
            {
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as never,
            },
          ]}
        >
          YOUR PLAN, IN SHORT
        </Text>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={getScaledFontSize(20)}
          color={colors.tint}
        />
      </View>

      <Text
        // numberOfLines is dropped entirely when expanded rather than set to a
        // large number — a finite cap would silently clip an unusually long
        // summary in the one state whose whole purpose is showing all of it.
        numberOfLines={expanded ? undefined : COLLAPSED_LINES}
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(15),
          lineHeight: 22,
          marginTop: 6,
        }}
      >
        {summary}
      </Text>

      {/* The AI provenance footer belongs with the full text. Showing it under
          a two-line teaser makes the card taller than the content it teases. */}
      {expanded && <AICitationsFooter compact />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    // Tighter than the 18 the always-expanded card used — this one is meant to
    // read as a control, not a panel.
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: { letterSpacing: 1, textTransform: 'uppercase' },
});
