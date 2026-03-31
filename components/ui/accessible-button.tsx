import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, TouchTargets, Radii, Typography } from '@/constants/design-system';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'small' | 'icon';

interface AccessibleButtonProps {
  variant?: ButtonVariant;
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function AccessibleButton({
  variant = 'primary',
  label,
  onPress,
  accessibilityHint,
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
}: AccessibleButtonProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const variantStyles = {
    primary: {
      bg: isDisabled ? colors.disabled : colors.primary,
      text: '#FFFFFF',
      borderColor: 'transparent',
      borderWidth: 0,
      height: TouchTargets.button,
      fontSize: Typography.body.fontSize,
    },
    secondary: {
      bg: 'transparent',
      text: isDisabled ? colors.disabled : colors.primary,
      borderColor: isDisabled ? colors.disabled : colors.primary,
      borderWidth: 2,
      height: TouchTargets.button,
      fontSize: Typography.body.fontSize,
    },
    destructive: {
      bg: isDisabled ? colors.disabled : colors.errorLight,
      text: isDisabled ? '#FFFFFF' : colors.error,
      borderColor: 'transparent',
      borderWidth: 0,
      height: TouchTargets.button,
      fontSize: Typography.body.fontSize,
    },
    small: {
      bg: colors.surface,
      text: isDisabled ? colors.disabled : colors.primaryDark,
      borderColor: colors.surfaceBorder,
      borderWidth: 1.5,
      height: TouchTargets.minimum,
      fontSize: Typography.callout.fontSize,
    },
    icon: {
      bg: colors.surface,
      text: isDisabled ? colors.disabled : colors.primaryDark,
      borderColor: colors.surfaceBorder,
      borderWidth: 1.5,
      height: TouchTargets.iconButton,
      fontSize: Typography.body.fontSize,
    },
  };

  const style = variantStyles[variant];

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: style.bg,
          borderColor: style.borderColor,
          borderWidth: style.borderWidth,
          minHeight: style.height,
          opacity: pressed ? 0.85 : 1,
          borderRadius: variant === 'icon' ? Radii.md : Radii.lg,
          width: variant === 'icon' ? TouchTargets.iconButton : undefined,
          alignSelf: fullWidth && variant !== 'icon' ? 'stretch' : 'flex-start',
        },
      ]}
    >
      <View style={styles.content}>
        {icon && <View style={styles.icon}>{icon}</View>}
        {variant !== 'icon' && (
          <Text
            style={[
              styles.label,
              {
                color: style.text,
                fontSize: getScaledFontSize(style.fontSize),
                fontWeight: getScaledFontWeight(600) as any,
              },
            ]}
          >
            {loading ? 'Loading...' : label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    textAlign: 'center',
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
