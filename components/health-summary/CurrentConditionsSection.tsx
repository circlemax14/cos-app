import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { useHealthSummary } from '@/hooks/use-health-summary';
import { useHealthDetails } from '@/hooks/use-health-details';
import { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

// Neutral slate — Section 3 is not a BPS-domain section, so it takes a neutral
// tint. Was amber #D97706, which read too close to the Social bio-domain color
// (#C97600) and blurred the BPS palette signal.
const ACCENT = '#64748B';

// Cap per-item length so a malformed Bedrock string can't become one giant
// "condition" that blows out the row layout. 120 comfortably fits real ICD-10
// long names (e.g. "Type 2 diabetes mellitus with diabetic polyneuropathy").
const MAX_CONDITION_LEN = 120;

// Split Bedrock's prose `conditions` field into individual items. The regex is
// intentionally aggressive (newlines, bullets, commas, semicolons) because the
// server's output varies — recall matters more than precision at this layer;
// case-insensitive dedupe below cleans up the near-duplicates.
function parseSummaryConditions(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  const out: string[] = [];
  raw.split(/\r?\n|[•\-*]|,|;/).forEach(part => {
    const s = part.trim().replace(/^\d+\.?\s*/, '');
    if (s && s.length < MAX_CONDITION_LEN) out.push(s);
  });
  return out;
}

/**
 * Shared source of truth for the current-condition list. Sections 3, 4, and 5
 * all group by this list so a medication or lab never lands under a condition
 * name that differs from what Section 3 renders.
 *
 * Merges the AI summary prose (`useHealthSummary().conditions`) with the
 * structured intake list (`useHealthDetails().chronicConditions`), trims and
 * dedupes case-insensitively while preserving the first occurrence's casing.
 */
export function useConditionList(): { conditions: string[]; isLoading: boolean } {
  const summary = useHealthSummary();
  const details = useHealthDetails();

  const conditions = useMemo(() => {
    const raw: string[] = [];
    parseSummaryConditions(summary.data?.conditions).forEach(c => raw.push(c));
    (details.data?.chronicConditions ?? []).forEach(c => {
      const trimmed = c?.trim();
      if (trimmed) raw.push(trimmed);
    });

    const seen = new Set<string>();
    return raw.filter(c => {
      const k = c.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [summary.data?.conditions, details.data?.chronicConditions]);

  return { conditions, isLoading: summary.isLoading || details.isLoading };
}

function CurrentConditionsSection() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { conditions, isLoading } = useConditionList();
  const isEmpty = conditions.length === 0;

  const emptyText = isLoading
    ? 'Loading your conditions…'
    : 'No current conditions on file yet. Complete your intake to populate this.';

  return (
    <SummaryCardShell
      title="Current conditions"
      icon="medical-information"
      accentColor={ACCENT}
      isEmpty={isEmpty}
      emptyState={<EmptyStateHint text={emptyText} />}
      testID="health-summary-current-conditions"
    >
      <View style={styles.list}>
        {conditions.map((c, i) => (
          <View key={`${c}-${i}`} style={styles.row}>
            <Text
              style={{ color: ACCENT, fontSize: getScaledFontSize(15) }}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              •
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                lineHeight: 22,
                flex: 1,
              }}
            >
              {c}
            </Text>
          </View>
        ))}
      </View>
    </SummaryCardShell>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
});

export default CurrentConditionsSection;
