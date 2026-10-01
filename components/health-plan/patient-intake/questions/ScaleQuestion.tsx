import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IntakeQuestionOption, IntakeScreenerKind } from '@/types/patient-intake';

import { readableOn } from '../intake-legibility';
import { useIntakeLegibility } from '../use-intake-legibility';

// Canonical PHQ-2 / GAD-2 / PSS-4 / LSNS-6 anchor sets.
// Exported so IntakeQuestionRenderer can hand the right labels + range to
// ScaleQuestion when a question carries a `screener` kind.
//
// COS-1215: these labels are now the VISIBLE text of each row, not just the
// two end anchors. Editing one changes what the patient reads; editing the
// COUNT changes the screener's score range, so don't.
export const SCREENER_SCALES: Record<
  IntakeScreenerKind,
  { min: number; max: number; labels: string[] }
> = {
  phq2: {
    min: 0,
    max: 3,
    labels: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
  },
  gad2: {
    min: 0,
    max: 3,
    labels: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
  },
  pss4: {
    min: 0,
    max: 4,
    labels: ['Never', 'Almost never', 'Sometimes', 'Fairly often', 'Very often'],
  },
  lsns6: {
    min: 0,
    max: 4,
    labels: ['None', 'One', 'Two', 'Three or four', 'Five or more'],
  },
};

interface Props {
  value: number | null;
  onChange: (v: number) => void;
  // Traditional (labels/min/max) path — used by PHQ/GAD/PSS/LSNS screeners via
  // SCREENER_SCALES. Ignored when `options` is provided.
  labels?: string[];
  min?: number;
  max?: number;
  // When provided, wins over labels/min/max: renders one row per option,
  // showing option.label and storing option.value (a number).
  options?: IntakeQuestionOption[];
  // Optional per-section accent for the SELECTED row's background. Falls back
  // to colors.tint when absent. Unselected row + text styling is unchanged.
  sectionColor?: string;
}

/**
 * COS-1215 — a scale question reads as WORDS, in a vertical list.
 *
 * It used to render a horizontal row of square chips showing the raw numbers
 * (0 1 2 3 4) with only the first and last option labels printed underneath as
 * anchors. A stakeholder testing the LSNS question "How many family members do
 * you see or hear from at least once a month?" read the last chip as `4` and
 * the anchor as "Five or more" and reported a MISSING OPTION — the five-or-more
 * option was always there (`{ value: 4, label: 'Five or more' }`), it just
 * never showed its own label. Same for PHQ-2/GAD-2/PSS-4, where "Several days"
 * rendered as `1`.
 *
 * So every row now carries its own label, which also retires the pair of small
 * light-grey anchor captions — the single hardest thing to read on this screen
 * for a 60+, partly sighted population. Full labels ("More than half the days")
 * do not fit five-across at large system font scales, so the layout is a
 * vertical list of selectable rows, mirroring the assessment stepper's
 * likert/choice branch (`app/Home/assessment-stepper.tsx` → AnimatedOptionRow)
 * so the two questionnaires stop diverging.
 *
 * WHICH PATH THE LSNS QUESTION ACTUALLY TAKES: the screener one. This component
 * has two row sources — `options` and `labels`/`min`/`max` — and
 * IntakeQuestionRenderer's `renderLeaf` checks `q.screener` BEFORE it looks at
 * `q.type` or `q.options` (COS-1223: this used to cite a line number, which the
 * round that wrote it had already moved by three lines — name the symbol), so
 * every PHQ-2 / GAD-2 / PSS-4 / LSNS-6 question renders from
 * SCREENER_SCALES via labels/min/max. `options` is reached only by a
 * `type: 'scale'` question with no screener kind. Both paths are normalised
 * into one row list below, so the fix covers both, but a reader chasing the
 * LSNS bug should follow labels/min/max.
 *
 * ponytail: mirrored, not imported — AnimatedOptionRow is local to the stepper
 * screen and carries an Animated bounce + sparkle burst that is outside this
 * screen's iOS 26.5 primitive envelope. Export it from a shared module if a
 * third caller ever wants it.
 *
 * What did NOT change: the stored answer is still the NUMBER, so answers on
 * file render unchanged, and the screener scoring in intake-report-builder is
 * untouched.
 */
export default function ScaleQuestion({
  value,
  onChange,
  labels,
  min,
  max,
  options,
  sectionColor,
}: Props) {
  /*
   * COS-1216 — `fs()` steps these phone bases up on tablet breakpoints before
   * the patient's own accessibility scale is applied. The flagged risk of
   * double-scaling against the store's internal isTablet() turned out not to
   * exist: that only lifts the PHONE dampening, so on a default iPad
   * getScaledFontSize is the identity and this step is the only thing that
   * makes the row readable. See intake-legibility.ts.
   */
  const { colors, fs, fw, muted } = useIntakeLegibility();

  const useOptions = Array.isArray(options) && options.length > 0;

  // Normalise both API shapes into a single `{ value:number, label:string }[]`
  // list so the render path stays one branch.
  const rows: { value: number; label: string }[] = useOptions
    ? (options as IntakeQuestionOption[]).map((o) => ({
        value: typeof o.value === 'number' ? o.value : Number(o.value),
        label: o.label,
      }))
    : (() => {
        const lo = min ?? 0;
        const hi = max ?? 0;
        const out: { value: number; label: string }[] = [];
        for (let i = lo; i <= hi; i++) {
          out.push({ value: i, label: labels?.[i - lo] ?? String(i) });
        }
        return out;
      })();

  const accent = sectionColor ?? colors.tint;
  /*
   * COS-1221 — this was a hardcoded '#fff', which is 3.46:1 on SECTION_COLOR.life
   * and 3.55:1 on .body: under AA for normal text, on the very question the
   * stakeholder could not read. No one label colour clears 4.5:1 on all three
   * BPS accents, so it is measured per accent. See intake-legibility.ts for why
   * the accents themselves are not darkened instead.
   */
  const onAccent = readableOn(accent);

  return (
    <View style={styles.list}>
      {rows.map((r) => {
        const selected = value === r.value;
        return (
          <Pressable
            key={r.value}
            onPress={() => onChange(r.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            // The number is no longer worth reading aloud: it is not on screen,
            // it carries no meaning to the patient, and on an unlabelled scale
            // the label IS the number, so it announced "0, value 0".
            accessibilityLabel={r.label}
            style={[
              styles.row,
              {
                borderColor: selected ? accent : colors.border,
                backgroundColor: selected ? accent : colors.card,
              },
            ]}
          >
            <MaterialIcons
              name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
              size={fs(22)}
              color={selected ? onAccent : muted}
            />
            <Text
              style={{
                marginLeft: 10,
                flex: 1,
                color: selected ? onAccent : colors.text,
                fontSize: fs(16),
                fontWeight: fw(selected ? 600 : 500) as any,
              }}
            >
              {r.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    // Keeps the tap target at the 44pt minimum even at the smallest font scale.
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
  },
});
