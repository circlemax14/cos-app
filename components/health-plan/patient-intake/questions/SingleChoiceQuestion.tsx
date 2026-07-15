import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { IntakeQuestionOption } from '@/types/patient-intake';

interface Props {
  options: IntakeQuestionOption[];
  value: string | number | null;
  onChange: (v: string | number) => void;
}

export default function SingleChoiceQuestion({ options, value, onChange }: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <View style={{ gap: 8 }}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.row,
              {
                borderColor: selected ? colors.tint : colors.border,
                // 10 == ~6% alpha tint wash on the selected row
                backgroundColor: selected ? colors.tint + '10' : 'transparent',
              },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
          >
            <MaterialIcons
              name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
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
