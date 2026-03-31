import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAccessibility } from '@/stores/accessibility-store';
import { StatusConfig, SupportStatusConfig, Typography, Spacing } from '@/constants/design-system';

interface StatusBadgeProps {
  status: string;
  type?: 'appointment' | 'support';
}

export function StatusBadge({ status, type = 'appointment' }: StatusBadgeProps) {
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const config = type === 'support'
    ? SupportStatusConfig[status as keyof typeof SupportStatusConfig]
    : StatusConfig[status as keyof typeof StatusConfig];

  if (!config) {
    return null;
  }

  return (
    <View
      style={[styles.badge, { backgroundColor: config.bg }]}
      accessibilityLabel={`Status: ${config.label}`}
    >
      <Text style={styles.icon}>{config.icon}</Text>
      <Text
        style={[
          styles.text,
          {
            color: config.text,
            fontSize: getScaledFontSize(Typography.footnote.fontSize + 1),
            fontWeight: getScaledFontWeight(600) as any,
          },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Spacing.sm,
    minHeight: 32,
  },
  icon: {
    fontSize: 14,
  },
  text: {},
});
