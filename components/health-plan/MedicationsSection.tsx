/**
 * MedicationsSection — Health-Plan Medication Management (COS-357 / SCRUM-504).
 *
 * Renders inside app/Home/health-plan.tsx for Basic AND Advanced plans, but
 * ONLY when the GET response `flagEnabled === true`. When the flag is off (or
 * the endpoint errors), this component renders `null` — no layout shift, the
 * health-plan screen looks exactly as it did before (back-compat rule).
 *
 * Features:
 *   - List effective meds with a source badge (EHR vs patient-reported)
 *   - Remove (hide) an EHR med / un-remove; add a new med; edit dose+times
 *   - Per-med adherence tracking toggle
 *   - Supply + refill: enter remaining quantity + doses/day; refill banner
 *     when needsRefill; "I refilled / update quantity" + snooze actions
 *   - Always-visible safety disclaimer: tracking only, not a prescription
 *     change, does not notify the provider.
 *
 * No PHI is logged anywhere in this component.
 */

import React from 'react';
import {
  AccessibilityInfo,
  Alert,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { usePlanMedications, useUpdatePlanMedications } from '@/hooks/use-plan-medications';
import type { Medication, MedicationCadence, MedicationForm } from '@/services/api/plan-medications';
import {
  CADENCE_OPTIONS,
  MED_FORMS_ENABLED,
  cadenceLabel,
  formTagLabel,
  normalizeCadence,
  normalizeForm,
  supplyUnitLabel,
} from '@/lib/med-forms';

const SAFETY_DISCLAIMER =
  'This updates your tracking only — it does not change your prescription or ' +
  'notify your provider. Talk to your provider before changing how you take a ' +
  'medication.';

/** YYYY-MM-DD for the snooze "until" field (default: 7 days out). */
function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from now until the given ISO date (clamped at >= 0). */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

/** Parse a comma/space-separated list of "HH:MM" times into a clean array. */
function parseTimes(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

type EditorMode =
  | { kind: 'add' }
  | { kind: 'edit'; med: Medication };

type SupplyMode = { med: Medication };

export interface MedicationsSectionProps {
  /**
   * Forwarded to the section's outer View so a parent screen can measure it and
   * scroll to it (used by the "Review your medications" prompt — COS-357).
   */
  onLayout?: (e: LayoutChangeEvent) => void;
  /**
   * Monotonic counter: whenever it increments, the section opens its add-med
   * flow. Lets the review prompt's "Review now" jump straight into adding/
   * confirming a med. Initial value (0) does nothing.
   */
  openAddSignal?: number;
}

export function MedicationsSection({
  onLayout,
  openAddSignal = 0,
}: MedicationsSectionProps = {}): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const query = usePlanMedications();
  const updateMutation = useUpdatePlanMedications();

  const [editor, setEditor] = React.useState<EditorMode | null>(null);
  const [supplyEditor, setSupplyEditor] = React.useState<SupplyMode | null>(null);

  // CHUNK 52.2 — session-local "recently hidden" restore banner.
  //
  // Background: the Medication type has no `removed` field, and the server
  // drops hidden meds from the response entirely on refetch. So a hidden med
  // never re-mounts as a MedicationCard — the per-card Restore Pressable that
  // used to live inside MedicationCard was unreachable in the typical flow.
  // Chunk 52.1's "removed the source==='ehr' gate" was a no-op for this
  // reason; Ken flagged that the restore path was un-findable during
  // dogfood. Chunk 52.2 deleted that unreachable Pressable entirely (see
  // the comment inside MedicationCard where it used to live) and replaced
  // the whole affordance with this session-local banner.
  //
  // Fix without a backend change: keep a session-local list of what the user
  // hid in this session and render a banner at the top of the section with a
  // Restore link. On tap, fire unremove + drop from the local list. Server
  // accepts the id regardless of source. If the mutation errors, keep the
  // entry so the user can retry.
  //
  // Persistence: session-only — clears on cold app relaunch. That's
  // acceptable given the alternative is nothing. A real backend `removed`
  // flag + a per-user "hidden meds" section is the durable fix (queued as
  // BE follow-up; do NOT ship pre-BE OTA to legacy without this banner or
  // patient-reported meds lose their only restore path).
  const [recentlyHidden, setRecentlyHidden] = React.useState<
    Array<{ id: string; name: string }>
  >([]);

  // CHUNK 52.1 (Concern 5): announce save failures to VoiceOver / TalkBack so
  // users of assistive tech notice the inline error View. Uses a rising-edge
  // detector on `updateMutation.isError` (false → true transition) — announces
  // once per new failure event without depending on error-instance identity
  // (a cached sentinel Error would defeat identity dedup) or on the mutation's
  // `failureCount` (react-query v5 resets that to 0 on every mutate() so a
  // strict-greater guard would suppress the 2nd + subsequent identical
  // failures). Between failures the query lib flips isError back to false
  // during pending, so wasError re-arms cleanly for the next fail.
  const wasError = React.useRef(false);
  React.useEffect(() => {
    const isErr = updateMutation.isError;
    if (isErr && !wasError.current) {
      AccessibilityInfo.announceForAccessibility(
        "Couldn't save that change. Please try again.",
      );
    }
    wasError.current = isErr;
  }, [updateMutation.isError]);

  // CHUNK 52.1 (Concern 7 + adversarial-verify majors #4 + nit #3): track how
  // many destructive Hide confirm Alerts are currently visible so the
  // openAddSignal effect below can skip mounting the editor Modal on top of a
  // live Alert (Alert-over-Modal is the iOS 26.5 forbidden pairing). A COUNTER
  // (not a boolean) so nested / rapid multi-tap stacking on Android — where
  // Alert.alert doesn't dedupe — doesn't accidentally flip the guard to false
  // while an underlying Alert is still visible. Increment on Alert.alert start,
  // decrement (floor 0) on each branch resolution + iOS/Android backdrop
  // dismiss. Ref, not state — no re-render needed to gate the effect.
  const confirmAlertInFlight = React.useRef(0);
  const beginConfirmAlert = React.useCallback(() => {
    confirmAlertInFlight.current += 1;
  }, []);
  const endConfirmAlert = React.useCallback(() => {
    if (confirmAlertInFlight.current > 0) {
      confirmAlertInFlight.current -= 1;
    }
  }, []);

  // Open the add flow when the parent bumps openAddSignal (skip the initial 0).
  // CHUNK 52.1 (Concern 7 + adversarial-verify majors #2 + #4): guard against
  // stacking a 2nd RN Modal on top of an in-flight one. Firing setEditor while
  // supplyEditor is open would mount MedicationEditorModal on top of the
  // open SupplyEditorModal → two <Modal transparent> visible simultaneously,
  // which is the iOS 26.5 multi-Modal crash class. Same defense against the
  // Alert-over-Modal pairing: if a Hide confirm Alert is in flight, defer.
  // Skip (don't queue): the parent's signal is a nudge, not an authoritative
  // command; user can always tap "+ Add" manually. Idempotent-open case
  // (editor already {kind:'add'}) also skips — nothing to do.
  const lastOpenSignal = React.useRef(0);
  React.useEffect(() => {
    if (openAddSignal > 0 && openAddSignal !== lastOpenSignal.current) {
      lastOpenSignal.current = openAddSignal;
      if (supplyEditor === null && editor === null && confirmAlertInFlight.current === 0) {
        setEditor({ kind: 'add' });
      }
    }
  }, [openAddSignal, supplyEditor, editor]);

  // Flag gate — render NOTHING until the server explicitly enables the
  // feature. Off-by-default for back-compat and while the query is loading.
  if (!query.data?.flagEnabled) {
    return null;
  }

  const medications = query.data.medications;

  const onRemove = (med: Medication) => {
    // CHUNK 52.2 fix (adversarial verify major #2): only push to
    // recentlyHidden AFTER the remove mutation succeeds. If we push
    // synchronously and the mutation errors, the banner asserts the med is
    // hidden while its card is still in the list — user sees the same med
    // as both a live card and a "recently hidden" entry, with no way to
    // reconcile without unremove-ing something the server never removed.
    // De-dupe on id so a same-med re-hide after a rollback doesn't push a
    // second banner entry.
    updateMutation.mutate(
      { remove: [med.id] },
      {
        onSuccess: () => {
          setRecentlyHidden((prev) =>
            prev.some((e) => e.id === med.id)
              ? prev
              : [...prev, { id: med.id, name: med.name }],
          );
        },
      },
    );
  };
  // CHUNK 52.2 fix (adversarial verify major #1): drop the banner entry
  // ONLY on unremove success. On error we keep the entry so the user can
  // retry — otherwise a network blip during Restore leaves the med
  // server-hidden with no in-UI recovery path (per-card Restore is
  // unreachable since the server drops hidden meds from the response, see
  // recentlyHidden useState comment). react-query v5 accepts per-invocation
  // mutation options via the second arg to mutate().
  const restoreFromBanner = (id: string) => {
    updateMutation.mutate(
      { unremove: [id] },
      {
        onSuccess: () => {
          setRecentlyHidden((prev) => prev.filter((e) => e.id !== id));
        },
      },
    );
  };
  const onToggleTracked = (med: Medication) => {
    updateMutation.mutate({ setTracked: [{ id: med.id, tracked: !med.tracked }] });
  };
  const onSnooze = (med: Medication) => {
    updateMutation.mutate({ snoozeRefill: [{ id: med.id, until: isoDatePlusDays(7) }] });
  };

  return (
    <View onLayout={onLayout}>
      {/* Section header */}
      <View style={styles.secHead}>
        <Text
          style={[
            styles.secLabel,
            { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(700) as any },
          ]}
        >
          MEDICATIONS
        </Text>
        <Pressable
          onPress={() => {
            // CHUNK 52.3 (adversarial verify minor): guard against opening
            // MedicationEditorModal on top of a live Hide confirm Alert
            // (Alert-over-Modal is the iOS 26 forbidden pairing). Matches
            // the openAddSignal effect's guard. Also skips if the
            // MedicationEditor or SupplyEditor is already open (rapid
            // multi-tap safety).
            if (confirmAlertInFlight.current > 0) return;
            if (editor !== null || supplyEditor !== null) return;
            setEditor({ kind: 'add' });
          }}
          accessibilityRole="button"
          accessibilityLabel="Add a medication"
          style={[styles.addBtn, { backgroundColor: (colors.tint as string) + '18' }]}
        >
          <MaterialIcons name="add" size={getScaledFontSize(16)} color={colors.tint as string} />
          <Text
            style={{
              color: colors.tint as string,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(700) as any,
              marginLeft: 4,
            }}
          >
            Add
          </Text>
        </Pressable>
      </View>

      {/* Always-visible safety disclaimer */}
      <View
        style={[styles.disclaimer, { backgroundColor: (colors.subtext as string) + '12', borderColor: colors.border }]}
        accessibilityRole="alert"
        accessibilityLabel={SAFETY_DISCLAIMER}
      >
        <MaterialIcons name="info-outline" size={getScaledFontSize(16)} color={colors.subtext} />
        <Text
          style={{
            flex: 1,
            marginLeft: 8,
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            lineHeight: getScaledFontSize(18),
          }}
        >
          {SAFETY_DISCLAIMER}
        </Text>
      </View>

      {/* Inline error (mutation failures) — non-blocking.
          CHUNK 52.1 (Concern 5): mark as alert + live region so screen readers
          pick up the failure. iOS honors accessibilityRole="alert"; Android
          honors accessibilityLiveRegion="polite". The useEffect above also
          fires AccessibilityInfo.announceForAccessibility as a belt-and-
          suspenders announcement, gated by a wasError rising-edge ref (see
          the effect's comment for why we don't key on failureCount or error
          identity). */}
      {updateMutation.isError ? (
        <View
          style={[styles.errorBox, { borderColor: '#DC2626', backgroundColor: '#FEE2E2' }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <MaterialIcons name="error-outline" size={getScaledFontSize(16)} color="#991B1B" />
          <Text style={{ color: '#991B1B', flex: 1, fontSize: getScaledFontSize(12), marginLeft: 6 }}>
            Couldn&apos;t save that change. Please try again.
          </Text>
        </View>
      ) : null}

      {/* CHUNK 52.2 + 52.3 (Ken 2026-07-22 dogfood): session-local
          recently-hidden banner. One row per med the user hid in this
          session, with a prominent Restore pill. See recentlyHidden
          useState comment for why this exists (the server drops hidden
          meds so a per-card Restore affordance is unreachable). Ken
          couldn't find the previous banner (subtle grey card blended
          with sibling meds); redesigned with warm amber background, a
          "Recently hidden" header row, and a real teal-pill Restore
          button so the affordance reads as "action available here". */}
      {recentlyHidden.length > 0 ? (
        <View
          style={[
            styles.recentlyHiddenCard,
            { borderColor: '#F59E0B', backgroundColor: '#FEF3C7' },
          ]}
        >
          <View style={styles.recentlyHiddenHead}>
            <MaterialIcons name="history" size={getScaledFontSize(16)} color="#92400E" />
            <Text
              style={{
                marginLeft: 6,
                color: '#92400E',
                fontSize: getScaledFontSize(12),
                fontWeight: getScaledFontWeight(700) as any,
                letterSpacing: 0.5,
              }}
            >
              RECENTLY HIDDEN — TAP RESTORE →
            </Text>
          </View>
          {recentlyHidden.map((entry) => (
            <View key={entry.id} style={styles.recentlyHiddenRow}>
              <MaterialIcons
                name="visibility-off"
                size={getScaledFontSize(16)}
                color="#92400E"
              />
              <Text
                style={{
                  flex: 1,
                  marginLeft: 8,
                  color: '#78350F',
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(600) as any,
                }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {entry.name}
              </Text>
              <Pressable
                onPress={() => restoreFromBanner(entry.id)}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${entry.name}`}
                accessibilityState={{ disabled: updateMutation.isPending }}
                disabled={updateMutation.isPending}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.restorePill,
                  {
                    backgroundColor: '#0D9488',
                    opacity: updateMutation.isPending ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <MaterialIcons name="undo" size={getScaledFontSize(14)} color="#FFFFFF" />
                <Text
                  style={{
                    marginLeft: 4,
                    color: '#FFFFFF',
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(700) as any,
                  }}
                >
                  Restore
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {medications.length === 0 ? (
        <View style={[styles.emptyRow, { borderColor: colors.border, backgroundColor: (colors.card as string) + 'D9' }]}>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
            No medications yet. Tap Add to track one you&apos;re taking.
          </Text>
        </View>
      ) : (
        medications.map((med) => (
          <MedicationCard
            key={med.id}
            med={med}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            busy={updateMutation.isPending}
            onEdit={() => setEditor({ kind: 'edit', med })}
            onRemove={() => onRemove(med)}
            onToggleTracked={() => onToggleTracked(med)}
            onUpdateSupply={() => setSupplyEditor({ med })}
            onSnooze={() => onSnooze(med)}
            onConfirmAlertOpen={beginConfirmAlert}
            onConfirmAlertResolve={endConfirmAlert}
          />
        ))
      )}

      {/* Add / Edit modal.
          CHUNK 52.3 revert (Ken 2026-07-22 dogfood): chunk 52.1's
          conditional mount pattern (`{editor !== null ? ... : null}`)
          broke the "+ Add" flow on Ken's iPhone 14,3 / iOS 26.5 build 62.
          Fresh-mounting an RN <Modal animationType="fade" transparent>
          with visible=true in the same commit is a known-brittle
          pattern — RN docs + community canonical usage universally
          prefer always-mount + toggle visible so the false→true
          transition drives the animation. Reverted to unconditional
          mount with visible={mode !== null} internally. This restores
          2 <Modal transparent> nodes at rest inside MedicationsSection
          (this + SupplyEditorModal below), matching pre-52.1 behavior
          and matching what /Home/health-plan legacy has shipped since
          the meds feature launched.
          Total <Modal transparent> at rest on BPS after 52.3:
            1 (chunk-53 consolidated BPS-owned) + 2 (MedicationsSection)
            = 3, same as the pre-chunk-53 BPS state Ken tested clean
            during chunks 47-52 dogfood. No new coexistence pattern
            introduced. If a future crash surfaces, the chunk-52.1
            conditional mount can be reintroduced with a
            requestAnimationFrame-deferred visible toggle. */}
      <MedicationEditorModal
        mode={editor}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
        saving={updateMutation.isPending}
        onClose={() => setEditor(null)}
        onSubmit={(payload) => {
          if (!editor) return;
          if (editor.kind === 'add') {
            // `form` is only set when MED_FORMS_ENABLED (the editor leaves it
            // undefined otherwise), so the add payload is unchanged when off.
            // Cadence isn't sent on add (no med id yet); the patient sets it
            // with supply via the supply modal, per the setSupply contract.
            updateMutation.mutate({ add: [payload] });
          } else {
            const id = editor.med.id;
            // On edit the id exists, so a chosen injectable cadence can ride
            // along on setSupply (cadence/startDate live on supply, keyed by
            // id). Only included when the editor returned a cadence — i.e. an
            // injectable with the feature on; otherwise the body is today's.
            const cadence = payload.cadence;
            updateMutation.mutate({
              edit: [
                {
                  id,
                  dose: payload.dose,
                  times: payload.times,
                  frequency: payload.frequency,
                  form: payload.form,
                },
              ],
              ...(cadence
                ? {
                    setSupply: [
                      {
                        id,
                        // Preserve any prior quantities; cadence is the change.
                        remainingQuantity: editor.med.supply?.remainingQuantity ?? 0,
                        dosesPerDay: editor.med.supply?.dosesPerDay ?? 1,
                        cadence,
                        startDate: isoDatePlusDays(0),
                      },
                    ],
                  }
                : {}),
            });
          }
          setEditor(null);
        }}
      />

      {/* Supply / refill modal.
          CHUNK 52.1 (Concern 7): conditionally mounted, same rationale as
          the editor modal above. */}
      {/* CHUNK 52.3 revert: same rationale as MedicationEditorModal above.
          Unconditional mount so RN's Modal fade animation gets the
          false→true visible transition it needs to present on iOS 26.5. */}
      <SupplyEditorModal
        mode={supplyEditor}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
        saving={updateMutation.isPending}
        onClose={() => setSupplyEditor(null)}
        onSubmit={({ remainingQuantity, dosesPerDay, cadence, startDate }) => {
          if (!supplyEditor) return;
          // Saving supply for a med also counts as confirming the patient
          // reviewed their meds (COS-357), so we auto-confirm the review here.
          // The explicit "Confirm my medications" button still exists for
          // patients who don't need to update supply.
          //
          // cadence/startDate are only populated for an injectable when
          // MED_FORMS_ENABLED; they stay undefined otherwise, so the setSupply
          // payload is byte-for-byte today's when the flag is off.
          updateMutation.mutate({
            setSupply: [{ id: supplyEditor.med.id, remainingQuantity, dosesPerDay, cadence, startDate }],
            confirmReview: true,
          });
          setSupplyEditor(null);
        }}
      />
    </View>
  );
}

// ─── Single medication card ─────────────────────────────────────────────────

interface ThemeProps {
  colors: (typeof Colors)['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function MedicationCard({
  med,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  busy,
  onEdit,
  onRemove,
  onToggleTracked,
  onUpdateSupply,
  onSnooze,
  onConfirmAlertOpen,
  onConfirmAlertResolve,
}: ThemeProps & {
  med: Medication;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onToggleTracked: () => void;
  onUpdateSupply: () => void;
  onSnooze: () => void;
  /** Signal the parent that a destructive-confirm Alert is presenting.
   *  Parent uses this to gate its openAddSignal effect so it doesn't
   *  mount MedicationEditorModal on top of a live Alert (iOS 26.5
   *  Alert-over-Modal forbidden pairing). Both handlers must be called
   *  in pairs — open on Alert.alert start, resolve on either branch. */
  onConfirmAlertOpen: () => void;
  onConfirmAlertResolve: () => void;
}): React.JSX.Element {
  const isEhr = med.source === 'ehr';
  const badgeColor = isEhr ? (colors.primary as string) : (colors.tint as string);
  const badgeLabel = isEhr ? 'From your records' : 'Added by you';
  const needsRefill = med.supply?.needsRefill === true;
  const daysLeft = daysUntil(med.supply?.runOutDate ?? null);
  // COS-372: form-derived display (only surfaced when MED_FORMS_ENABLED).
  const isInjectable = normalizeForm(med.form) === 'injectable';
  const formTag = formTagLabel(med.form);

  // CHUNK 52.1 (Concern 1): confirm before firing the destructive Hide
  // mutation. INVARIANT: MedicationsSection must be rendered as INLINE content
  // on the plan surface, NEVER inside a <Modal>. If that ever changes, this
  // Alert becomes the iOS 26 Alert-over-Modal forbidden pairing — swap to a
  // custom in-tree confirm before re-parenting. Verified: BPS
  // (BiopsychosocialPlanScreen) and legacy (/Home/health-plan) both mount
  // this section inline.
  const confirmRemove = () => {
    // CHUNK 52.1 adversarial-verify major #4 fix: signal alert-in-flight to
    // the parent so it can skip openAddSignal-triggered Modal mounts while
    // the Alert is visible (Alert-over-Modal is the iOS 26.5 forbidden
    // pairing). Every branch (Cancel + Hide) resolves the ref before firing
    // its user-facing action, so the ref is guaranteed cleared once the
    // Alert dismisses regardless of user choice.
    onConfirmAlertOpen();
    Alert.alert(
      'Hide medication?',
      `${med.name} will be hidden from your medication list. You can restore it later.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: onConfirmAlertResolve },
        { text: 'Hide', style: 'destructive', onPress: () => { onConfirmAlertResolve(); onRemove(); } },
      ],
      { onDismiss: onConfirmAlertResolve },
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
      <View style={styles.cardTopRow}>
        <View style={[styles.medIcon, { backgroundColor: 'rgba(139,92,246,0.12)' }]}>
          <MaterialIcons name="medication" size={getScaledFontSize(20)} color="#8B5CF6" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}
            numberOfLines={1}
          >
            {med.name}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }} numberOfLines={1}>
            {[med.dose, med.frequency].filter(Boolean).join(' · ') || 'No dose set'}
          </Text>
          {med.times.length > 0 ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 1 }} numberOfLines={1}>
              {med.times.join(', ')}
            </Text>
          ) : null}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: badgeColor + '1A', borderColor: badgeColor + '40' }]}>
              <MaterialIcons
                name={isEhr ? 'verified' : 'edit'}
                size={getScaledFontSize(11)}
                color={badgeColor}
              />
              <Text
                style={{
                  color: badgeColor,
                  fontSize: getScaledFontSize(10),
                  fontWeight: getScaledFontWeight(700) as any,
                  marginLeft: 4,
                }}
              >
                {badgeLabel}
              </Text>
            </View>
            {/* COS-372: small Injectable/Oral tag. Dark by default. */}
            {MED_FORMS_ENABLED ? (
              <View style={[styles.badge, { backgroundColor: (colors.subtext as string) + '14', borderColor: (colors.subtext as string) + '40' }]}>
                <MaterialIcons
                  name={isInjectable ? 'vaccines' : 'medication'}
                  size={getScaledFontSize(11)}
                  color={colors.subtext}
                />
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: getScaledFontSize(10),
                    fontWeight: getScaledFontWeight(700) as any,
                    marginLeft: 4,
                  }}
                >
                  {formTag}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={onEdit}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${med.name}`}
          style={styles.iconBtn}
        >
          <MaterialIcons name="edit" size={getScaledFontSize(18)} color={colors.subtext} />
        </Pressable>
        {/* CHUNK 52.1 (Concerns 1 + 3): destructive Hide is now confirm-
            gated via Alert.alert and spatially separated from Edit with
            iconBtnDestructive (marginLeft: 12) + asymmetric hitSlop (smaller
            on the left) so a stray finger between Edit and Hide falls on
            Edit — the non-destructive side. */}
        <Pressable
          onPress={confirmRemove}
          disabled={busy}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Hide ${med.name}`}
          accessibilityHint="Opens a confirmation dialog before hiding"
          style={styles.iconBtnDestructive}
        >
          <MaterialIcons name="visibility-off" size={getScaledFontSize(18)} color={colors.subtext} />
        </Pressable>
      </View>

      {/* Refill banner */}
      {needsRefill ? (
        <View style={[styles.refillBanner, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B' }]}>
          <MaterialIcons name="warning-amber" size={getScaledFontSize(16)} color="#B45309" />
          <Text style={{ flex: 1, marginLeft: 8, color: '#92400E', fontSize: getScaledFontSize(12), lineHeight: getScaledFontSize(18) }}>
            {daysLeft != null
              ? `Running low — about ${daysLeft} day${daysLeft === 1 ? '' : 's'} left, time to refill.`
              : 'Running low — time to refill.'}
          </Text>
        </View>
      ) : null}

      {/* Supply summary line */}
      {med.supply && (med.supply.remainingQuantity != null || med.supply.dosesPerDay != null) ? (
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 8 }}>
          {med.supply.remainingQuantity != null ? `${med.supply.remainingQuantity} left` : 'Supply unknown'}
          {/* COS-372: injectables read as "· weekly"; consumables keep "· N/day".
              When the flag is off this is byte-for-byte today's "/day" line. */}
          {MED_FORMS_ENABLED && isInjectable
            ? ` · ${cadenceLabel(med.supply.cadence).toLowerCase()}`
            : med.supply.dosesPerDay != null
            ? ` · ${med.supply.dosesPerDay}/day`
            : ''}
          {med.supply.runOutDate
            ? ` · runs out ${new Date(med.supply.runOutDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : ''}
        </Text>
      ) : null}

      {/* Action row: track toggle + supply / refill actions */}
      <View style={styles.cardActions}>
        <View style={styles.trackToggle}>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), marginRight: 8 }}>Track adherence</Text>
          <Switch
            value={med.tracked}
            onValueChange={onToggleTracked}
            disabled={busy}
            trackColor={{ false: colors.border, true: (colors.tint as string) + '99' }}
            thumbColor={med.tracked ? (colors.tint as string) : '#f4f3f4'}
            accessibilityLabel={`Track adherence for ${med.name}`}
          />
        </View>
      </View>

      <View style={styles.supplyActions}>
        <Pressable
          onPress={onUpdateSupply}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Update supply for ${med.name}`}
          style={[styles.supplyBtn, { borderColor: colors.border }]}
        >
          <MaterialIcons name="inventory-2" size={getScaledFontSize(15)} color={colors.tint as string} />
          <Text style={{ color: colors.tint as string, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any, marginLeft: 5 }}>
            {med.supply?.remainingQuantity != null ? 'I refilled / update quantity' : 'Add supply'}
          </Text>
        </Pressable>
        {needsRefill ? (
          <Pressable
            onPress={onSnooze}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Snooze refill reminder for ${med.name}`}
            style={[styles.supplyBtn, { borderColor: colors.border }]}
          >
            <MaterialIcons name="snooze" size={getScaledFontSize(15)} color={colors.subtext} />
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any, marginLeft: 5 }}>
              Snooze
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* CHUNK 52.2: the per-card "Hid this by mistake? Restore" Pressable
          was removed. It was unreachable — the server drops hidden meds
          from the response, so no MedicationCard mounts for a hidden med
          in the first place. Chunk 52.1 removed the source==='ehr' gate
          in a well-meaning-but-no-op fix; this chunk replaces the whole
          affordance with the session-local recently-hidden banner rendered
          by MedicationsSection above the med list. */}
    </View>
  );
}

// ─── Add / Edit modal ───────────────────────────────────────────────────────

function MedicationEditorModal({
  mode,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  saving,
  onClose,
  onSubmit,
}: ThemeProps & {
  mode: EditorMode | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    dose?: string;
    frequency?: string;
    times?: string[];
    form?: MedicationForm;
    /** COS-372 — chosen injectable cadence (undefined for consumables/flag-off). */
    cadence?: MedicationCadence;
  }) => void;
}): React.JSX.Element {
  const visible = mode !== null;
  const isEdit = mode?.kind === 'edit';
  const existing = mode?.kind === 'edit' ? mode.med : null;

  const [name, setName] = React.useState('');
  const [dose, setDose] = React.useState('');
  const [frequency, setFrequency] = React.useState('');
  const [timesRaw, setTimesRaw] = React.useState('');
  // COS-372: which form is selected. Only surfaced when MED_FORMS_ENABLED;
  // otherwise it stays at the default and is never sent.
  const [form, setForm] = React.useState<MedicationForm>('consumable');
  // COS-372: cadence for an injectable (the consumable path ignores it).
  const [cadence, setCadence] = React.useState<MedicationCadence>('daily');

  // Reset fields whenever the modal target changes.
  React.useEffect(() => {
    setName(existing?.name ?? '');
    setDose(existing?.dose ?? '');
    setFrequency(existing?.frequency ?? '');
    setTimesRaw((existing?.times ?? []).join(', '));
    setForm(normalizeForm(existing?.form));
    setCadence(normalizeCadence(existing?.supply?.cadence));
  }, [existing, visible]);

  const nameValid = isEdit || name.trim().length > 0;
  // The injectable layout (cadence picker, no daily-times field) only applies
  // when the feature is on AND the user picked injectable. When the flag is
  // off this is always false → today's consumable layout exactly.
  const isInjectable = MED_FORMS_ENABLED && form === 'injectable';

  const submit = () => {
    if (!nameValid) return;
    const times = parseTimes(timesRaw);
    onSubmit({
      name: name.trim(),
      dose: dose.trim() || undefined,
      frequency: frequency.trim() || undefined,
      // Injectables dose on a cadence, not daily times — don't send stale times.
      times: !isInjectable && times.length > 0 ? times : undefined,
      // Only attach `form` when the feature is enabled; undefined otherwise so
      // the payload is identical to today's.
      form: MED_FORMS_ENABLED ? form : undefined,
      // Carry the chosen cadence for the parent to persist via setSupply on the
      // edit path (where the med id exists). undefined for consumables/flag-off.
      cadence: isInjectable ? cadence : undefined,
    });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        {/* CHUNK 52.1 (Concern 6): accessibilityViewIsModal contains
            VoiceOver focus inside this sheet on iOS so it can't leak into
            the plan surface behind. iOS-only prop; Android ignores it (native
            RN Modal already contains focus via Dialog). */}
        <View
          style={[styles.modalSheet, { backgroundColor: (colors.card as string) + 'F8', borderColor: colors.border }]}
          accessibilityViewIsModal
        >
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any, marginBottom: 12 }}>
            {isEdit ? 'Edit medication' : 'Add medication'}
          </Text>

          {/* COS-372: consumable / injectable segmented control. Dark by
              default — when MED_FORMS_ENABLED is false this whole block is not
              rendered, so the modal is byte-for-byte today's. */}
          {MED_FORMS_ENABLED ? (
            <>
              <FieldLabel text="Type" colors={colors} getScaledFontSize={getScaledFontSize} />
              <View style={[styles.segmented, { borderColor: colors.text + '30' }]}>
                {(['consumable', 'injectable'] as MedicationForm[]).map((opt) => {
                  const selected = form === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setForm(opt)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={opt === 'injectable' ? 'Injectable' : 'Consumable (pills, tablets, liquid)'}
                      style={[
                        styles.segment,
                        selected ? { backgroundColor: colors.tint as string } : null,
                      ]}
                    >
                      <Text
                        style={{
                          color: selected ? '#fff' : colors.text,
                          fontSize: getScaledFontSize(13),
                          fontWeight: getScaledFontWeight(selected ? 700 : 600) as any,
                        }}
                      >
                        {opt === 'injectable' ? 'Injectable' : 'Consumable'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {!isEdit ? (
            <>
              <FieldLabel text="Name" colors={colors} getScaledFontSize={getScaledFontSize} />
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Metformin"
                placeholderTextColor={colors.text + '40'}
                autoCapitalize="words"
              />
            </>
          ) : (
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any, marginBottom: 8 }}>
              {existing?.name}
            </Text>
          )}

          <FieldLabel text="Dose" colors={colors} getScaledFontSize={getScaledFontSize} />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
            value={dose}
            onChangeText={setDose}
            placeholder="e.g. 500 mg"
            placeholderTextColor={colors.text + '40'}
          />

          <FieldLabel text="Frequency" colors={colors} getScaledFontSize={getScaledFontSize} />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
            value={frequency}
            onChangeText={setFrequency}
            placeholder="e.g. Twice daily"
            placeholderTextColor={colors.text + '40'}
          />

          {isInjectable ? (
            // COS-372: injectables dose on a cadence (weekly, etc.), not daily
            // clock times. The cadence itself is chosen with the supply (it
            // drives the run-out projection and is keyed by med id on
            // setSupply), so here we just pick the cadence and surface where
            // it's applied. The selected value pre-seeds the supply modal.
            <>
              <FieldLabel text="How often" colors={colors} getScaledFontSize={getScaledFontSize} />
              <View style={styles.cadenceWrap}>
                {CADENCE_OPTIONS.map((opt) => {
                  const selected = cadence === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setCadence(opt)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={cadenceLabel(opt)}
                      style={[
                        styles.cadenceChip,
                        {
                          borderColor: selected ? (colors.tint as string) : colors.text + '30',
                          backgroundColor: selected ? (colors.tint as string) + '1A' : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selected ? (colors.tint as string) : colors.text,
                          fontSize: getScaledFontSize(13),
                          fontWeight: getScaledFontWeight(selected ? 700 : 500) as any,
                        }}
                      >
                        {cadenceLabel(opt)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 6 }}>
                You&apos;ll confirm how many {supplyUnitLabel(form)} you have when you add supply.
              </Text>
            </>
          ) : (
            <>
              <FieldLabel text="Times (comma-separated, HH:MM)" colors={colors} getScaledFontSize={getScaledFontSize} />
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
                value={timesRaw}
                onChangeText={setTimesRaw}
                placeholder="e.g. 08:00, 20:00"
                placeholderTextColor={colors.text + '40'}
                autoCapitalize="none"
              />
            </>
          )}

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { borderColor: colors.border }]} accessibilityRole="button">
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!nameValid || saving}
              style={[
                styles.modalBtn,
                styles.modalBtnPrimary,
                { backgroundColor: nameValid ? (colors.tint as string) : colors.subtext + '60', opacity: saving ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={isEdit ? 'Save medication' : 'Add medication'}
              // CHUNK 52.1 (Concern 4): expose pending + disabled state to
              // VoiceOver / TalkBack. Chunk 46.1 dropped ActivityIndicator, so
              // AT had no way to detect the saving/disabled state visually
              // encoded by opacity/disabled.
              accessibilityState={{ busy: saving, disabled: !nameValid || saving }}
            >
              {/* CHUNK 46.1: dropped ActivityIndicator (chunk-17 crash
                  class). Parent Pressable already has opacity: 0.6 while
                  saving + disabled state — sufficient pending affordance. */}
              <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                {isEdit ? 'Save' : 'Add'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Supply / refill modal ──────────────────────────────────────────────────

function SupplyEditorModal({
  mode,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  saving,
  onClose,
  onSubmit,
}: ThemeProps & {
  mode: SupplyMode | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    remainingQuantity: number;
    dosesPerDay: number;
    cadence?: MedicationCadence;
    startDate?: string;
  }) => void;
}): React.JSX.Element {
  const visible = mode !== null;
  const med = mode?.med ?? null;
  // COS-372: an injectable's supply is measured in pens/vials/doses on a
  // cadence. Off by default → consumable units + no cadence row, exactly today.
  const isInjectable = MED_FORMS_ENABLED && normalizeForm(med?.form) === 'injectable';
  const unitLabel = MED_FORMS_ENABLED ? supplyUnitLabel(med?.form) : 'pills/tablets/mL';

  const [remaining, setRemaining] = React.useState('');
  const [perDay, setPerDay] = React.useState('');
  const [cadence, setCadence] = React.useState<MedicationCadence>('daily');

  React.useEffect(() => {
    setRemaining(med?.supply?.remainingQuantity != null ? String(med.supply.remainingQuantity) : '');
    setPerDay(med?.supply?.dosesPerDay != null ? String(med.supply.dosesPerDay) : '');
    setCadence(normalizeCadence(med?.supply?.cadence));
  }, [med, visible]);

  const remainingNum = Number(remaining);
  const perDayNum = Number(perDay);
  const valid =
    remaining.trim() !== '' &&
    perDay.trim() !== '' &&
    Number.isFinite(remainingNum) &&
    remainingNum >= 0 &&
    Number.isFinite(perDayNum) &&
    perDayNum > 0;

  const submit = () => {
    if (!valid) return;
    onSubmit({
      remainingQuantity: remainingNum,
      dosesPerDay: perDayNum,
      // Only send cadence/startDate for an injectable when the feature is on;
      // undefined otherwise → today's setSupply payload exactly.
      cadence: isInjectable ? cadence : undefined,
      startDate: isInjectable ? isoDatePlusDays(0) : undefined,
    });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        {/* CHUNK 52.1 (Concern 6): contain VoiceOver focus inside this sheet
            on iOS — same rationale as the editor modal. */}
        <View
          style={[styles.modalSheet, { backgroundColor: (colors.card as string) + 'F8', borderColor: colors.border }]}
          accessibilityViewIsModal
        >
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any, marginBottom: 4 }}>
            Update supply
          </Text>
          {med ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 12 }} numberOfLines={1}>
              {med.name}
            </Text>
          ) : null}

          {/* COS-372: when the feature is on, qualify the count with the
              form's unit ("How many do you have left? (pens/vials/doses)").
              When off, the label is byte-for-byte today's. */}
          <FieldLabel
            text={MED_FORMS_ENABLED ? `How many do you have left? (${unitLabel})` : 'How many do you have left?'}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
          />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
            value={remaining}
            onChangeText={setRemaining}
            placeholder="e.g. 30"
            placeholderTextColor={colors.text + '40'}
            keyboardType="number-pad"
          />

          {/* COS-372: cadence picker for an injectable's supply projection.
              Only rendered when the feature is on AND the med is injectable. */}
          {isInjectable ? (
            <>
              <FieldLabel text="How often" colors={colors} getScaledFontSize={getScaledFontSize} />
              <View style={styles.cadenceWrap}>
                {CADENCE_OPTIONS.map((opt) => {
                  const selected = cadence === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setCadence(opt)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={cadenceLabel(opt)}
                      style={[
                        styles.cadenceChip,
                        {
                          borderColor: selected ? (colors.tint as string) : colors.text + '30',
                          backgroundColor: selected ? (colors.tint as string) + '1A' : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selected ? (colors.tint as string) : colors.text,
                          fontSize: getScaledFontSize(13),
                          fontWeight: getScaledFontWeight(selected ? 700 : 500) as any,
                        }}
                      >
                        {cadenceLabel(opt)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <FieldLabel
            text={isInjectable ? 'Doses per intake' : 'Doses per day'}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
          />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
            value={perDay}
            onChangeText={setPerDay}
            placeholder="e.g. 2"
            placeholderTextColor={colors.text + '40'}
            keyboardType="number-pad"
          />

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { borderColor: colors.border }]} accessibilityRole="button">
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!valid || saving}
              style={[
                styles.modalBtn,
                styles.modalBtnPrimary,
                { backgroundColor: valid ? (colors.tint as string) : colors.subtext + '60', opacity: saving ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save supply"
              // CHUNK 52.1 (Concern 4): expose pending + disabled state to
              // VoiceOver / TalkBack.
              accessibilityState={{ busy: saving, disabled: !valid || saving }}
            >
              {/* CHUNK 46.1: dropped ActivityIndicator (chunk-17 crash
                  class). Parent Pressable already dims + disables while
                  saving — sufficient pending affordance. */}
              <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FieldLabel({
  text,
  colors,
  getScaledFontSize,
}: {
  text: string;
  colors: (typeof Colors)['light'];
  getScaledFontSize: (n: number) => number;
}): React.JSX.Element {
  return (
    <Text style={{ color: colors.text + '80', fontSize: getScaledFontSize(13), marginTop: 12, marginBottom: 4 }}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  secHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  secLabel: { letterSpacing: 0.5, textTransform: 'uppercase' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  // CHUNK 52.2 + 52.3 (Ken 2026-07-22 dogfood): recently-hidden banner
  // styles. Warm amber palette + prominent teal Restore pill so Ken can
  // FIND the restore path — the previous grey card blended with the
  // sibling med cards and wasn't legibly distinct.
  recentlyHiddenCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  recentlyHiddenHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recentlyHiddenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  restorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  emptyRow: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  medIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  iconBtn: { padding: 6, marginLeft: 2 },
  // CHUNK 52.1 (Concern 3): Hide sits 12pt to the right of Edit so a mis-tap
  // between the two lands on Edit (non-destructive). Paired with asymmetric
  // hitSlop on the Hide Pressable (smaller left extent).
  iconBtnDestructive: { padding: 6, marginLeft: 12 },
  refillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  trackToggle: { flexDirection: 'row', alignItems: 'center' },
  supplyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  supplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: { borderRadius: 16, padding: 20, borderWidth: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // COS-372: consumable/injectable segmented control + cadence chips.
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cadenceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cadenceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  modalBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  modalBtnPrimary: { borderColor: 'transparent' },
});
