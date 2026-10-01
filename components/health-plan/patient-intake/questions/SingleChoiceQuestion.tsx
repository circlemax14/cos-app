import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type {
  IntakeAnswerValue,
  IntakeQuestionOption,
  IntakeSingleWithSpecify,
} from '@/types/patient-intake';

import { useIntakeLegibility } from '../use-intake-legibility';

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

/** Radio glyph base size and the gap between it and the label. */
const ICON = 22;
const LABEL_GAP = 10;

export default function SingleChoiceQuestion({ options, value, onChange }: Props) {
  const { colors, fs, fw, muted } = useIntakeLegibility();

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
                // Was a hardcoded 22: the radio stayed put while the label
                // grew, on every screen size and every font scale.
                size={fs(ICON)}
                color={selected ? colors.tint : muted}
              />
              <Text
                style={{
                  color: colors.text,
                  marginLeft: LABEL_GAP,
                  flex: 1,
                  fontSize: fs(15),
                  fontWeight: fw(500) as any,
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
                placeholderTextColor={muted}
                maxLength={400}
                style={[
                  styles.specify,
                  {
                    color: colors.text,
                    borderColor: colors.tint,
                    backgroundColor: colors.background,
                    fontSize: fs(15),
                    // COS-1221 — was a hardcoded marginLeft: 32, measured against
                    // an icon that is no longer 22pt. Same two numbers the label
                    // is laid out with, so the input stays under it at every
                    // scale (the icon reaches 60pt at max accessibility scale).
                    marginLeft: fs(ICON) + LABEL_GAP,
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
    // COS-1216 scaled the radio glyph, so 12 + icon + 12 is no longer a fixed
    // 46pt — at the smallest system font scale fs(22) shrinks and the row can
    // fall under Apple's 44pt minimum. (The pre-COS-1216 row could not: its
    // icon was a hardcoded 22.) The floor is explicit so the scaler cannot
    // take the tap target below 44 for a patient with a tremor.
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
  },
  specify: {
    marginTop: 8,
    // marginLeft is set inline — it is derived from the scaled icon size.
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
});
