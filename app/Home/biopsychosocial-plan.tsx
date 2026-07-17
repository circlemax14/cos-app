/**
 * Biopsychosocial plan route (COS-438).
 *
 * Kenneth's 2026-07-10 feedback: "where is my old plan, this biopsychosicial
 * plan should be an extension so we can give patients more refined services."
 * Bio used to hard-replace the legacy plan on the Care Plan tab whenever
 * `hasBiopsychosocialPlan` was true — hiding it entirely. This route makes
 * bio a peer of the legacy plan instead: legacy stays the default Care
 * Plan tab, and users push into this route via a "View your biopsychosocial
 * insights" link on the legacy plan when they want the deeper view.
 *
 * Owns the bio Modal state + mutation here (mirrors the pattern from
 * COS-433 — parent-owned Modal, not descendant-owned — even though COS-435
 * proved the real iOS 26.5 crash trigger was GoalCard's render density and
 * not Modal co-location. Keeping the defensive pattern costs almost
 * nothing and preserves the guarantee.
 *
 * If a user lands here without a bio plan record (edge case: notification
 * deep-link after backend deleted the record, or manual URL entry), we
 * silently redirect back to `/Home/health-plan` rather than render an
 * empty bio screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import { BiopsychosocialPlanScreen } from '@/components/health-plan/BiopsychosocialPlanScreen';
import { BioGoalEditorModal } from '@/components/health-plan/BioGoalEditorModal';
import { TryUnifiedPlanBanner } from '@/components/unified-plan/TryUnifiedPlanBanner';
import { useBiopsychosocialPlan, useUpdateBioGoal } from '@/hooks/use-biopsychosocial-plan';
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag';
import { usePlanType } from '@/hooks/use-plan-type';
import { usePatientInfo } from '@/hooks/use-patient';
import { useAccessibility } from '@/stores/accessibility-store';
import { Colors } from '@/constants/theme';
import { knownSubdomains } from '@/lib/bps-subdomains';
import type { MeasurableGoal } from '@/services/api/biopsychosocial-plan';
import type { GoalPatch } from '@/services/api/ai-health-plan';

/** Pure helper — no hooks — mirrors app/Home/health-plan.tsx's version. */
function firstNameFromPatient(
  patient: { name?: { given?: string[]; family?: string }[] } | undefined,
): string | null {
  const given = patient?.name?.[0]?.given?.[0];
  return given && given.trim() ? given.trim() : null;
}

export default function BiopsychosocialPlanRoute(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const biopsychosocialPlanEnabled = useBiopsychosocialPlanFlag();
  const planQuery = useBiopsychosocialPlan();
  const patientQuery = usePatientInfo();
  const planTypeQuery = usePlanType();
  const patientName = firstNameFromPatient(patientQuery.data);
  const currentPlanType = planTypeQuery.planType;

  const openPlanTypeChooser = useCallback(() => {
    router.push('/Home/plan-type-chooser' as never);
  }, []);

  /*
   * Bio goal-editor Modal state — owned by this route (the "long-resident
   * parent" for anything under this route), same pattern the previous
   * health-plan.tsx used before COS-438. See file header for iOS 26.5
   * defensive-pattern rationale.
   */
  const [bioEditGoal, setBioEditGoal] = useState<MeasurableGoal | null>(null);
  const [bioEditTitle, setBioEditTitle] = useState('');
  const [bioEditDesc, setBioEditDesc] = useState('');
  const [bioEditTarget, setBioEditTarget] = useState('');
  const [bioEditTimeframe, setBioEditTimeframe] = useState('');
  const [bioEditSubdomains, setBioEditSubdomains] = useState<string[]>([]);
  const updateBioGoalMutation = useUpdateBioGoal();

  const openBioGoalEditor = useCallback((g: MeasurableGoal) => {
    setBioEditGoal(g);
    setBioEditTitle(g.title);
    setBioEditDesc(g.description ?? '');
    setBioEditTarget(g.target ?? '');
    setBioEditTimeframe(g.timeframe ?? '');
    setBioEditSubdomains(knownSubdomains(g.subdomains));
  }, []);

  const closeBioGoalEditor = useCallback(() => setBioEditGoal(null), []);

  const toggleBioSubdomain = useCallback((key: string) => {
    setBioEditSubdomains((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const saveBioGoalEdit = useCallback(async () => {
    if (!bioEditGoal) return;
    const patch: GoalPatch = {};
    if (bioEditTitle !== bioEditGoal.title) patch.title = bioEditTitle;
    if (bioEditDesc !== (bioEditGoal.description ?? '')) patch.description = bioEditDesc;
    if (bioEditTarget !== (bioEditGoal.target ?? '')) patch.target = bioEditTarget;
    if (bioEditTimeframe !== (bioEditGoal.timeframe ?? '')) patch.timeframe = bioEditTimeframe;
    const currentSubs = knownSubdomains(bioEditGoal.subdomains);
    if (
      currentSubs.length !== bioEditSubdomains.length ||
      currentSubs.some((k, i) => k !== bioEditSubdomains[i])
    ) {
      patch.subdomains = bioEditSubdomains;
    }
    try {
      await updateBioGoalMutation.mutateAsync({ goalId: bioEditGoal.id, patch });
      closeBioGoalEditor();
    } catch {
      Alert.alert('Error', 'Failed to save goal. Please try again.');
    }
  }, [
    bioEditGoal,
    bioEditTitle,
    bioEditDesc,
    bioEditTarget,
    bioEditTimeframe,
    bioEditSubdomains,
    updateBioGoalMutation,
    closeBioGoalEditor,
  ]);

  /*
   * If bio flag is off OR no plan record exists, silently kick user back
   * to the main Care Plan tab. Uses replace so the back button doesn't
   * lead into a dead route.
   */
  const hasBioPlan =
    biopsychosocialPlanEnabled && planQuery.data?.plan != null;
  const hasBioPlanDataReady = !planQuery.isLoading;

  useEffect(() => {
    if (hasBioPlanDataReady && !hasBioPlan) {
      router.replace('/Home/health-plan' as never);
    }
  }, [hasBioPlanDataReady, hasBioPlan]);

  if (!hasBioPlan) return null;

  return (
    <>
      {/* COS-467 Phase 2 — opt-in banner for the unified BPS plan view.
          Self-gates on useUnifiedPlan().disabled + 7-day AsyncStorage
          dismissal, so this is inert whenever the BE flag is off. */}
      <TryUnifiedPlanBanner source="bps" />
      <BiopsychosocialPlanScreen
        currentPlanType={currentPlanType}
        onChangePlanType={openPlanTypeChooser}
        onEditGoal={openBioGoalEditor}
        patientName={patientName}
      />
      <BioGoalEditorModal
        visible={bioEditGoal !== null}
        colors={colors as unknown as Record<string, string>}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
        title={bioEditTitle}
        description={bioEditDesc}
        target={bioEditTarget}
        timeframe={bioEditTimeframe}
        subdomains={bioEditSubdomains}
        onChangeTitle={setBioEditTitle}
        onChangeDescription={setBioEditDesc}
        onChangeTarget={setBioEditTarget}
        onChangeTimeframe={setBioEditTimeframe}
        onToggleSubdomain={toggleBioSubdomain}
        onClose={closeBioGoalEditor}
        onSave={saveBioGoalEdit}
        saving={updateBioGoalMutation.isPending}
      />
    </>
  );
}
