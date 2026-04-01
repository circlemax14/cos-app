import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Radii, TouchTargets, Typography } from '@/constants/design-system';

interface AccessibleInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
}

export function AccessibleInput({
  label,
  error,
  hint,
  ...inputProps
}: AccessibleInputProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? colors.error
    : isFocused
      ? colors.primary
      : colors.border;

  const labelColor = error
    ? colors.error
    : isFocused
      ? colors.primary
      : colors.text;

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.label,
          {
            color: labelColor,
            fontSize: getScaledFontSize(Typography.footnote.fontSize),
            fontWeight: getScaledFontWeight(600) as any,
          },
        ]}
        accessibilityRole="text"
      >
        {label}
      </Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        accessibilityHint={hint}
        style={[
          styles.input,
          {
            color: colors.text,
            fontSize: getScaledFontSize(Typography.body.fontSize),
            borderColor,
            borderWidth: 2,
            backgroundColor: error ? colors.errorBg : colors.background,
          },
          isFocused && !error && {
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 3,
          },
        ]}
        placeholderTextColor={colors.disabled}
        onFocus={(e) => {
          setIsFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          inputProps.onBlur?.(e);
        }}
        allowFontScaling
        maxFontSizeMultiplier={2}
      />
      {error && (
        <View style={styles.errorRow} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text
            style={[
              styles.errorText,
              {
                color: colors.error,
                fontSize: getScaledFontSize(Typography.footnote.fontSize),
                fontWeight: getScaledFontWeight(500) as any,
              },
            ]}
          >
            {error}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs + 2,
  },
  label: {
    marginLeft: 2,
  },
  input: {
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    minHeight: TouchTargets.button,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    marginLeft: 2,
  },
  errorIcon: {
    fontSize: 16,
  },
  errorText: {},
});
