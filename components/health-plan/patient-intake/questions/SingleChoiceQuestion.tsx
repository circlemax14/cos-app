import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type {
  IntakeAnswerValue,
  IntakeQuestionOption,
  IntakeSingleWithSpecify,
} from '@/types/patient-intake';

interface Props {
  options: IntakeQuestionOption[];
  /**
   * Legacy bare-value answer OR the SCRUM-659 `{ choice, specify }` shape.
   * The wrapper is emitted only when the user selects an option with
   * `specifyOnSelect: true`.
   */
  value: IntakeAnswerValue | null;
  onChange: (v: IntakeAnswerValue) => void;
}

function isSpecifyShape(v: IntakeAnswerValue | null | undefined): v is IntakeSingleWithSpecify {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'choice' in v;
}

export default function SingleChoiceQuestion({ options, value, onChange }: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const currentChoice = isSpecifyShape(value)
    ? value.choice
    : ((value as string | number | null | undefined) ?? null);
  const currentSpecify = isSpecifyShape(value) ? value.specify ?? '' : '';

  const emit = (choice: string | number, opt: IntakeQuestionOption) => {
    if (opt.specifyOnSelect) {
      onChange({ choice: String(choice), specify: currentSpecify });
    } else {
      onChange(choice);
    }
  };

  const emitSpecify = (specify: string) => {
    if (isSpecifyShape(value)) {
      onChange({ choice: value.choice, specify });
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {options.map((opt) => {
        const selected = currentChoice === opt.value;
        return (
          <View key={opt.value}>
            <Pressable
              onPress={() => emit(opt.value, opt)}
              style={[
                styles.row,
                {
                  borderColor: selected ? colors.tint : colors.border,
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
            {selected && opt.specifyOnSelect && (
              <TextInput
                value={currentSpecify}
                onChangeText={emitSpecify}
                placeholder="Please specify…"
                placeholderTextColor={colors.subtext}
                maxLength={400}
                style={[
                  styles.specify,
                  {
                    color: colors.text,
                    borderColor: colors.tint,
                    backgroundColor: colors.background,
                    fontSize: getScaledFontSize(15),
                  },
                ]}
                accessibilityLabel={`Specify ${opt.label}`}
              />
            )}
          </View>
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
  specify: {
    marginTop: 8,
    marginLeft: 32,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
});
