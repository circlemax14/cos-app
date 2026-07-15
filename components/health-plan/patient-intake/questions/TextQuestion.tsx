import React from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function TextQuestion({ value, onChange, placeholder }: Props) {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder ?? 'Type your answer…'}
      placeholderTextColor={colors.subtext}
      multiline
      textAlignVertical="top"
      style={[
        styles.input,
        {
          color: colors.text,
          borderColor: colors.border,
          backgroundColor: colors.background,
          fontSize: getScaledFontSize(16),
        },
      ]}
      accessibilityLabel="Answer"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
});
