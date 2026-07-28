/**
 * MedicationsReviewPrompt — soft, recurring "review your medications" nudge
 * (COS-357 follow-up / SCRUM-504).
 *
 * Renders a small, accessible, themed card at the top of the Plan tab when the
 * backend reports `medsReviewNeeded === true` (server review flag on AND the
 * patient hasn't confirmed). It is deliberately *persistent, not one-time*:
 *
 *   - "Review now"  → reveals/scrolls to the MedicationsSection via onReviewNow.
 *   - "Not now"     → stores a LOCAL snooze (AsyncStorage key
 *                     `meds_review_snoozed_until` = now + 3h). While snoozed the
 *                     card hides; it RE-APPEARS once the snooze expires.
 *   - "Confirm my medications" → PUT { confirmReview: true }; on success the
 *                     server flips medsReviewNeeded to false and the prompt
 *                     stops permanently.
 *
 * Recurrence: the snooze is re-evaluated against Date.now() on every screen
 * focus and on every app foreground (AppState 'active'), so an active user sees
 * the nudge again after the 3h window — multiple times a day until they finish.
 *
 * Back-compat / safety:
 *   - Flag-gated: renders null unless `flagEnabled === true` (mirrors
 *     MedicationsSection). Off / loading / error → renders nothing, no layout
 *     shift, no crash.
 *   - When medsReviewNeeded becomes false, the local snooze key is cleared so a
 *     future review cycle starts clean.
 *   - No PHI is logged anywhere in this component.
 */

import React from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { usePlanMedications, useUpdatePlanMedications } from '@/hooks/use-plan-medications';
import { MedicationsReviewModal } from './MedicationsReviewModal';

/** Local snooze key (device-local; never holds PHI — just a timestamp). */
export const MEDS_REVIEW_SNOOZE_KEY = 'meds_review_snoozed_until';
/**
 * COS-364: flag that the first-visit review MODAL has already been shown for
 * the CURRENT review cycle (device-local, no PHI). Set when the modal appears;
 * cleared when the patient confirms (reviewNeeded → false) so the next cycle
 * shows the modal again. The banner remains the recurring nudge in between.
 */
export const MEDS_REVIEW_MODAL_SHOWN_KEY = 'meds_review_modal_shown';
/** How long "Not now" hides the prompt for. */
const SNOOZE_MS = 3 * 60 * 60 * 1000; // 3 hours

export function MedicationsReviewPrompt({
  onReviewNow,
}: {
  /** Reveal/scroll to the MedicationsSection (and optionally open its flow). */
  onReviewNow: () => void;
}): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const query = usePlanMedications();
  const updateMutation = useUpdatePlanMedications();

  const flagEnabled = query.data?.flagEnabled === true;
  const reviewNeeded = query.data?.medsReviewNeeded === true;

  // null = not yet read; number = ms epoch the snooze expires at; 0 = no snooze.
  const [snoozeUntil, setSnoozeUntil] = React.useState<number | null>(null);

  // COS-364: first-visit review modal. Shown once per review cycle (guarded by
  // MEDS_REVIEW_MODAL_SHOWN_KEY across sessions + a ref within this mount).
  const [modalVisible, setModalVisible] = React.useState(false);
  const modalEvalRef = React.useRef(false);

  /** Read the stored snooze and decide if it's still active right now. */
  const refreshSnooze = React.useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MEDS_REVIEW_SNOOZE_KEY);
      const until = raw ? Number(raw) : 0;
      setSnoozeUntil(Number.isFinite(until) ? until : 0);
    } catch {
      // If storage is unavailable, fail open (show the prompt) rather than crash.
      setSnoozeUntil(0);
    }
  }, []);

  // Re-evaluate the snooze on every screen focus.
  useFocusEffect(
    React.useCallback(() => {
      void refreshSnooze();
    }, [refreshSnooze]),
  );

  // Re-evaluate on every app foreground (AppState -> 'active'), so an active
  // user re-sees the nudge once the 3h window lapses without re-navigating.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshSnooze();
    });
    return () => sub.remove();
  }, [refreshSnooze]);

  // COS-364: show the first-visit modal ONCE per review cycle — when the
  // feature is on, a review is needed, and we're NOT currently snoozed. The
  // AsyncStorage flag makes it once-per-cycle across sessions; modalEvalRef
  // guards against a double-show race within this mount. When snoozed, the
  // modal stays closed and the banner is the (also-hidden-while-snoozed) nudge.
  React.useEffect(() => {
    if (!flagEnabled || !reviewNeeded) return;
    if (snoozeUntil === null || snoozeUntil > Date.now()) return;
    if (modalEvalRef.current) return;
    modalEvalRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const shown = await AsyncStorage.getItem(MEDS_REVIEW_MODAL_SHOWN_KEY);
        if (shown) return; // already shown this cycle
        await AsyncStorage.setItem(MEDS_REVIEW_MODAL_SHOWN_KEY, '1');
        if (!cancelled) setModalVisible(true);
      } catch {
        /* storage unavailable → just skip the modal (banner still nudges) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flagEnabled, reviewNeeded, snoozeUntil]);

  // Once the patient has confirmed (reviewNeeded false), clear the local snooze
  // AND the modal-shown flag so the next review cycle starts fresh (modal shows
  // again). Only act once the query has data and the flag is on, to avoid
  // clobbering during load/back-compat.
  React.useEffect(() => {
    if (flagEnabled && query.data && !reviewNeeded) {
      AsyncStorage.removeItem(MEDS_REVIEW_SNOOZE_KEY).catch(() => {
        /* non-fatal */
      });
      AsyncStorage.removeItem(MEDS_REVIEW_MODAL_SHOWN_KEY).catch(() => {
        /* non-fatal */
      });
      modalEvalRef.current = false;
    }
  }, [flagEnabled, reviewNeeded, query.data]);

  // Gate: nothing to show unless the feature is on AND a review is needed.
  if (!flagEnabled || !reviewNeeded) {
    return null;
  }
  // Wait until we've read the snooze once (avoids a flicker on mount).
  if (snoozeUntil === null) {
    return null;
  }
  // Currently snoozed → hidden until the window expires.
  if (snoozeUntil > Date.now()) {
    return null;
  }

  const onNotNow = () => {
    const until = Date.now() + SNOOZE_MS;
    setSnoozeUntil(until); // hide immediately
    AsyncStorage.setItem(MEDS_REVIEW_SNOOZE_KEY, String(until)).catch(() => {
      /* non-fatal — worst case the prompt reappears on next focus */
    });
  };

  const onConfirm = () => {
    updateMutation.mutate({ confirmReview: true });
  };

  // COS-364 modal actions (mirror the banner buttons).
  const onModalConfirm = () => {
    updateMutation.mutate({ confirmReview: true }, { onSuccess: () => setModalVisible(false) });
  };
  const onModalReviewEdit = () => {
    setModalVisible(false);
    onReviewNow();
  };
  const onModalNotNow = () => {
    setModalVisible(false);
    onNotNow();
  };

  return (
    <>
      <MedicationsReviewModal
        visible={modalVisible}
        medications={query.data?.medications ?? []}
        isConfirming={updateMutation.isPending}
        onConfirm={onModalConfirm}
        onReviewEdit={onModalReviewEdit}
        onNotNow={onModalNotNow}
      />
    <View
      style={[
        styles.card,
        { backgroundColor: (colors.tint as string) + '14', borderColor: colors.tint as string },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="Review your medications"
    >
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { backgroundColor: (colors.tint as string) + '26' }]}>
          <MaterialIcons name="medication" size={getScaledFontSize(20)} color={colors.tint as string} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(15),
              fontWeight: getScaledFontWeight(700) as any,
            }}
          >
            Review your medications
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              marginTop: 2,
              lineHeight: getScaledFontSize(17),
            }}
          >
            Take a moment to confirm the medications you&apos;re taking and how many you have left.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onReviewNow}
          accessibilityRole="button"
          accessibilityLabel="Review your medications now"
          style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.tint as string }]}
        >
          <Text
            style={{ color: '#fff', fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }}
          >
            Review now
          </Text>
        </Pressable>

        <Pressable
          onPress={onConfirm}
          disabled={updateMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Confirm my medications"
          style={[styles.btn, { borderColor: colors.tint as string, borderWidth: 1, opacity: updateMutation.isPending ? 0.6 : 1 }]}
        >
          <Text
            style={{ color: colors.tint as string, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any }}
          >
            Confirm my medications
          </Text>
        </Pressable>

        <Pressable
          onPress={onNotNow}
          accessibilityRole="button"
          accessibilityLabel="Not now — remind me later"
          hitSlop={6}
          style={[styles.btn, styles.btnGhost]}
        >
          <Text
            style={{ color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }}
          >
            Not now
          </Text>
        </Pressable>
      </View>

      {updateMutation.isError ? (
        <Text style={{ color: '#B91C1C', fontSize: getScaledFontSize(12), marginTop: 8 }}>
          Couldn&apos;t save that. Please try again.
        </Text>
      ) : null}
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { borderColor: 'transparent' },
  btnGhost: { paddingHorizontal: 10 },
});
