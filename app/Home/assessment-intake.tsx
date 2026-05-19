import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'

/**
 * Backward-compat redirect (SCRUM-225). The monolithic intake was
 * replaced by the catalog + per-question stepper. Any deep link or
 * pre-existing nav action that still points at /Home/assessment-intake
 * (older OTAs, push notifications, etc.) lands here and is bounced to
 * the new catalog, preserving the `source` query param so the catalog
 * can show the "you just upgraded" copy when appropriate.
 */
export default function AssessmentIntakeRedirect(): React.JSX.Element {
  const { settings } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const params = useLocalSearchParams<{ source?: string }>()

  React.useEffect(() => {
    const source = typeof params.source === 'string' ? params.source : undefined
    const target = source
      ? `/Home/assessments-catalog?source=${encodeURIComponent(source)}`
      : '/Home/assessments-catalog'
    router.replace(target as never)
  }, [params.source])

  return (
    <AppWrapper>
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint as string} />
      </View>
    </AppWrapper>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
