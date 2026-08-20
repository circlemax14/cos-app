import React from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router, useLocalSearchParams } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { usePlanType, meetsTier } from '@/hooks/use-plan-type'
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag'
import { AssessmentCatalogContent } from '@/components/health-plan/AssessmentCatalogContent'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

// CHUNK 69: `?focus=bio|psy|soc` deep-link (from BpsWellbeingScoreCard tap,
// chunks 65/66) scrolls the catalog to the matching domain section on
// mount. Mirrors chunk-55 poll discipline: 10 attempts × 200ms, mark
// handled after successful scroll, VoiceOver announce on completion.
// Silently no-ops for any other `focus` value (incl. 'other', '') and
// when the assessment-strategy-v2 flag is OFF (no per-domain sections
// rendered — flat grid only).
type CatalogFocusToken = 'bio' | 'psy' | 'soc'
// Mirrors CatalogDomainBucket in AssessmentCatalogContent. 'cognitive' is a
// section but not a deep-link target — FOCUS_TO_DOMAIN only maps bio/psy/soc,
// which are the three slices the wellbeing card can be tapped through.
type CatalogDomainKey = 'biological' | 'psychological' | 'cognitive' | 'social' | 'other'
const FOCUS_TO_DOMAIN: Record<CatalogFocusToken, CatalogDomainKey> = {
  bio: 'biological',
  psy: 'psychological',
  soc: 'social',
}
const FOCUS_ANNOUNCE: Record<CatalogFocusToken, string> = {
  bio: 'Navigated to your biological check-ins.',
  psy: 'Navigated to your psychological check-ins.',
  soc: 'Navigated to your social and spiritual check-ins.',
}
function normalizeFocus(v: unknown): CatalogFocusToken | null {
  return v === 'bio' || v === 'psy' || v === 'soc' ? v : null
}

export default function AssessmentsCatalogScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const params = useLocalSearchParams<{ source?: string; focus?: string }>()
  const fromPlanUpgrade = params.source === 'plan-upgrade'
  // Normalize the deep-link param up-front so effect deps depend on a
  // stable primitive (null | 'bio' | 'psy' | 'soc') instead of the raw
  // string, which would re-fire the effect on unrelated param churn.
  const deepLinkFocus = normalizeFocus(params.focus)

  const { planType, isLoading: planLoading } = usePlanType()
  const canAccess = meetsTier(planType, 'advanced')
  // COS-411: when the biopsychosocial Care Plan rebuild is live, "Build my
  // plan" from this catalog should regenerate that plan instead of the
  // legacy AI health plan. Derived from the flag + whether the plan-type
  // query has resolved to an actual tier, not from a query param — this
  // screen is reached from several entry points (plan-upgrade CTA, direct
  // link from assessment-stepper, etc.) and the flag/tier state is the
  // single source of truth regardless of how the user got here.
  const biopsychosocialPlanEnabled = useBiopsychosocialPlanFlag()

  // CHUNK 69: parent-owned refs the deep-link effect reads from. Y values
  // captured via onLayout wrappers below. Value-keyed guard (not boolean)
  // — repeat identical focus value no-ops; a fresh value on route re-entry
  // re-fires. Same discipline as BiopsychosocialPlanScreen chunk-55/60.
  const scrollRef = React.useRef<ScrollView | null>(null)
  // Y of the AssessmentCatalogContent root wrapper within the ScrollView
  // (needed because domainGroup onLayout fires against its parent, which
  // is the catalog content root — not the ScrollView directly). Sum of
  // this + per-group y = ScrollView-content y-offset. Mirrors the chunk-57
  // blocker comment on BiopsychosocialPlanScreen line 1584-1590.
  const contentBaseYRef = React.useRef<number | null>(null)
  const sectionYByKey = React.useRef<Map<CatalogDomainKey, number>>(
    new Map<CatalogDomainKey, number>(),
  )
  const focusHandledRef = React.useRef<string | null>(null)
  const onSectionLayout = React.useCallback((key: CatalogDomainKey, y: number) => {
    sectionYByKey.current.set(key, y)
  }, [])

  // CHUNK 69 deep-link effect. Polls every 200ms up to ~2s for the target
  // domain wrapper to lay out, then scrolls and marks handled. Give-up
  // still marks handled so we never loop across re-renders of the same
  // unresolved value (e.g. flag OFF branch → no domain sections render,
  // or user's `visible` set has zero instruments in the target bucket so
  // that section is filtered out at line 107 of AssessmentCatalogContent).
  //
  // Bail branches:
  //  - deepLinkFocus null/invalid: nothing to do
  //  - already handled this exact value: idempotent
  //  - planLoading / !canAccess: ScrollView isn't mounted (early returns
  //    below), so polls would burn against nothing. Effect re-runs on
  //    those state transitions and starts fresh polling once mounted.
  React.useEffect(() => {
    if (!deepLinkFocus) return
    if (focusHandledRef.current === deepLinkFocus) return
    if (planLoading || !canAccess) return
    const domainKey = FOCUS_TO_DOMAIN[deepLinkFocus]
    const POLL_MS = 200
    const MAX_ATTEMPTS = 10
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const tryScroll = () => {
      const base = contentBaseYRef.current
      const rel = sectionYByKey.current.get(domainKey)
      if (base != null && rel != null && scrollRef.current) {
        const y = Math.max(0, base + rel - 12)
        scrollRef.current.scrollTo({ y, animated: true })
        focusHandledRef.current = deepLinkFocus
        // announceForAccessibilityWithOptions(queue:true) available since
        // RN 0.68; cos-app is on 0.83.10. Queued so it fires AFTER any
        // in-flight VoiceOver read (header, plan-upgrade intro) instead
        // of preempting it.
        AccessibilityInfo.announceForAccessibilityWithOptions(
          FOCUS_ANNOUNCE[deepLinkFocus],
          { queue: true },
        )
        return
      }
      if (++attempts >= MAX_ATTEMPTS) {
        // Give up. Common legitimate causes: v2 flag OFF (no domain
        // sections render), or target bucket empty (filtered at
        // groupInstrumentsByDomain line 107). Mark handled so we don't
        // retry forever on the same value.
        focusHandledRef.current = deepLinkFocus
        return
      }
      timer = setTimeout(tryScroll, POLL_MS)
    }
    timer = setTimeout(tryScroll, POLL_MS)
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [deepLinkFocus, planLoading, canAccess])

  if (planLoading) {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint as string} />
        </View>
      </AppWrapper>
    )
  }

  if (!canAccess) {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <MaterialIcons name="lock-outline" size={getScaledFontSize(56)} color={colors.tint as string} />
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
            Health check-ins are an Advanced feature
          </Text>
          <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            Upgrade to access the full set of guided assessments.
          </Text>
          <Pressable
            onPress={() => router.replace('/Home/health-plan' as never)}
            style={[styles.primaryBtn, { backgroundColor: colors.tint as string }]}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
              View plans
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    )
  }

  return (
    <AppWrapper>
      <ScrollView
        ref={scrollRef}
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any, marginLeft: 12 }]}>
            Health check-ins
          </Text>
        </View>

        {/*
          CHUNK 69: onLayout wrapper captures the AssessmentCatalogContent
          root's y-offset within the ScrollView so per-domain offsets
          (relative to this wrapper's child, filled via onSectionLayout)
          can be summed to a correct ScrollView-content y. Mirrors the
          chunk-57 blocker fix on BiopsychosocialPlanScreen: onLayout
          fires relative to its IMMEDIATE parent, so the wrapper must
          be a direct child of the ScrollView.
        */}
        <View
          onLayout={(e) => {
            contentBaseYRef.current = e.nativeEvent.layout.y
          }}
        >
          <AssessmentCatalogContent
            intro={
              fromPlanUpgrade
                ? 'Pick the check-ins to start with. Your AI plan personalizes itself as you go.'
                : 'Take or revisit check-ins to keep your plan up to date.'
            }
            biopsychosocialPlanEnabled={biopsychosocialPlanEnabled}
            hasPlanType={planType !== undefined}
            onSectionLayout={onSectionLayout}
            // CHUNK 69 (hide-completed filter): map the deep-link token
            // to the domain-bucket key so AssessmentCatalogContent can
            // hide already-completed instruments inside that one group
            // (safe-fallback: reverts to full list if the group would
            // end up empty). Absent/invalid ?focus= → undefined → no
            // filtering, byte-for-byte today's behavior.
            focusedDomain={deepLinkFocus ? FOCUS_TO_DOMAIN[deepLinkFocus] : undefined}
          />
        </View>
      </ScrollView>
    </AppWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  headerTitle: { flex: 1 },
  title: { marginTop: 12, textAlign: 'center' },
  body: { marginTop: 6, paddingHorizontal: 8, textAlign: 'center' },
  primaryBtn: { marginTop: 18, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
})
