/**
 * MedicationsReviewModal — first-visit "here are your medications, confirm
 * them" modal (COS-364 / SCRUM-507, follow-up to the COS-357 review prompt).
 *
 * WHY: the recurring review nudge previously surfaced ONLY as an inline banner
 * (MedicationsReviewPrompt). Patients expected to actually SEE their current
 * medication list when first asked to review it. This modal shows that list
 * up front, once per review cycle, with the same three actions as the banner:
 *
 *   - "These look right"  → PUT { confirmReview: true } (onConfirm)
 *   - "Review & edit"     → close + scroll to the MedicationsSection (onReviewEdit)
 *   - "Not now"           → local 3h snooze, same key as the banner (onNotNow)
 *
 * The banner remains the gentle RECURRING nudge after this modal is dismissed;
 * MedicationsReviewPrompt owns when this modal appears (once per cycle) so the
 * two never fight. This component is purely presentational — it holds no
 * review/snooze state and makes no network calls itself; the parent passes the
 * list + handlers.
 *
 * Back-compat / safety: rendered only when the parent decides (flag on +
 * review needed + not snoozed + not yet shown this cycle). No PHI is logged.
 * "Tracking only — this never changes a prescription" disclaimer is shown, per
 * the medication-management product rule.
 */

import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { Medication } from '@/services/api/plan-medications';

/** One-line supply hint for a med row (no PHI beyond what's already on screen). */
function supplyHint(med: Medication): string | null {
  const s = med.supply;
  if (!s) return null;
  if (s.needsRefill) return 'Refill soon';
  if (typeof s.remainingQuantity === 'number') {
    return `${s.remainingQuantity} left`;
  }
  return null;
}

/** Secondary line: dose + frequency, whichever are present. */
function detailLine(med: Medication): string {
  return [med.dose, med.frequency].filter(Boolean).join(' · ');
}

export function MedicationsReviewModal({
  visible,
  medications,
  isConfirming,
  onConfirm,
  onReviewEdit,
  onNotNow,
}: {
  visible: boolean;
  medications: Medication[];
  isConfirming: boolean;
  /** Mark the review complete (PUT confirmReview:true). */
  onConfirm: () => void;
  /** Close + reveal/scroll to the editable MedicationsSection. */
  onReviewEdit: () => void;
  /** Snooze the nudge (shared with the banner) + close. */
  onNotNow: () => void;
}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const tint = colors.tint as string;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android hardware back = "Not now" (snooze), never a silent dismiss that
      // would leave the cycle in a half-state.
      onRequestClose={onNotNow}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.card, { backgroundColor: colors.background as string }]}
          accessibilityViewIsModal
          accessibilityLabel="Review your medications"
        >
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: tint + '26' }]}>
              <MaterialIcons name="medication" size={getScaledFontSize(22)} color={tint} />
            </View>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(700) as any,
                flex: 1,
              }}
            >
              Review your medications
            </Text>
          </View>

          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              lineHeight: getScaledFontSize(18),
              marginTop: 8,
            }}
          >
            Confirm the medications you&apos;re currently taking and how many you have left. This is
            for tracking only — it never changes a prescription.
          </Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={{ paddingVertical: 4 }}
            showsVerticalScrollIndicator
          >
            {medications.length === 0 ? (
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(14),
                  paddingVertical: 16,
                  textAlign: 'center',
                }}
              >
                We don&apos;t have any medications on file yet. Tap “Review &amp; edit” to add the
                ones you take.
              </Text>
            ) : (
              medications.map((med) => {
                const detail = detailLine(med);
                const hint = supplyHint(med);
                return (
                  <View key={med.id} style={[styles.row, { borderBottomColor: (colors.subtext as string) + '22' }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}
                        numberOfLines={2}
                      >
                        {med.name}
                      </Text>
                      {detail ? (
                        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }} numberOfLines={2}>
                          {detail}
                        </Text>
                      ) : null}
                    </View>
                    {hint ? (
                      <View
                        style={[
                          styles.hintChip,
                          { backgroundColor: (med.supply?.needsRefill ? '#B91C1C' : tint) + '1A' },
                        ]}
                      >
                        <Text
                          style={{
                            color: med.supply?.needsRefill ? '#B91C1C' : tint,
                            fontSize: getScaledFontSize(11),
                            fontWeight: getScaledFontWeight(700) as any,
                          }}
                        >
                          {hint}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={onConfirm}
              disabled={isConfirming}
              accessibilityRole="button"
              accessibilityLabel="These look right — confirm my medications"
              style={[styles.btn, styles.btnPrimary, { backgroundColor: tint, opacity: isConfirming ? 0.6 : 1 }]}
            >
              {isConfirming ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                  These look right
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={onReviewEdit}
              accessibilityRole="button"
              accessibilityLabel="Review and edit my medications"
              style={[styles.btn, { borderColor: tint, borderWidth: 1 }]}
            >
              <Text style={{ color: tint, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                Review &amp; edit
              </Text>
            </Pressable>

            <Pressable
              onPress={onNotNow}
              accessibilityRole="button"
              accessibilityLabel="Not now — remind me later"
              hitSlop={6}
              style={[styles.btn, styles.btnGhost]}
            >
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }}>
                Not now
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  list: { marginTop: 12, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  hintChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  actions: { marginTop: 16, gap: 8 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { borderColor: 'transparent' },
  btnGhost: { paddingVertical: 8 },
});
