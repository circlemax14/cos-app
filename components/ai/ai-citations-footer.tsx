/**
 * AI Citations + Disclaimer footer (build 53 — Apple Review 1.4.1).
 *
 * Apple rejected build 52 with two related issues under Guideline 1.4.1:
 *   1. "App provides medical information without citations" — needs
 *       in-app links to sources.
 *   2. "App provides medical advice without medical disclaimer" — needs
 *       a disclaimer reminding users to consult their doctor.
 *
 * This component is rendered below every AI-generated medical surface
 * (Daily Summary, Encounter narrative, Progress Notes, Trends
 * Summarize, AI Health Plan rationale). It provides:
 *   - A short, plain-language medical disclaimer
 *   - Links to the authoritative medical organizations whose clinical
 *     guidelines our AI plan + summary generator is conditioned on
 *
 * The citations are static and curated for now — sufficient for the
 * App Review bar. A future task can have the backend return per-
 * summary citations dynamically (SCRUM-326 follow-up).
 */

import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface CitationLink {
  label: string;
  url: string;
}

/**
 * Default static citations — authoritative U.S. clinical sources whose
 * published guidelines inform the AI plan generator's vitals
 * monitoring thresholds, recommended exercise levels, medication
 * adherence framing, and recovery-marker timelines.
 */
const DEFAULT_CITATIONS: CitationLink[] = [
  { label: 'Centers for Disease Control and Prevention (CDC)', url: 'https://www.cdc.gov/' },
  { label: 'American Heart Association — clinical guidelines', url: 'https://www.heart.org/en/health-topics' },
  { label: 'American Diabetes Association — standards of care', url: 'https://diabetes.org/about-us/standards-of-care' },
  { label: 'U.S. Preventive Services Task Force', url: 'https://www.uspreventiveservicestaskforce.org/uspstf/' },
  { label: 'MedlinePlus (National Library of Medicine)', url: 'https://medlineplus.gov/' },
];

export interface AICitationsFooterProps {
  /** Optional override of the static citation list for context-specific
   *  surfaces (e.g., a glucose-trend summary linking to the ADA
   *  glucose targets page directly). */
  citations?: CitationLink[];
  /** Tighten vertical padding when the footer sits inside a tight card. */
  compact?: boolean;
}

export function AICitationsFooter({ citations, compact }: AICitationsFooterProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const sources = citations ?? DEFAULT_CITATIONS;

  return (
    <View style={[styles.wrapper, compact && styles.wrapperCompact, { borderTopColor: colors.text + '15' }]}>
      <View style={styles.disclaimerRow}>
        <MaterialIcons name="medical-services" size={14} color={colors.text + '99'} />
        <Text
          style={[
            styles.disclaimer,
            {
              color: colors.text + '99',
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(500) as any,
            },
          ]}
          accessibilityRole="text"
        >
          AI-generated. Informational only — not a diagnosis or treatment plan. Always consult your doctor or qualified health professional before making any medical decisions, changing medications, or acting on this information.
        </Text>
      </View>

      <Text
        style={[
          styles.sourcesHeader,
          {
            color: colors.text + 'AA',
            fontSize: getScaledFontSize(10),
            fontWeight: getScaledFontWeight(700) as any,
          },
        ]}
      >
        SOURCES
      </Text>
      {sources.map((c) => (
        <Pressable
          key={c.url}
          onPress={() => { void Linking.openURL(c.url).catch(() => {}); }}
          accessibilityRole="link"
          accessibilityLabel={`Open ${c.label}`}
          style={({ pressed }) => [styles.sourceRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="open-in-new" size={11} color={colors.tint} />
          <Text
            style={[
              styles.sourceLabel,
              { color: colors.tint, fontSize: getScaledFontSize(11) },
            ]}
            numberOfLines={1}
          >
            {c.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  wrapperCompact: {
    marginTop: 8,
    paddingTop: 8,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 10,
  },
  disclaimer: {
    flex: 1,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  sourcesHeader: {
    letterSpacing: 1,
    marginBottom: 4,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  sourceLabel: {
    flex: 1,
    textDecorationLine: 'underline',
  },
});
