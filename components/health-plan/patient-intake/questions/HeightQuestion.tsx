/**
 * COS-927 — ask for a height the way the patient would say it.
 *
 * Vishal: "we are just asking for the number, but there can also be two
 * options — anyone can enter in centimeters, or anyone can enter in five feet
 * and inches."
 *
 * It rendered through the generic NumberQuestion, so the question read "How
 * tall are you?" above an empty box with the placeholder "0". Nothing on the
 * screen said inches. Someone 180 cm tall types 180, which is fifteen feet,
 * and the server accepts it — 36 to 96 is the range, so 180 is rejected, but
 * 170 is not, and that patient is silently recorded as fourteen feet two.
 *
 * ─── WHAT IS STORED IS UNCHANGED ─────────────────────────────────────
 *
 * Still `height_in`, still a number of inches. lib/height-units.ts explains
 * why that is not up for revisiting — BMI, health age and every existing
 * patient answer are all in inches. The toggle is an input affordance.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable / TextInput only, which is what the sibling question
 * components already use. No new primitives, no wrappers.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  cmToInches,
  ftInToInches,
  inchesToCm,
  inchesToFtIn,
  preferredUnitFor,
  type HeightUnit,
} from '@/lib/height-units';

interface Props {
  /** Total inches, as stored. Null when unanswered. */
  value: number | null;
  onChange: (v: number | null) => void;
}

export default function HeightQuestion({ value, onChange }: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [unit, setUnit] = useState<HeightUnit>(() => preferredUnitFor(value));

  /*
   * Local text mirrors, for the same reason NumberQuestion has one: a patient
   * mid-type is in a state that does not coerce to a number ("5", "17"), and
   * driving the boxes straight from the stored value would fight them —
   * clearing the feet box to retype it would rewrite the answer to null and
   * then bounce the cursor.
   */
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [cm, setCm] = useState('');

  /*
   * Re-seed from the stored value when it changes underneath us — an EHR
   * prefill, or the patient stepping back to this question. Keyed on unit too,
   * so switching units refills the boxes for the new one.
   *
   * It deliberately does NOT re-seed on every keystroke: `value` changes as
   * they type, but the effect writes the SAME text back, so the cursor holds.
   */
  useEffect(() => {
    if (unit === 'cm') {
      const asCm = inchesToCm(value ?? Number.NaN);
      setCm(asCm == null ? '' : String(asCm));
      return;
    }
    const parts = inchesToFtIn(value ?? Number.NaN);
    setFeet(parts == null ? '' : String(parts.feet));
    setInches(parts == null ? '' : String(parts.inches));
  }, [value, unit]);

  const digitsOnly = (t: string) => t.replace(/[^0-9]/g, '');

  function commitFtIn(f: string, i: string) {
    // Both boxes empty is "not answered", not "zero feet".
    if (f === '' && i === '') {
      onChange(null);
      return;
    }
    // One box filled is a real answer: 5 ft on its own means 5 ft 0 in, and
    // making someone type a 0 to be understood is a worse form.
    onChange(ftInToInches(Number(f || '0'), Number(i || '0')));
  }

  function commitCm(t: string) {
    if (t === '') {
      onChange(null);
      return;
    }
    onChange(cmToInches(Number(t)));
  }

  const inputStyle = {
    color: colors.text,
    borderColor: colors.border,
    backgroundColor: colors.background,
    fontSize: getScaledFontSize(16),
  };

  return (
    <View style={styles.wrap}>
      {/*
        The toggle sits ABOVE the boxes, not beside or below them. It is the
        first decision — reading "How tall are you?" and then a box is exactly
        the ambiguity this fixes — and below the input it would be under the
        keyboard the moment they tap in.
      */}
      <View
        style={[styles.toggle, { borderColor: colors.border, backgroundColor: colors.background }]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Height unit"
      >
        {(['ftin', 'cm'] as const).map((u) => {
          const active = unit === u;
          const label = u === 'ftin' ? 'Feet & inches' : 'Centimetres';
          return (
            <Pressable
              key={u}
              onPress={() => setUnit(u)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              accessibilityHint="Changes the unit. Your answer is kept."
              style={[styles.toggleBtn, active && { backgroundColor: colors.tint }]}
            >
              <Text
                style={{
                  color: active ? '#FFFFFF' : colors.text,
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(active ? 600 : 400) as never,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {unit === 'ftin' ? (
        <View style={styles.row}>
          <View style={styles.field}>
            <TextInput
              value={feet}
              onChangeText={(t) => {
                const c = digitsOnly(t);
                setFeet(c);
                commitFtIn(c, inches);
              }}
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor={colors.subtext}
              maxLength={1}
              style={[styles.input, inputStyle]}
              accessibilityLabel="Height, feet"
            />
            <Text style={[styles.suffix, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              ft
            </Text>
          </View>
          <View style={styles.field}>
            <TextInput
              value={inches}
              onChangeText={(t) => {
                const c = digitsOnly(t);
                setInches(c);
                commitFtIn(feet, c);
              }}
              keyboardType="number-pad"
              placeholder="11"
              placeholderTextColor={colors.subtext}
              maxLength={2}
              style={[styles.input, inputStyle]}
              accessibilityLabel="Height, inches"
            />
            <Text style={[styles.suffix, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              in
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.field}>
          <TextInput
            value={cm}
            onChangeText={(t) => {
              const c = digitsOnly(t);
              setCm(c);
              commitCm(c);
            }}
            keyboardType="number-pad"
            placeholder="180"
            placeholderTextColor={colors.subtext}
            maxLength={3}
            style={[styles.input, inputStyle]}
            accessibilityLabel="Height in centimetres"
          />
          <Text style={[styles.suffix, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            cm
          </Text>
        </View>
      )}

      {/*
        The other unit, read back. It is the confirmation that the toggle did
        what they expected, and it catches a mis-tap on the toggle before they
        move on — 180 entered as feet-and-inches shows an absurd centimetre
        figure right where they are already looking.
      */}
      {value != null && value > 0 ? (
        <Text
          style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}
          accessibilityLabel={
            unit === 'cm'
              ? `That is ${String(inchesToFtIn(value)?.feet ?? 0)} feet ${String(inchesToFtIn(value)?.inches ?? 0)} inches.`
              : `That is ${String(inchesToCm(value) ?? 0)} centimetres.`
          }
        >
          {unit === 'cm'
            ? `That's ${String(inchesToFtIn(value)?.feet ?? 0)} ft ${String(inchesToFtIn(value)?.inches ?? 0)} in`
            : `That's ${String(inchesToCm(value) ?? 0)} cm`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  toggleBtn: {
    flex: 1,
    // 44, not 42: Apple's minimum tap target. Measured at 42 in the layout
    // check, which is the kind of two-pixel miss nobody notices until someone
    // with a tremor cannot switch units.
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    paddingHorizontal: 8,
  },
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  suffix: { minWidth: 22 },
});
