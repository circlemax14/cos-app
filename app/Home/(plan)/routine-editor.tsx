/**
 * Routine editor sheet (COS-475, Phase 6.4).
 *
 * Create / edit / delete a RoutineRow. When id is present, hydrates
 * from the useRoutines cache and sends If-Match on PATCH.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useRoutines } from '@/hooks/use-routines';
import { getTodayLocalDate } from '@/lib/plan-v2/patient-local-date';
import {
  createRoutine,
  deleteRoutine,
  updateRoutine,
  type WrappedApiError,
} from '@/services/api/ai-health-plan';
import type {
  BpsDomain,
  CreateRoutineBody,
  TaskRecurrence,
  TaskType,
  UpdateRoutineBody,
} from '@/services/api/types';

const RECURRENCE_OPTIONS: readonly TaskRecurrence[] = ['daily', 'weekdays', 'weekly', 'once'];
const BPS_OPTIONS: readonly BpsDomain[] = ['bio', 'psy', 'soc', 'spi'];
const TYPE_OPTIONS: readonly TaskType[] = ['reminder', 'exercise', 'appointment', 'medication'];

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isBpsDomain(v: string | undefined): v is BpsDomain {
  return v === 'bio' || v === 'psy' || v === 'soc' || v === 'spi';
}

export default function RoutineEditorSheet(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    id?: string;
    bpsDomain?: string;
    prefillTitle?: string;
  }>();

  const editingId = typeof params.id === 'string' ? params.id : null;
  const { routines } = useRoutines();
  const existing = useMemo(
    () => (editingId ? routines.find((r) => r.id === editingId) ?? null : null),
    [editingId, routines],
  );

  const initialBpsDomain: BpsDomain = isBpsDomain(params.bpsDomain)
    ? params.bpsDomain
    : (existing?.bpsDomain ?? 'bio');

  const [title, setTitle] = useState<string>(existing?.title ?? params.prefillTitle ?? '');
  const [description, setDescription] = useState<string>(existing?.description ?? '');
  const [scheduledTime, setScheduledTime] = useState<string>(existing?.scheduledTime ?? '09:00');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(existing?.recurrence ?? 'daily');
  const [startDate, setStartDate] = useState<string>(existing?.startDate ?? getTodayLocalDate());
  const [type, setType] = useState<TaskType>(existing?.type ?? 'reminder');
  const [bpsDomain, setBpsDomain] = useState<BpsDomain>(initialBpsDomain);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!editingId && !!existing;

  const validate = useCallback((): string | null => {
    if (!title.trim()) return 'Title is required';
    if (title.length > 120) return 'Title must be 120 characters or fewer';
    if (!HHMM_RE.test(scheduledTime)) return 'Time must be HH:mm (e.g. 09:00)';
    if (!DATE_RE.test(startDate)) return 'Start date must be YYYY-MM-DD';
    return null;
  }, [title, scheduledTime, startDate]);

  const onSubmit = useCallback(async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit && existing) {
        const patch: UpdateRoutineBody = {
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledTime,
          recurrence,
          startDate,
          type,
          bpsDomain,
        };
        await updateRoutine(existing.id, patch, { ifMatch: existing.updatedAt });
      } else {
        const body: CreateRoutineBody = {
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledTime,
          recurrence,
          startDate,
          type,
          bpsDomain,
        };
        await createRoutine(body);
      }
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      router.back();
    } catch (err) {
      const code = (err as WrappedApiError)?.code;
      if (code === 'ROUTINE_STALE') {
        setError('Someone else changed this routine — reopen and try again');
      } else if (code === 'ROUTINES_LIMIT_EXCEEDED') {
        setError("You've reached the routines limit — archive one to add another");
      } else {
        setError((err as Error)?.message ?? 'Failed to save routine');
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    isEdit,
    existing,
    title,
    description,
    scheduledTime,
    recurrence,
    startDate,
    type,
    bpsDomain,
    queryClient,
    validate,
  ]);

  const onDelete = useCallback(async () => {
    if (!existing) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteRoutine(existing.id);
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      router.back();
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to delete routine');
    } finally {
      setDeleting(false);
    }
  }, [existing, queryClient]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background, flex: 1 }}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <FieldLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
        Title
      </FieldLabel>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. 15-minute walk after dinner"
        placeholderTextColor={colors.subtext}
        style={inputStyle(colors)}
        maxLength={120}
        testID="plan-v2-routine-title"
      />

      <FieldLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
        Description
      </FieldLabel>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Optional details"
        placeholderTextColor={colors.subtext}
        multiline
        style={[inputStyle(colors), { minHeight: 80, textAlignVertical: 'top' }]}
        maxLength={400}
      />

      <FieldLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
        Time (HH:mm)
      </FieldLabel>
      <TextInput
        value={scheduledTime}
        onChangeText={setScheduledTime}
        placeholder="09:00"
        placeholderTextColor={colors.subtext}
        keyboardType="numbers-and-punctuation"
        style={inputStyle(colors)}
        maxLength={5}
      />

      <FieldLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
        Start date (YYYY-MM-DD)
      </FieldLabel>
      <TextInput
        value={startDate}
        onChangeText={setStartDate}
        placeholder="2026-07-20"
        placeholderTextColor={colors.subtext}
        style={inputStyle(colors)}
        maxLength={10}
      />

      <FieldLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
        Recurrence
      </FieldLabel>
      <SegmentedRow
        value={recurrence}
        onChange={(v) => setRecurrence(v)}
        options={[...RECURRENCE_OPTIONS]}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
      />

      <FieldLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
        Type
      </FieldLabel>
      <SegmentedRow
        value={type}
        onChange={(v) => setType(v)}
        options={[...TYPE_OPTIONS]}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
      />

      <FieldLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
        Biopsychosocial domain
      </FieldLabel>
      <SegmentedRow
        value={bpsDomain}
        onChange={(v) => setBpsDomain(v)}
        options={[...BPS_OPTIONS]}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
      />

      {error ? (
        <Text
          style={{
            color: (colors as unknown as { error?: string }).error ?? '#DC2626',
            fontSize: getScaledFontSize(12),
            marginTop: Spacing.sm,
          }}
        >
          {error}
        </Text>
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={({ pressed }) => [
            styles.btn,
            styles.btnSecondary,
            { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
          ]}
          disabled={submitting || deleting}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
            }}
          >
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel={isEdit ? 'Save changes' : 'Create routine'}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
          disabled={submitting || deleting}
          testID="plan-v2-routine-submit"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              {isEdit ? 'Save' : 'Create'}
            </Text>
          )}
        </Pressable>
      </View>

      {isEdit && !confirmingDelete ? (
        <Pressable
          onPress={() => setConfirmingDelete(true)}
          accessibilityRole="button"
          accessibilityLabel="Delete routine"
          style={{ marginTop: Spacing.md, alignItems: 'center' }}
          disabled={submitting || deleting}
        >
          <Text
            style={{
              color: (colors as unknown as { error?: string }).error ?? '#DC2626',
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
            }}
          >
            Delete routine
          </Text>
        </Pressable>
      ) : null}

      {isEdit && confirmingDelete ? (
        <View
          style={[
            styles.confirmStrip,
            { borderColor: (colors as unknown as { error?: string }).error ?? '#DC2626', backgroundColor: ((colors as unknown as { error?: string }).error ?? '#DC2626') + '14' },
          ]}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(12),
              flex: 1,
            }}
          >
            Delete this routine? It will be archived.
          </Text>
          <Pressable
            onPress={() => setConfirmingDelete(false)}
            accessibilityRole="button"
            accessibilityLabel="Keep routine"
            style={styles.confirmBtn}
            disabled={deleting}
          >
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>Keep</Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Confirm delete"
            style={[styles.confirmBtn, { backgroundColor: (colors as unknown as { error?: string }).error ?? '#DC2626' }]}
            disabled={deleting}
            testID="plan-v2-routine-confirm-delete"
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: getScaledFontSize(12),
                  fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                }}
              >
                Delete
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function FieldLabel({
  children,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  children: React.ReactNode;
  colors: typeof Colors.light;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}): React.JSX.Element {
  return (
    <Text
      style={{
        color: colors.subtext,
        fontSize: getScaledFontSize(11),
        fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginTop: Spacing.md,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

function SegmentedRow<T extends string>({
  value,
  onChange,
  options,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  value: T;
  onChange: (next: T) => void;
  options: T[];
  colors: typeof Colors.light;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.segment,
              {
                borderColor: selected ? colors.tint : colors.border,
                backgroundColor: selected ? (colors.tint as string) + '1F' : 'transparent',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: selected ? colors.tint : colors.text,
                fontSize: getScaledFontSize(12),
                fontWeight: getScaledFontWeight(selected ? 700 : 500) as TextStyle['fontWeight'],
              }}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function inputStyle(colors: typeof Colors.light) {
  return {
    borderWidth: 1,
    borderRadius: Radii.md,
    borderColor: colors.border,
    color: colors.text,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  } as const;
}

const styles = StyleSheet.create({
  buttonRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  btnSecondary: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  segment: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  confirmStrip: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confirmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
