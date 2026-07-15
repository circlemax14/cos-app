import React from 'react';
import { View, Text, StyleSheet, TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useHealthSummary } from '@/hooks/use-health-summary';
import { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

function formatDate(iso?: string): string {
  if (!iso) return 'not yet generated';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'not yet generated';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function UpdatedAtFooter() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data } = useHealthSummary();
  const generatedLabel = formatDate(data?.generatedAt);

  return (
    <View
      style={styles.wrap}
      accessibilityRole="summary"
      accessibilityLabel={`Section 9 of 9. Last updated ${generatedLabel}. Pull down to refresh. Automatic refresh coming soon.`}
    >
      <View style={styles.headerRow}>
        <MaterialIcons
          name="autorenew"
          size={getScaledFontSize(16)}
          color={colors.subtext}
        />
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
        >
          9 / 9 · Last updated {generatedLabel}
        </Text>
      </View>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(12),
          textAlign: 'center',
          lineHeight: 18,
        }}
      >
        Pull down to refresh. Automatic refresh coming soon.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

export default UpdatedAtFooter;
