import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Radii } from '@/constants/design-system';

interface AccessibleCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  showChevron?: boolean;
}

export function AccessibleCard({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  showChevron = true,
}: AccessibleCardProps) {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const borderWidth = settings.isHighContrast ? 2 : 1.5;

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.surfaceBorder,
          borderWidth,
          padding: Spacing.cardPadding,
        },
      ]}
    >
      {children}
      {onPress && showChevron && (
        <View style={styles.chevron}>
          <IconSymbol
            name="chevron.right"
            size={getScaledFontSize(18)}
            color={colors.secondary}
          />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint ?? 'Double tap for details'}
        style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.xl,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  chevron: {
    position: 'absolute',
    right: Spacing.cardPadding,
    top: '50%',
    transform: [{ translateY: -9 }],
  },
});
