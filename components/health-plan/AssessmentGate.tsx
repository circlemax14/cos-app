/**
 * COS-761 — assessments due, taken before the care plan is shown.
 *
 * ─── THE FLOW ────────────────────────────────────────────────────────
 *
 * The plan's cadence decides when a reassessment falls due. The sweeper
 * creates the request and pushes "your assessments are ready". The patient
 * opens the Care Plan tab and lands HERE rather than on their plan; they work
 * through what is due, results are stored, and the plan comes back. Next
 * cycle, the same loop — which is what gives the progress graphs regular,
 * evenly spaced data points instead of whenever somebody happened to engage.
 *
 * ─── WHY THIS IS A SEPARATE COMPONENT ────────────────────────────────
 *
 * BiopsychosocialPlanScreen is ~2600 lines and has crashed production from
 * cold-mount rendering. It gets ONE early return pointing here, below every
 * hook — a hook-count change on that screen is the documented SIGABRT. All
 * the gate's own logic lives in this file where it cannot perturb that.
 *
 * ─── WHAT STAYS REACHABLE ────────────────────────────────────────────
 *
 * The drawer (AppWrapper's hamburger) is deliberately kept, because it is the
 * route to emergency contact and allergies. Medications gets an explicit link
 * on the gate: MedicationsBanner on the plan behind this is the only in-plan
 * path to them, and a cadence nudge should not stand between a patient and
 * what they take today.
 *
 * Crisis support is on the gate for the same reason. PCL-5 and ACE are seeded
 * instruments; a trauma screener with no route to help behind it is the one
 * version of this screen that could do harm.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable / ScrollView only, static, no animation. This is a
 * first-paint path on a screen with a crash history.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PatientRetakeRequestView } from '@/services/api/retake-requests';
import { retakeStartRoute } from '@/components/health-plan/retake-request/RetakeRequestInboxCard';

export interface AssessmentGateProps {
  due: PatientRetakeRequestView[];
  colors: { text: string; subtext: string; tint?: string; card?: string; border?: string; background?: string };
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => number | string;
  /** Human label for an instrument key; falls back to the key. */
  labelFor?: (instrumentKey: string) => string;
}

/**
 * A request blocks the plan when it is pending and not snoozed into the future.
 *
 * Snooze is honoured because it is an existing, deliberate product behaviour:
 * a patient who deferred an hour ago should not hit a wall for that hour. It
 * is the sweeper's `mandatory` flag that decides whether snooze was offered in
 * the first place.
 */
export function blockingRequests(
  rows: readonly PatientRetakeRequestView[] | undefined,
  nowIso: string,
): PatientRetakeRequestView[] {
  if (!rows?.length) return [];
  return rows.filter(
    (r) => r.status === 'pending' && !(r.snoozeUntil && r.snoozeUntil > nowIso),
  );
}

export default function AssessmentGate({
  due,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  labelFor,
}: AssessmentGateProps) {
  const first = due[0];
  const name = (k: string) => labelFor?.(k) ?? k;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background ?? '#FFFFFF' }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.icon, { backgroundColor: (colors.tint ?? '#0D9488') + '18' }]}>
        <MaterialIcons name="assignment" size={32} color={colors.tint ?? '#0D9488'} />
      </View>

      <Text
        style={[
          styles.title,
          { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as never },
        ]}
      >
        {due.length === 1 ? 'Your check-in is ready' : 'Your check-ins are ready'}
      </Text>

      <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
        {due.length === 1
          ? 'Answer a few questions and your care plan will update with the results.'
          : `Answer ${String(due.length)} short sets of questions and your care plan will update with the results.`}
      </Text>

      {due.map((r) => (
        <View key={r.id} style={[styles.row, { borderColor: colors.border ?? '#E0E0E0' }]}>
          <MaterialIcons name="radio-button-unchecked" size={getScaledFontSize(18)} color={colors.subtext} />
          <Text style={[styles.rowText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            {name(r.instrumentKey)}
          </Text>
        </View>
      ))}

      {first && (
        <Pressable
          onPress={() => router.push(retakeStartRoute(first.instrumentKey) as never)}
          accessibilityRole="button"
          accessibilityLabel={`Start ${name(first.instrumentKey)}`}
          style={[styles.cta, { backgroundColor: colors.tint ?? '#0D9488' }]}
        >
          <Text style={[styles.ctaText, { fontSize: getScaledFontSize(15) }]}>Start now</Text>
        </Pressable>
      )}

      {/*
        Medications stays reachable. The banner on the plan behind this gate is
        the only in-plan route to them, and what a patient takes TODAY should
        not sit behind a questionnaire about next month.
      */}
      <Pressable
        onPress={() => router.push('/Home/medications' as never)}
        accessibilityRole="button"
        accessibilityLabel="View your medications"
        style={[styles.secondary, { borderColor: colors.border ?? '#E0E0E0' }]}
      >
        <MaterialIcons name="medication" size={getScaledFontSize(18)} color={colors.text} />
        <Text style={[styles.secondaryText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
          Your medications
        </Text>
      </Pressable>

      {/*
        Crisis support. PCL-5 and ACE are seeded instruments — a trauma
        screener with no route to help behind it is the version of this screen
        that could do harm.
      */}
      <Text style={[styles.crisis, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
        If you need urgent help, call or text 988 (Suicide &amp; Crisis Lifeline), or 911 in an emergency.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 24, paddingTop: 40, alignItems: 'center' },
  icon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { textAlign: 'center', marginBottom: 8 },
  body: { textAlign: 'center', lineHeight: 21, maxWidth: 300, marginBottom: 22 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch',
    borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 8,
  },
  rowText: { flex: 1 },
  cta: { alignSelf: 'stretch', borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  ctaText: { color: '#FFFFFF', fontWeight: '700' },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    alignSelf: 'stretch', borderWidth: 1, borderRadius: 999, paddingVertical: 13, marginTop: 10,
  },
  secondaryText: { fontWeight: '600' },
  crisis: { textAlign: 'center', lineHeight: 19, marginTop: 22, maxWidth: 320 },
});
