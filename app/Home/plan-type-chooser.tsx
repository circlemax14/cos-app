/**
 * Plan type chooser route (COS-430).
 *
 * A full-screen route replacement for the previous `PlanTypeChooser` Modal
 * (SCRUM-224 / SCRUM-268 / COS-352 / COS-412). Kenneth's iOS 26.5 device
 * crashed repeatedly on that Modal — see project_ios26_biopsychosocial_parked
 * memory — because the chooser nested a consent Modal INSIDE the tier-list
 * Modal, and iOS 26.5 rejects that dismiss-on-nil pattern. This route
 * flattens it into a single pushed screen with the consent expanded INLINE
 * on the selected card, so there is no Modal in the picking-and-confirming
 * path at all.
 *
 * Same tier cards, same mutation, same consent copy, same COS-412 bio
 * regenerate + navigation-to-catalog behavior — only the presentation
 * differs. The old `components/health-plan/PlanTypeChooser.tsx` file is
 * removed in this commit; every caller migrates to `router.push('/Home/
 * plan-type-chooser')`.
 */
import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router, Stack } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPlanTypeCards } from '@/services/plan-type-cards'

import { AppWrapper } from '@/components/app-wrapper'
import { updatePlanType, type PlanType } from '@/services/api/plan-type'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { usePlanType } from '@/hooks/use-plan-type'
import { usePlanTypeDisplayName } from '@/hooks/use-plan-type-display-name'
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag'
import { useRegenerateBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

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
  light: '#6B7280',
  standard: '#5B47CC',
  clinical: '#0E7490',
}
const ASSESSMENT_LABEL: Record<AssessmentLevel, string> = {
  light: 'Light assessment',
  standard: 'Standard + EHR assessment',
  clinical: 'Full clinical assessment',
}

// COS-352 (preserved from PlanTypeChooser): agency tiers hidden until the
// full agency business flow is rebuilt. Existing agency users keep their
// current plan (health-plan.tsx still renders the labels).
const AGENCY_PLANS_ENABLED = false
const isAgencyType = (t: PlanType) => t === 'agency-supported' || t === 'agency-managed'

/**
 * COS-432: "Coming soon" cards — display-only entries in the chooser that
 * advertise upcoming tiers so users know they're on the roadmap, without
 * wiring them to the backend PlanType enum or the tier-switch mutation.
 * Rendered by `ComingSoonPlanCard` below the selectable tiers, styled as
 * disabled with a "COMING SOON" badge. Ken's stakeholder ask 2026-07-09:
 * show Family as coming soon on the chooser (assessment-strategy-v2 §3.2
 * has Family queued as a real tier for a later phase).
 */
interface ComingSoonSpec {
  key: string
  title: string
  description: string
  features: PlanCardSpec['features']
  icon: keyof typeof MaterialIcons.glyphMap
  assessmentLevel: AssessmentLevel
}

const COMING_SOON_CARDS: ComingSoonSpec[] = [
  {
    key: 'family',
    title: 'Family',
    description:
      'Shared with your household — invited family members can view, comment on, and help track your goals together.',
    features: {
      assessment: 'Everything in Advanced, shared with invited family',
      updates: 'Family can view + comment on your plan and goals',
      support: 'Shared with your care circle',
      bestFor: 'Households where family manages care together',
    },
    icon: 'groups',
    assessmentLevel: 'standard',
  },
]

const PLAN_CARDS: PlanCardSpec[] = [
  {
    type: 'basic',
    title: 'Basic',
    description: 'Light AI-picked screeners + analytics from your records and wearables.',
    assessmentLevel: 'light',
    features: {
      assessment: '1–3 brief screeners (mood, sleep, wellbeing)',
      updates: 'AI re-picks screeners as your health record evolves',
      support: 'Self-directed',
      bestFor: 'Stable conditions, self-managed care',
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
      updates: 'AI re-selects as conditions, meds, or labs change',
      support: 'AI',
      bestFor: 'Complex care, multiple specialists',
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
      updates: 'AI updates + your care team can override',
      support: 'Shared with your care team',
      bestFor: 'Patients with functional or cognitive change',
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
      updates: 'Care manager directs assessment cadence',
      support: 'Full care management',
      bestFor: 'Patients needing active coordination',
    },
    icon: 'medical-services',
  },
]

const CONSENT_COPY: Record<PlanType, string> = {
  basic:
    "You'll see a small set of AI-picked screeners (mood, sleep, wellbeing). Your answers personalize your plan and you can retake them monthly.",
  advanced:
    "We'll ask you a series of short health check-ins. Your answers are stored in your account and used to personalize your AI plan. You can retake or update them any time.",
  'agency-supported':
    'Your linked care management agency can see your check-in results and add their own screens (Mini-Cog and others) alongside the AI-picked set.',
  'agency-managed':
    'Your linked care management agency manages your full intake and cognitive assessment. MOCA + Full Intake are coming soon; until then the AI-picked clinical set still applies.',
}

export default function PlanTypeChooserRoute(): React.JSX.Element {
  const queryClient = useQueryClient()

  /**
   * COS-734 — card copy now comes from the backend so an admin can edit it
   * without an app release. PLAN_CARDS below stays as the LAST-RESORT fallback:
   * this screen drives assessment intensity, so it has to render even offline.
   *
   * `type`, `assessmentLevel` and `icon` still come from the response, but the
   * fetcher drops any card whose type is not one of ours — the enum is clinical
   * and the server must not be able to introduce a new one.
   */
  const cardsQuery = useQuery({
    queryKey: ['plan-type-cards'],
    queryFn: () => fetchPlanTypeCards(PLAN_CARDS),
    staleTime: 5 * 60 * 1000,
    // The fallback is already the embedded copy, so a retry buys nothing.
    retry: false,
  })
  const cards = (cardsQuery.data ?? PLAN_CARDS) as typeof PLAN_CARDS
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const planTypeDisplayName = usePlanTypeDisplayName()

  const planTypeQuery = usePlanType()
  const currentType = planTypeQuery.planType
  // hasAgency is hard-wired true at every previous caller of the Modal
  // (see health-plan.tsx pre-COS-430) so preserve that here. Actual agency
  // gating comes from the backend `NO_AGENCY` error path below.
  const hasAgency = true

  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  // COS-430: replaces the nested consent Modal — one card can be
  // "expanded" at a time with its consent checkbox + Confirm button inline.
  const [pendingType, setPendingType] = React.useState<PlanType | null>(null)
  const [consentAck, setConsentAck] = React.useState(false)

  const biopsychosocialPlanEnabled = useBiopsychosocialPlanFlag()
  const regenerateBioPlanMutation = useRegenerateBiopsychosocialPlan()
  const [migrating, setMigrating] = React.useState(false)

  const mutation = useMutation({
    mutationFn: (type: PlanType) =>
      updatePlanType(type, { consent: { acknowledged: true, consentVersion: 'v1' } }),
    onSuccess: (_record, type) => {
      queryClient.invalidateQueries({ queryKey: ['plan-type'] })
      queryClient.invalidateQueries({ queryKey: ['health-plan-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] })

      // With no nested Modal to unwind, we just pop the route and navigate.
      const dismissAndNavigate = () => {
        setConsentAck(false)
        setPendingType(null)
        // Any non-basic tier opens the assessment catalog so users can see
        // their AI-picked check-ins. Basic stays on the plan screen.
        if (type !== 'basic') {
          router.replace('/Home/assessments-catalog?source=plan-upgrade' as never)
        } else {
          router.back()
        }
      }

      // COS-412 preserved: fire-and-forget bio regenerate; on failure we
      // still dismiss/navigate as before (user just stays on the legacy
      // screen with "Try new plan" CTA available to retry later).
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

  const closePendingConfirm = React.useCallback(() => {
    if (migrating) return // don't allow cancel while regenerate is running
    setPendingType(null)
    setConsentAck(false)
  }, [migrating])

  return (
    <AppWrapper>
      <Stack.Screen options={{ title: 'Plan type', headerBackTitle: 'Care Plan' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/*
          SCRUM-661 (2026-07-31): explicit back-button row. Same pattern
          as SCRUM-656/657 fix on /Home/bps-progress + /Home/wellbeing-map
          — the route sits inside the Tabs navigator with headerShown:
          false so the <Stack.Screen> above is a no-op and users had no
          back affordance. router.replace to biopsychosocial-plan (not
          router.back) because the Plan-tab entry point is a tab switch
          (not a push) and back would fall through to Home.
          Migrating guard: disabled while a plan-switch mutation is in
          flight so the user can't nav away mid-request.
        */}
        <View style={styles.backHeader}>
          <Pressable
            onPress={() => {
              if (migrating) return
              router.replace('/Home/biopsychosocial-plan' as never)
            }}
            style={styles.backBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back to care plan"
            accessibilityState={{ disabled: migrating }}
            disabled={migrating}
          >
            <MaterialIcons
              name="arrow-back"
              size={getScaledFontSize(24)}
              color={migrating ? colors.subtext : colors.text}
            />
          </Pressable>
        </View>
        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
            },
          ]}
        >
          Choose your health plan
        </Text>
        <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          You can switch any time. Your progress and badges are preserved.
        </Text>

        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {errorMsg ? (
            <View style={[styles.errorBox, { borderColor: '#DC2626', backgroundColor: '#FEE2E2' }]}>
              <MaterialIcons name="error-outline" size={20} color="#991B1B" />
              <Text style={{ color: '#991B1B', flex: 1, fontSize: getScaledFontSize(13) }}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Selectable tiers first, then coming-soon tiers underneath. */}
          {cards.filter((c) => AGENCY_PLANS_ENABLED || !isAgencyType(c.type)).map((card) => {
            const isCurrent = card.type === currentType
            const isAgencyTier = card.type === 'agency-supported' || card.type === 'agency-managed'
            const isAgencyDisabled = isAgencyTier && !hasAgency
            const isLocked = isAgencyDisabled
            const disabled = mutation.isPending || isLocked || isCurrent
            const displayTitle = planTypeDisplayName(card.type)
            const isExpanded = pendingType === card.type

            return (
              <View key={card.type}>
                <Pressable
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
                      borderColor: isCurrent || isExpanded ? (colors.tint as string) : colors.text + '20',
                      borderWidth: isCurrent || isExpanded ? 2 : 1,
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
                      <Text
                        style={[
                          styles.cardTitle,
                          {
                            color: colors.text,
                            fontSize: getScaledFontSize(18),
                            fontWeight: getScaledFontWeight(700) as any,
                          },
                        ]}
                      >
                        {displayTitle}
                      </Text>
                    </View>
                    {isCurrent ? (
                      <View style={[styles.currentPill, { backgroundColor: colors.tint as string }]}>
                        <Text
                          style={[
                            styles.currentPillText,
                            {
                              fontSize: getScaledFontSize(11),
                              fontWeight: getScaledFontWeight(700) as any,
                            },
                          ]}
                        >
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
                      {
                        backgroundColor: ASSESSMENT_COLOR[card.assessmentLevel] + '22',
                        borderColor: ASSESSMENT_COLOR[card.assessmentLevel],
                      },
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
                  <Text
                    style={[
                      styles.cardDescription,
                      { color: colors.text, fontSize: getScaledFontSize(14), marginTop: 8 },
                    ]}
                  >
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
                    <Text
                      style={[
                        styles.cardDetail,
                        { color: '#C0392B', marginTop: 10, fontSize: getScaledFontSize(12) },
                      ]}
                    >
                      Connect a care-management agency to enable this plan.
                    </Text>
                  ) : null}
                </Pressable>

                {isExpanded ? (
                  <View
                    style={[
                      styles.inlineConfirm,
                      {
                        backgroundColor: (colors.card as string),
                        borderColor: colors.tint as string,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.consentTitle,
                        {
                          color: colors.text,
                          fontSize: getScaledFontSize(16),
                          fontWeight: getScaledFontWeight(700) as any,
                        },
                      ]}
                    >
                      {migrating ? 'Generating your new plan…' : `Switching to ${planTypeDisplayName(card.type)}`}
                    </Text>
                    <Text
                      style={[
                        styles.consentBody,
                        { color: colors.subtext, fontSize: getScaledFontSize(13) },
                      ]}
                    >
                      {migrating
                        ? 'Setting up your personalized plan across Biological, Psychological, and Social & Faith sections. This can take up to a minute.'
                        : CONSENT_COPY[card.type]}
                    </Text>

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
                          <Text
                            style={{
                              marginLeft: 8,
                              color: colors.text,
                              fontSize: getScaledFontSize(13),
                              flex: 1,
                            }}
                          >
                            I understand and agree.
                          </Text>
                        </Pressable>
                        <View style={styles.consentActions}>
                          <Pressable
                            onPress={closePendingConfirm}
                            style={[styles.consentBtn, { borderColor: colors.border }]}
                            accessibilityRole="button"
                          >
                            <Text
                              style={{
                                color: colors.text,
                                fontSize: getScaledFontSize(14),
                                fontWeight: getScaledFontWeight(600) as any,
                              }}
                            >
                              Cancel
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              if (consentAck) {
                                setErrorMsg(null)
                                mutation.mutate(card.type)
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
                              <Text
                                style={{
                                  color: '#fff',
                                  fontSize: getScaledFontSize(14),
                                  fontWeight: getScaledFontWeight(700) as any,
                                }}
                              >
                                Confirm &amp; regenerate
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            )
          })}

          {/*
           * COS-432: coming-soon tiers (Family, ...). Display-only, not
           * selectable, not routed to the backend PlanType enum. Shown so
           * users know these are on the roadmap.
           */}
          {COMING_SOON_CARDS.map((card) => (
            <ComingSoonPlanCard
              key={card.key}
              spec={card}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ))}

          {/*
            COS-737 — this screen chooses ASSESSMENT INTENSITY, which is free and
            clinical. Billing plans are a separate thing with prices, so they get
            a separate screen rather than being mixed into these cards: nobody
            should change their screener depth by picking a price, or be charged
            for choosing more screeners.
          */}
          <Pressable
            onPress={() => router.push('/Home/billing' as never)}
            accessibilityRole="button"
            accessibilityLabel="View your plan and pricing"
            style={{
              marginTop: 8,
              marginBottom: 24,
              paddingVertical: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border ?? '#E5E7EB',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(600) as never,
              }}
            >
              View your plan and pricing
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </AppWrapper>
  )
}

/**
 * COS-432: read-only "coming soon" tier card. Same visual shell as a
 * selectable card (icon + title + description + feature rows) so users
 * see it belongs to the same list, but rendered non-interactive with a
 * "COMING SOON" badge in place of a selection state. Not a Pressable —
 * there is nothing to press yet.
 */
function ComingSoonPlanCard({
  spec,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  spec: ComingSoonSpec
  colors: { text: string; subtext: string; card: string; tint: string | undefined; border: string }
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${spec.title} plan — coming soon. ${spec.description}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.text + '20',
          borderWidth: 1,
          borderStyle: 'dashed',
          opacity: 0.7,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <MaterialIcons name={spec.icon} size={28} color={colors.subtext} />
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.cardTitle,
              {
                color: colors.text,
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(700) as any,
              },
            ]}
          >
            {spec.title}
          </Text>
        </View>
        <View style={[styles.currentPill, { backgroundColor: colors.subtext }]}>
          <Text
            style={[
              styles.currentPillText,
              {
                fontSize: getScaledFontSize(11),
                fontWeight: getScaledFontWeight(700) as any,
              },
            ]}
          >
            COMING SOON
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.assessmentBadge,
          {
            backgroundColor: ASSESSMENT_COLOR[spec.assessmentLevel] + '18',
            borderColor: ASSESSMENT_COLOR[spec.assessmentLevel] + '80',
          },
        ]}
      >
        <MaterialIcons name="assignment" size={12} color={ASSESSMENT_COLOR[spec.assessmentLevel]} />
        <Text
          style={{
            color: ASSESSMENT_COLOR[spec.assessmentLevel],
            fontSize: getScaledFontSize(10),
            fontWeight: getScaledFontWeight(700) as any,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginLeft: 4,
          }}
        >
          {ASSESSMENT_LABEL[spec.assessmentLevel]}
        </Text>
      </View>
      <Text
        style={[styles.cardDescription, { color: colors.text, fontSize: getScaledFontSize(14), marginTop: 8 }]}
      >
        {spec.description}
      </Text>
      <View style={styles.includedList}>
        <FeatureRow
          icon="health-and-safety"
          label="Assessment"
          value={spec.features.assessment}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
        />
        <FeatureRow
          icon="autorenew"
          label="Updates"
          value={spec.features.updates}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
        />
        <FeatureRow
          icon="support-agent"
          label="Support"
          value={spec.features.support}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
        />
        <FeatureRow
          icon="favorite"
          label="Best for"
          value={spec.features.bestFor}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
        />
      </View>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(12),
          marginTop: 10,
          fontStyle: 'italic',
        }}
      >
        We&apos;ll let you know when this plan is available.
      </Text>
    </View>
  )
}

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
  container: { flex: 1, padding: 20 },
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
    marginTop: -4,
    marginBottom: 4,
  },
  backBtn: {
    padding: 8,
  },
  title: { marginBottom: 4 },
  subtitle: { marginBottom: 18 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  card: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
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
  inlineConfirm: {
    marginTop: -6,
    marginBottom: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
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
