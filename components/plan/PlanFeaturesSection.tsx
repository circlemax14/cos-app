/**
 * COS-745 — "Your plan includes": what the patient's plan actually unlocks.
 *
 * ─── WHY THE GENERATE BUTTON IS GONE ─────────────────────────────────
 *
 * The Care Plan tab used to be one big "Generate your Health Plan" call to
 * action. That button was never the point — it is a MANUAL FALLBACK for
 * something that already happens by itself: cos-webhook step 5 POSTs
 * /v1/internal/health-plan/generate whenever health records are ingested.
 *
 * So the tab now shows what the plan gives you, and the daily plan appears on
 * its own once there are records to build it from.
 *
 * ─── THE RISK THIS FILE HAS TO COVER ─────────────────────────────────
 *
 * Removing the button means a patient with no plan yet has nothing to tap.
 * That is a dead screen unless it explains itself, so the status line below is
 * not decoration — it is the whole reason removing the button is safe:
 *
 *   no records connected  → say so, and offer the screen that fixes it
 *   records, no plan yet  → say it is being built, and roughly how long
 *
 * "Nothing here" with no explanation and no next step would be worse than the
 * button we removed.
 *
 * ─── THE TILES COME FROM THE BACKEND ─────────────────────────────────
 *
 * /v1/patients/me/plans/features returns label, description and route per
 * feature, resolved from the patient's live entitlements. Nothing is
 * hardcoded, so an admin adding a feature to a plan makes it appear here with
 * no app release — which is the entire point of the plan model.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable only.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { usePatientPlans } from '@/components/plan/PlanStatusSection';

/*
 * COS-754 — the local fetch is gone. The list it fed was removed in COS-752,
 * and the only thing this component still needs is whether a plan has been
 * chosen, which usePatientPlans already answers for PlanStatusSection.
 * Keeping a second query would have meant two sources for one question.
 */

interface Props {
  colors: { text: string; subtext?: string; tint: string; card?: string; border?: string };
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => number | string;
  /** False when the patient has connected no health records. */
  hasConnectedRecords: boolean;
}

export default function PlanFeaturesSection({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  hasConnectedRecords,
}: Props) {
  const { data } = usePatientPlans();

  /*
   * COS-754 — say nothing until a plan is chosen.
   *
   * This block answers "where is my daily plan?". Somebody still picking a
   * plan has not asked that yet, so showing "Building your daily plan" under
   * the chooser answered a question they had not reached, and implied work
   * was already under way on a plan they had not selected.
   *
   * Keyed off the billing summary — the same signal PlanStatusSection uses to
   * choose between the shelf and the chip — so the two cannot disagree about
   * which state the screen is in.
   */
  if (!data?.billing?.planName) return null;

  return (
    <View style={styles.wrap}>
      {/*
        The daily-plan status. Shown FIRST because it answers the question a
        patient actually arrives with — "where is my plan?" — which the tiles
        below do not.
      */}
      <View style={[styles.status, { borderColor: colors.border ?? '#E0E0E0' }]}>
        <Text
          style={[
            styles.statusTitle,
            { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as never },
          ]}
        >
          {hasConnectedRecords ? 'Building your daily plan' : 'Connect your health records'}
        </Text>
        <Text style={[styles.statusBody, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(13) }]}>
          {hasConnectedRecords
            ? 'We’re putting together your goals and tasks from your records. This can take a few minutes — it’ll appear here on its own.'
            : 'Once a clinic is connected we’ll build your daily plan automatically, with goals and tasks tailored to your care.'}
        </Text>
        {!hasConnectedRecords && (
          <Pressable
            onPress={() => router.push('/Home/connect-clinics' as never)}
            accessibilityRole="button"
            accessibilityLabel="Connect a clinic"
            style={[styles.statusBtn, { backgroundColor: colors.tint }]}
          >
            <Text style={[styles.statusBtnText, { fontSize: getScaledFontSize(14) }]}>Connect a clinic</Text>
          </Pressable>
        )}
      </View>

      {/*
        COS-752 — the feature list is GONE from this screen.

        It listed "Your care plan", "Medications", "Appointments" and the rest.
        Those are internal plumbing: the names of things the app is built out
        of, not things a patient thinks of as belonging to them. A patient
        opening Care Plan wants their day, and reads a list of app sections as
        either a menu they did not ask for or a bill of materials.

        The data still exists on /v1/patients/me/plans/features and still
        drives what a plan grants. It is simply not something to show someone.

        What stays is the one thing they need here: why there is no plan yet,
        and what to do about it.
      */}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 },
  status: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 22 },
  statusTitle: { marginBottom: 6 },
  statusBody: { lineHeight: 19 },
  statusBtn: { borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  statusBtnText: { color: '#FFFFFF', fontWeight: '700' },

  heading: { letterSpacing: 1, marginBottom: 10 },
  tile: { borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 8 },
  tileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileLabel: { flex: 1 },
  chev: { marginLeft: 8 },
  tileDesc: { marginTop: 3, lineHeight: 17 },
  // Dashed + faded so it reads as "not yours yet" rather than "broken".
  tileLocked: { backgroundColor: 'transparent', borderStyle: 'dashed', opacity: 0.6 },
});
