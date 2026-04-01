import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Typography } from '@/constants/design-system';
import { AccessibleButton } from './accessible-button';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export function EmptyState({ icon, title, description, ctaLabel, onCtaPress }: EmptyStateProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text
        style={[
          styles.title,
          {
            color: colors.text,
            fontSize: getScaledFontSize(Typography.title2.fontSize),
            fontWeight: getScaledFontWeight(600) as any,
          },
        ]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <Text
        style={[
          styles.description,
          {
            color: colors.secondary,
            fontSize: getScaledFontSize(Typography.callout.fontSize),
          },
        ]}
      >
        {description}
      </Text>
      {ctaLabel && onCtaPress && (
        <View style={styles.cta}>
          <AccessibleButton
            variant="primary"
            label={ctaLabel}
            onPress={onCtaPress}
            fullWidth={false}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: Spacing.xl,
  },
  icon: {
    fontSize: 56,
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  cta: {
    marginTop: Spacing.lg,
  },
});
