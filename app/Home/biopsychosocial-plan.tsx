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
import { router, useLocalSearchParams } from 'expo-router';

import {
  BiopsychosocialPlanScreen,
  BPS_MODAL_CONSOLIDATION_ENABLED,
} from '@/components/health-plan/BiopsychosocialPlanScreen';
import { BioGoalEditorModal } from '@/components/health-plan/BioGoalEditorModal';
import { TryUnifiedPlanBanner } from '@/components/unified-plan/TryUnifiedPlanBanner';
import { TryUnifiedViewLink } from '@/components/unified-plan/ClassicViewLink';
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

  /*
   * COS-469 / Phase 4 — `?classic=1` is the stable bypass-hook when the
   * default-flip is on and the user came in via ClassicViewLink. Read
   * defensively but take no action today; this param exists so any
   * future auto-forward-to-unified redirect has a documented escape.
   *
   * CHUNK 55 (2026-07-22): also read `?focus=` and forward its value
   * unmodified to BiopsychosocialPlanScreen as `deepLinkFocus`. The
   * child owns the scroll/timer/refs so the meds-focus behavior lives
   * in a single place (not split across the route and screen).
   * Non-'medications' values are no-ops downstream — the child
   * short-circuits before its timer registers. Route-parent reads
   * only, no local effect: everything happens inside the screen.
   *
   * NOTE: MEDICATION_REFILL_REMINDER push currently routes to
   * `/Home/health-plan?focus=medications` (lib/notification-routing.ts:63-64),
   * not this route. Once BPS is the default surface (or once we ship a
   * BPS-first push handler), a one-line change to that router points the
   * push here and this `focus` read starts firing on push taps too.
   */
  const { focus } = useLocalSearchParams<{ classic?: string; focus?: string }>();
  const deepLinkFocus = typeof focus === 'string' ? focus : null;

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

  /*
   * CHUNK 41 (2026-07-21): fire-and-forget Save.
   *
   * Prior shape was `await mutateAsync(...)` then `closeBioGoalEditor()`
   * in a try/catch with an Alert.alert on failure. Awaiting the axios
   * response while the BioGoalEditorModal was STILL mounted was the exact
   * chunk-9.5 SIGABRT shape on iOS 26.5 (turbomodule queue) — same class
   * as the regen crash chunk 40 fixed.
   *
   * New shape: fire `.mutate` (no await, no return-value read), close the
   * Modal on the very next line (same tick as the tap). Modal unmounts
   * before any HTTP response could arrive. The `useUpdateBioGoal` hook's
   * pending-window latch (8s) keeps `isPending` true so `onSuccess`
   * invalidate fires AFTER the server has landed the write; on the bio
   * route that pending flag is presentational dead code because the
   * Modal is already gone.
   *
   * No Alert.alert on failure: server-side reconcile happens on next
   * refetch (staleTime 5min or pull-to-refresh). The tradeoff is
   * accepted — pull-to-refresh is the recovery path, same discipline as
   * chunks 32 / 34 / 40.
   */
  const saveBioGoalEdit = useCallback(() => {
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
    updateBioGoalMutation.mutate({ goalId: bioEditGoal.id, patch });
    closeBioGoalEditor();
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
      {/* CHUNK 61 (Ken 2026-07-22): TryUnifiedPlanBanner removed from BPS.
          Ken parked unified-plan v2 on 2026-07-22 and confirmed the CTA
          banner should come down. Kept the import for a fast revert if
          a future decision brings v2 back, and left the legacy
          /Home/health-plan mount untouched in the same chunk since Ken
          may still want the reverse CTA on the classic surface — remove
          separately if desired. */}
      <BiopsychosocialPlanScreen
        currentPlanType={currentPlanType}
        onChangePlanType={openPlanTypeChooser}
        onEditGoal={openBioGoalEditor}
        patientName={patientName}
        headerRight={
          <TryUnifiedViewLink color={colors.tint as string} size={getScaledFontSize(22)} />
        }
        deepLinkFocus={deepLinkFocus}
      />
      {/*
        CHUNK 53 (2026-07-22): under BPS_MODAL_CONSOLIDATION_ENABLED, the
        bio-goal editor lives INSIDE the consolidated Modal owned by
        BiopsychosocialPlanScreen — the child intercepts `onEditGoal` locally
        and never fires the prop, so `bioEditGoal` state below never gets
        set. The five draft-state cells + `updateBioGoalMutation` above are
        harmless dead code in that path (kept in-tree so the kill-switch
        revert is a one-flag flip with no state migration).

        Under flag=false, this Modal is the primary editor path exactly as
        before — CHUNK 41 `saving` is presentational dead code (fire-and-
        forget close same-tick) but the wire is retained for contract
        stability with health-plan.tsx which also imports BioGoalEditorModal.
      */}
      {!BPS_MODAL_CONSOLIDATION_ENABLED && (
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
      )}
    </>
  );
}
