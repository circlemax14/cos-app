import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { IntakeAddListItem, IntakeAnswerValue, IntakeQuestion } from '@/types/patient-intake';

import { SECTION_COLOR } from './IntakeProgressHeader';
import AddListQuestion from './questions/AddListQuestion';
import MultiChoiceQuestion from './questions/MultiChoiceQuestion';
import NumberQuestion from './questions/NumberQuestion';
import ScaleQuestion, { SCREENER_SCALES } from './questions/ScaleQuestion';
import SingleChoiceQuestion from './questions/SingleChoiceQuestion';
import TextQuestion from './questions/TextQuestion';

interface Props {
  question: IntakeQuestion;
  value: IntakeAnswerValue | undefined;
  onChange: (v: IntakeAnswerValue) => void;
  invalid: boolean;
}

export default function IntakeQuestionRenderer({ question, value, onChange, invalid }: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const borderColor = invalid ? '#DC2626' : colors.border;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor }]}>
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(20),
          fontWeight: getScaledFontWeight(700) as any,
        }}>
        {question.prompt}
      </Text>
      {!!question.hint && (
        <Text
          style={{
            color: colors.subtext,
            marginTop: 6,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(400) as any,
          }}>
          {question.hint}
        </Text>
      )}
      <View style={{ marginTop: 16 }}>{renderLeaf(question, value, onChange)}</View>
      {invalid && (
        <Text
          style={{
            color: '#DC2626',
            marginTop: 8,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(500) as any,
          }}>
          That doesn’t look right. Please review your answer.
        </Text>
      )}
    </View>
  );
}

function renderLeaf(
  q: IntakeQuestion,
  v: IntakeAnswerValue | undefined,
  onChange: (v: IntakeAnswerValue) => void,
) {
  const sectionColor = SECTION_COLOR[q.section];
  // Screener kind (PHQ-2 / GAD-2 / PSS-4 / LSNS-6) always wins over q.type — it forces
  // ScaleQuestion with a validated numeric range + canonical anchor labels.
  if (q.screener) {
    const scale = SCREENER_SCALES[q.screener];
    return (
      <ScaleQuestion
        value={typeof v === 'number' ? v : null}
        onChange={onChange}
        labels={scale.labels}
        min={scale.min}
        max={scale.max}
        sectionColor={sectionColor}
      />
    );
  }

  switch (q.type) {
    case 'text':
      return <TextQuestion value={typeof v === 'string' ? v : ''} onChange={onChange} />;
    case 'number':
      return <NumberQuestion value={typeof v === 'number' ? v : null} onChange={onChange} />;
    case 'single':
      return (
        <SingleChoiceQuestion
          options={q.options ?? []}
          value={typeof v === 'string' || typeof v === 'number' ? v : null}
          onChange={onChange}
        />
      );
    case 'multi':
      return (
        <MultiChoiceQuestion
          options={q.options ?? []}
          value={
            Array.isArray(v) &&
            v.every((x) => typeof x === 'string' || typeof x === 'number')
              ? (v as Array<string | number>)
              : []
          }
          onChange={onChange}
        />
      );
    case 'scale':
      if (q.options && q.options.length > 0) {
        return (
          <ScaleQuestion
            value={typeof v === 'number' ? v : null}
            onChange={onChange}
            options={q.options}
            sectionColor={sectionColor}
          />
        );
      }
      return (
        <ScaleQuestion
          value={typeof v === 'number' ? v : null}
          onChange={onChange}
          labels={['0', '1', '2', '3', '4', '5']}
          min={0}
          max={5}
          sectionColor={sectionColor}
        />
      );
    case 'add_list':
      return (
        <AddListQuestion
          value={
            Array.isArray(v) &&
            v.every(
              (x) =>
                x !== null &&
                typeof x === 'object' &&
                'label' in (x as Record<string, unknown>),
            )
              ? (v as IntakeAddListItem[])
              : []
          }
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 12 },
});
