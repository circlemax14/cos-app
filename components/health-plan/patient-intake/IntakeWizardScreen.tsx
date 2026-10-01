import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';

import { AppWrapper } from '@/components/app-wrapper';
import { useCanRender } from '@/hooks/use-entitlement';
import { Radii, Spacing } from '@/constants/design-system';
import {
  usePatientIntake,
  useStartIntake,
  usePatchIntakeAnswers,
  useCompleteIntake,
  useRetakeIntake,
} from '@/hooks/use-patient-intake';
import { IntakeAnswerError } from '@/services/api/patient-intake';
import type { IntakeAnswerValue, IntakeQuestion, IntakeSection } from '@/types/patient-intake';

import IntakeProgressHeader from './IntakeProgressHeader';
import IntakeQuestionRenderer from './IntakeQuestionRenderer';
import IntakeCompleteView from './IntakeCompleteView';
import { GROUP_SPECS, type GroupId } from './intake-report-builder';
import { useIntakeLegibility, type IntakeLegibility } from './use-intake-legibility';

export default function IntakeWizardScreen() {
  /*
   * COS-1221 — the wizard chrome (buttons, Skip link, loader, error state) was
   * still on the unstepped scaler while the question card inside it stepped to
   * 1.25-1.35x on a tablet, so the frame shrank around the content it frames.
   * `leg` is passed whole to the module-level render helpers below rather than
   * re-threading four arguments through each.
   */
  const leg = useIntakeLegibility();
  const { colors, fs, fw, muted, error } = leg;
  const canAnswerQuestion = useCanRender('patient-intake.answer-question');
  const params = useLocalSearchParams<{ retake?: string; section?: string; group?: string }>();
  const isRetakeRequest = params.retake === '1';
  // Ken 2026-08-05 — sectioned retake. Two accepted param shapes:
  //   ?section=body|mind|life   (legacy 3-way pick, still honored)
  //   ?group=<GroupId>          (report-parity chunks, preferred)
  // Only ONE is honored per request — `group` wins when both are
  // present. When neither is set the wizard walks every question
  // (legacy full-intake retake).
  const requestedGroup: GroupId | undefined = React.useMemo(() => {
    const raw = params.group;
    if (!raw) return undefined;
    return GROUP_SPECS.some((g) => g.id === raw) ? (raw as GroupId) : undefined;
  }, [params.group]);
  const requestedSection: IntakeSection | undefined =
    requestedGroup ? undefined
      : params.section === 'body' || params.section === 'mind' || params.section === 'life'
        ? params.section
        : undefined;
  // Question keys that belong to the requested chunk. Empty when the
  // request is a full retake (no filter). For group-scoped retakes we
  // pull directly from GROUP_SPECS so filter membership matches the
  // report exactly.
  const chunkKeys = React.useMemo<ReadonlySet<string> | null>(() => {
    if (requestedGroup) {
      const spec = GROUP_SPECS.find((g) => g.id === requestedGroup);
      return spec ? new Set(spec.keys) : null;
    }
    return null;
  }, [requestedGroup]);
  const intakeQuery = usePatientIntake();
  const startMut = useStartIntake();
  const patchMut = usePatchIntakeAnswers();
  const completeMut = useCompleteIntake();
  const retakeMut = useRetakeIntake();

  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<Record<string, IntakeAnswerValue>>({});
  const [invalidKey, setInvalidKey] = useState<string | null>(null);

  const intake = intakeQuery.data?.intake ?? null;
  const allQuestions = intakeQuery.data?.questions ?? [];
  // Filter to the picked chunk. Precedence: group (report parity) →
  // section (legacy) → full intake. When both are absent we present
  // every question (legacy behavior).
  const questions = useMemo(() => {
    if (chunkKeys) return allQuestions.filter((q) => chunkKeys.has(q.key));
    if (requestedSection) return allQuestions.filter((q) => q.section === requestedSection);
    return allQuestions;
  }, [allQuestions, chunkKeys, requestedSection]);

  // Keep a live ref to `draft` so async advance() reads the latest value
  // even if the user typed again between Next-tap and PATCH resolve.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Retake takes precedence over auto-start: if the caller asked for a fresh
  // version AND the server still has a complete intake, kick off retake first
  // and let the query invalidate. Guarded per-request (see requestSig below)
  // so a SECOND retake in the same wizard mount (e.g. section retake after a
  // prior full retake) also fires — refs used to sticky-latch across the
  // wizard's lifetime and swallowed subsequent retake requests.
  //
  // Ken 2026-08-05: patient-intake is a hidden persistent Tabs.Screen —
  // the wizard component does NOT unmount between visits. A per-request
  // signature keyed on (retake, section) is the reliable way to detect
  // "this is a new retake request" and re-arm the mutation.
  const requestSig = `${isRetakeRequest ? '1' : '0'}|g:${requestedGroup ?? '-'}|s:${requestedSection ?? '-'}`;
  const lastFiredRetakeSigRef = useRef<string | null>(null);
  // Sticky latch: once ?retake=1 is observed, we never regress even if
  // useLocalSearchParams commits a later render with retake=undefined
  // (Expo Router param-lag under the persistent Tabs layout).
  const intendsToRetakeRef = useRef(isRetakeRequest);
  if (isRetakeRequest && !intendsToRetakeRef.current) {
    intendsToRetakeRef.current = true;
  }
  // When the request signature changes (e.g. user just tapped a new
  // section from the summary sheet), clear the "already fired" and
  // "already completed" latches so the wizard re-enters the retake
  // flow cleanly instead of showing a stale IntakeCompleteView from
  // a prior finish.
  const seenSigRef = useRef(requestSig);
  if (seenSigRef.current !== requestSig) {
    seenSigRef.current = requestSig;
    if (isRetakeRequest) {
      // Reset the sticky latch for a genuinely new retake request.
      intendsToRetakeRef.current = true;
    }
  }
  // Ken 2026-08-05 — sectioned retake preservation. When the user is
  // retaking only ONE section, snapshot the pre-retake answers BEFORE
  // firing the retake mutation. After retake succeeds, immediately
  // patch the OTHER two sections' answers onto the fresh intake — so
  // the untouched sections aren't blown away. Falls through to the
  // legacy full-clear behavior when requestedSection is undefined.
  const preservedAnswersRef = useRef<Record<string, IntakeAnswerValue> | null>(null);
  const lastPreservedSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isRetakeRequest) return;
    // Per-request guard: fire retakeMut once per signature. A fresh
    // signature (new section pick, or first retake) re-fires; a
    // re-render inside the same request no-ops.
    if (lastFiredRetakeSigRef.current === requestSig) return;
    if (!intakeQuery.isSuccess) return;
    if (intake?.status !== 'complete') return;
    // Capture the answers that must survive the retake — only meaningful
    // when a specific chunk was picked (group OR legacy section). For a
    // full retake this stays null (the retakeMut fresh intake keeps its
    // empty answers).
    if (chunkKeys) {
      // Group-scoped: preserve every answer whose key is NOT in the
      // picked group's key list. Any stale key from a prior schema
      // version is preserved too — the wizard just won't render it.
      const priorAnswers = intake.answers ?? {};
      const preserved: Record<string, IntakeAnswerValue> = {};
      for (const [k, v] of Object.entries(priorAnswers)) {
        if (!chunkKeys.has(k)) preserved[k] = v;
      }
      preservedAnswersRef.current = preserved;
    } else if (requestedSection) {
      const priorAnswers = intake.answers ?? {};
      const priorSections = new Map(allQuestions.map((q) => [q.key, q.section] as const));
      const preserved: Record<string, IntakeAnswerValue> = {};
      for (const [k, v] of Object.entries(priorAnswers)) {
        const s = priorSections.get(k);
        // Preserve answers whose question belongs to a DIFFERENT section
        // than the one being re-taken. Drop unknowns defensively — a
        // stale key from a prior schema version has nowhere clean to land.
        if (s && s !== requestedSection) preserved[k] = v;
      }
      preservedAnswersRef.current = preserved;
    } else {
      preservedAnswersRef.current = null;
    }
    lastFiredRetakeSigRef.current = requestSig;
    // Reset mutation state from any prior retake so isSuccess/isError
    // flags represent THIS request, not the last one.
    retakeMut.reset();
    completeMut.reset();
    retakeMut.mutate();
  }, [
    isRetakeRequest,
    requestSig,
    intakeQuery.isSuccess,
    intake?.status,
    intake?.answers,
    allQuestions,
    chunkKeys,
    requestedSection,
    retakeMut,
    completeMut,
  ]);

  // After a chunk-scoped retake succeeds and the fresh intake lands
  // in cache, restore the preserved (non-picked-chunk) answers via
  // a single patch. Sig-guarded so it fires exactly once per retake request.
  useEffect(() => {
    if (!chunkKeys && !requestedSection) return;
    if (lastPreservedSigRef.current === requestSig) return;
    if (!retakeMut.isSuccess) return;
    if (!intake || intake.status !== 'in_progress') return;
    const preserved = preservedAnswersRef.current;
    if (!preserved || Object.keys(preserved).length === 0) {
      lastPreservedSigRef.current = requestSig;
      return;
    }
    lastPreservedSigRef.current = requestSig;
    patchMut.mutate(preserved);
  }, [chunkKeys, requestedSection, requestSig, retakeMut.isSuccess, intake, patchMut]);

  // Auto-start intake if the server has none once the initial fetch resolves.
  // The hook swallows 409 INTAKE_IN_PROGRESS and invalidates so a duplicate
  // tap just refetches the in-flight record. Ref-guarded so it fires at most
  // once per mount regardless of downstream state churn.
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (!intakeQuery.isSuccess) return;
    if (intake) return;
    // Wait for the retake mutation to settle before auto-starting; otherwise
    // we could race retake and start against the same slot.
    if (isRetakeRequest && lastFiredRetakeSigRef.current !== requestSig) return;
    if (retakeMut.isPending) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startMut.mutate();
  }, [intakeQuery.isSuccess, intake, isRetakeRequest, retakeMut.isPending, startMut]);

  // Seed the local draft from the server record whenever the underlying
  // intake identity changes (new user, new version after retake, etc.).
  useEffect(() => {
    if (intake) {
      setDraft(intake.answers ?? {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake?.userId, intake?.version]);

  // Resume at the first unanswered REQUIRED question when the questions load.
  // Optional questions never block progression, so a missing optional answer
  // shouldn't rewind the user. If every required question is answered, jump
  // to the final question so Finish is one tap away. A fresh intake (no
  // answers of any kind) ALWAYS starts at stepIdx=0 — otherwise the
  // findIndex-returns-(-1) fallback would auto-jump the user to Q_last and
  // fire completeMut on the very first Finish tap.
  useEffect(() => {
    if (!questions.length || !intake) return;
    const answered = intake.answers ?? {};
    const isBlank = (v: IntakeAnswerValue | undefined) =>
      v === undefined || v === null || v === '' ||
      (Array.isArray(v) && v.length === 0);
    const hasAnyProgress = Object.keys(answered).some((k) => !isBlank(answered[k]));
    if (!hasAnyProgress) { setStepIdx(0); return; }
    const firstUnansweredRequired = questions.findIndex(
      (q) => q.required && isBlank(answered[q.key]),
    );
    if (firstUnansweredRequired >= 0) { setStepIdx(firstUnansweredRequired); return; }
    const firstBlank = questions.findIndex((q) => isBlank(answered[q.key]));
    setStepIdx(firstBlank >= 0 ? firstBlank : Math.max(0, questions.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length, intake?.version]);

  const total = questions.length;
  const current: IntakeQuestion | undefined = questions[stepIdx];

  const currentValue = current ? draft[current.key] : undefined;
  const currentAnswered = useMemo(() => {
    if (!current) return false;
    if (!current.required) return true;
    const v = currentValue;
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }, [current, currentValue]);

  const onChangeAnswer = useCallback(
    (val: IntakeAnswerValue) => {
      if (!current) return;
      setInvalidKey(null);
      setDraft((prev) => ({ ...prev, [current.key]: val }));
    },
    [current],
  );

  const goBack = useCallback(() => {
    if (stepIdx === 0) {
      // patient-intake is a hidden sibling Tabs.Screen (href:null), so
      // router.back() no-ops — replace with the Health Summary tab.
      router.replace('/Home/plan' as never);
      return;
    }
    setStepIdx((i) => Math.max(0, i - 1));
  }, [stepIdx]);

  const advance = useCallback(async () => {
    if (!current || !currentAnswered) return;
    // Read the freshest value at PATCH-time. If the user typed 'A', tapped
    // Next, then typed 'B' before the request resolved, we want 'B' to hit
    // the server — not the stale 'A' captured when the callback was memoised.
    const latestValue = draftRef.current[current.key];
    const isBlank =
      latestValue === undefined ||
      latestValue === null ||
      latestValue === '' ||
      (Array.isArray(latestValue) && latestValue.length === 0);
    // Skip the PATCH entirely when an optional question was left blank —
    // otherwise we'd overwrite whatever the server has with { key: null }.
    if (!isBlank || current.required) {
      const patch: Record<string, IntakeAnswerValue> = {
        [current.key]: latestValue ?? null,
      };
      try {
        await patchMut.mutateAsync(patch);
      } catch (err) {
        if (err instanceof IntakeAnswerError && err.key) {
          setInvalidKey(err.key);
          return;
        }
        // Other errors surface passively via patchMut.isError at the render layer.
        return;
      }
    }
    if (stepIdx >= total - 1) {
      try {
        await completeMut.mutateAsync();
      } catch {
        // Passive: completeMut.isError shows the retry hint.
      }
    } else {
      setStepIdx((i) => Math.min(total - 1, i + 1));
    }
  }, [current, currentAnswered, patchMut, completeMut, stepIdx, total]);

  // === top-level branches ===
  if (
    intakeQuery.isLoading ||
    startMut.isPending ||
    retakeMut.isPending ||
    // While we're waiting for the retake to kick in (params say retake, but
    // the mutation hasn't started yet or the query hasn't reflected the new
    // version), hold on the loader so we don't briefly flash IntakeComplete.
    // The sticky ref covers the case where params.retake momentarily reads
    // as undefined during Expo Router's first commit after navigation.
    ((isRetakeRequest || intendsToRetakeRef.current) &&
      intake?.status === 'complete' && lastFiredRetakeSigRef.current !== requestSig) ||
    (retakeMut.isSuccess && intake?.status === 'complete' && intakeQuery.isFetching)
  ) {
    return renderLoader(leg);
  }
  if (intakeQuery.isError) {
    return renderError(leg, () => {
      void intakeQuery.refetch();
    });
  }
  // Retake mutation failed — otherwise we'd fall through and render the
  // wizard against the still-complete intake, and every Next tap would
  // silently 409 because there's no in-progress version to PATCH. Reset
  // the per-request signature so the retry actually re-fires the mutation.
  if (retakeMut.isError && intendsToRetakeRef.current) {
    return renderError(leg, () => {
      lastFiredRetakeSigRef.current = null;
      retakeMut.reset();
      retakeMut.mutate();
    });
  }
  // Ken 2026-08-05 — pendingRetakeArrival is TRUE when the URL says we
  // should be retaking but the retake mutation hasn't fired yet for
  // THIS request signature. We use it to suppress a brief flash of
  // IntakeCompleteView from a PRIOR completion between navigation and
  // the useEffect that fires the fresh retakeMut. Without this guard,
  // tapping a section from the sheet after having previously completed
  // an intake momentarily lands on the "back to Health Summary" view.
  const pendingRetakeArrival =
    (isRetakeRequest || intendsToRetakeRef.current) &&
    lastFiredRetakeSigRef.current !== requestSig;
  // Only show the Complete view if we're not in the middle of a retake flow.
  // completeMut.isSuccess wins outright — the user just tapped Finish —
  // UNLESS a new retake request just arrived (sig differs), in which case
  // we hold on the loader until the fresh retakeMut kicks in.
  if (completeMut.isSuccess && !pendingRetakeArrival) {
    return <IntakeCompleteView />;
  }
  if (
    intake?.status === 'complete' &&
    !isRetakeRequest &&
    !intendsToRetakeRef.current &&
    !retakeMut.isPending &&
    !retakeMut.isSuccess &&
    !pendingRetakeArrival
  ) {
    return <IntakeCompleteView />;
  }
  if (!questions.length) return renderLoader(leg);
  if (!current) return renderLoader(leg); // stale-index guard

  const isFinalStep = stepIdx === total - 1;
  const primaryLabel = isFinalStep ? 'Finish' : 'Next';

  return (
    <AppWrapper>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <IntakeProgressHeader
            section={current.section}
            stepIdx={stepIdx}
            total={total}
            onClose={() => router.replace('/Home/plan' as never)}
          />
          {canAnswerQuestion && (
            <IntakeQuestionRenderer
              question={current}
              value={currentValue}
              onChange={onChangeAnswer}
              invalid={invalidKey === current.key}
              allAnswers={draft}
            />
          )}
          <View style={styles.actions}>
            <Pressable
              onPress={goBack}
              disabled={patchMut.isPending}
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={stepIdx === 0 ? 'Close intake' : 'Go to previous question'}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: fs(15),
                  fontWeight: fw(600) as any,
                }}
              >
                {stepIdx === 0 ? 'Close' : 'Back'}
              </Text>
            </Pressable>
            <Pressable
              onPress={advance}
              disabled={!currentAnswered || patchMut.isPending || completeMut.isPending}
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: currentAnswered ? colors.tint : muted + '60',
                  opacity: patchMut.isPending || completeMut.isPending ? 0.6 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: fs(15),
                  fontWeight: fw(700) as any,
                }}
              >
                {primaryLabel}
              </Text>
            </Pressable>
          </View>
          {/*
            COS-1182 — SKIP, made visible.

            Vishal: "either they skip every query or they complete every query."

            Skipping was already possible and completely undiscoverable. NOT ONE
            of the ~30 intake questions carries `required: true` (five carry
            `required: false`, the rest say nothing), so `currentAnswered` is
            already true on every question and `advance()` already omits the PATCH
            for a blank optional answer. The only way to find that out was to tap
            "Next" on an empty field and notice it worked.

            So this adds no new capability — it names one the patient already had.
            Hidden on the LAST step: "Skip" next to "Finish" reads as "finish
            without saving", which is not what it does.

            If anything ever sets `required: true`, `currentAnswered` goes false,
            the primary button disables, and this must not become the way around
            it — hence the same `currentAnswered` condition guards both.
          */}
          {current && !current.required && stepIdx < total - 1 ? (
            <Pressable
              onPress={advance}
              disabled={patchMut.isPending || completeMut.isPending}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Skip this question"
              style={{ alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 }}
            >
              <Text
                style={{
                  color: muted,
                  fontSize: fs(14),
                  textDecorationLine: 'underline',
                }}
              >
                Skip this question
              </Text>
            </Pressable>
          ) : null}
          {(patchMut.isError || completeMut.isError) && (
            <Text
              style={{
                color: error,
                fontSize: fs(12),
                fontWeight: fw(500) as any,
                textAlign: 'center',
                marginTop: 10,
              }}
            >
              Couldn’t save. Tap {primaryLabel} again.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AppWrapper>
  );
}

function renderLoader({ colors, fs, muted }: IntakeLegibility) {
  return (
    <AppWrapper>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: colors.background,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        {/* COS-1221 — a bare `fontSize: 14` was the one size on this screen that
            no scaler of any kind ever touched. */}
        <Text style={{ marginTop: 12, color: muted, fontSize: fs(14) }}>
          Loading your intake…
        </Text>
      </View>
    </AppWrapper>
  );
}

function renderError({ colors, fs, fw, muted }: IntakeLegibility, retry: () => void) {
  return (
    <AppWrapper>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: colors.background,
        }}
      >
        <MaterialIcons name="error-outline" size={fs(56)} color={muted} />
        <Text
          style={{
            color: colors.text,
            marginTop: 12,
            fontSize: fs(18),
            fontWeight: fw(700) as any,
            textAlign: 'center',
          }}
        >
          Couldn’t load your check-in
        </Text>
        <Pressable
          onPress={retry}
          style={{
            marginTop: 16,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: Radii.md,
            backgroundColor: colors.tint,
          }}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text
            style={{
              color: '#fff',
              fontSize: fs(15),
              fontWeight: fw(700) as any,
            }}
          >
            Try again
          </Text>
        </Pressable>
      </View>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 32,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtn: {
    flex: 1,
    borderRadius: Radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
