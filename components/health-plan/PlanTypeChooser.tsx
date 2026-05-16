import React from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updatePlanType, type PlanType } from '@/services/api/plan-type'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'

interface PlanTypeChooserProps {
  visible: boolean
  currentType?: PlanType
  hasAgency: boolean
  onClose: () => void
}

interface PlanCardSpec {
  type: PlanType
  title: string
  description: string
  detail: string
  icon: keyof typeof MaterialIcons.glyphMap
}

const PLAN_CARDS: PlanCardSpec[] = [
  {
    type: 'basic',
    title: 'Basic',
    description: 'A simple, steady plan tailored to your records today.',
    detail: 'Generated once and stays the same until you ask for an update.',
    icon: 'check-circle-outline',
  },
  {
    type: 'advanced',
    title: 'Advanced',
    description: 'An adaptive plan that updates as your health record changes.',
    detail: 'AI refines tasks when you add new conditions, meds, or visits. Your care team can adjust too.',
    icon: 'auto-awesome',
  },
  {
    type: 'agency',
    title: 'Agency-managed',
    description: 'Your care management agency designs and updates your plan.',
    detail: 'Available when you have an active care management agency.',
    icon: 'workspaces',
  },
]

/**
 * First-visit (or settings-driven) plan type selector. Always switchable; the
 * server preserves task completions and badges across switches.
 *
 * Agency option is shown to everyone, disabled with explanatory copy when
 * the user has no care management agency linked.
 */
export function PlanTypeChooser({
  visible,
  currentType,
  hasAgency,
  onClose,
}: PlanTypeChooserProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (type: PlanType) => updatePlanType(type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan-type'] })
      onClose()
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'NO_AGENCY') {
        setErrorMsg('Agency plan requires an active care-management agency. Connect one in settings first.')
      } else {
        setErrorMsg(err.message || 'Unable to update plan type. Try again.')
      }
    },
  })

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any }]}>
            Choose your health plan
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <MaterialIcons name="close" size={getScaledFontSize(26)} color={colors.text} />
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          You can switch any time. Your progress and badges are preserved.
        </Text>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {errorMsg ? (
            <View style={[styles.errorBox, { borderColor: '#DC2626', backgroundColor: '#FEE2E2' }]}>
              <MaterialIcons name="error-outline" size={20} color="#991B1B" />
              <Text style={{ color: '#991B1B', flex: 1, fontSize: getScaledFontSize(13) }}>{errorMsg}</Text>
            </View>
          ) : null}

          {PLAN_CARDS.map((card) => {
            const isCurrent = card.type === currentType
            const isAgencyDisabled = card.type === 'agency' && !hasAgency
            const disabled = mutation.isPending || isAgencyDisabled || isCurrent
            return (
              <Pressable
                key={card.type}
                onPress={() => { if (!disabled) { setErrorMsg(null); mutation.mutate(card.type) } }}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: isCurrent ? (colors.tint as string) : colors.text + '20',
                    borderWidth: isCurrent ? 2 : 1,
                    opacity: isAgencyDisabled ? 0.55 : pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isCurrent, disabled }}
                accessibilityLabel={`${card.title} plan. ${card.description}${isCurrent ? '. Currently selected.' : ''}`}
              >
                <View style={styles.cardHeader}>
                  <MaterialIcons name={card.icon} size={28} color={colors.tint as string} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
                      {card.title}
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
                <Text style={[styles.cardDescription, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                  {card.description}
                </Text>
                <Text style={[styles.cardDetail, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                  {card.detail}
                </Text>
                {isAgencyDisabled ? (
                  <Text style={[styles.cardDetail, { color: '#C0392B', marginTop: 6, fontSize: getScaledFontSize(12) }]}>
                    Connect a care-management agency to enable this plan.
                  </Text>
                ) : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { flex: 1 },
  subtitle: { marginBottom: 18 },
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
})
