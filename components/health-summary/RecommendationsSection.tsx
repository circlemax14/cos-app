import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SummaryCardShell from './SummaryCardShell';
import EmptyStateHint from './EmptyStateHint';
import { useHealthSummary } from '@/hooks/use-health-summary';
import { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

const ACCENT = '#6366F1';

// Split Bedrock's prose into bullet strings. The regex intentionally covers
// three common list shapes the model returns: newlines, bulleted lines
// (•, -, *), and numbered lines ("1. ", "2. "). Fallback yields a single
// item when the string is one long paragraph.
function toBullets(raw?: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/\r?\n|(?:^|\s)[•\-*]\s+|(?:^|\s)\d+\.\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function RecommendationsSection() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data, isLoading, isError } = useHealthSummary();
  const bullets = useMemo(
    () => toBullets(data?.recommendations),
    [data?.recommendations],
  );
  const isEmpty = bullets.length === 0;

  const emptyText = isLoading
    ? 'Loading recommendations…'
    : isError
      ? 'Recommendations are temporarily unavailable. Pull down to refresh.'
      : 'No recommendations yet. Complete your intake to see personalized suggestions here.';

  return (
    <SummaryCardShell
      sectionNumber={8}
      title="Further recommendations"
      icon="tips-and-updates"
      accentColor={ACCENT}
      isEmpty={isEmpty}
      emptyState={<EmptyStateHint text={emptyText} />}
      testID="health-summary-recommendations"
    >
      <View style={styles.list}>
        {bullets.map((b, i) => (
          <View key={`${i}-${b.slice(0, 12)}`} style={styles.row}>
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
              {b}
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

export default RecommendationsSection;
