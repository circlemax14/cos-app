import React, { useState, useEffect } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export default function NumberQuestion({ value, onChange }: Props) {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // Local text mirror so the user can type intermediate states (e.g. "12.")
  // that don't yet coerce to a valid number.
  const [text, setText] = useState<string>(value == null ? '' : String(value));

  useEffect(() => {
    setText(value == null ? '' : String(value));
  }, [value]);

  const handle = (t: string) => {
    // Allow only digits and dots; strip everything else so pasted junk
    // (currency symbols, spaces, letters from autocomplete) cannot land.
    const cleaned = t.replace(/[^0-9.]/g, '');
    setText(cleaned);
    if (cleaned === '' || cleaned === '.') {
      onChange(null);
      return;
    }
    const n = Number(cleaned);
    onChange(Number.isFinite(n) ? n : null);
  };

  return (
    <TextInput
      value={text}
      onChangeText={handle}
      keyboardType="numeric"
      placeholder="0"
      placeholderTextColor={colors.subtext}
      style={[
        styles.input,
        {
          color: colors.text,
          borderColor: colors.border,
          backgroundColor: colors.background,
          fontSize: getScaledFontSize(16),
        },
      ]}
      accessibilityLabel="Numeric answer"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
});
