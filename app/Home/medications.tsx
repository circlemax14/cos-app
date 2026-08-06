import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { MedicationsSection } from '@/components/health-plan/MedicationsSection';
import { MedicationsReviewPrompt } from '@/components/health-plan/MedicationsReviewPrompt';

export default function MedicationsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // Ken 2026-08-06 — screen simplified to a single Active/Past view
  // owned by MedicationsSection (which now consumes the plan-medications
  // ?includePast=1 endpoint from BE PR #365). The previous parallel
  // fetchMedicationsSummary Active/Past rendering was showing users a
  // duplicate flat list below the new one and burying the tap-to-expand
  // behavior. Only one source of truth now: plan-medications overlay,
  // which is what the patient can actually add / edit / discontinue
  // from this screen. Historical FHIR-only past meds (never in the
  // overlay) don't render — that's a nice-to-have for a follow-up.
  //
  // Bumped by the header "+" button so MedicationsSection's add flow
  // opens without the user having to scroll down to its own "+ Add"
  // affordance. Nonce pattern matches the openAddSignal contract on
  // MedicationsSection (see props doc at line ~175 of that file).
  const [addNonce, setAddNonce] = useState(0);

  return (
    <AppWrapper>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {/*
          Ken 2026-08-05 — header row: back icon + "Medications" title
          + "+" Add button, all vertically centered on ONE row. Prior
          layout stacked back / title / subtitle in three separate rows
          which read as three disconnected controls. The Add button
          hands to MedicationsSection's add flow via `openAddSignal`
          (bumped nonce) so the same modal editor handles both paths
          (in-list "+ Add medication" AND this header "+"). Subtitle
          moves to a second row so the title-row can stay a compact
          navigation bar without stretching.
        */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.replace('/Home/biopsychosocial-plan' as never)}
            style={styles.iconBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back to care plan"
          >
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            Medications
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setAddNonce((n) => n + 1)}
            style={[styles.iconBtn, { backgroundColor: `${colors.tint}14` }]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Add medication"
            accessibilityHint="Opens the add medication form"
          >
            <MaterialIcons name="add" size={getScaledFontSize(24)} color={colors.tint} />
          </Pressable>
        </View>
        {/* Ken 2026-08-06 — removed TodaysMedicationsCard. Its purpose
            (surface upcoming doses at a glance) now lives folded into
            the MedicationsBanner on the Plan/Home surfaces, so having
            it here as well was redundant. */}
        <MedicationsReviewPrompt onReviewNow={() => undefined} />
        {/* Owns the full Active / Past render + tap-to-expand active rows.
            When PLAN_MEDICATIONS_ENABLED is off on the server the section
            returns null and this screen renders only the header + today's
            card + review prompt — acceptable degraded state. */}
        <MedicationsSection openAddSignal={addNonce} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    marginLeft: -8,
    gap: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  title: { letterSpacing: -0.4 },
});
