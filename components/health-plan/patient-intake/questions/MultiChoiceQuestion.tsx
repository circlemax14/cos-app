import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import type { IntakeQuestionOption } from '@/types/patient-intake';

import { useIntakeLegibility } from '../use-intake-legibility';

interface Props {
  options: IntakeQuestionOption[];
  value: Array<string | number>;
  onChange: (v: Array<string | number>) => void;
}

export default function MultiChoiceQuestion({ options, value, onChange }: Props) {
  const { colors, fs, fw, muted } = useIntakeLegibility();

  const toggle = (v: string | number) => {
    // Set preserves uniqueness cheaply; order of remaining items is preserved by insertion.
    const set = new Set(value);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange(Array.from(set));
  };

  return (
    <View style={{ gap: 8 }}>
      {options.map(opt => {
        const selected = value.includes(opt.value);
        return (
          <Pressable
            key={opt.value}
            onPress={() => toggle(opt.value)}
            style={[
              styles.row,
              {
                borderColor: selected ? colors.tint : colors.border,
                backgroundColor: selected ? colors.tint + '10' : 'transparent',
              },
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={opt.label}
          >
            <MaterialIcons
              name={selected ? 'check-box' : 'check-box-outline-blank'}
              // Was a hardcoded 22 — see SingleChoiceQuestion.
              size={fs(22)}
              color={selected ? colors.tint : muted}
            />
            <Text
              style={{
                color: colors.text,
                marginLeft: 10,
                flex: 1,
                fontSize: fs(15),
                fontWeight: fw(500) as any,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    // Same reason as SingleChoiceQuestion's row: COS-1216 made the checkbox
    // glyph scale, so padding alone no longer guarantees 44pt at the smallest
    // system font scale. Explicit floor.
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
  },
});
