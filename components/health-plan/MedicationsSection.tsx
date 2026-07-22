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

  // Open the add flow when the parent bumps openAddSignal (skip the initial 0).
  const lastOpenSignal = React.useRef(0);
  React.useEffect(() => {
    if (openAddSignal > 0 && openAddSignal !== lastOpenSignal.current) {
      lastOpenSignal.current = openAddSignal;
      setEditor({ kind: 'add' });
    }
  }, [openAddSignal]);

  // Flag gate — render NOTHING until the server explicitly enables the
  // feature. Off-by-default for back-compat and while the query is loading.
  if (!query.data?.flagEnabled) {
    return null;
  }

  const medications = query.data.medications;

  const onRemove = (med: Medication) => {
    updateMutation.mutate({ remove: [med.id] });
  };
  const onUnremove = (id: string) => {
    updateMutation.mutate({ unremove: [id] });
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
          onPress={() => setEditor({ kind: 'add' })}
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

      {/* Inline error (mutation failures) — non-blocking */}
      {updateMutation.isError ? (
        <View style={[styles.errorBox, { borderColor: '#DC2626', backgroundColor: '#FEE2E2' }]}>
          <MaterialIcons name="error-outline" size={getScaledFontSize(16)} color="#991B1B" />
          <Text style={{ color: '#991B1B', flex: 1, fontSize: getScaledFontSize(12), marginLeft: 6 }}>
            Couldn&apos;t save that change. Please try again.
          </Text>
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
            onUnremove={() => onUnremove(med.id)}
            onToggleTracked={() => onToggleTracked(med)}
            onUpdateSupply={() => setSupplyEditor({ med })}
            onSnooze={() => onSnooze(med)}
          />
        ))
      )}

      {/* Add / Edit modal */}
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

      {/* Supply / refill modal */}
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
  onUnremove,
  onToggleTracked,
  onUpdateSupply,
  onSnooze,
}: ThemeProps & {
  med: Medication;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onUnremove: () => void;
  onToggleTracked: () => void;
  onUpdateSupply: () => void;
  onSnooze: () => void;
}): React.JSX.Element {
  const isEhr = med.source === 'ehr';
  const badgeColor = isEhr ? (colors.primary as string) : (colors.tint as string);
  const badgeLabel = isEhr ? 'From your records' : 'Added by you';
  const needsRefill = med.supply?.needsRefill === true;
  const daysLeft = daysUntil(med.supply?.runOutDate ?? null);
  // COS-372: form-derived display (only surfaced when MED_FORMS_ENABLED).
  const isInjectable = normalizeForm(med.form) === 'injectable';
  const formTag = formTagLabel(med.form);

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
        <Pressable
          onPress={onRemove}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Hide ${med.name}`}
          style={styles.iconBtn}
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

      {/* Un-hide affordance only matters right after a remove; the list
          re-fetches and drops removed meds, so this stays simple — an EHR
          med that was removed can be re-added via the same backend by
          un-removing if the server still returns it. Kept lightweight. */}
      {med.source === 'ehr' ? (
        <Pressable
          onPress={onUnremove}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Restore ${med.name} if you hid it`}
          style={{ marginTop: 6, alignSelf: 'flex-start' }}
          hitSlop={6}
        >
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), textDecorationLine: 'underline' }}>
            Hid this by mistake? Restore
          </Text>
        </Pressable>
      ) : null}
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
        <View style={[styles.modalSheet, { backgroundColor: (colors.card as string) + 'F8', borderColor: colors.border }]}>
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
        <View style={[styles.modalSheet, { backgroundColor: (colors.card as string) + 'F8', borderColor: colors.border }]}>
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
