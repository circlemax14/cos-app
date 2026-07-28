import React from 'react';
import { View, Text, StyleSheet, TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useHealthSummary } from '@/hooks/use-health-summary';
import { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

function formatRelativeOrDate(iso?: string): string {
  if (!iso) return 'Not yet generated';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not yet generated';
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'Updated just now';
  if (min < 60) return `Updated ${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Updated ${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
  return `Updated ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function UpdatedAtFooter() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data } = useHealthSummary();
  const label = formatRelativeOrDate(data?.generatedAt);

  return (
    <View
      style={styles.wrap}
      accessibilityRole="summary"
      accessibilityLabel={`${label}. Your health summary updates automatically as your data changes.`}
    >
      <View style={styles.headerRow}>
        <MaterialIcons
          name="autorenew"
          size={getScaledFontSize(14)}
          color={colors.subtext}
        />
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          textAlign: 'center',
          lineHeight: 16,
        }}
      >
        Your summary updates automatically as your health data changes.
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
