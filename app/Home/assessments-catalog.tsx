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
import { router, useLocalSearchParams } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { usePlanType, meetsTier } from '@/hooks/use-plan-type'
import { useBiopsychosocialPlanFlag } from '@/hooks/use-assessment-strategy-v2-flag'
import { AssessmentCatalogContent } from '@/components/health-plan/AssessmentCatalogContent'

export default function AssessmentsCatalogScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const params = useLocalSearchParams<{ source?: string }>()
  const fromPlanUpgrade = params.source === 'plan-upgrade'

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
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any, marginLeft: 12 }]}>
            Health check-ins
          </Text>
        </View>

        <AssessmentCatalogContent
          intro={
            fromPlanUpgrade
              ? 'Pick the check-ins to start with. Your AI plan personalizes itself as you go.'
              : 'Take or revisit check-ins to keep your plan up to date.'
          }
          biopsychosocialPlanEnabled={biopsychosocialPlanEnabled}
          hasPlanType={planType !== undefined}
        />
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
