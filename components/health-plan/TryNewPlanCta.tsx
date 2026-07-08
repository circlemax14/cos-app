/**
 * TryNewPlanCta — opt-in migration CTA #2 for the biopsychosocial (3-section)
 * Care Plan rebuild (COS-412 / SCRUM-518).
 *
 * health-plan.tsx's routing gate only ever renders `BiopsychosocialPlanScreen`
 * once a biopsychosocial plan RECORD exists — flag-on alone is not enough, so
 * existing users on a legacy plan (e.g. Ken) are never force-migrated
 * ("until Ken changes plan or requests to go through this option this should
 * not be forced on patients"). This card is how a user on the legacy screen
 * can request it themselves. The other trigger is a plan-type change in
 * `PlanTypeChooser`.
 *
 * Self-gates like `MedicationsReviewPrompt` elsewhere on this screen: hooks
 * run unconditionally, then the component renders null unless BOTH the
 * `BIOPSYCHOSOCIAL_PLAN_ENABLED` flag is on AND no bio plan record exists
 * yet. Once regenerate succeeds, `useBiopsychosocialPlan`'s query
 * invalidates and health-plan.tsx's routing gate flips the whole screen over
 * to `BiopsychosocialPlanScreen` — so this card simply stops rendering (its
 * host screen unmounts) rather than needing to navigate anywhere itself.
 *
 * COS-414 — visual redesign only: promoted from a small pill to a full-width
 * banner matching the "Personalize your plan" banner on
 * `PlanScreenRedesignedV2` (icon chip + title + subtitle + chevron) so it
 * carries the same visual weight instead of being easy to miss. Gating logic
 * and the confirm modal are unchanged.
 */
import React from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag';
import { useBiopsychosocialPlan, useRegenerateBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';

// Add an alpha suffix to a 6-digit hex color (e.g. tint + '14'). Mirrors the
// pattern used on PlanScreenRedesignedV2's own banners.
function alpha(hex: string, hh: string): string {
  return hex.length === 7 ? hex + hh : hex;
}

// Matches PlanScreenRedesignedV2's elevation(1) preset so this banner reads
// at the same visual weight as "Personalize your plan".
const bannerElevation = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
  },
  android: { elevation: 2 },
  default: {},
}) as object;

export function TryNewPlanCta(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const tint = colors.tint as string;

  // Hooks run unconditionally, gate on JSX below (rules-of-hooks safe even
  // though both the flag and the plan query resolve async).
  const flagEnabled = useBiopsychosocialPlanFlag();
  const bioPlanQuery = useBiopsychosocialPlan();
  const regenerateMutation = useRegenerateBiopsychosocialPlan();

  const [confirmVisible, setConfirmVisible] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const hasBioPlan = bioPlanQuery.data?.plan != null;

  // Nothing to show: flag off, or a bio plan already exists (health-plan.tsx
  // will already be routing to BiopsychosocialPlanScreen in that case).
  if (!flagEnabled || hasBioPlan) {
    return null;
  }

  const isGenerating = regenerateMutation.isPending;

  const onOpenConfirm = () => {
    setErrorMsg(null);
    setConfirmVisible(true);
  };

  const onCloseConfirm = () => {
    if (isGenerating) return; // don't let the sheet be dismissed mid-regenerate
    setConfirmVisible(false);
  };

  const onConfirmGenerate = () => {
    setErrorMsg(null);
    regenerateMutation.mutate(undefined, {
      // useRegenerateBiopsychosocialPlan already invalidates the
      // ['biopsychosocial-plan'] query on success — that's what makes
      // health-plan.tsx's routing gate pick up the new plan and swap
      // screens. We just need to close this sheet.
      onSuccess: () => setConfirmVisible(false),
      onError: () => setErrorMsg("Couldn't generate right now, try again."),
    });
  };

  return (
    <>
      <Pressable
        onPress={onOpenConfirm}
        accessibilityRole="button"
        accessibilityLabel="Try our new 3-section plan"
        accessibilityHint="Generates a new plan organized into Biological, Psychological, and Social & Spiritual sections"
        style={({ pressed }) => [
          styles.banner,
          bannerElevation,
          {
            backgroundColor: alpha(tint, '14'),
            borderColor: alpha(tint, '55'),
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={[styles.bannerIcon, { backgroundColor: alpha(tint, '22') }]}>
          <MaterialIcons name="auto-awesome" size={getScaledFontSize(22)} color={tint} />
        </View>
        <View style={{ flex: 1, marginLeft: Spacing.md - 4 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            Try our new 3-section plan
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 3, lineHeight: 18 }}>
            Get personalized insights across Biological, Psychological, and Social & Spiritual sections.
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={getScaledFontSize(24)} color={tint} />
      </Pressable>

      <Modal visible={confirmVisible} animationType="fade" transparent onRequestClose={onCloseConfirm}>
        <View style={styles.backdrop}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: (colors.card as string) + 'F2', borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.title,
                { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any },
              ]}
            >
              {isGenerating ? 'Generating your new plan…' : 'Try the new 3-section plan?'}
            </Text>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), lineHeight: 19 }}>
              {isGenerating
                ? 'Setting up your personalized plan across Biological, Psychological, and Social & Spiritual sections. This can take up to a minute.'
                : 'Generate a new personalized plan organized into 3 sections (Biological, Psychological, Social & Spiritual)? Your current plan will remain, and you can switch back anytime.'}
            </Text>

            {errorMsg ? (
              <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(12), marginTop: 10 }}>{errorMsg}</Text>
            ) : null}

            {isGenerating ? (
              <View style={styles.generatingRow}>
                <ActivityIndicator color={tint} />
              </View>
            ) : (
              <View style={styles.actions}>
                <Pressable
                  onPress={onCloseConfirm}
                  style={[styles.btn, { borderColor: colors.border }]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onConfirmGenerate}
                  style={[styles.btn, styles.btnPrimary, { backgroundColor: tint }]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                    Generate
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md - 2,
    borderWidth: 1,
    borderRadius: Radii.xl,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  title: { marginBottom: 8 },
  generatingRow: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  btnPrimary: { borderColor: 'transparent' },
});
