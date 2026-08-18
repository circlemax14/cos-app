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
import { classifyMedication, splitByMedicationClass } from '@/lib/medication-classification';
import {
  classMark,
  doseLine,
  formTagIfNotable,
  formatTimeLabel,
  formatTimes,
  provenanceLabel,
} from '@/lib/medication-display';
// cadenceLabel deliberately NOT imported here — lib/med-forms already exports
// one and it is already in use in this file. Two functions answering the same
// question is how they drift.
import {
  canDrawSupplyBar,
  passedTodayTimes,
  supplyProvenance,
  supplyStatus,
  upcomingTodayTimes,
} from '@/lib/medication-schedule';
import { NextScheduledBand } from './NextScheduledBand';

import { DrugLabelFactsBlock } from '@/components/health-plan/DrugLabelFacts';

/** The one class we assert. Medical is a default, so it gets no colour. */
const PSYCH_TINT = '#6B4FA8';

/**
 * Direction D's monogram palette. Decorative — it aids recognition and encodes
 * NOTHING, so nothing on the screen may depend on reading it. Deliberately
 * dark enough for white text at every entry (all ≥4.5:1 on #FFF).
 */
/** Refill amber. #B45309 clears 4.5:1 on white; the lighter #F59E0B never carries text. */
const REFILL_AMBER = '#B45309';
const SUPPLY_OK = '#0F7A4A';

/** "17 Aug" — short enough to sit inside a one-line qualifier. */
function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Local YYYY-MM-DD. toISOString would shift the date either side of midnight. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONOGRAM_HUES = ['#0B6963', '#2C5EA8', '#8A4B7D', '#A8632C', '#3E7A3E'];

/**
 * Hashes the WHOLE NAME, not its first letter.
 *
 * First-char modulo-5 collided constantly on real data — verified against
 * Vishal's own list on 2026-08-18: cephalexin and metformin both landed on
 * green, QUVIVIQ and escitalopram both on blue. Adjacent letters map to
 * adjacent buckets, and a five-bucket palette turns that into a coin flip.
 *
 * Hashing every character spreads them, and it also means two medications
 * starting with the same letter get DIFFERENT colours, which is the case
 * where a distinct tile actually helps. Case-folded so "QUVIVIQ" and
 * "Quviviq" are the same medication to the eye.
 */
function monogramHue(name: string | null | undefined): string {
  const n = (name ?? '').trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < n.length; i += 1) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return MONOGRAM_HUES[h % MONOGRAM_HUES.length] as string;
}

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

/**
 * Normalize one user-typed time into the strict `HH:mm` the backend
 * requires, or return null when it genuinely can't be understood.
 *
 * ─── BUG #12.4 FIX (Ken 2026-08-07) ─────────────────────────────────
 * Ken: "Would not add all data and then did not show up on this page in
 * daily plan."
 *
 * `parseTimes` used to do a raw comma-split with ZERO validation, while
 * the backend enforces `^([01]\d|2[0-3]):[0-5]\d$` inside a `.strict()`
 * body. So a perfectly reasonable entry — "8:00", "8am", "8 AM",
 * "20:00 " — produced a 400 that rejected the ENTIRE PUT. The med was
 * not added at all, and the UI only said "Couldn't save that change",
 * giving no hint that the times field was the culprit.
 *
 * Accepted inputs → output:
 *   "8:00"    → "08:00"      (zero-pad)
 *   "8"       → "08:00"      (bare hour)
 *   "8am"     → "08:00"
 *   "8 PM"    → "20:00"
 *   "12am"    → "00:00"      (midnight, not 12:00)
 *   "12pm"    → "12:00"      (noon)
 *   "20:00 "  → "20:00"      (trim)
 * Rejected (returns null): "25:00", "8:99", "morning", "".
 */
export function normalizeTimeInput(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(t);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] === undefined ? 0 : parseInt(m[2], 10);
  const meridiem = m[3];
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'am') hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Parse a comma/newline-separated list of times into strict `HH:mm`
 * entries. Unparseable entries are reported separately so the caller can
 * tell the user exactly which token was wrong instead of failing the
 * whole save with a generic message (BUG #12.4).
 */
export function parseTimesDetailed(raw: string): { times: string[]; invalid: string[] } {
  const times: string[] = [];
  const invalid: string[] = [];
  for (const tok of raw.split(/[,\n]/)) {
    const trimmed = tok.trim();
    if (!trimmed) continue;
    const norm = normalizeTimeInput(trimmed);
    if (norm) {
      // De-dupe — "8am, 08:00" is one dose, not two.
      if (!times.includes(norm)) times.push(norm);
    } else {
      invalid.push(trimmed);
    }
  }
  // Chronological so the daily plan renders doses in order.
  times.sort();
  return { times, invalid };
}

/** Parse a comma/space-separated list of "HH:MM" times into a clean array. */
function parseTimes(raw: string): string[] {
  return parseTimesDetailed(raw).times;
}

/**
 * CHUNK 99 — Signed days until the ISO date (positive = future, negative = past,
 * null = missing/invalid). Distinct from `daysUntil` above, which clamps at 0
 * for the visual "days left" line. This variant preserves the sign so the
 * composed a11y label can distinguish "Refill in 3 days" from "Refill overdue
 * by 2 days". Rounded whole days.
 */
function signedDaysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((target - Date.now()) / 86_400_000);
}

/**
 * CHUNK 99 — VoiceOver / TalkBack composed label for a single medication card.
 *
 * VoiceOver previously heard each Text node as a separate utterance
 * ("Lisinopril", "10 mg", "Once daily", "Refill in 3 days") — four swipes to
 * assemble one med. This function composes a single coherent sentence:
 *
 *   "{name}, {dose}. {schedule}. {refill status}."
 *
 * Rules honored:
 *   - Missing fields fall back to natural phrases ("Schedule not specified",
 *     "Refill status unknown") — never "undefined".
 *   - Sentence-ending periods separate clauses so VoiceOver pauses naturally.
 *   - Refill clause distinguishes needs-refill / overdue / days-left / unknown.
 *
 * Pure function; no rendering side effects. Safe to compute on every render.
 */
function composeMedA11yLabel(med: Medication): string {
  // Name + dose. If dose is missing, name stands alone (no dangling comma).
  const name = (med.name ?? '').trim() || 'Medication';
  const dose = (med.dose ?? '').trim();
  const namePart = dose.length > 0 ? `${name}, ${dose}` : name;

  // Schedule from frequency + times. Either may be missing.
  //
  // Times go through the same humaniser the visible row uses. VoiceOver
  // reading "zero eight colon zero zero" is no better than the screen showing
  // "08:00" was, and the spoken label should match what is on screen.
  const freq = (med.frequency ?? '').trim();
  const times = formatTimes(med.times);
  let schedulePart: string;
  if (freq && times) {
    schedulePart = `${freq} at ${times}`;
  } else if (freq) {
    schedulePart = freq;
  } else if (times) {
    schedulePart = `Take at ${times}`;
  } else {
    schedulePart = 'Schedule not specified';
  }

  // Refill status. Priority:
  //   1. needsRefill + past runOutDate → "Refill overdue by N days"
  //   2. needsRefill + future runOutDate → "Refill in N days"
  //   3. needsRefill only → "Refill needed"
  //   4. Not needsRefill but future runOutDate → "Refill in N days"
  //   5. Neither → "Refill status unknown"
  const signedDays = signedDaysUntil(med.supply?.runOutDate ?? null);
  const needsRefill = med.supply?.needsRefill === true;
  let refillPart: string;
  if (needsRefill && signedDays != null && signedDays < 0) {
    const overdue = Math.abs(signedDays);
    refillPart = `Refill overdue by ${overdue} day${overdue === 1 ? '' : 's'}`;
  } else if (needsRefill && signedDays != null && signedDays >= 0) {
    refillPart = `Refill in ${signedDays} day${signedDays === 1 ? '' : 's'}`;
  } else if (needsRefill) {
    refillPart = 'Refill needed';
  } else if (signedDays != null && signedDays >= 0) {
    refillPart = `Refill in ${signedDays} day${signedDays === 1 ? '' : 's'}`;
  } else if (signedDays != null && signedDays < 0) {
    const overdue = Math.abs(signedDays);
    refillPart = `Refill overdue by ${overdue} day${overdue === 1 ? '' : 's'}`;
  } else {
    refillPart = 'Refill status unknown';
  }

  // NO REFILL CLAUSE WHEN THERE IS NO SUPPLY RECORD AT ALL.
  //
  // `supply` has no backend source — it exists only once a patient types the
  // quantity into the supply modal — so it is null on essentially every row.
  // Emitting "Refill status unknown" there made VoiceOver announce a refill
  // state on every medication in the list while the screen showed none, which
  // is both noise and a contradiction. Retained when supply EXISTS but nothing
  // is derivable from it, because then "unknown" is the true answer.
  const hasSupplyRecord = med.supply != null;

  // What was scheduled earlier today — spoken as well as shown, since the
  // greyed times in the row carry it visually and a screen-reader user gets
  // no colour. SCHEDULED, never "missed": there is no dose-taken event.
  const passedToday = passedTodayTimes(med.times, new Date());
  const earlierPart =
    passedToday.length > 0
      ? ` ${formatTimes(passedToday)} ${passedToday.length === 1 ? 'was' : 'were'} scheduled earlier today.`
      : '';

  const refillSentence = hasSupplyRecord ? ` ${refillPart}.` : '';
  return `${namePart}. ${schedulePart}.${earlierPart}${refillSentence}`;
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
  /**
   * The "Next scheduled" band. Defaults to `flush`, i.e. ONLY the dedicated
   * medications screen. On the Plan and Home surfaces MedicationsBanner
   * already carries upcoming doses, and a second one landing mid-plan would
   * duplicate it — the same redundancy Ken removed TodaysMedicationsCard for
   * on 2026-08-06.
   */
  showNextDoseBand?: boolean;
  /**
   * Ken 2026-08-06 — when true, drop the internal 20pt horizontal
   * margin on cards + section headers so the parent screen can supply
   * horizontal padding at its own preferred value (16pt to match
   * Health Trends banner on the medications screen). Defaults false to
   * preserve the legacy layout on health-plan.tsx +
   * PlanScreenRedesigned surfaces that rely on the internal margin.
   */
  flush?: boolean;
}

export function MedicationsSection({
  onLayout,
  openAddSignal = 0,
  flush = false,
  // Defaults to `flush` — which is true only on app/Home/medications.tsx.
  // The Plan and Home surfaces already carry upcoming doses in
  // MedicationsBanner, and a second band landing mid-plan would duplicate it.
  showNextDoseBand = flush,
}: MedicationsSectionProps = {}): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // Ken 2026-08-06 — flush override zeroes the internal horizontal
  // margins on cards + section headers when the parent supplies its
  // own padding. Threaded into every style array below rather than
  // via a wrapping conditional so the changes stay local + reviewable.
  const flushOverride = flush ? { marginHorizontal: 0 } : null;
  const flushPadOverride = flush ? { paddingHorizontal: 0 } : null;

  // Ken 2026-08-06 — opt into `?includePast=1` (BE PR #365) so
  // discontinued meds land in the response with `discontinuedAt`
  // populated. Enables the Active-vs-Past split below (and the
  // Past section that surfaces user-discontinued rows instead of
  // silently dropping them). The default (`includePast: false`)
  // response is still what non-editor surfaces read (e.g. the
  // Home MedicationsBanner) — separate query key so the banner
  // never ingests a list inflated with discontinued rows.
  const query = usePlanMedications({ includePast: true });
  const updateMutation = useUpdatePlanMedications({ includePast: true });

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

  /**
   * BUG #12.3 FIX (Ken 2026-08-07) — restore a medication from a
   * Past-section card.
   *
   * Ken reported: "One active medication was placed in past medications.
   * Tried to add back. Buggy." The "buggy" part was that there was NO
   * per-card restore control at all — CHUNK 52.2 deleted it on the
   * (then-correct) reasoning that the server never returned hidden meds,
   * so no card could mount for one. Once `?includePast=1` started
   * surfacing them, that reasoning expired but the control was never
   * brought back. The only remaining path was the amber
   * "recently hidden" banner, which is session-local and wiped on
   * relaunch — so anything hidden on a previous day was unrecoverable.
   *
   * Same `unremove` mutation as the banner path; also clears any banner
   * entry so the two affordances can't disagree about state.
   */
  const restoreMedication = (id: string) => {
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
      {/* Section header — Ken 2026-08-06: skipped when flush=true (medications
          screen) because the screen already has its own "Medications" title +
          "+" Add button in the top header row, and the section itself now
          renders "ACTIVE MEDICATIONS" / "PAST MEDICATIONS" sub-headers below.
          Rendering all three tiers is redundant + confusing. Legacy surfaces
          (health-plan.tsx / PlanScreenRedesigned) still get this header — the
          section is embedded inside a bigger plan screen there with no
          dedicated "Medications" title above it. */}
      {!flush ? (
      <View style={[styles.secHead, flushPadOverride]}>
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
      ) : null}

      {/* Always-visible safety disclaimer */}
      <View
        style={[styles.disclaimer, flushOverride, { backgroundColor: (colors.subtext as string) + '12', borderColor: colors.border }]}
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
          style={[styles.errorBox, flushOverride, { borderColor: '#DC2626', backgroundColor: '#FEE2E2' }]}
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
            flushOverride,
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

      {(() => {
        // Ken 2026-08-06 — split into Active vs Past on `discontinuedAt`.
        // Active = actively taken (null / absent). Past = user-discontinued
        // (ISO string). Legacy `removed[]` overlay entries that predate the
        // Aug-2026 rollout still surface here — the BE assigns them a
        // fallback timestamp (`overlay.updatedAt`) so they render in Past
        // instead of vanishing.
        // BUG #12.1/#12.2/#12.3 (Ken 2026-08-07) — a medication belongs in
        // PAST if ANY of three things is true:
        //   • the patient explicitly discontinued it  (discontinuedAt)
        //   • the EHR says the course ended            (endedInEhr)
        //   • it was hidden under the legacy "hide"    (hidden)
        // The third case used to be misreported as a discontinue with a
        // fabricated date; it now carries its own flag so the UI can label
        // it honestly and offer Restore.
        const isPastMed = (m: Medication) =>
          !!m.discontinuedAt || m.endedInEhr === true || m.hidden === true;
        const active = medications.filter((m) => !isPastMed(m));
        const past = medications.filter(isPastMed);
        if (medications.length === 0) {
          return (
            <View style={[styles.emptyRow, flushOverride, { borderColor: colors.border, backgroundColor: (colors.card as string) + 'D9' }]}>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
                No medications yet. Tap Add to track one you&apos;re taking.
              </Text>
            </View>
          );
        }
        return (
          <>
            {/* THE BAND. Only on the dedicated screen, and only when some
                medication actually has a computable next dose — it returns
                null otherwise, so an EHR-only account (no dose times anywhere)
                sees no shell and no "add your times" nag. */}
            {showNextDoseBand ? (
              <NextScheduledBand
                meds={active}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            ) : null}

            {/* The count states the number next to its noun, so nobody has to
                count rows to answer "how many am I on". Raised 11 → 13: this
                screen has a 13pt floor. */}
            <Text
              style={{
                marginTop: 6,
                marginBottom: 8,
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              {`Active · ${active.length} medication${active.length === 1 ? '' : 's'}`}
            </Text>
            {active.length === 0 ? (
              <View style={[styles.emptyRow, flushOverride, { borderColor: colors.border, backgroundColor: (colors.card as string) + 'D9' }]}>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
                  No active medications. Tap Add to track one you&apos;re taking.
                </Text>
              </View>
            ) : (
              /* Ken 2026-08-14 asked for medical vs psychiatric. This was
                 built as TWO HEADED SECTIONS, and Vishal 2026-08-18 corrected
                 it: "it's not like we have 2 sections, it has to be icon
                 based."

                 The headings did more harm than being heavy. They SPLIT THE
                 LIST IN TWO, so a patient's medications stopped appearing in
                 one place and the order they were added in was destroyed —
                 someone scanning for the drug they just took had to work out
                 which half it lived in first. The distinction is a property
                 OF a medication, not a way to file them.

                 So: one list, in one order, with a glyph on each row. Nothing
                 about the classification is lost — see MedicationCardDescriptive
                 for the icon and the legend below for what the glyphs mean. */
              (() => {
                const renderCard = (med: Medication) => (
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
                    onRestore={() => restoreMedication(med.id)}
                    onConfirmAlertOpen={beginConfirmAlert}
                    onConfirmAlertResolve={endConfirmAlert}
                    collapsible
                    flush={flush}
                  />
                );
                // A legend, shown only when BOTH kinds are present. With one
                // kind there is nothing to tell apart, and a key explaining a
                // distinction the patient cannot see on their own list is
                // furniture. Counts stay — they were the useful half of the
                // headings.
                const { medical, psychiatric } = splitByMedicationClass(active);
                const showLegend = medical.length > 0 && psychiatric.length > 0;

                return (
                  <>
                    {/* One quiet line, not a two-key legend: only psychiatric
                        rows carry a mark now, so a "Medical" key would explain
                        a symbol that does not appear anywhere. */}
                    {showLegend ? (
                      <View
                        style={styles.legendRow}
                        accessible
                        accessibilityLabel={`${psychiatric.length} of your ${active.length} medications are psychiatric and are marked.`}
                      >
                        <View style={[styles.classDot, { backgroundColor: PSYCH_TINT }]} />
                        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11) }}>
                          {`${psychiatric.length} of ${active.length} are psychiatric`}
                        </Text>
                      </View>
                    ) : null}
                    {/* ONE list, in the order the patient's medications
                        actually arrived — not re-sorted by class. */}
                    {active.map(renderCard)}
                  </>
                );
              })()
            )}
            {past.length > 0 && (
              <>
                {/* A PLAIN HEADING AGAIN.
                    I first made this whole section one accordion hanging off
                    the title. That was a misread: Vishal asked for the
                    accordion to be PER MEDICATION, so each past row can hide
                    its own detail. Collapsing the entire section instead hid
                    the fact that any history existed at all, behind a control
                    nobody asked for. The per-row collapse lives on
                    MedicationCard via `collapsible` (see below). */}
                <Text
                  style={{
                    marginTop: 20,
                    marginBottom: 8,
                    color: colors.subtext,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {`Past · ${past.length} medication${past.length === 1 ? '' : 's'}`}
                </Text>
                {past.map((med) => (
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
                    onRestore={() => restoreMedication(med.id)}
                    onConfirmAlertOpen={beginConfirmAlert}
                    onConfirmAlertResolve={endConfirmAlert}
                    isPast
                    // PER-MEDICATION ACCORDION. A past row now shows its name
                    // and why it ended, and hides the dose, schedule and
                    // footnote until tapped — "info which is not required"
                    // for a medication the patient is no longer taking.
                    collapsible
                    flush={flush}
                  />
                ))}
              </>
            )}
          </>
        );
      })()}

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

// Ken 2026-08-06 — passive descriptive block extracted so the same
// content renders inside a Pressable (collapsible + active) OR a plain
// View (past / non-collapsible). Kept as a named component so the
// Pressable's `accessibilityLabel` semantics stay on the parent while
// this block's Text nodes remain accessibilityElementsHidden — that's
// the CHUNK 99 v2 grouping contract.
function MedicationCardDescriptive({
  med,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  badgeColor,
  badgeLabel,
  isEhr,
  isInjectable,
  formTag,
  discontinuedLabel,
  compact = false,
}: ThemeProps & {
  med: Medication;
  badgeColor: string;
  badgeLabel: string;
  isEhr: boolean;
  isInjectable: boolean;
  formTag: string;
  discontinuedLabel: string | null;
  /**
   * A collapsed PAST row. Shows the name and why it ended, and hides the
   * dose, schedule and footnote — detail that is not required for a
   * medication the patient is no longer taking, and which pushed the rows
   * they ARE taking off the screen.
   */
  compact?: boolean;
}): React.JSX.Element {
  // ─── HIERARCHY, CORRECTED (Vishal 2026-08-18) ──────────────────────
  //
  // "UX of this page looks very odd." It did, and the cause was not the
  // icons — it was that the card ranked its content backwards.
  //
  // The loudest thing after the drug name was a bordered, coloured, bold chip
  // reading "FROM RECORDS": a fact about our data pipeline. The dose and the
  // schedule — the only content on this card a patient has to act on — were
  // the smallest, greyest text on it. A second chip said "ORAL" on every
  // single row, which is information-free by definition.
  //
  // So the weights are swapped. Dose and times move up to body weight in the
  // primary text colour; provenance becomes a quiet grey footnote with no
  // border, no fill and no caps; the form tag survives ONLY when it is
  // injectable, because that is the case where it changes what the patient
  // does.
  //
  // ─── AND ONLY PSYCHIATRIC IS MARKED ────────────────────────────────
  //
  // classifyMedication is deliberately one-sided — psychiatric on a confident
  // match, 'medical' for everything else INCLUDING psychiatric drugs not on
  // its list. So 'medical' is a default, not a finding, and badging it would
  // dress a fallback up as a conclusion. Marking only what we detected drops
  // a claim we cannot support, and takes a mark off most rows as a bonus.
  const medClass = classifyMedication(med);
  const mark = classMark(medClass);
  const notableForm = MED_FORMS_ENABLED ? formTagIfNotable(isInjectable) : null;

  // ─── SCHEDULE, SPLIT INTO PASSED AND UPCOMING ──────────────────────
  //
  // The old line printed every time in one colour, so at 10am a four-times-
  // daily antibiotic read "8am · 2pm · 8pm · 2am" with nothing to say that
  // 8am had already gone by. Greying the passed ones — and, below, saying so
  // in words as well, because the state must not be carried by colour alone.
  //
  // SCHEDULED, never "missed" and never "taken": there is no dose-taken event
  // anywhere in the medication contract, so the screen must not imply one in
  // either direction.
  const nowAt = new Date();
  const passed = passedTodayTimes(med.times, nowAt);
  const upcoming = upcomingTodayTimes(med.times, nowAt);
  // Guarded on the cadence EXISTING: med-forms' cadenceLabel defaults to
  // 'Daily' for absent input, which would put a schedule on a row that has none.
  const injectableCadence = med.supply?.cadence ? cadenceLabel(med.supply.cadence) : null;
  const hasClockSchedule = passed.length > 0 || upcoming.length > 0;

  // ─── THE A+B CARD ──────────────────────────────────────────────────
  //
  // Vishal 2026-08-18: "I asked you to mix both A and B but it doesn't match,
  // details in cards are not laid out properly."
  //
  // Correct on both counts, and they are the same fault. The first pass
  // shipped A plus the band and dropped everything B contributed, so a card
  // became FIVE STACKED TEXT LINES with nothing anchoring them and no
  // structure telling the eye where one kind of information ended and the
  // next began. B's density was the half he liked.
  //
  // So B is back, in the two parts that carry it:
  //
  //   THE MONOGRAM ANCHORS THE ROW. Every line of text now starts at the same
  //   x, against a fixed tile, instead of floating against the card edge.
  //   ONE TINT, NOT SIX: violet when psychiatric, neutral otherwise. The six
  //   hash-picked hues of the mockup looked richer but meant nothing —
  //   Metformin and Metoprolol both draw "M" — and they competed with the two
  //   colours on this screen that DO mean something.
  //
  //   DOSE TIMES BECOME CHIPS. Discrete moments read as discrete objects; a
  //   run-on "2am · 8am · 2pm · 8pm" reads as one string to parse. Passed
  //   chips are muted and upcoming ones tinted, which is the same passed/
  //   upcoming split as before, now legible at a glance.
  //
  // A hairline divider separates the row's CONTENT from its FOOTNOTE, so
  // provenance stops competing with the instruction.
  //
  // NO numberOfLines ANYWHERE. A clamped name hides the drug; a clamped sig
  // hides the instruction.
  return (
    <>
      {/* NO TILE HERE. MedicationCard ALREADY renders one — styles.medIcon at
          the top of cardTopRow — and adding a second put two icon columns side
          by side on every card, squeezing the text into a strip. That is what
          "details are not laid out properly" was, and my HTML mock never
          showed it because the mock did not include the wrapper. The existing
          tile now carries the class instead; see MedicationCard. */}
      <>
        <View style={{ minWidth: 0 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(17),
              fontWeight: getScaledFontWeight(700) as any,
            }}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          >
            {med.name}
          </Text>

          {/* A COLLAPSED PAST ROW STOPS HERE — name plus why it ended. The
              dose, schedule and footnote of a medication the patient is no
              longer taking is exactly the "info which is not required" that
              was pushing their CURRENT medications off the screen. */}
          {compact ? (
            discontinuedLabel ? (
              <Text
                style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 2 }}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              >
                {discontinuedLabel}
              </Text>
            ) : null
          ) : (
            <>
          {/* THE INSTRUCTION — the reason the card exists. */}
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(15),
              lineHeight: getScaledFontSize(22),
              marginTop: 2,
            }}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          >
            {doseLine(med.dose, med.frequency)}
          </Text>

          {/* Dose times as chips. Passed muted, upcoming tinted. */}
          {hasClockSchedule ? (
            <View
              style={styles.chipRow}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            >
              {passed.map((t) => (
                <View
                  key={`p-${t}`}
                  style={[styles.timeChip, { backgroundColor: (colors.border as string) + '99' }]}
                >
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
                    {formatTimeLabel(t)}
                  </Text>
                </View>
              ))}
              {upcoming.map((t) => (
                <View
                  key={`u-${t}`}
                  style={[styles.timeChip, { backgroundColor: (colors.tint as string) + '1A' }]}
                >
                  <Text
                    style={{
                      color: colors.tint as string,
                      fontSize: getScaledFontSize(13),
                      fontWeight: getScaledFontWeight(600) as any,
                    }}
                  >
                    {formatTimeLabel(t)}
                  </Text>
                </View>
              ))}
              {/* D moves the class into the chip row as a LABELLED chip. That
                  is what frees the monogram to be decorative — the class now
                  has its own channel, with the word in it, instead of relying
                  on a tile colour a reader has to decode. */}
              {mark.show ? (
                <View style={[styles.timeChip, { backgroundColor: PSYCH_TINT + '1F' }]}>
                  <Text
                    style={{
                      color: PSYCH_TINT,
                      fontSize: getScaledFontSize(13),
                      fontWeight: getScaledFontWeight(600) as any,
                    }}
                  >
                    {mark.label}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : injectableCadence ? (
            // An injectable has no clock time and that is CORRECT — saying
            // "no times set" about one would be wrong, not merely unhelpful.
            <View
              style={styles.chipRow}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            >
              <View style={[styles.timeChip, { backgroundColor: (colors.tint as string) + '1A' }]}>
                <Text
                  style={{
                    color: colors.tint as string,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {injectableCadence}
                </Text>
              </View>
            </View>
          ) : null}

          {/* The same fact in words. Redundant with the muted chips ON
              PURPOSE — the state must not be carried by colour alone. */}
          {passed.length > 0 ? (
            <Text
              style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 6 }}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            >
              {`${formatTimes(passed)} ${passed.length === 1 ? 'was' : 'were'} scheduled earlier today`}
            </Text>
          ) : null}
            </>
          )}
        </View>
      </>

      {compact ? null : (
        <View style={[styles.cardRule, { backgroundColor: colors.border as string }]} />
      )}

      {/* ─── D'S SUPPLY BLOCK ────────────────────────────────────────
          Direction D shows days-of-supply and a bar under every card. It can
          only be shown where the data exists, and it mostly does not:
          `supply` is written ONLY by the hand-entry modal — no EHR or FHIR
          path populates it — so it is null on essentially every row until a
          patient types a quantity.

          So this renders NOTHING by default, and the card above it is
          complete without it. Drawing an empty track on every row would be a
          gauge of a number we do not have, which is worse than silence.

          The BAR needs both a day count and a quantity. With only one, the
          length is an invented fraction, so the text is shown alone. */}
      {(() => {
        if (compact) return null;
        const st = supplyStatus(med.supply, todayISO());
        if (st.kind === 'none') return null;
        const prov = supplyProvenance(med.supply);

        const urgent =
          st.kind === 'overdue' || (st.kind === 'reorder' && st.urgent);
        const amber = st.kind === 'overdue' || st.kind === 'reorder';
        const tone = amber ? REFILL_AMBER : (colors.subtext as string);

        const label =
          st.kind === 'overdue'
            ? `Refill overdue by ${st.days} day${st.days === 1 ? '' : 's'}`
            : st.kind === 'reorder'
              ? st.days == null
                ? 'Time to reorder'
                : `About ${st.days} day${st.days === 1 ? '' : 's'} left — time to reorder`
              : st.kind === 'ok'
                ? `${st.days} day${st.days === 1 ? '' : 's'} of supply`
                : st.kind === 'snoozed'
                  ? 'Refill reminder paused'
                  : `${st.remaining} left`;

        const qty = med.supply?.remainingQuantity;
        const showBar = canDrawSupplyBar(med.supply);
        // An overdue supply is EMPTY, not nearly-empty — a 4% sliver would
        // read as "a little left" on the row that has none.
        const pct =
          st.kind === 'overdue'
            ? 0
            : st.kind === 'ok' || st.kind === 'reorder'
              ? Math.max(0.04, Math.min(1, (st.kind === 'ok' ? st.days : (st.days ?? 0)) / 30))
              : 0.04;

        return (
          <View
            style={styles.supplyBlock}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          >
            <View style={styles.supplyRow}>
              <Text
                style={{
                  color: tone,
                  fontSize: getScaledFontSize(13),
                  fontWeight: urgent ? (getScaledFontWeight(700) as any) : undefined,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {label}
              </Text>
              {typeof qty === 'number' && Number.isFinite(qty) ? (
                <Text
                  style={{
                    color: tone,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {`${qty} left`}
                </Text>
              ) : null}
            </View>
            {/* SAY THAT IT IS AN ESTIMATE.
                The backend derives this from the dispense quantity when
                nobody has typed a count, assuming the fill happened the day
                the script was written and that every dose since was taken.
                Neither is observable. Unqualified, "About 4 days left" reads
                as a measurement — and the bar below it reads as one even
                harder. The invitation to correct it is the useful half: a
                patient who has actually counted can replace a guess with a
                fact in two taps. */}
            {prov.estimated ? (
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 3 }}>
                {prov.basedOn
                  ? `Estimated from your ${formatShortDate(prov.basedOn)} prescription · tap to correct`
                  : 'Estimated from your prescription · tap to correct'}
              </Text>
            ) : null}
            {showBar ? (
              <View style={[styles.supplyTrack, { backgroundColor: colors.border as string }]}>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    width: `${Math.round(pct * 100)}%`,
                    backgroundColor: amber ? REFILL_AMBER : SUPPLY_OK,
                  }}
                />
              </View>
            ) : null}
          </View>
        );
      })()}

      {/* The footnote line: class (only when detected), form (only when
          notable), provenance. Plain grey, one line, no chrome.

          HIDDEN WHEN COLLAPSED. On a past row it was still rendering, so a
          collapsed card showed the name, the reason it ended, "from your
          health records", AND the reason again in italic below — four lines
          for a medication the patient is not taking. That is the opposite of
          hiding info which is not required. */}
      {compact ? null : (
      <View
        style={styles.metaRow}
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
      >
        {/* No psychiatric mark here — it is a chip in the row above now.
            Saying it twice on one card is how a footnote becomes noise. */}
        {notableForm ? (
          <>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>{notableForm}</Text>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>·</Text>
          </>
        ) : null}
        {/* No numberOfLines: at large text this wraps rather than clipping
            the only statement of where the row came from. */}
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
          {provenanceLabel(isEhr)}
        </Text>
      </View>
      )}
      {/* The reason it ended, ONCE. The collapsed branch above already prints
          it, so printing it here too gave every past card the same sentence
          twice — once upright, once italic. */}
      {!compact && discontinuedLabel ? (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            marginTop: 6,
            fontStyle: 'italic',
          }}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        >
          {discontinuedLabel}
        </Text>
      ) : null}
    </>
  );
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
  onRestore,
  onConfirmAlertOpen,
  onConfirmAlertResolve,
  collapsible = false,
  isPast = false,
  flush = false,
}: ThemeProps & {
  med: Medication;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onToggleTracked: () => void;
  onUpdateSupply: () => void;
  onSnooze: () => void;
  /** BUG #12.3 — un-hide / un-discontinue this med (fires `unremove`).
   *  Only invoked from Past-section rows. */
  onRestore: () => void;
  /** Signal the parent that a destructive-confirm Alert is presenting.
   *  Parent uses this to gate its openAddSignal effect so it doesn't
   *  mount MedicationEditorModal on top of a live Alert (iOS 26.5
   *  Alert-over-Modal forbidden pairing). Both handlers must be called
   *  in pairs — open on Alert.alert start, resolve on either branch. */
  onConfirmAlertOpen: () => void;
  onConfirmAlertResolve: () => void;
  /** Ken 2026-08-06 — when true, hide the interactive controls block
   *  (Edit / Hide / Track adherence / Update supply / Snooze) until
   *  the card's header is tapped. Applied to Active-section rows so
   *  the list scans clean; controls stay one tap away. Past-section
   *  rows render read-only (see `isPast`) and ignore this flag. */
  collapsible?: boolean;
  /** Ken 2026-08-06 — Past-section row. Renders read-only (no
   *  controls), with a muted color treatment + "Discontinued
   *  {date}" caption. `collapsible` is ignored when isPast=true. */
  isPast?: boolean;
  /** Ken 2026-08-06 — see MedicationsSection.flush. Zeroes the card's
   *  internal 20pt horizontal margin so the parent screen supplies
   *  its own horizontal padding (medications screen uses 16pt to
   *  match Health Trends banner). */
  flush?: boolean;
}): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(!collapsible);
  React.useEffect(() => {
    // Reset expanded state if the collapsible prop changes (e.g. row
    // moves between Active/Past on a discontinue). Past rows stay
    // read-only regardless of the local expanded state.
    setExpanded(!collapsible);
  }, [collapsible]);
  const showControls = !isPast && expanded;
  const isEhr = med.source === 'ehr';
  const badgeColor = isEhr ? (colors.primary as string) : (colors.tint as string);
  const badgeLabel = isEhr ? 'From your records' : 'Added by you';
  const needsRefill = med.supply?.needsRefill === true;
  const daysLeft = daysUntil(med.supply?.runOutDate ?? null);
  // COS-372: form-derived display (only surfaced when MED_FORMS_ENABLED).
  const isInjectable = normalizeForm(med.form) === 'injectable';
  const formTag = formTagLabel(med.form);
  /**
   * Caption for past-section rows.
   *
   * BUG #12.2/#12.3 (Ken 2026-08-07): distinguish a real DISCONTINUE
   * from a legacy HIDE. Ken saw meds he had merely hidden appear as
   * "Discontinued <date>" — clinically misleading, and the date shown
   * was the last time he touched anything (the BE fell back to
   * overlay.updatedAt). The BE now only sets discontinuedAt on an
   * explicit discontinue and flags legacy hides with `hidden`.
   */
  const pastCaption = React.useMemo(() => {
    if (!isPast) return null;
    // BUG #12.1 — the health system reported this course as finished. Say
    // so explicitly; the patient did not do this, and conflating the two
    // would misrepresent their own record back to them.
    if (med.endedInEhr && !med.discontinuedAt) {
      return 'Ended — reported by your health records';
    }
    if (med.hidden && !med.discontinuedAt) {
      return 'Hidden from your list — tap Restore to bring it back';
    }
    if (!med.discontinuedAt) return null;
    const d = new Date(med.discontinuedAt);
    if (Number.isNaN(d.getTime())) return null;
    return `Discontinued ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [isPast, med.discontinuedAt, med.hidden, med.endedInEhr]);
  // Kept for the descriptive block's existing prop name.
  const discontinuedLabel = pastCaption;

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

  // CHUNK 99 v2 — Composed VoiceOver / TalkBack label for the whole card. See
  // composeMedA11yLabel above for the sentence shape and fallback rules.
  //
  // v1 put accessible={true} + this label on the OUTER card View, which on
  // iOS/Android collapses the card into a single AT leaf and subsumes the
  // Edit / Hide / Track switch / Update supply / Snooze controls — a swipe
  // through the card could not reach any of them. v2 moves the accessibility
  // grouping to a NEW inner View that wraps ONLY the passive descriptive
  // block (name / dose+frequency / times / badges). Each interactive control
  // (Edit Pressable, Hide Pressable, Track adherence Switch, Update supply
  // Pressable, Snooze Pressable) stays OUTSIDE that inner grouping as a
  // sibling inside the outer card, so each remains individually swipe-
  // focusable with its own accessibilityLabel. The refill banner / supply
  // summary Text / Track-adherence label Text remain marked
  // accessibilityElementsHidden + importantForAccessibility
  // "no-hide-descendants" — the composed label already narrates refill and
  // supply state, so those visual lines stay silent to AT.
  const composedA11yLabel = composeMedA11yLabel(med);

  // The scannable half of the class mark: a thin edge down the left of
  // psychiatric rows. The word in the meta row says WHAT it is; this is what
  // lets someone find them without reading. Medical rows get nothing, because
  // 'medical' is a default rather than something we detected.
  const isPsychRow = classifyMedication(med) === 'psychiatric';

  return (
    <View
      style={[
        styles.card,
        flush ? { marginHorizontal: 0 } : null,
        {
          backgroundColor: (colors.card as string) + 'D9',
          borderColor: colors.border,
          // Ken 2026-08-06 — past-section rows read as "history", not
          // active concerns. Lower the overall opacity so they visually
          // recede while staying legible for a review.
          opacity: isPast ? 0.72 : 1,
        },
        isPsychRow ? { borderLeftWidth: 3, borderLeftColor: PSYCH_TINT } : null,
      ]}
    >
      {/*
        Ken 2026-08-06 — tap-to-expand for Active-section rows. When
        `collapsible` is true (Active + not currently editing), the
        descriptive block (icon + name + dose + times + badges) becomes
        a Pressable that toggles the controls block below. Collapsed
        card shows only the passive descriptive text + a chevron;
        expanded card shows Edit / Hide + Track adherence + Supply
        actions exactly as before. Past-section rows are read-only
        (isPast → showControls always false, no chevron, no Pressable
        wrap) since restore is a separate flow.
       */}
      <View style={styles.cardTopRow}>
        {/* DIRECTION D'S MONOGRAM. A solid tile carrying the medication's
            initial, replacing the tinted pill glyph that used to sit here.
            THE SAME TILE, restyled — not an extra one. Adding a second was
            what crushed the text last time.

            The hue is decorative and I argued against it earlier, on the
            grounds that six hash-picked colours compete with the two that
            carry meaning. D defuses that: psychiatric is now a LABELLED CHIP
            in the row below, so the class has its own channel and the tile is
            free to be identity. Two medications starting with the same letter
            still get the same colour — the tile aids recognition, it does not
            encode anything, and nothing on this screen depends on reading it. */}
        <View style={[styles.medIcon, { backgroundColor: monogramHue(med.name) }]}>
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: getScaledFontSize(19),
              fontWeight: getScaledFontWeight(700) as any,
            }}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          >
            {(med.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        {/* CHUNK 99 v2: inner accessibility grouping is the single a11y leaf
            for the passive descriptive text. Wrapping in a Pressable when
            collapsible keeps the grouping semantics intact (Pressable is
            focusable as a button, so AT gets one "expand medication card"
            action instead of three separate leaves) — the Edit / Hide
            Pressables remain siblings and stay individually focusable when
            expanded. */}
        {collapsible ? (
          <Pressable
            style={{ flex: 1, minWidth: 0 }}
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={composedA11yLabel}
            accessibilityHint={expanded ? 'Collapse controls' : 'Expand to edit or remove this medication'}
            accessibilityState={{ expanded }}
          >
            <MedicationCardDescriptive
              med={med}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              badgeColor={badgeColor}
              badgeLabel={badgeLabel}
              isEhr={isEhr}
              isInjectable={isInjectable}
              formTag={formTag}
              discontinuedLabel={discontinuedLabel}
              compact={isPast && !expanded}
            />
          </Pressable>
        ) : (
          <View
            style={{ flex: 1, minWidth: 0 }}
            accessible={true}
            accessibilityLabel={composedA11yLabel}
          >
            <MedicationCardDescriptive
              med={med}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              badgeColor={badgeColor}
              badgeLabel={badgeLabel}
              isEhr={isEhr}
              isInjectable={isInjectable}
              formTag={formTag}
              discontinuedLabel={discontinuedLabel}
            />
          </View>
        )}
        {/* BUG #12.3 FIX (Ken 2026-08-07) — Past rows get a RESTORE control.
            Ken: "One active medication was placed in past medications. Tried
            to add back. Buggy."

            Past rows previously rendered with showControls=false and NO
            actions at all. The per-card Restore Pressable had been deleted
            in CHUNK 52.2 on the reasoning that the server dropped hidden
            meds from the response, so no card could ever mount for one —
            true THEN, but no longer true once ?includePast=1 started
            surfacing them. The only surviving unremove path was the
            session-local amber "recently hidden" banner, which is populated
            only by a remove performed in the CURRENT session and is wiped on
            relaunch. A med hidden yesterday was therefore permanently
            unreachable. This restores the direct path. */}
        {isPast && med.endedInEhr !== true ? (
          <Pressable
            onPress={onRestore}
            disabled={busy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Restore ${med.name} to your active medications`}
            style={({ pressed }) => [
              styles.cardRestorePill,
              {
                backgroundColor: (colors.tint as string) + '1A',
                borderColor: (colors.tint as string) + '55',
                opacity: pressed || busy ? 0.6 : 1,
              },
            ]}
          >
            <MaterialIcons name="undo" size={getScaledFontSize(15)} color={colors.tint as string} />
            <Text
              style={{
                color: colors.tint as string,
                fontSize: getScaledFontSize(12),
                fontWeight: getScaledFontWeight(700) as any,
                marginLeft: 4,
              }}
            >
              Restore
            </Text>
          </Pressable>
        ) : null}
        {showControls ? (
          <>
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
          </>
        ) : collapsible ? (
          // Ken 2026-08-07: "When I went to edit it took a few presses for the
          // box to drop down."
          //
          // The chevron was a bare <MaterialIcons> — the one element on the
          // row that LOOKS like the expand control was the one element that
          // wasn't tappable. Only the descriptive text block to its left
          // toggled the card, so a finger aimed at the chevron (or at the
          // empty gutter beside it) did nothing, and it took repeated
          // presses to accidentally land on the text.
          //
          // Now the chevron toggles too. Marked accessibilityElementsHidden
          // because the text block already exposes ONE "expand medication
          // card" action to VoiceOver — adding a second focusable control
          // that does exactly the same thing would make AT users hear the
          // card twice (the chunk-99-v2 grouping rule).
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            hitSlop={12}
            style={styles.iconBtn}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <MaterialIcons
              name={expanded ? 'expand-less' : 'expand-more'}
              size={getScaledFontSize(22)}
              color={colors.subtext}
            />
          </Pressable>
        ) : null}
      </View>

      {/* Refill banner.
          CHUNK 99: hidden from AT — refill status is already in the card's
          composed accessibilityLabel. Visual banner unchanged.
          Ken 2026-08-06: gated on showControls so collapsed Active rows
          + all Past rows don't surface a refill nag for a med the user
          isn't currently reviewing. */}
      {showControls && needsRefill ? (
        <View
          style={[styles.refillBanner, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B' }]}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        >
          <MaterialIcons name="warning-amber" size={getScaledFontSize(16)} color="#B45309" />
          <Text style={{ flex: 1, marginLeft: 8, color: '#92400E', fontSize: getScaledFontSize(12), lineHeight: getScaledFontSize(18) }}>
            {daysLeft != null
              ? `Running low — about ${daysLeft} day${daysLeft === 1 ? '' : 's'} left, time to refill.`
              : 'Running low — time to refill.'}
          </Text>
        </View>
      ) : null}

      {/* Supply summary line.
          CHUNK 99: hidden from AT — supply detail is subsumed by the
          composed card label. Visual line unchanged.
          Ken 2026-08-06: same gate as the refill banner above. */}
      {showControls && med.supply && (med.supply.remainingQuantity != null || med.supply.dosesPerDay != null) ? (
        <Text
          style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 8 }}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        >
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

      {/* SCRUM-674b — "About this medication", straight off the FDA label.
          Only on an EXPANDED row: it is reference material a patient goes
          looking for, not something to push into a list they are scanning.
          Renders nothing at all when the lookup finds nothing, which today is
          always — the endpoint is dark behind drug_label_lookup_enabled. */}
      {showControls && med.name ? (
        <DrugLabelFactsBlock
          name={med.name}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
      ) : null}

      {/* Action row: track toggle + supply / refill actions.
          Ken 2026-08-06: full block gated on showControls — collapsed
          Active rows + all Past rows omit it entirely. */}
      {showControls && (
      <View style={styles.cardActions}>
        <View style={styles.trackToggle}>
          {/* CHUNK 99: "Track adherence" is the visual label for the Switch
              beside it. The Switch itself has accessibilityLabel="Track
              adherence for {name}", so this Text is redundant to AT and is
              hidden to keep the card's composed label the sole utterance
              until the user swipes forward to interactive controls. */}
          <Text
            style={{ color: colors.text, fontSize: getScaledFontSize(13), marginRight: 8 }}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          >
            Track adherence
          </Text>
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
      )}

      {showControls && (
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
      )}

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
  // BUG #12.4 — inline validation message for the times field so a bad
  // token is attributed to the right input instead of surfacing as a
  // generic "Couldn't save that change" after a server 400.
  const [timesError, setTimesError] = React.useState<string | null>(null);
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
    // BUG #12.4 (Ken 2026-08-07) — validate + normalize times BEFORE
    // sending. The backend's schema is strict `HH:mm` inside a
    // `.strict()` body, so one loose token ("8am", "8:00") used to 400
    // the entire request and silently drop the whole medication. Now we
    // normalize what we can and tell the user precisely what we can't,
    // instead of failing the save with a generic error.
    const { times, invalid } = parseTimesDetailed(timesRaw);
    if (invalid.length > 0) {
      setTimesError(
        invalid.length === 1
          ? `"${invalid[0]}" isn't a time we recognise. Try 8:00, 8am, or 20:00.`
          : `These aren't times we recognise: ${invalid.map((v) => `"${v}"`).join(', ')}. Try 8:00, 8am, or 20:00.`,
      );
      return;
    }
    setTimesError(null);
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
              <FieldLabel text="Times (comma-separated)" colors={colors} getScaledFontSize={getScaledFontSize} />
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    // BUG #12.4 — red border when the field is the reason
                    // the save was blocked.
                    borderColor: timesError ? '#DC2626' : colors.text + '30',
                    fontSize: getScaledFontSize(16),
                  },
                ]}
                value={timesRaw}
                onChangeText={(v) => { setTimesRaw(v); if (timesError) setTimesError(null); }}
                placeholder="e.g. 8am, 8:00, 20:00"
                placeholderTextColor={colors.text + '40'}
                autoCapitalize="none"
              />
              {timesError ? (
                <Text
                  style={{ color: '#DC2626', fontSize: getScaledFontSize(12), marginTop: 6 }}
                  accessibilityLiveRegion="polite"
                >
                  {timesError}
                </Text>
              ) : (
                /* BUG #12.5 (Ken 2026-08-07) — "did not show up on this
                   page in daily plan". A medication with NO times never
                   generates a daily task (medicationTasksForDate skips
                   `times.length === 0`), and nothing told the patient
                   that. Make the consequence explicit at the point of
                   entry rather than leaving them to discover it. */
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 6 }}>
                  {timesRaw.trim().length === 0
                    ? 'Add a time to see this medication in your daily plan.'
                    : 'These times drive your daily plan reminders.'}
                </Text>
              )}
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
  // A dot, not a boxed glyph. The class is a footnote-level fact; giving it a
  // filled tile put it at the same weight as the drug name.
  classDot: { width: 6, height: 6, borderRadius: 3 },
  // WRAPS: four dose times fit one line, but not at a large accessibility
  // text size, and clipping a dose time is not an option.
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  timeChip: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  // Separates what the patient DOES from where the row came from.
  cardRule: { height: StyleSheet.hairlineWidth, marginTop: 12, opacity: 0.9 },
  supplyBlock: { marginTop: 10 },
  supplyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Fixed 6pt and never font-scaled: it carries no text, and a bar that grew
  // with the type size would dominate the card at large accessibility sizes.
  supplyTrack: { height: 6, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  // Wraps rather than truncates: at large accessibility text sizes these
  // three fragments will not fit one line, and clipping provenance is worse
  // than letting it run on.
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, flexWrap: 'wrap' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 8 },
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
    width: 46,
    height: 46,
    borderRadius: 15,
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
  // BUG #12.3 (Ken 2026-08-07) — Restore affordance on Past-section CARDS.
  // Distinct from `restorePill` above, which belongs to the session-local
  // "recently hidden" banner and has no border/min-height.
  cardRestorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 8,
    minHeight: 36,
  },
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
