/**
 * JargonText — wraps a piece of text and, if it matches a known clinical
 * term, attaches a long-press popover that shows the plain-language
 * explanation. No-op if the term isn't in the glossary.
 *
 * Usage:
 *   <JargonText style={...}>{diagnosis.name}</JargonText>
 *
 * The glossary seed list covers ~25 high-frequency terms surfaced in our
 * existing FHIR samples. Expand based on user feedback.
 */
import React, { useState } from 'react';
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

function lookupExplanation(term: string): string | null {
  const key = term.trim().toLowerCase();
  if (CLINICAL_GLOSSARY[key]) return CLINICAL_GLOSSARY[key];
  // Also try matching the last word/phrase (e.g. "Asthma → Resolved" → "resolved")
  for (const [glossKey, explanation] of Object.entries(CLINICAL_GLOSSARY)) {
    if (key.includes(glossKey)) return explanation;
  }
  return null;
}

interface JargonTextProps {
  children: string;
  style?: TextStyle | TextStyle[];
}

export function JargonText({ children, style }: JargonTextProps) {
  const explanation = lookupExplanation(children);
  const [popoverVisible, setPopoverVisible] = useState(false);

  if (!explanation) {
    return <Text style={style}>{children}</Text>;
  }

  return (
    <>
      <Pressable
        onLongPress={() => setPopoverVisible(true)}
        accessibilityRole="button"
        accessibilityHint="Long press for plain-language explanation"
      >
        <Text style={style}>{children}</Text>
      </Pressable>
      <Portal>
        <Modal
          visible={popoverVisible}
          onDismiss={() => setPopoverVisible(false)}
          contentContainerStyle={styles.popover}
        >
          <Text style={styles.popoverTerm}>{children}</Text>
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
