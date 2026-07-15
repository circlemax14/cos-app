/**
 * MeasurementHistoryList (Chunk 1c · COS-450 / SCRUM-588).
 *
 * Read-only chronological list of a measurable task's recent
 * TaskMeasurement entries. Rendered inside TaskDetailModal below
 * MeasurementLogInput. Sorts most-recent first and caps at `limit`
 * (default 10) so the modal stays scannable without pagination.
 *
 * Handles two payload shapes, matched to the metric.key:
 *   - blood_pressure → { systolic, diastolic } → "120/80"
 *   - every other preset + custom → { value } → "72"
 * A defensive fallback stringifies unknown Record shapes so a shape
 * drift in cos-backend never crashes the modal.
 *
 * Renders a "No measurements yet." empty state so the parent can
 * mount this unconditionally.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TextStyle } from 'react-native';

import type { TaskMeasurement, TaskMetric } from '@/services/api/types';

type ColorMap = Record<string, string>;

export interface MeasurementHistoryListProps {
  measurements: TaskMeasurement[];
  metric?: TaskMetric;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string | number;
  /** Max entries to render. Default 10. */
  limit?: number;
}

// TaskMeasurement.value is Record<string, number|string>; shape varies by metric.key.
// BP → { systolic, diastolic }; all other presets + custom → { value }.
function formatValue(m: TaskMeasurement): string {
  const v = (m.value ?? {}) as Record<string, number | string>;
  if ('systolic' in v && 'diastolic' in v) return `${v.systolic}/${v.diastolic}`;
  if ('value' in v) return String(v.value);
  return Object.entries(v)
    .map(([k, val]) => `${k}: ${val}`)
    .join(', ');
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} ${time}`;
}

export function MeasurementHistoryList({
  measurements,
  metric,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  limit = 10,
}: MeasurementHistoryListProps): React.JSX.Element {
  const sorted = React.useMemo(() => {
    const arr = Array.isArray(measurements) ? measurements.slice() : [];
    arr.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return arr.slice(0, limit);
  }, [measurements, limit]);

  const unit = metric?.unit;

  return (
    <View>
      <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>
        HISTORY
      </Text>
      {sorted.length === 0 ? (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            fontStyle: 'italic',
          }}
        >
          No measurements yet.
        </Text>
      ) : (
        sorted.map((m, i) => (
          <View
            key={`${m.timestamp}-${i}`}
            style={[styles.row, { borderBottomColor: colors.border }]}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              {formatValue(m)}
              {unit ? ` ${unit}` : ''}
            </Text>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12) }}>
              {formatWhen(m.timestamp)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
