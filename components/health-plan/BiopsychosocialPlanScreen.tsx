/**
 * BiopsychosocialPlanScreen (COS-360 / SCRUM-518, Phase 3) — full-screen
 * rendering of Ken's biopsychosocial Care Plan: a patient greeting + last-
 * generated date, three `SectionCard`s (Biological / Psychological /
 * Social & Spiritual Wellness), and a "Refresh my plan" action (COS-430
 * — Ken's SCRUM-538 language: legacy uses "Refresh my plan" for the same
 * primary CTA; bio now matches for consistency).
 *
 * Rendered by `app/Home/health-plan.tsx` ONLY when `useBiopsychosocialPlanFlag()`
 * is true (which itself requires the upstream `ASSESSMENT_STRATEGY_V2_ENABLED`
 * flag) — otherwise `PlanScreenRedesignedV2` renders unchanged.
 *
 * COS-411: this screen used to own no tier awareness at all — the parent's
 * PlanTypeChooser modal was unreachable once this component rendered
 * (see health-plan.tsx's early-return fix), so users had no way to see or
 * switch their plan tier from here. `currentPlanType` / `onChangePlanType`
 * are threaded in as props so the parent stays the single owner of the
 * chooser's open state (`showChooser`) while this screen can still surface
 * a tier pill and trigger it.
 */
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { usePatientInfo } from '@/hooks/use-patient';
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name';
import { useBiopsychosocialPlan, useRegenerateBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { SectionCard, type BiopsychosocialSectionKey } from './SectionCard';
import { updatePlanGoal, type GoalPatch } from '@/services/api/ai-health-plan';
import type { MeasurableGoal } from '@/services/api/biopsychosocial-plan';
import type { PlanType } from '@/services/api/plan-type';
import {
  BPS_SUBDOMAINS,
  knownSubdomains,
  subdomainsByDomain,
  type BpsDomain,
} from '@/lib/bps-subdomains';

const SECTION_ORDER: { key: BiopsychosocialSectionKey; title: string }[] = [
  { key: 'biological', title: 'Biological Wellness' },
  { key: 'psychological', title: 'Psychological Wellness' },
  { key: 'social', title: 'Social & Spiritual Wellness' },
];

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstNameFrom(
  patient: { name?: { given?: string[]; family?: string }[] } | undefined,
): string | null {
  const given = patient?.name?.[0]?.given?.[0];
  return given && given.trim() ? given.trim() : null;
}

function formatGeneratedDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * COS-415: relative "time ago" label for an in-flight regenerate job's
 * `jobStartedAt`. COS-421: with `refetchInterval` polling removed, this is
 * now a one-time snapshot computed whenever `planQuery.data` was last
 * fetched (mount, pull-to-refresh, or a push-triggered invalidation) — it
 * no longer ticks up live while the screen sits idle. Caps at "generating
 * for a while..." past 3 minutes rather than counting up indefinitely — by
 * that point the exact elapsed time isn't useful to the user, just the
 * fact that it's still going.
 */
function formatRelativeStartedAt(iso: string): string {
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return 'just now';
  const elapsedMs = Date.now() - started;
  const elapsedSec = Math.floor(elapsedMs / 1000);
  if (elapsedSec < 5) return 'just now';
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 3) return `${elapsedMin}m ago`;
  return 'generating for a while...';
}

/**
 * COS-411: small rounded "Plan: <name> · Change" pill, styled after the
 * prominent plan-type card on the legacy Plan tab (health-plan.tsx
 * ~line 768) but compact enough to sit under the greeting instead of
 * taking a full card row. Tapping it opens the parent's PlanTypeChooser.
 */
function PlanTierPill({
  label,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onPress,
  centered,
}: {
  label: string;
  colors: Record<string, string>;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => number | string;
  onPress: () => void;
  /** Center the pill instead of the default left alignment — used in the
   *  empty states, which are already center-aligned columns. */
  centered?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Plan: ${label}. Tap to change.`}
      style={({ pressed }) => [
        styles.tierPill,
        centered && styles.tierPillCentered,
        {
          backgroundColor: (colors.tint ?? '#0D9488') + '14',
          borderColor: (colors.tint ?? '#0D9488') + '33',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: colors.tint,
          fontSize: getScaledFontSize(12),
          fontWeight: getScaledFontWeight(700) as any,
        }}
      >
        Plan: {label} · Change
      </Text>
      <MaterialIcons name="swap-horiz" size={getScaledFontSize(14)} color={colors.tint} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

export function BiopsychosocialPlanScreen({
  currentPlanType,
  onChangePlanType,
}: {
  currentPlanType: PlanType | undefined;
  onChangePlanType: () => void;
}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'] as unknown as Record<string, string>;
  const queryClient = useQueryClient();
  const planTypeDisplayName = usePlanTypeDisplayName();

  const planQuery = useBiopsychosocialPlan();
  const patientQuery = usePatientInfo();
  const regenerateMutation = useRegenerateBiopsychosocialPlan();

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await planQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [planQuery]);

  // ── Goal editing — same GoalPatch/updatePlanGoal contract as the legacy
  // Care Plan editor (COS-377). Reuses the identical endpoint rather than a
  // second one because the backend dual-writes the same measurable goals to
  // both the legacy AI_GENERATED_PLAN and the new BIOPSYCHOSOCIAL_PLAN record
  // for one release cycle (see assessment-strategy-v2.md §3.1). On success we
  // invalidate both query keys so every surface reflects the edit.
  const [editGoal, setEditGoal] = React.useState<MeasurableGoal | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editDesc, setEditDesc] = React.useState('');
  const [editTarget, setEditTarget] = React.useState('');
  const [editTimeframe, setEditTimeframe] = React.useState('');
  // COS-430: NovoPsych subdomain tags editable per goal. Empty array is
  // fine — legacy goals arrive without subdomains and stay unchanged unless
  // the user toggles something.
  const [editSubdomains, setEditSubdomains] = React.useState<string[]>([]);

  const openGoalEditor = React.useCallback((g: MeasurableGoal) => {
    setEditGoal(g);
    setEditTitle(g.title);
    setEditDesc(g.description ?? '');
    setEditTarget(g.target ?? '');
    setEditTimeframe(g.timeframe ?? '');
    setEditSubdomains(knownSubdomains(g.subdomains));
  }, []);
  const closeGoalEditor = React.useCallback(() => setEditGoal(null), []);

  const toggleSubdomain = React.useCallback((key: string) => {
    setEditSubdomains((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const updateGoalMutation = useMutation({
    mutationFn: ({ goalId, patch }: { goalId: string; patch: GoalPatch }) => updatePlanGoal(goalId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biopsychosocial-plan'] });
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] });
    },
  });

  const saveGoalEdit = React.useCallback(async () => {
    if (!editGoal) return;
    const patch: GoalPatch = {};
    if (editTitle !== editGoal.title) patch.title = editTitle;
    if (editDesc !== (editGoal.description ?? '')) patch.description = editDesc;
    if (editTarget !== (editGoal.target ?? '')) patch.target = editTarget;
    if (editTimeframe !== (editGoal.timeframe ?? '')) patch.timeframe = editTimeframe;
    // COS-430: only send subdomains when they've actually changed to keep
    // the patch minimal and avoid disturbing legacy fields on the server.
    const currentSubs = knownSubdomains(editGoal.subdomains);
    const nextSubs = editSubdomains;
    if (currentSubs.length !== nextSubs.length || currentSubs.some((k, i) => k !== nextSubs[i])) {
      patch.subdomains = nextSubs;
    }
    try {
      await updateGoalMutation.mutateAsync({ goalId: editGoal.id, patch });
      closeGoalEditor();
    } catch {
      Alert.alert('Error', 'Failed to save goal. Please try again.');
    }
  }, [editGoal, editTitle, editDesc, editTarget, editTimeframe, editSubdomains, updateGoalMutation, closeGoalEditor]);

  const onRegenerate = React.useCallback(() => {
    regenerateMutation.mutate(undefined, {
      onError: () => {
        Alert.alert('Error', "Couldn't regenerate your plan right now. Try again in a moment.");
      },
    });
  }, [regenerateMutation]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (planQuery.isLoading) {
    return (
      <AppWrapper>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            Loading your plan…
          </Text>
        </View>
      </AppWrapper>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (planQuery.isError) {
    return (
      <AppWrapper>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
        >
          <View style={styles.center}>
            <MaterialIcons name="error-outline" size={40} color={colors.error ?? '#DC2626'} />
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
              Couldn&apos;t load your plan
            </Text>
            <Text style={[styles.emptyBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              Pull down to try again.
            </Text>
          </View>
        </ScrollView>
      </AppWrapper>
    );
  }

  const plan = planQuery.data?.plan ?? null;
  const patientName = firstNameFrom(patientQuery.data);
  const generatedDate = formatGeneratedDate(plan?.generatedAt);
  // COS-415: `generating` is additive on the GET response — undefined on
  // BE deploys that predate this change, which the `=== true` check treats
  // as false. COS-421: this is now a point-in-time snapshot from the last
  // fetch, not a live-updating flag (refetchInterval polling removed in
  // favor of push-triggered invalidation) — it only matters at initial
  // render to detect "another device's job was already running".
  const isRegenerating = planQuery.data?.generating === true;
  // COS-421: primarily driven by this device's own tap. A stale
  // `isRegenerating` from another device no longer disables the button —
  // the backend's REGENERATION_IN_FLIGHT (409) is already swallowed by
  // `useRegenerateBiopsychosocialPlan`, so tapping while another device is
  // generating is harmless and just converges on the same invalidation.
  const regenerateDisabled = regenerateMutation.isPending;
  // True only when ANOTHER device's job was in flight as of the last
  // fetch — this device's own tap is represented by
  // `regenerateMutation.isPending` and gets the committed-loader UX on the
  // button itself instead of this static banner.
  const showOtherDeviceGenerating = isRegenerating && !regenerateMutation.isPending;

  // ── No tier selected yet (COS-411) ──────────────────────────────────────
  // Distinct from the generic "no plan yet" empty state below: without a
  // tier, there's no assigned assessment set for the plan to be built from,
  // so the usual "check back after completing your assessments" copy (and
  // any Generate/Take-assessments CTA) would just dead-end the user. Route
  // them to the chooser instead.
  if (!plan && currentPlanType === undefined) {
    return (
      <AppWrapper>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
        >
          <View style={styles.center}>
            <View style={[styles.emptyIcon, { backgroundColor: (colors.tint ?? '#0D9488') + '18' }]}>
              <MaterialIcons name="tune" size={32} color={colors.tint} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
              Choose your plan first
            </Text>
            <Text style={[styles.emptyBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              Pick a plan tier so we know which check-ins to build your care plan from.
            </Text>
            <TouchableOpacity
              style={[styles.regenerateBtn, { backgroundColor: colors.tint, alignSelf: 'center', paddingHorizontal: Spacing.lg }]}
              onPress={onChangePlanType}
              accessibilityRole="button"
              accessibilityLabel="Choose your plan"
            >
              <Text style={[styles.regenerateBtnText, { fontSize: getScaledFontSize(14) }]}>Choose plan</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </AppWrapper>
    );
  }

  // ── Empty (has a tier, no plan generated yet) ───────────────────────────
  if (!plan) {
    return (
      <AppWrapper>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
        >
          <View style={styles.center}>
            <View style={[styles.emptyIcon, { backgroundColor: (colors.tint ?? '#0D9488') + '18' }]}>
              <MaterialIcons name="spa" size={32} color={colors.tint} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
              Your care plan is being prepared
            </Text>
            <Text style={[styles.emptyBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              Check back after completing your assessments.
            </Text>
            <PlanTierPill
              label={planTypeDisplayName(currentPlanType as PlanType)}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              onPress={onChangePlanType}
              centered
            />
          </View>
        </ScrollView>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
      >
        {/* Header — patient greeting + last-generated date */}
        <View style={styles.headerBlock}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(26),
              fontWeight: getScaledFontWeight(800) as any,
              letterSpacing: -0.4,
            }}
          >
            {patientName ? `${greetingForNow()}, ${patientName}` : greetingForNow()}
          </Text>
          {!!generatedDate && (
            <View style={styles.metaRow}>
              <MaterialIcons name="auto-awesome" size={12} color={colors.subtext} />
              <Text style={[styles.metaText, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                Updated {generatedDate}
                {planQuery.data?.staleness === 'stale' ? ' · may be out of date' : ''}
              </Text>
            </View>
          )}
          <PlanTierPill
            label={planTypeDisplayName(currentPlanType ?? 'basic')}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onPress={onChangePlanType}
          />
          {/*
            COS-430: entry point to the NovoPsych Wellbeing map. Small text
            link so it doesn't compete with the tier pill or the Refresh
            button. Route is read-only — safe to open mid-generate.
          */}
          <Pressable
            onPress={() => router.push('/Home/wellbeing-map' as never)}
            accessibilityRole="link"
            accessibilityLabel="Open Wellbeing map"
            style={styles.mapLinkRow}
          >
            <MaterialIcons name="hub" size={16} color={colors.tint} />
            <Text
              style={{
                color: colors.tint,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(600) as any,
                marginLeft: 6,
              }}
            >
              See your Wellbeing map
            </Text>
          </Pressable>
        </View>

        {/* Three section cards */}
        {SECTION_ORDER.map(({ key, title }) => (
          <SectionCard
            key={key}
            sectionKey={key}
            title={title}
            section={plan.sections[key]}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onEditGoal={openGoalEditor}
          />
        ))}

        {/* Another device's regeneration in flight — static message, no
            live polling (COS-421). Snapshot only; updates on next fetch
            (pull-to-refresh, push invalidation, or remount). */}
        {showOtherDeviceGenerating && (
          <View
            style={[
              styles.generatingBanner,
              { backgroundColor: (colors.tint ?? '#0D9488') + '14', borderColor: (colors.tint ?? '#0D9488') + '33' },
            ]}
            accessibilityRole="text"
            accessibilityLabel="A generation is already in progress on another device. Pull down to refresh once it's done."
          >
            <MaterialIcons name="info-outline" size={16} color={colors.tint} />
            <Text style={[styles.generatingBannerText, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
              A generation is already in progress
              {planQuery.data?.jobStartedAt
                ? ` (started ${formatRelativeStartedAt(planQuery.data.jobStartedAt)})`
                : ''}
              . Pull down to refresh once it&apos;s done.
            </Text>
          </View>
        )}

        {/* Refresh my plan — COS-430: matches legacy PlanScreenRedesignedV2 copy. */}
        <TouchableOpacity
          style={[styles.regenerateBtn, { backgroundColor: colors.tint, opacity: regenerateDisabled ? 0.7 : 1 }]}
          onPress={onRegenerate}
          disabled={regenerateDisabled}
          accessibilityRole="button"
          accessibilityLabel={regenerateMutation.isPending ? 'Generating your plan' : 'Refresh my plan'}
          accessibilityState={{ disabled: regenerateDisabled, busy: regenerateMutation.isPending }}
        >
          {regenerateMutation.isPending ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.regenerateBtnText, { fontSize: getScaledFontSize(14) }]}>
                Generating your plan…
              </Text>
            </>
          ) : (
            <>
              <MaterialIcons name="refresh" size={16} color="#fff" />
              <Text style={[styles.regenerateBtnText, { fontSize: getScaledFontSize(14) }]}>Refresh my plan</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Goal editor modal */}
      <Modal visible={editGoal !== null} animationType="slide" transparent onRequestClose={closeGoalEditor}>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card ?? colors.background }]}>
            <View style={modalStyles.header}>
              <Text style={[modalStyles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any }]}>
                Edit Goal
              </Text>
              <TouchableOpacity onPress={closeGoalEditor} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color={colors.subtext} />
              </TouchableOpacity>
            </View>

            <ScrollView style={modalStyles.scrollArea} keyboardShouldPersistTaps="handled">
              <Text style={[modalStyles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>TITLE</Text>
              <TextInput
                style={[modalStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={editTitle}
                onChangeText={setEditTitle}
                maxLength={120}
                placeholder="Goal title"
                placeholderTextColor={colors.subtext}
              />

              <Text style={[modalStyles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>DESCRIPTION</Text>
              <TextInput
                style={[modalStyles.input, modalStyles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={editDesc}
                onChangeText={setEditDesc}
                maxLength={300}
                multiline
                numberOfLines={3}
                placeholder="Description"
                placeholderTextColor={colors.subtext}
              />

              <Text style={[modalStyles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>TARGET</Text>
              <TextInput
                style={[modalStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={editTarget}
                onChangeText={setEditTarget}
                maxLength={40}
                placeholder="Goal value"
                placeholderTextColor={colors.subtext}
              />

              <Text style={[modalStyles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>TIMEFRAME</Text>
              <TextInput
                style={[modalStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={editTimeframe}
                onChangeText={setEditTimeframe}
                maxLength={40}
                placeholder="e.g. 3 months"
                placeholderTextColor={colors.subtext}
              />

              {/*
                COS-430: NovoPsych subdomain multi-picker. Grouped by domain
                so each row's chips stay visually associated with their
                domain header (Biological / Psychological / Social).
              */}
              <Text style={[modalStyles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 8 }]}>
                NOVOPSYCH SUBDOMAINS
              </Text>
              {(Object.entries(subdomainsByDomain()) as [BpsDomain, typeof BPS_SUBDOMAINS[number][]][])
                .map(([domain, subs]) => (
                <View key={domain} style={{ marginBottom: 10 }}>
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: getScaledFontSize(11),
                      textTransform: 'capitalize',
                      marginBottom: 4,
                    }}
                  >
                    {domain}
                  </Text>
                  <View style={modalStyles.chipRow}>
                    {subs.map((s) => {
                      const active = editSubdomains.includes(s.key);
                      return (
                        <Pressable
                          key={s.key}
                          onPress={() => toggleSubdomain(s.key)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[
                            modalStyles.pickerChip,
                            {
                              backgroundColor: active ? (colors.tint as string) + '22' : colors.background,
                              borderColor: active ? (colors.tint as string) : colors.border,
                              borderStyle: s.crossDomain ? 'dashed' : 'solid',
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: active ? (colors.tint as string) : colors.text,
                              fontSize: getScaledFontSize(12),
                              fontWeight: '600',
                            }}
                          >
                            {s.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={modalStyles.footer}>
              <Pressable onPress={closeGoalEditor} style={[modalStyles.footerBtn, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveGoalEdit}
                disabled={updateGoalMutation.isPending}
                style={[
                  modalStyles.footerBtn,
                  { backgroundColor: colors.tint, borderColor: colors.tint, opacity: updateGoalMutation.isPending ? 0.7 : 1 },
                ]}
              >
                {updateGoalMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  loadingText: { marginTop: 12 },
  headerBlock: { marginBottom: Spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  metaText: {},
  mapLinkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: { textAlign: 'center', marginBottom: 6 },
  emptyBody: { textAlign: 'center', lineHeight: 20 },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
    paddingVertical: 14,
    marginTop: Spacing.sm,
    gap: 8,
  },
  regenerateBtnText: { color: '#fff', fontWeight: '700' },
  generatingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: Spacing.sm,
    gap: 8,
  },
  generatingBannerText: { flex: 1, lineHeight: 18 },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  tierPillCentered: { alignSelf: 'center' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', padding: Spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  headerTitle: {},
  scrollArea: { marginBottom: Spacing.sm },
  fieldLabel: { marginTop: Spacing.sm, marginBottom: 4, letterSpacing: 0.6 },
  input: { borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', gap: 12, marginTop: Spacing.sm },
  footerBtn: { flex: 1, borderWidth: 1, borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickerChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
});
