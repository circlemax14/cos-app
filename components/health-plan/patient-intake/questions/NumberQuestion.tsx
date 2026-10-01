import React, { useState, useEffect } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { useIntakeLegibility } from '../use-intake-legibility';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export default function NumberQuestion({ value, onChange }: Props) {
  const { colors, fs, muted } = useIntakeLegibility();

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
      /*
       * COS-1221 — was "0". At the AA `muted` contrast a bare digit reads as an
       * ANSWER, not a prompt, so an empty required field looked answered and the
       * patient tapped a dead Next with nothing to explain it. An instruction
       * cannot be mistaken for a value at any contrast.
       */
      placeholder="Enter a number"
      placeholderTextColor={muted}
      style={[
        styles.input,
        {
          color: colors.text,
          borderColor: colors.border,
          backgroundColor: colors.background,
          fontSize: fs(16),
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
