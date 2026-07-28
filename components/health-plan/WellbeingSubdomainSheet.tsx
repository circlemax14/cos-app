/**
 * WellbeingSubdomainSheet (COS-446, SCRUM-582).
 *
 * Bottom sheet that opens when the user taps a subdomain chip or a Venn
 * dot on the wellbeing map. Shows what the subdomain means, why it
 * matters, current goals targeting it, example goals, and 4 action
 * buttons (Add a goal / Learn more / Ask care circle / AI suggest).
 *
 * v1 wiring:
 *   - Add a goal → parent's onAddGoal callback (navigates to
 *     /Home/biopsychosocial-plan; deep-link with subdomain pre-select
 *     deferred to a follow-up).
 *   - Learn more → in-place expand of the sheet to reveal whyItMatters
 *     + exampleGoals (no navigation).
 *   - Ask care circle → parent's onAskCareCircle callback (placeholder
 *     toast for v1; real care-circle-chat prefilled draft deferred).
 *   - AI suggest → parent's onAiSuggest callback (placeholder toast for
 *     v1; real regenerate-focused-on-subdomain deferred to Track 2).
 *
 * OTA-safe (no native fingerprint change). Uses standard RN Modal —
 * safe outside the biopsychosocial-plan accordion tree that triggered
 * iOS 26.5 crashes (COS-433/435 was a specific in-plan-modal issue,
 * not Modal-in-general).
 */
import React from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { Colors } from '@/constants/theme'
import { getSubdomainContent } from '@/lib/bps-subdomain-content'
import type { BpsDomain, BpsSubdomain } from '@/lib/bps-subdomains'
import type { PlanCoverageFillLevel } from '@/services/api/biopsychosocial-plan'

const DOMAIN_COLOR: Record<BpsDomain, string> = {
  biological: '#199C4F',
  psychological: '#7B3FE4',
  social: '#C97600',
}
const DOMAIN_BG: Record<BpsDomain, string> = {
  biological: 'rgba(25,156,79,0.10)',
  psychological: 'rgba(123,63,228,0.10)',
  social: 'rgba(201,118,0,0.10)',
}
const DOMAIN_LABEL: Record<BpsDomain, string> = {
  biological: 'Biological',
  psychological: 'Psychological',
  social: 'Social & Faith',
}
const OVERLAP_LABEL: Record<string, string> = {
  bio_psy: 'This area sits at the overlap of Biological and Psychological — goals here help both.',
  bio_soc: 'This area sits at the overlap of Biological and Social & Spiritual — goals here help both.',
  psy_soc: 'This area sits at the overlap of Psychological and Social & Spiritual — goals here help both.',
}

export interface WellbeingSubdomainSheetProps {
  visible: boolean
  subdomain: BpsSubdomain | null
  currentGoalCount: number
  currentGoalTitles: string[]
  /**
   * Wave 2 — number of unique non-expired instruments the user has
   * completed touching this subdomain. Powers the second pill and the
   * "Take a check-in" CTA gating. Default 0 keeps pre-wave-2 callers
   * working: no pill rendered, and CTA falls back to the pre-wave-2
   * behavior (no CTA on covered subdomains, since fillLevel defaults
   * to a derivation of currentGoalCount).
   */
  assessmentCount?: number
  /**
   * Wave 2 — tri-state coverage level. When absent, derived from
   * `currentGoalCount > 0 ? 'full' : 'none'` so the component stays
   * backward-compatible with pre-wave-2 callers.
   */
  fillLevel?: PlanCoverageFillLevel
  colors: typeof Colors['light']
  isDark: boolean
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string | number
  onClose: () => void
  onAddGoal: (subdomain: BpsSubdomain) => void
  onAiSuggest: (subdomain: BpsSubdomain) => void
  /**
   * Wave 2 — new callback for the "Take a check-in" CTA rendered when
   * `fillLevel !== 'full'`. Optional so pre-wave-2 callers keep
   * working (CTA hidden when absent).
   */
  onTakeAssessment?: (subdomain: BpsSubdomain) => void
}

export function WellbeingSubdomainSheet(props: WellbeingSubdomainSheetProps): React.JSX.Element | null {
  const {
    visible,
    subdomain,
    currentGoalCount,
    currentGoalTitles,
    assessmentCount = 0,
    fillLevel,
    colors,
    isDark,
    getScaledFontSize,
    getScaledFontWeight,
    onClose,
    onAddGoal,
    onAiSuggest,
    onTakeAssessment,
  } = props

  const [expanded, setExpanded] = React.useState(false)

  // Reset the expanded state whenever a new subdomain is opened.
  React.useEffect(() => {
    if (visible) setExpanded(false)
  }, [visible, subdomain?.key])

  if (!subdomain) return null

  const content = getSubdomainContent(subdomain.key, subdomain.label)
  const color = DOMAIN_COLOR[subdomain.domain]
  const bg = DOMAIN_BG[subdomain.domain]
  const domainName = DOMAIN_LABEL[subdomain.domain]
  const overlapNote = subdomain.overlap ? OVERLAP_LABEL[subdomain.overlap] : null
  // Wave 2 — derive tri-state fill; when the parent didn't pass fillLevel,
  // fall back to the pre-wave-2 boolean derivation.
  const effectiveFill: PlanCoverageFillLevel =
    fillLevel ?? (currentGoalCount > 0 ? 'full' : 'none')
  const covered = effectiveFill === 'full'
  const halfCovered = effectiveFill === 'half'

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card ?? colors.background }]}>
          {/* Header — domain badge + title + close */}
          <View style={styles.header}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  backgroundColor: bg,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                }}
              >
                <Text style={{ color, fontSize: getScaledFontSize(10), fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  {subdomain.overlap ? 'OVERLAP' : domainName}
                </Text>
              </View>
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(17),
                  fontWeight: getScaledFontWeight(700) as any,
                  flex: 1,
                }}
                numberOfLines={2}
              >
                {subdomain.label}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={24} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          {/* Coverage state pills — Wave 2 renders up to two side-by-side:
              (a) goals pill (always) and (b) assessments pill (only when
              assessmentCount > 0). Neutral tokens on the second pill so it
              reads as informational, not as a competing coverage signal. */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: color,
                backgroundColor: covered ? bg : 'transparent',
                borderStyle: covered ? 'solid' : 'dashed',
              }}
            >
              <Text
                style={{
                  color: covered ? color : (isDark ? '#8E8E93' : '#8E8E93'),
                  fontSize: getScaledFontSize(11),
                  fontWeight: covered ? '700' : '500',
                  fontStyle: covered ? 'normal' : 'italic',
                  flexShrink: 1,
                }}
              >
                {covered
                  ? `Covered · ${currentGoalCount} goal${currentGoalCount === 1 ? '' : 's'}`
                  : halfCovered
                    ? 'No goals yet — add one to fully cover'
                    : 'No goals yet — this is a gap'}
              </Text>
            </View>

            {assessmentCount > 0 ? (
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                }}
              >
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(11),
                    fontWeight: '600',
                    flexShrink: 1,
                  }}
                >
                  {`${assessmentCount} check-in${assessmentCount === 1 ? '' : 's'} completed`}
                </Text>
              </View>
            ) : null}
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: 12 }}>
            {/* What this means */}
            <Text
              style={[styles.sectionLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}
            >
              WHAT THIS MEANS
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(14),
                lineHeight: 20,
                paddingHorizontal: 16,
                paddingBottom: 8,
              }}
            >
              {content.description}
            </Text>

            {overlapNote ? (
              <View style={{ marginHorizontal: 16, marginBottom: 8, padding: 10, backgroundColor: bg, borderRadius: 10 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(12),
                    lineHeight: 17,
                    fontStyle: 'italic',
                  }}
                >
                  {overlapNote}
                </Text>
              </View>
            ) : null}

            {/* Current goals (if any) */}
            {covered ? (
              <>
                <Text
                  style={[styles.sectionLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}
                >
                  YOUR GOALS FOR THIS
                </Text>
                <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                  {currentGoalTitles.slice(0, 5).map((title, i) => (
                    <View
                      key={`${title}-${i}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <Text style={{ color, fontSize: getScaledFontSize(14), lineHeight: 20 }}>•</Text>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: getScaledFontSize(13),
                          lineHeight: 20,
                          flex: 1,
                        }}
                      >
                        {title}
                      </Text>
                    </View>
                  ))}
                  {currentGoalTitles.length > 5 ? (
                    <Text
                      style={{
                        color: colors.subtext,
                        fontSize: getScaledFontSize(12),
                        marginTop: 2,
                        fontStyle: 'italic',
                      }}
                    >
                      + {currentGoalTitles.length - 5} more
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}

            {/* Expanded section: Why it matters + example goals */}
            {expanded ? (
              <>
                <Text
                  style={[styles.sectionLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}
                >
                  WHY IT MATTERS
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(13),
                    lineHeight: 19,
                    paddingHorizontal: 16,
                    paddingBottom: 8,
                  }}
                >
                  {content.whyItMatters}
                </Text>

                <Text
                  style={[styles.sectionLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}
                >
                  EXAMPLE GOALS
                </Text>
                <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                  {content.exampleGoals.map((eg, i) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <Text style={{ color, fontSize: getScaledFontSize(14), lineHeight: 20 }}>›</Text>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: getScaledFontSize(13),
                          lineHeight: 20,
                          flex: 1,
                        }}
                      >
                        {eg}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {/* Wave 2 — Take-a-check-in CTA is rendered above the Add-a-goal
                primary whenever the subdomain isn't already fully covered
                (gap OR half-covered). Styled as a secondary/outline button
                so Add-a-goal remains the primary action. */}
            {onTakeAssessment && effectiveFill !== 'full' ? (
              <TouchableOpacity
                onPress={() => onTakeAssessment(subdomain)}
                style={[
                  styles.actionPrimary,
                  { backgroundColor: 'transparent', borderWidth: 1, borderColor: color },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  halfCovered
                    ? `Take another check-in on ${subdomain.label}`
                    : `Take a check-in on ${subdomain.label}`
                }
              >
                <MaterialIcons name="assignment" size={18} color={color} />
                <Text
                  style={{
                    color,
                    fontSize: getScaledFontSize(14),
                    fontWeight: '700',
                  }}
                >
                  {halfCovered
                    ? 'Take another check-in'
                    : `Take a check-in about ${subdomain.label}`}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={() => onAddGoal(subdomain)}
              style={[styles.actionPrimary, { backgroundColor: color }]}
              accessibilityRole="button"
            >
              <MaterialIcons name="add" size={18} color="#FFFFFF" />
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: getScaledFontSize(14),
                  fontWeight: '700',
                }}
              >
                Add a goal for {subdomain.label}
              </Text>
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              <TouchableOpacity
                onPress={() => setExpanded((e) => !e)}
                style={[styles.actionSecondary, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Learn more"
              >
                <MaterialIcons name={expanded ? 'expand-less' : 'info-outline'} size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(12), fontWeight: '600' }}>
                  {expanded ? 'Show less' : 'Learn more'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onAiSuggest(subdomain)}
                style={[styles.actionSecondary, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="AI suggest a goal"
              >
                <MaterialIcons name="auto-awesome" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(12), fontWeight: '600' }}>
                  AI suggest
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  sectionLabel: {
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  scrollArea: {
    flexGrow: 0,
  },
  actions: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    padding: 12,
    gap: 8,
  },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
})
