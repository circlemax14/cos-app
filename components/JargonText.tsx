/**
 * JargonText — wraps a piece of text and, if it matches a known clinical
 * term, attaches a long-press popover that shows the plain-language
 * explanation. No-op if the term isn't in the glossary.
 *
 * Usage:
 *   <JargonText style={...}>{diagnosis.name}</JargonText>
 *
 * The glossary seed list covers ~17 high-frequency terms surfaced in our
 * existing FHIR samples. Expand based on user feedback.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextStyle, StyleSheet } from 'react-native';
import { Modal, Portal } from 'react-native-paper';

const CLINICAL_GLOSSARY: Record<string, string> = {
  // status terms
  'in remission': 'The condition has temporarily improved or paused. It may come back.',
  'remission': 'The condition has temporarily improved or paused. It may come back.',
  'recurrence': 'The condition has come back after a period of improvement.',
  'relapse': 'The condition has returned after improving.',
  'resolved': 'The condition has gone away.',
  'inactive': 'The condition is not currently affecting you.',
  'uncontrolled': 'The condition is not yet well-managed by current treatment.',
  'stable': 'The condition is not getting worse.',
  // common diagnoses
  'hypertension': 'High blood pressure.',
  'hyperlipidemia': 'High cholesterol.',
  'type 2 diabetes': 'A long-term condition where blood sugar runs high.',
  'type 1 diabetes': 'A condition where the body does not make enough insulin.',
  'asthma': 'A breathing condition where airways tighten and inflame.',
  'gerd': 'Acid reflux — stomach acid backing up into the throat.',
  // medication concepts
  'authored on': 'The date your provider wrote this prescription.',
  'dosage': 'How much of the medicine you take.',
  'frequency': 'How often you take the medicine.',
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pre-sort glossary keys by descending length so longer phrases win first
// (e.g. "type 2 diabetes" before "diabetes", "in remission" before "remission").
const GLOSSARY_KEYS_LONGEST_FIRST = Object.keys(CLINICAL_GLOSSARY).sort(
  (a, b) => b.length - a.length,
);

function lookupExplanation(term: string): string | null {
  const key = term.trim().toLowerCase();
  if (CLINICAL_GLOSSARY[key]) return CLINICAL_GLOSSARY[key];
  // Word-boundary substring fallback: match each glossary key only when it
  // appears as a complete word in `key` (so "stable" does NOT match
  // "Stable Angina"). Iterate longest-first so "type 2 diabetes" beats
  // "diabetes" when both would match.
  for (const glossKey of GLOSSARY_KEYS_LONGEST_FIRST) {
    const re = new RegExp(`\\b${escapeRegex(glossKey)}\\b`);
    if (re.test(key)) return CLINICAL_GLOSSARY[glossKey];
  }
  return null;
}

interface JargonTextProps {
  children: string;
  style?: TextStyle | TextStyle[];
}

export function JargonText({ children, style }: JargonTextProps) {
  // Defensive coercion: if a caller passes a non-string (number, null,
  // undefined), avoid crashing inside lookupExplanation's .trim() call.
  const text = typeof children === 'string' ? children : String(children ?? '');
  const explanation = useMemo(() => lookupExplanation(text), [text]);
  const [popoverVisible, setPopoverVisible] = useState(false);

  if (!explanation) {
    return <Text style={style}>{text}</Text>;
  }

  return (
    <>
      <Pressable
        onLongPress={() => setPopoverVisible(true)}
        accessibilityRole="button"
        accessibilityHint="Long press for plain-language explanation"
      >
        <Text
          style={[
            style as TextStyle | TextStyle[] | undefined,
            { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
          ]}
        >
          {text}
        </Text>
      </Pressable>
      <Portal>
        <Modal
          visible={popoverVisible}
          onDismiss={() => setPopoverVisible(false)}
          contentContainerStyle={styles.popover}
        >
          <Text style={styles.popoverTerm}>{text}</Text>
          <Text style={styles.popoverExplanation}>{explanation}</Text>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  popover: {
    margin: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  popoverTerm: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  popoverExplanation: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },
});
