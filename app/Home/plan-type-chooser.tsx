/**
 * Plan type chooser (COS-417) — first-visit (or settings-driven) plan tier
 * selector. Always switchable; the server preserves task completions and
 * badges across switches.
 *
 * Previously `components/health-plan/PlanTypeChooser.tsx`, a full-screen
 * `<Modal presentationStyle="pageSheet">` with a second, transparent
 * `<Modal>` nested inside it for the two-step consent confirmation. That
 * nesting is the closest structural match in the biopsychosocial UI to a
 * documented iOS bug (two nested-Modal dismissals colliding and leaving a
 * blank orphaned sheet — see the old file's SCRUM-524 comment), patched at
 * the time with a `requestAnimationFrame` stagger. iOS 26.5 hardens against
 * exactly this pattern.
 *
 * This route eliminates the nesting entirely: it's a single expo-router
 * screen, and the "consent modal" is now an in-place content swap (tier
 * list ⇄ consent panel) driven by local state — there is only ever one
 * presentation (this screen) at a time. Confirming a tier switch pops this
 * route with `router.back()` instead of closing a Modal.
 *
 * Agency option is shown to everyone, disabled with explanatory copy when
 * the user has no care management agency linked.
 */
import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

import { AppWrapper } from '@/components/app-wrapper'
import { fetchPlanType, updatePlanType, type PlanType } from '@/services/api/plan-type'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name'
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag'
import { useRegenerateBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan'

type AssessmentLevel = 'light' | 'standard' | 'clinical'

interface PlanCardSpec {
  type: PlanType
  title: string
  description: string
  assessmentLevel: AssessmentLevel
  features: {
    assessment: string
    updates: string
    support: string
    bestFor: string
  }
  icon: keyof typeof MaterialIcons.glyphMap
}

const ASSESSMENT_COLOR: Record<AssessmentLevel, string> = {
  light:    '#6B7280',
  standard: '#5B47CC',
  clinical: '#0E7490',
}
const ASSESSMENT_LABEL: Record<AssessmentLevel, string> = {
  light:    'Light assessment',
  standard: 'Standard + EHR assessment',
  clinical: 'Full clinical assessment',
}

// COS-352: Ken asked to remove the "Agency Supported" / "Agency Managed"
// tiers for now — to be reworked with the full agency business flow. This
// flag hides them from the chooser WITHOUT deleting any code path, so it
// flips straight back on when the agency flow is rebuilt. Existing agency
// users keep their current plan (health-plan.tsx still renders the labels).
const AGENCY_PLANS_ENABLED = false
const isAgencyType = (t: PlanType) => t === 'agency-supported' || t === 'agency-managed'

const PLAN_CARDS: PlanCardSpec[] = [
  {
    type: 'basic',
    title: 'Basic',
    description: 'Light AI-picked screeners + analytics from your records and wearables.',
    assessmentLevel: 'light',
    features: {
      assessment: '1–3 brief screeners (mood, sleep, wellbeing)',
      updates:    'AI re-picks screeners as your health record evolves',
      support:    'Self-directed',
      bestFor:    'Stable conditions, self-managed care',
    },
    icon: 'check-circle-outline',
  },
  {
    type: 'advanced',
    title: 'Advanced',
    description: 'Clinical screeners (PHQ-9, GAD-7, PSS, pain, sleep) personalized by AI.',
    assessmentLevel: 'standard',
    features: {
      assessment: '3–5 AI-picked clinical screeners',
      updates:    'AI re-selects as conditions, meds, or labs change',
      support:    'AI + light agency oversight',
      bestFor:    'Complex care, multiple specialists',
    },
    icon: 'auto-awesome',
  },
  {
    type: 'agency-supported',
    title: 'Agency Supported',
    description: 'Advanced plan plus functional + light cognitive screens, supported by your care team.',
    assessmentLevel: 'clinical',
    features: {
      assessment: '4–7 AI-picked screeners including ADL/IADL and Mini-Cog',
      updates:    'AI updates + your care team can override',
      support:    'Shared with your care team',
      bestFor:    'Patients with functional or cognitive change',
    },
    icon: 'workspaces',
  },
  {
    type: 'agency-managed',
    title: 'Agency Managed',
    description: 'Full intake + full cognitive (MOCA) for active care-team management.',
    assessmentLevel: 'clinical',
    features: {
      assessment: 'Full intake + 5–8 AI-picked clinical screeners (MOCA + full intake coming soon)',
      updates:    'Care manager directs assessment cadence',
      support:    'Full care management',
      bestFor:    'Patients needing active coordination',
    },
    icon: 'medical-services',
  },
]

export default function PlanTypeChooserScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const queryClient = useQueryClient()
  // COS-360 / SCRUM-577 — renders 'agency-supported' as "Family Support"
  // when ASSESSMENT_STRATEGY_V2_ENABLED is on, "Agency Supported" otherwise.
  const planTypeDisplayName = usePlanTypeDisplayName()

  // COS-417: standalone route now owns fetching the current tier instead of
  // receiving it as a prop from health-plan.tsx. Same query key/staleTime
  // health-plan.tsx uses, so in the common case (navigated here from the
  // Plan tab) this is an instant cache hit, not a new network round trip.
  const planTypeQuery = useQuery({
    queryKey: ['plan-type'],
    queryFn: fetchPlanType,
    staleTime: 5 * 60 * 1000,
  })
  const currentType = planTypeQuery.data

  // SCRUM-232: chooser is fully open — both original call sites in
  // health-plan.tsx passed the bare `hasAgency` prop (i.e. always `true`),
  // so agency tiers were never actually gated behind a real "has agency"
  // check on this screen. Preserved verbatim rather than "fixed" as part of
  // this modal-removal change.
  const hasAgency = true

  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  // COS-417: two-step confirm, now an in-place content swap instead of a
  // nested Modal — tap a card → this screen swaps to a consent panel → user
  // acknowledges → we send `consent: { acknowledged: true }` with the API
  // call (SCRUM-224).
  const [pendingType, setPendingType] = React.useState<PlanType | null>(null)
  const [consentAck, setConsentAck] = React.useState(false)

  // COS-412: opt-in migration trigger #1 for the biopsychosocial (3-section)
  // Care Plan rebuild — when the flag is on, a plan-type change also kicks
  // off a background regenerate so the user lands on the new plan without a
  // separate step. `migrating` keeps the consent panel showing (swapped to a
  // loading state) for the duration instead of navigating away immediately,
  // so the ~30-40s regenerate isn't invisible.
  const biopsychosocialPlanEnabled = useBiopsychosocialPlanFlag()
  const regenerateBioPlanMutation = useRegenerateBiopsychosocialPlan()
  const [migrating, setMigrating] = React.useState(false)

  const mutation = useMutation({
    mutationFn: (type: PlanType) =>
      updatePlanType(type, { consent: { acknowledged: true, consentVersion: 'v1' } }),
    onSuccess: (_record, type) => {
      queryClient.invalidateQueries({ queryKey: ['plan-type'] })
      // SCRUM-254: server may have just picked new AI-assigned
      // assessments for an Advanced plan, or cleared them for Basic.
      // Refetch the assignment progress + the AI plan so the Health
      // Plan screen reflects the switch immediately.
      queryClient.invalidateQueries({ queryKey: ['health-plan-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] })

      // COS-417: no more nested native Modals to collide on dismissal — this
      // whole screen is a single expo-router route now, so popping it is a
      // plain router.back() rather than the old two-Modal, one-frame-deferred
      // dismissal dance.
      const dismissAndNavigate = () => {
        setConsentAck(false)
        setPendingType(null)
        router.back()
        // Any non-basic tier opens the assessment catalog so users can see
        // their AI-picked check-ins. Basic stays on the plan screen — it
        // also gets AI picks now (SCRUM-268) but they're light enough that
        // we don't force the user into the catalog.
        if (type !== 'basic') {
          router.push('/Home/assessments-catalog?source=plan-upgrade' as never)
        }
      }

      // COS-412: the tier switch above already succeeded regardless of what
      // happens next, so this is fire-and-forget from the user's
      // perspective — on regenerate failure we still dismiss/navigate
      // exactly as before; the user just stays on the legacy screen (no
      // bio plan record exists yet) with the "Try new plan" CTA available
      // to retry later.
      if (biopsychosocialPlanEnabled) {
        setMigrating(true)
        regenerateBioPlanMutation.mutate(undefined, {
          onSettled: () => {
            setMigrating(false)
            dismissAndNavigate()
          },
        })
      } else {
        dismissAndNavigate()
      }
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'NO_AGENCY') {
        setErrorMsg('Agency plan requires an active care-management agency. Connect one in settings first.')
      } else if (err.code === 'CONSENT_REQUIRED') {
        setErrorMsg('Please acknowledge consent to switch your plan.')
      } else {
        setErrorMsg(err.message || 'Unable to update plan type. Try again.')
      }
    },
  })

  const consentCopyForType: Record<PlanType, string> = {
    basic:
      'You’ll see a small set of AI-picked screeners (mood, sleep, wellbeing). Your answers personalize your plan and you can retake them monthly.',
    advanced:
      'We’ll ask you a series of short health check-ins. Your answers are stored in your account and used to personalize your AI plan. You can retake or update them any time.',
    'agency-supported':
      'Your linked care management agency can see your check-in results and add their own screens (Mini-Cog and others) alongside the AI-picked set.',
    'agency-managed':
      'Your linked care management agency manages your full intake and cognitive assessment. MOCA + Full Intake are coming soon; until then the AI-picked clinical set still applies.',
  }

  const onCancelConsent = () => {
    if (migrating) return // don't allow dismissal mid-regenerate
    setPendingType(null)
    setConsentAck(false)
    setErrorMsg(null)
  }

  const onClose = () => {
    router.back()
  }

  return (
    <AppWrapper>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any, marginLeft: 12 },
            ]}
          >
            Choose your health plan
          </Text>
        </View>

        {pendingType === null ? (
          <Animated.View key="list" entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
            <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              You can switch any time. Your progress and badges are preserved.
            </Text>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              {errorMsg ? (
                <View style={[styles.errorBox, { borderColor: '#DC2626', backgroundColor: '#FEE2E2' }]}>
                  <MaterialIcons name="error-outline" size={20} color="#991B1B" />
                  <Text style={{ color: '#991B1B', flex: 1, fontSize: getScaledFontSize(13) }}>{errorMsg}</Text>
                </View>
              ) : null}

              {PLAN_CARDS.filter((c) => AGENCY_PLANS_ENABLED || !isAgencyType(c.type)).map((card) => {
                const isCurrent = card.type === currentType
                // SCRUM-232: chooser is fully open — users can pick any tier.
                // Agency tiers still require a linked care-management agency
                // (data gate, not subscription gate). SCRUM-268: both
                // agency-supported and agency-managed share the same data gate.
                const isAgencyTier = card.type === 'agency-supported' || card.type === 'agency-managed'
                const isAgencyDisabled = isAgencyTier && !hasAgency
                const isLocked = isAgencyDisabled
                const disabled = mutation.isPending || isLocked || isCurrent
                // COS-360 / SCRUM-577 — flag-gated rename of 'agency-supported'
                // to "Family Support"; other tiers pass through unchanged.
                const displayTitle = planTypeDisplayName(card.type)
                return (
                  <Pressable
                    key={card.type}
                    onPress={() => {
                      if (!disabled) {
                        setErrorMsg(null)
                        setConsentAck(false)
                        setPendingType(card.type)
                      }
                    }}
                    disabled={disabled}
                    style={({ pressed }) => [
                      styles.card,
                      {
                        backgroundColor: colors.card,
                        borderColor: isCurrent ? (colors.tint as string) : colors.text + '20',
                        borderWidth: isCurrent ? 2 : 1,
                        opacity: isLocked ? 0.55 : pressed ? 0.85 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isCurrent, disabled }}
                    accessibilityLabel={`${displayTitle} plan. ${card.description}${isCurrent ? '. Currently selected.' : ''}`}
                  >
                    <View style={styles.cardHeader}>
                      <MaterialIcons name={card.icon} size={28} color={colors.tint as string} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                          {displayTitle}
                        </Text>
                      </View>
                      {isCurrent ? (
                        <View style={[styles.currentPill, { backgroundColor: colors.tint as string }]}>
                          <Text style={[styles.currentPillText, { fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any }]}>
                            CURRENT
                          </Text>
                        </View>
                      ) : null}
                      {mutation.isPending && mutation.variables === card.type ? (
                        <ActivityIndicator color={colors.tint as string} />
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.assessmentBadge,
                        { backgroundColor: ASSESSMENT_COLOR[card.assessmentLevel] + '22', borderColor: ASSESSMENT_COLOR[card.assessmentLevel] },
                      ]}
                    >
                      <MaterialIcons
                        name="assignment"
                        size={12}
                        color={ASSESSMENT_COLOR[card.assessmentLevel]}
                      />
                      <Text
                        style={{
                          color: ASSESSMENT_COLOR[card.assessmentLevel],
                          fontSize: getScaledFontSize(10),
                          fontWeight: getScaledFontWeight(700) as any,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginLeft: 4,
                        }}
                      >
                        {ASSESSMENT_LABEL[card.assessmentLevel]}
                      </Text>
                    </View>
                    <Text style={[styles.cardDescription, { color: colors.text, fontSize: getScaledFontSize(14), marginTop: 8 }]}>
                      {card.description}
                    </Text>

                    <View style={styles.includedList}>
                      <FeatureRow
                        icon="health-and-safety"
                        label="Assessment"
                        value={card.features.assessment}
                        colors={colors}
                        getScaledFontSize={getScaledFontSize}
                      />
                      <FeatureRow
                        icon="autorenew"
                        label="Updates"
                        value={card.features.updates}
                        colors={colors}
                        getScaledFontSize={getScaledFontSize}
                      />
                      <FeatureRow
                        icon="support-agent"
                        label="Support"
                        value={card.features.support}
                        colors={colors}
                        getScaledFontSize={getScaledFontSize}
                      />
                      <FeatureRow
                        icon="favorite"
                        label="Best for"
                        value={card.features.bestFor}
                        colors={colors}
                        getScaledFontSize={getScaledFontSize}
                      />
                    </View>

                    {isAgencyDisabled ? (
                      <Text style={[styles.cardDetail, { color: '#C0392B', marginTop: 10, fontSize: getScaledFontSize(12) }]}>
                        Connect a care-management agency to enable this plan.
                      </Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </Animated.View>
        ) : (
          // COS-417: consent confirmation (SCRUM-224), formerly a nested
          // transparent Modal — now swaps in for the tier list within this
          // same screen. While `migrating` is true (biopsychosocial
          // regenerate in flight after a successful tier switch) this shows
          // a loading state instead of Cancel/Confirm, so the ~30-40s
          // regenerate isn't invisible to the user.
          <Animated.View key="consent" entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.consentWrap}>
            <View
              style={[
                styles.consentSheet,
                { backgroundColor: colors.card as string, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.consentTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                {migrating
                  ? 'Generating your new plan…'
                  : `Switching to ${pendingType ? planTypeDisplayName(pendingType) : ''}`}
              </Text>
              <Text style={[styles.consentBody, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
                {migrating
                  ? 'Setting up your personalized plan across Biological, Psychological, and Social & Spiritual sections. This can take up to a minute.'
                  : (pendingType ? consentCopyForType[pendingType] : '')}
              </Text>

              {errorMsg ? (
                <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(12), marginTop: 4, marginBottom: 10 }}>
                  {errorMsg}
                </Text>
              ) : null}

              {migrating ? (
                <View style={styles.migratingRow}>
                  <ActivityIndicator color={colors.tint as string} />
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={() => setConsentAck((v) => !v)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: consentAck }}
                    style={styles.consentCheckRow}
                  >
                    <MaterialIcons
                      name={consentAck ? 'check-box' : 'check-box-outline-blank'}
                      size={getScaledFontSize(22)}
                      color={consentAck ? (colors.tint as string) : colors.subtext}
                    />
                    <Text style={{ marginLeft: 8, color: colors.text, fontSize: getScaledFontSize(13), flex: 1 }}>
                      I understand and agree.
                    </Text>
                  </Pressable>
                  <View style={styles.consentActions}>
                    <Pressable
                      onPress={onCancelConsent}
                      style={[styles.consentBtn, { borderColor: colors.border }]}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (pendingType && consentAck) {
                          setErrorMsg(null)
                          mutation.mutate(pendingType)
                        }
                      }}
                      disabled={!consentAck || mutation.isPending}
                      style={[
                        styles.consentBtn,
                        styles.consentBtnPrimary,
                        {
                          backgroundColor: consentAck ? (colors.tint as string) : (colors.subtext + '60'),
                          opacity: mutation.isPending ? 0.6 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                    >
                      {mutation.isPending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                          Confirm
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </Animated.View>
        )}
      </View>
    </AppWrapper>
  )
}

/** Single attribute row inside a plan card: icon + label + value. */
function FeatureRow({
  icon,
  label,
  value,
  colors,
  getScaledFontSize,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
  value: string
  colors: { text: string; subtext: string; tint: string | undefined }
  getScaledFontSize: (n: number) => number
}): React.JSX.Element {
  return (
    <View style={styles.featureRow}>
      <MaterialIcons name={icon} size={16} color={colors.subtext} />
      <Text
        style={{
          width: 92,
          marginLeft: 8,
          color: colors.subtext,
          fontSize: getScaledFontSize(12),
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          flex: 1,
          color: colors.text,
          fontSize: getScaledFontSize(12),
          lineHeight: getScaledFontSize(18),
        }}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, paddingTop: 12,
  },
  title: { flex: 1 },
  subtitle: { marginHorizontal: 16, marginBottom: 18 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12,
  },
  card: {
    padding: 16, borderRadius: 14, marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  cardTitle: {},
  cardDescription: { marginBottom: 4 },
  cardDetail: { lineHeight: 18 },
  currentPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  currentPillText: { color: '#fff', letterSpacing: 0.5 },
  assessmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
  },
  includedList: { marginTop: 10, gap: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start' },
  consentWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  consentSheet: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  consentTitle: { marginBottom: 8 },
  consentBody: { lineHeight: 20, marginBottom: 14 },
  consentCheckRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  consentActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  migratingRow: { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
  consentBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  consentBtnPrimary: { borderColor: 'transparent' },
})
