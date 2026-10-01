import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { IntakeAddListItem, IntakeAnswerValue, IntakeQuestion } from '@/types/patient-intake';

import { SECTION_COLOR } from './IntakeProgressHeader';
import { useIntakeLegibility } from './use-intake-legibility';
import AddListQuestion from './questions/AddListQuestion';
import MultiChoiceQuestion from './questions/MultiChoiceQuestion';
import HeightQuestion from './questions/HeightQuestion';
import NumberQuestion from './questions/NumberQuestion';
import ScaleQuestion, { SCREENER_SCALES } from './questions/ScaleQuestion';
import SingleChoiceQuestion from './questions/SingleChoiceQuestion';
import TextQuestion from './questions/TextQuestion';

interface Props {
  question: IntakeQuestion;
  value: IntakeAnswerValue | undefined;
  onChange: (v: IntakeAnswerValue) => void;
  invalid: boolean;
  /**
   * SCRUM-659 followup (2026-08-05) — the full in-progress answers map.
   * Used to resolve `question.linkSourceKey` into a list of add-list
   * item labels for the AddListQuestion's link picker. Optional so
   * legacy callers that don't need linking work unchanged.
   */
  allAnswers?: Record<string, IntakeAnswerValue>;
}

export default function IntakeQuestionRenderer({ question, value, onChange, invalid, allAnswers }: Props) {
  /*
   * COS-1216 — `fs()` is the breakpoint-stepped scaler, NOT getScaledFontSize.
   * The bases below are unchanged phone sizes; the step is what makes them
   * readable on the ~10" iPad the stakeholders are reviewing on.
   */
  const { colors, fs, fw, muted, error } = useIntakeLegibility();
  const borderColor = invalid ? error : colors.border;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor }]}>
      <Text
        style={{
          color: colors.text,
          fontSize: fs(20),
          fontWeight: fw(700) as any,
        }}>
        {question.prompt}
      </Text>
      {!!question.hint && (
        <Text
          style={{
            // 4.62:1 as the theme's subtext grey on #f5f5f5 — the "light gray
            // font" the stakeholder could not read. 6.93:1 now, from the
            // design-system `secondary` token. See use-intake-legibility.ts.
            color: muted,
            marginTop: 6,
            fontSize: fs(13),
            fontWeight: fw(400) as any,
          }}>
          {question.hint}
        </Text>
      )}
      <View style={{ marginTop: 16 }}>{renderLeaf(question, value, onChange, allAnswers)}</View>
      {invalid && (
        <Text
          style={{
            // This was a hardcoded red that FAILED AA on the card in both
            // themes (4.43:1 light, 3.38:1 dark) at the smallest size on the
            // screen. Now design-system `error`: 5.93:1 light, 5.91:1 dark —
            // and the light token was fixed where it lives, not shadowed here.
            color: error,
            marginTop: 8,
            fontSize: fs(12),
            fontWeight: fw(500) as any,
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
  allAnswers?: Record<string, IntakeAnswerValue>,
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

  /*
   * COS-927 — the hint is checked BEFORE the type switch.
   *
   * `height_in` is still `type: 'number'` on the wire, precisely so an app
   * build without this component keeps rendering the plain box rather than
   * falling through the switch's `default` arm to null. So the hint has to win
   * here, not be a case below.
   */
  if (q.inputHint === 'height' && q.type === 'number') {
    return <HeightQuestion value={typeof v === 'number' ? v : null} onChange={onChange} />;
  }

  switch (q.type) {
    case 'text':
      return <TextQuestion value={typeof v === 'string' ? v : ''} onChange={onChange} />;
    case 'number':
      return <NumberQuestion value={typeof v === 'number' ? v : null} onChange={onChange} />;
    case 'single':
      // SCRUM-659 followup — SingleChoiceQuestion now accepts the
      // `{ choice, specify }` wrapper for options with specifyOnSelect.
      // Pass the raw answer through; the child component discriminates.
      return (
        <SingleChoiceQuestion
          options={q.options ?? []}
          value={v ?? null}
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
    case 'add_list': {
      // SCRUM-659 followup — when this add_list references another
      // add_list via linkSourceKey, resolve the source's item labels
      // and offer them as chip toggles per row. Empty source → the
      // component hides the picker instead of rendering an empty row.
      let linkOptions: string[] | undefined;
      if (q.linkSourceKey && allAnswers) {
        const sourceValue = allAnswers[q.linkSourceKey];
        if (Array.isArray(sourceValue)) {
          linkOptions = sourceValue
            .filter(
              (x): x is IntakeAddListItem =>
                x !== null &&
                typeof x === 'object' &&
                'label' in (x as Record<string, unknown>),
            )
            .map((x) => x.label)
            .filter((l) => typeof l === 'string' && l.length > 0);
        }
      }
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
          labelPlaceholder={q.addListLabelPlaceholder}
          notePlaceholder={q.addListNotePlaceholder}
          linkOptions={linkOptions}
          linkPickerLabel={q.linkPickerLabel}
        />
      );
    }
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 12 },
});
