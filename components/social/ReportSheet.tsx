/**
 * COS-1268 — the Report form and its confirmation.
 *
 * A MODE of the conversation screen, not an overlay: it renders in place of
 * the thread and composer, inside that screen's existing KeyboardAvoidingView.
 * So the comment box gets keyboard avoidance for free, and there is no Modal,
 * Portal or Animated to put on a cold mount (iOS 26 envelope, ADR-0003). Same
 * reasoning as SocialPanel's invite sheet, which is a mode for the same reason.
 *
 * Actions sit OUTSIDE the ScrollView so the keyboard can never cover Send, and
 * keyboardShouldPersistTaps so the first tap on Send is not eaten dismissing it.
 */
import React from 'react'
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useMutation } from '@tanstack/react-query'

import { reportConversation, type ReportReason } from '@/services/api/conversations'
import { CrisisSupportCard } from '@/components/assessments/CrisisSupportCard'
import { Colors } from '@/constants/theme'
import { Radii, Spacing, TouchTargets, getColors } from '@/constants/design-system'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  MAX_REPORT_COMMENT,
  REPORT_REASONS,
  WORRIED_ABOUT_SOMEONE_INTRO,
  WORRIED_ABOUT_SOMEONE_TITLE,
  alsoBlockToSend,
  reportConfirmation,
  safetyErrorText,
} from '@/lib/social-safety'

export function ReportSheet({
  conversationId,
  message,
  onClose,
  onBlocked,
}: {
  conversationId: string
  /** Set when reporting one message; absent when reporting the person. */
  message?: { messageId: string; body: string } | null
  onClose: () => void
  /** The block went through, so this conversation no longer exists. */
  onBlocked: () => void
}): React.JSX.Element {
  const { settings, getScaledFontSize: fs, getScaledFontWeight: fw } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  // The AA-legible teal and the error red, as SocialPanel derives them.
  const tokens = getColors(!!settings.isDarkTheme)
  const actionTint = settings.isDarkTheme ? tokens.primary : tokens.primaryDark

  const [reason, setReason] = React.useState<ReportReason | null>(null)
  const [comment, setComment] = React.useState('')
  // Ticked by default. Hidden and sent as false for self_harm (alsoBlockToSend).
  const [alsoBlock, setAlsoBlock] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const report = useMutation({
    mutationFn: (r: ReportReason) =>
      reportConversation(conversationId, {
        messageId: message?.messageId,
        reason: r,
        comment: comment.trim() ? comment.trim().slice(0, MAX_REPORT_COMMENT) : undefined,
        alsoBlock: alsoBlockToSend(r, alsoBlock),
      }),
    onSuccess: (filed) =>
      AccessibilityInfo.announceForAccessibility(`Report sent. Reference ${filed.reference}.`),
    onError: (err) => setError(safetyErrorText(err)),
  })

  const submit = () => {
    if (!reason) {
      // Send stays live and says what is missing, rather than greying out.
      setError('Choose a reason.')
      return
    }
    setError(null)
    report.mutate(reason)
  }

  const filed = report.data
  const title = { color: colors.text, fontSize: fs(17), fontWeight: fw(700) as never }
  const body = { color: colors.text, fontSize: fs(15), lineHeight: fs(21) }
  const sub = { color: colors.subtext, fontSize: fs(13), lineHeight: fs(19) }

  if (filed) {
    const asked = alsoBlockToSend(filed.reason, alsoBlock)
    return (
      <>
        <ScrollView style={styles.flex} contentContainerStyle={styles.wrap}>
          <Text style={title} accessibilityRole="header">
            Report sent
          </Text>
          <Text style={body}>{`Reference ${filed.reference}`}</Text>
          <Text style={body}>{reportConfirmation(filed.reviewWindowText)}</Text>
          {filed.blocked ? (
            <Text style={sub}>You&apos;ve blocked this person. They won&apos;t be told.</Text>
          ) : asked ? (
            <Text style={sub}>
              We couldn&apos;t block them just now. You can try again from the menu.
            </Text>
          ) : null}
        </ScrollView>
        <View style={[styles.actions, { borderColor: colors.border }]}>
          <Pressable
            onPress={filed.blocked ? onBlocked : onClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={[styles.btn, styles.flex, { backgroundColor: actionTint }]}
          >
            <Text style={{ color: '#fff', fontSize: fs(16), fontWeight: fw(700) as never }}>Done</Text>
          </Pressable>
        </View>
      </>
    )
  }

  return (
    <>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={title} accessibilityRole="header">
          {message ? 'Report message' : 'Report this person'}
        </Text>
        {message ? (
          <View style={[styles.quote, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={sub} numberOfLines={3}>
              {message.body}
            </Text>
          </View>
        ) : null}
        <Text style={sub}>Why are you reporting this? They won&apos;t know who reported them.</Text>

        <View accessibilityRole="radiogroup">
          {REPORT_REASONS.map((r) => {
            const on = reason === r.key
            return (
              <Pressable
                key={r.key}
                onPress={() => {
                  setReason(r.key)
                  setError(null)
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={r.label}
                style={styles.option}
              >
                <MaterialIcons
                  name={on ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={fs(22)}
                  color={on ? actionTint : colors.icon}
                />
                <Text style={[body, styles.flex]}>{r.label}</Text>
              </Pressable>
            )
          })}
        </View>

        {/* Non-blocking: it sits in the flow and the report can still be sent. */}
        {reason === 'self_harm' ? (
          <CrisisSupportCard title={WORRIED_ABOUT_SOMEONE_TITLE} intro={WORRIED_ABOUT_SOMEONE_INTRO} />
        ) : null}

        <Text style={[sub, { marginTop: Spacing.sm }]}>Anything else we should know? (optional)</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={MAX_REPORT_COMMENT}
          // A multiline field has no other keyboard-side way out on iOS.
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          placeholder="Add a comment"
          placeholderTextColor={colors.subtext as string}
          accessibilityLabel="Comment, optional"
          style={[styles.input, body, { borderColor: colors.border, backgroundColor: colors.card }]}
        />

        {reason !== 'self_harm' ? (
          <Pressable
            onPress={() => setAlsoBlock((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alsoBlock }}
            accessibilityLabel="Also block them. They won't be told."
            style={styles.option}
          >
            <MaterialIcons
              name={alsoBlock ? 'check-box' : 'check-box-outline-blank'}
              size={fs(22)}
              color={alsoBlock ? actionTint : colors.icon}
            />
            <View style={styles.flex}>
              <Text style={body}>Also block them</Text>
              <Text style={sub}>They won&apos;t be told, and they can&apos;t message or find you.</Text>
            </View>
          </Pressable>
        ) : null}
      </ScrollView>

      {error ? (
        <Text
          style={{ color: tokens.error, fontSize: fs(13), paddingHorizontal: Spacing.md }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
      <View style={[styles.actions, { borderColor: colors.border }]}>
        <Pressable
          onPress={onClose}
          disabled={report.isPending}
          accessibilityRole="button"
          accessibilityLabel="Cancel report"
          style={[styles.btn, styles.flex, { borderWidth: 1, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.text, fontSize: fs(16) }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={report.isPending}
          accessibilityRole="button"
          accessibilityState={{ busy: report.isPending }}
          accessibilityLabel="Send report"
          style={[styles.btn, styles.flex, { backgroundColor: actionTint, opacity: report.isPending ? 0.6 : 1 }]}
        >
          <Text style={{ color: '#fff', fontSize: fs(16), fontWeight: fw(700) as never }}>
            {report.isPending ? 'Sending…' : 'Send report'}
          </Text>
        </Pressable>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { padding: Spacing.md, gap: Spacing.sm },
  quote: { borderWidth: 1, borderRadius: Radii.md, padding: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTargets.minimum,
    paddingVertical: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.sm,
    minHeight: 80,
    maxHeight: 160,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    borderTopWidth: 1,
    padding: Spacing.md,
  },
  btn: {
    minHeight: TouchTargets.minimum,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
