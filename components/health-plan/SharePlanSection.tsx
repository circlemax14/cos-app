/**
 * SharePlanSection — "Share as PDF" for the biopsychosocial Care Plan.
 *
 * Direct sibling of `patient-intake/ShareIntakeReportSection` (COS-452) and
 * `health-summary/ShareSummarySection` (SCRUM-591): the SAME expo-print →
 * expo-sharing pipeline, the SAME RN `Share` plain-text fallback for binaries
 * without those native modules linked, the SAME card + accent + button
 * treatment. Only the HTML differs, and that lives in the pure
 * `plan-pdf-builder.ts` next to this file.
 *
 * NO NEW DEPENDENCIES. `expo-print` and `expo-sharing` are already linked in
 * the current binary via ShareSummarySection / ShareIntakeReportSection, so
 * this ships OTA-safe — it introduces no native surface the shipped binary
 * doesn't already carry.
 *
 * Mounted at the tail of `BiopsychosocialPlanScreen`'s scroll content, in the
 * slot SCRUM-662 freed when the "Refresh my plan" / "Classic view" bottom
 * actions were removed.
 *
 * iOS 26.5 primitive envelope: View / Text / Pressable / MaterialIcons /
 * StyleSheet only. No Modal, no Animated, no ActivityIndicator, no SVG, no
 * gradient, no rotate. The pending affordance is parent-Pressable opacity +
 * a copy swap ("Preparing PDF…"), matching the shipped intake share button.
 */
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { useAiHealthPlan } from '@/hooks/use-plan-tasks';
import { usePlanMedications } from '@/hooks/use-plan-medications';
import { usePlanHabits } from '@/hooks/use-plan-habits';
import type { BiopsychosocialSectionKey } from './SectionCard';
import type { PlanTask } from '@/services/api/types';
import { buildPlanHtml, planHtmlToText } from './plan-pdf-builder';

// Same slate accent ShareIntakeReportSection uses, so the two share cards
// read as one system when a patient meets them on different surfaces.
const ACCENT = '#334155';

/**
 * Task category → BPS section, mirroring `sectionForCategory` in
 * BiopsychosocialPlanScreen.
 *
 * WHY DUPLICATED rather than imported: that helper is a module-private
 * function inside a large RN screen component. Importing it would mean
 * exporting internals from a screen and coupling this card's lifetime to
 * it; more importantly the pure builder must not reach into a .tsx. The
 * mapping is small and stable (it tracks cos-backend's
 * `care-plan-categories.ts` taxonomy, which is BE-enforced). If the
 * taxonomy changes, both copies must change — the keyword fallback arm
 * below means an unmapped category still lands somewhere sensible instead
 * of silently vanishing from the PDF.
 */
function sectionForCategory(category: string | undefined): BiopsychosocialSectionKey {
  switch (category) {
    case 'medical':
    case 'medication':
    case 'integrative':
    case 'adl':
    case 'cognitive':
      return 'biological';
    case 'mentalHealth':
      return 'psychological';
    case 'social':
    case 'spiritual':
      return 'social';
    default: {
      if (!category) return 'biological';
      const c = category.toLowerCase();
      if (/med|physical|sleep/.test(c)) return 'biological';
      if (/mental|anxi|depress|stress/.test(c)) return 'psychological';
      if (/social|family|spirit/.test(c)) return 'social';
      return 'biological';
    }
  }
}

export function SharePlanSection({
  patientName,
}: {
  /**
   * Patient's first name for the PDF header, threaded down from the screen
   * (which already receives it as a prop from the route parent). Optional so
   * a caller without it can still mount — the builder falls back to the
   * generic "My care plan" title.
   */
  patientName?: string | null;
}): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [sharing, setSharing] = useState(false);

  // Every one of these rides a query key the plan screen ALREADY observes
  // (['biopsychosocial-plan'], ['ai-health-plan'], ['plan-medications'],
  // and usePlanHabits' shared ['ai-health-plan']), so react-query dedupes
  // and this card adds ZERO extra network round-trips on the plan surface.
  const planQuery = useBiopsychosocialPlan();
  const aiPlanQuery = useAiHealthPlan();
  const medsQuery = usePlanMedications();
  const { habits } = usePlanHabits();

  const plan = planQuery.data?.plan ?? null;

  // Nothing to share until a plan exists. Matches the intake card's
  // `if (!intake) return null` — no empty-state noise on a surface the
  // patient hasn't populated yet.
  if (!plan) return null;

  // Entitlement gate. Hides the whole card, not just the button: the card is
  // nothing BUT the share control (heading, one-line pitch, disclaimer), so
  // gating the Pressable alone would leave "Share your plan / Send a PDF
  // copy…" advertising a feature with no way to use it. Same early-return
  // idiom as the `!plan` guard above — no new JSX, nothing added to the
  // cold-mount tree.

  const disabled = sharing;

  const buildHtml = (): string => {
    const allTasks: PlanTask[] = aiPlanQuery.data?.tasks ?? [];
    const tasksBySection: Record<BiopsychosocialSectionKey, PlanTask[]> = {
      biological: [],
      psychological: [],
      social: [],
    };
    for (const t of allTasks) tasksBySection[sectionForCategory(t.category)].push(t);

    return buildPlanHtml({
      patientName,
      planGeneratedAt: plan.generatedAt,
      sections: plan.sections,
      aiSummary: aiPlanQuery.data?.summary,
      tasksBySection,
      habits,
      // Fetched WITHOUT includePast, so discontinued rows shouldn't be here
      // at all; the builder's selectCurrentMedications is the second gate.
      medications: medsQuery.data?.medications,
    });
  };

  const shareTextFallback = async (html: string) => {
    const message = planHtmlToText(html);
    await Share.share({ message, title: 'My care plan' }, { subject: 'My care plan' });
  };

  const onShare = async () => {
    if (disabled) return;
    setSharing(true);
    const html = buildHtml();
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share care plan',
          UTI: 'com.adobe.pdf',
        });
      } else {
        // Native module present but sharing unavailable — degrade to text.
        await shareTextFallback(html);
      }
    } catch {
      // Old binary without the expo-print/expo-sharing modules linked (or a
      // transient failure) — fall back to a plain-text share so the button
      // still works. The disclaimer survives the strip (see planHtmlToText).
      try {
        await shareTextFallback(html);
      } catch {
        Alert.alert('Could not share', 'Please try again in a moment.');
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconChip, { backgroundColor: ACCENT + '1A' }]}>
          <MaterialIcons
            name="picture-as-pdf"
            size={getScaledFontSize(20)}
            color={ACCENT}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(17),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            }}
          >
            Share your plan
          </Text>
          <Text
            style={{
              color: colors.subtext,
              marginTop: 2,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
            }}
          >
            Send a PDF copy of your care plan to a doctor, caregiver, or family member.
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onShare}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Share care plan as PDF"
        accessibilityHint="Generates a PDF of your care plan and opens the share sheet"
        accessibilityState={{ disabled, busy: sharing }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: ACCENT,
            opacity: disabled ? 0.7 : pressed ? 0.7 : 1,
          },
        ]}
      >
        <MaterialIcons name="share" size={getScaledFontSize(18)} color="#fff" />
        <Text
          style={{
            color: '#fff',
            marginLeft: 8,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          }}
        >
          {sharing ? 'Preparing PDF…' : 'Share as PDF'}
        </Text>
      </Pressable>

      {/*
        Non-medical-record notice repeated ON SCREEN, not just inside the
        PDF. A patient should know what they're about to hand a clinician
        BEFORE the share sheet opens, not after they've sent it.
      */}
      <Text
        style={{
          color: colors.subtext,
          marginTop: Spacing.sm,
          fontSize: getScaledFontSize(11),
          fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
        }}
      >
        This is a snapshot of your plan, not a medical record.
      </Text>
    </View>
  );
}

export default SharePlanSection;

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // 44pt minimum tap target: 12pt padding top/bottom + ~20pt line box
    // clears 44 at default text scale and grows with getScaledFontSize.
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
  },
});
