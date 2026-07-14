import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { IntakeQuestionOption } from '@/types/patient-intake';

interface Props {
  options: IntakeQuestionOption[];
  value: Array<string | number>;
  onChange: (v: Array<string | number>) => void;
}

export default function MultiChoiceQuestion({ options, value, onChange }: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

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
              size={22}
              color={selected ? colors.tint : colors.subtext}
            />
            <Text
              style={{
                color: colors.text,
                marginLeft: 10,
                flex: 1,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(500) as any,
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
    borderWidth: 1,
    borderRadius: 12,
  },
});
