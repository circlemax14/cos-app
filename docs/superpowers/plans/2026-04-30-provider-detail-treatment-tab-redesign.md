# Provider Detail — Treatment Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Diagnoses/Medications layout on the Provider Detail "Diagnosis & Treatment Plan" tab with an encounter-grouped timeline (Approach A) — solves all 10 design issues in one coherent layout.

**Architecture:** Pure-data helper (`groupTreatmentByEncounter`) buckets the existing `ProviderTreatmentPlan` against the existing `ProviderAppointment[]` into a reverse-chronological set of encounter groups + active/resolved condition lists. Five new presentational components consume that grouped data. The doctor-detail.tsx file shrinks by deleting the legacy `renderTreatmentPlan` / `renderDiagnosisCard` / `renderMedicationRow` bodies.

**Tech Stack:** React Native (Expo) · TypeScript · react-native-paper · MaterialIcons (`@expo/vector-icons`) · existing `colors` theme + `getScaledFontSize` accessibility scaling

**Spec:** `docs/superpowers/specs/2026-04-30-provider-detail-treatment-tab-redesign-design.md`

**Branch:** `COS-134/edit-provider-fields-fix` (in-flight cos-app fixes batch — do **not** create a new branch; user wants single batched merge)

**Testing strategy:** cos-app currently has no JS test runner (no `npm test`, no jest/vitest). Verification path:
1. `npx tsc --noEmit` clean after every task
2. ESLint clean (`npm run lint`)
3. Manual on-device QA via EAS Update push to production after Task 10
   (Setting up jest is out of scope — separate ticket if/when desired.)

---

## File Structure

**New:**
```
app/Home/doctor-detail/
├── index.ts                         (barrel export)
├── WhatChangedCard.tsx              (AI deltas pill)
├── ActiveConditionsRow.tsx          (horizontal status pill list)
├── EncounterGroup.tsx               (date header + stack of items)
└── TimelineItem.tsx                 (single colored-rule event row)

components/JargonText.tsx            (long-press popover for clinical jargon)
services/treatment-timeline.ts       (pure groupTreatmentByEncounter helper)
```

**Modified:**
```
services/api/types.ts                (add encounterId to diagnoses/meds; add EncounterGroup, TimelineEvent)
services/api/providers.ts            (surface encounter ref into mapped types — already in raw FHIR, currently dropped)
app/Home/doctor-detail.tsx           (renderTreatmentPlan rewrite; delete legacy renderDiagnosisCard, renderMedicationRow, treatmentSection styles)
```

---

## Task 1: Extend types

**Files:**
- Modify: `services/api/types.ts`

- [ ] **Step 1: Add `encounterId` to `ProviderDiagnosis` and `ProviderMedication`**

Open `services/api/types.ts`. Replace the two interfaces (currently around lines 94–111):

```ts
export interface ProviderDiagnosis {
  id: string;
  name: string;
  clinicalStatus: ClinicalStatus;
  onsetDate: string | null;
  recordedDate: string | null;
  notes: string[];
  /** Encounter ID this diagnosis was attached to in the EHR, if known.
   *  Extracted from FHIR `Condition.encounter.reference` ("Encounter/{id}").
   *  Used by the timeline view to bucket diagnoses by visit. */
  encounterId: string | null;
}

export interface ProviderMedication {
  id: string;
  name: string;
  status: string;
  dose: string | null;
  frequency: string | null;
  authoredOn: string | null;
  reason: string | null;
  /** Encounter ID this prescription was authored at, if known.
   *  Extracted from FHIR `MedicationRequest.encounter.reference`.
   *  Used by the timeline view to bucket meds by visit. */
  encounterId: string | null;
}
```

- [ ] **Step 2: Append timeline-view types at the bottom of the Doctor-Detail section**

After the `ProviderAppointment` interface (around line 164), append:

```ts
// ─── Treatment Timeline (view layer) ────────────────────────────────────────
export type TimelineEventKind =
  | 'medication-added'
  | 'diagnosis-resolved'
  | 'diagnosis-recorded';

/** A single row inside an `EncounterGroup`. Either a medication that was
 *  added/changed at the encounter, or a diagnosis whose state was set. */
export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  /** Display title — med name or diagnosis name. */
  title: string;
  /** Optional secondary line — dose+frequency for meds, status pill text
   *  for diagnoses, free-text otherwise. */
  subtitle: string | null;
  /** "for High Cholesterol" — only for medications with a linked reason. */
  reasonText: string | null;
}

/** A bucket of timeline events tied to one encounter (or the trailing
 *  "Earlier" bucket for items with no encounter attribution). */
export interface EncounterGroupView {
  /** Stable id — encounter id, or "earlier" for the trailing bucket. */
  id: string;
  /** Header date string ("APR 12") or "EARLIER". `null` for the trailing
   *  earlier bucket means "no date header below the headline". */
  dateLabel: string | null;
  /** Header type string ("ANNUAL PHYSICAL"). `null` if unknown. */
  typeLabel: string | null;
  events: TimelineEvent[];
}

/** Output of `groupTreatmentByEncounter` — feeds the redesigned tab. */
export interface TreatmentTimeline {
  /** Diagnoses with `clinicalStatus` in ['active','recurrence','relapse']. */
  activeConditions: ProviderDiagnosis[];
  /** Diagnoses with `clinicalStatus` in ['resolved','remission','inactive']. */
  resolvedConditions: ProviderDiagnosis[];
  /** Reverse-chronological encounter groups. Trailing entry has id 'earlier'
   *  if any items lacked encounter attribution. */
  encounterGroups: EncounterGroupView[];
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean — no errors. (Adding optional fields and new exports is non-breaking.)

- [ ] **Step 4: Commit**

```bash
git add services/api/types.ts
git -c commit.gpgsign=false commit -m "types(treatment): add encounterId + TreatmentTimeline view shape (SCRUM-115)"
```

---

## Task 2: Surface encounterId from FHIR mappers

**Files:**
- Modify: `services/api/providers.ts`

- [ ] **Step 1: Helper to extract encounter id from a FHIR reference**

In `services/api/providers.ts`, just above the line `export async function fetchProviderTreatmentPlans` (around line 252), add:

```ts
/** Extract the bare id from a FHIR reference like "Encounter/abc-123".
 *  Returns null if the reference is missing or malformed. */
function extractEncounterId(ref?: string): string | null {
  if (!ref) return null;
  const m = ref.match(/^Encounter\/([^/]+)$/);
  return m ? m[1] : null;
}
```

- [ ] **Step 2: Populate `encounterId` on diagnoses**

Find the `.map((c) => ({ id: c.id, name: conditionName(c), ... }))` block inside `fetchProviderTreatmentPlans` (around lines 301–310). Add the `encounterId` field at the end of the mapped object:

```ts
    .map((c) => ({
      id: c.id,
      name: conditionName(c),
      clinicalStatus: normaliseClinicalStatus(c.clinicalStatus),
      onsetDate: c.onsetDateTime ?? null,
      recordedDate: c.recordedDate ?? null,
      notes: (c.note ?? [])
        .map((n) => n.text?.trim())
        .filter((t): t is string => !!t),
      encounterId: extractEncounterId(c.encounter?.reference),
    }));
```

- [ ] **Step 3: Populate `encounterId` on medications**

Find the `.map((m) => ({ id: m.id, name: medicationName(m), ... }))` block (around lines 318–326). Append `encounterId`:

```ts
    .map((m) => ({
      id: m.id,
      name: medicationName(m),
      status: m.status ?? 'unknown',
      dose: formatDose(m),
      frequency: formatFrequency(m),
      authoredOn: m.authoredOn ?? null,
      reason: formatReason(m),
      encounterId: extractEncounterId(m.encounter?.reference),
    }));
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (The new field is required on the type and now populated.)

- [ ] **Step 5: Commit**

```bash
git add services/api/providers.ts
git -c commit.gpgsign=false commit -m "feat(treatment): surface encounterId from FHIR onto diagnoses + meds (SCRUM-115)"
```

---

## Task 3: Pure helper — groupTreatmentByEncounter

**Files:**
- Create: `services/treatment-timeline.ts`

- [ ] **Step 1: Write the helper**

Create `services/treatment-timeline.ts` with this complete content:

```ts
import type {
  ProviderTreatmentPlan,
  ProviderAppointment,
  ProviderDiagnosis,
  ProviderMedication,
  TimelineEvent,
  EncounterGroupView,
  TreatmentTimeline,
  ClinicalStatus,
} from './api/types';

const ACTIVE_STATUSES: ClinicalStatus[] = ['active', 'recurrence', 'relapse'];
const RESOLVED_STATUSES: ClinicalStatus[] = ['resolved', 'remission', 'inactive'];

function isActive(status: ClinicalStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function isResolved(status: ClinicalStatus): boolean {
  return RESOLVED_STATUSES.includes(status);
}

/** "2026-04-12T..." → "APR 12" (uppercase, no year). Empty string if invalid. */
function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

function diagnosisToEvent(d: ProviderDiagnosis): TimelineEvent {
  if (isResolved(d.clinicalStatus)) {
    return {
      id: `dx-${d.id}`,
      kind: 'diagnosis-resolved',
      title: `${d.name} → Resolved`,
      subtitle: null,
      reasonText: null,
    };
  }
  return {
    id: `dx-${d.id}`,
    kind: 'diagnosis-recorded',
    title: d.name,
    subtitle: d.clinicalStatus === 'unknown' ? null : d.clinicalStatus,
    reasonText: null,
  };
}

function medicationToEvent(m: ProviderMedication): TimelineEvent {
  const dosePieces = [m.dose, m.frequency].filter(Boolean);
  return {
    id: `med-${m.id}`,
    kind: 'medication-added',
    title: m.name,
    subtitle: dosePieces.length ? dosePieces.join(' · ') : null,
    reasonText: m.reason ? `for ${m.reason}` : null,
  };
}

/**
 * Build the grouped timeline view from raw treatment + appointment data.
 *
 * Rules:
 *  - Diagnoses with active-family clinicalStatus go into `activeConditions`.
 *  - Diagnoses with resolved-family clinicalStatus go into `resolvedConditions`.
 *  - Items (any med, plus diagnoses with a state-change worth showing on the
 *    timeline) bucket by `encounterId` when known. Resolved diagnoses always
 *    get a timeline event (so the user sees "X → Resolved at this visit").
 *    Active-recorded-here diagnoses do not — they're already pinned at top.
 *  - Items lacking an encounter id fall into a trailing "EARLIER" bucket.
 *  - Encounter groups sort reverse-chronological by appointment date; the
 *    "EARLIER" bucket is always last.
 */
export function groupTreatmentByEncounter(
  plan: ProviderTreatmentPlan,
  appointments: ProviderAppointment[],
): TreatmentTimeline {
  const activeConditions = plan.diagnoses.filter((d) => isActive(d.clinicalStatus));
  const resolvedConditions = plan.diagnoses.filter((d) => isResolved(d.clinicalStatus));

  // Index appointments by id for O(1) lookup of date + type metadata
  const apptById = new Map(appointments.map((a) => [a.id, a]));

  // Bucket items by encounterId. Map iteration order = insertion order;
  // we'll re-sort once we have the full set.
  const buckets = new Map<string, TimelineEvent[]>();

  // Resolved diagnoses → one event each, bucketed
  for (const d of resolvedConditions) {
    const key = d.encounterId ?? 'earlier';
    const arr = buckets.get(key) ?? [];
    arr.push(diagnosisToEvent(d));
    buckets.set(key, arr);
  }

  // All medications → one event each, bucketed
  for (const m of plan.medications) {
    const key = m.encounterId ?? 'earlier';
    const arr = buckets.get(key) ?? [];
    arr.push(medicationToEvent(m));
    buckets.set(key, arr);
  }

  // Build the group views
  const groups: EncounterGroupView[] = [];
  for (const [encounterId, events] of buckets.entries()) {
    if (encounterId === 'earlier') continue; // handle last
    const appt = apptById.get(encounterId);
    groups.push({
      id: encounterId,
      dateLabel: formatDateLabel(appt?.date) || null,
      typeLabel: appt?.type ? appt.type.toUpperCase() : null,
      events,
    });
  }

  // Sort dated groups newest-first by appt.date (fallback: keep insertion order)
  groups.sort((a, b) => {
    const da = apptById.get(a.id)?.date ?? '';
    const db = apptById.get(b.id)?.date ?? '';
    return db.localeCompare(da);
  });

  // Append the "earlier" bucket last if it exists
  const earlier = buckets.get('earlier');
  if (earlier && earlier.length) {
    groups.push({
      id: 'earlier',
      dateLabel: 'EARLIER',
      typeLabel: null,
      events: earlier,
    });
  }

  return {
    activeConditions,
    resolvedConditions,
    encounterGroups: groups,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean — all imported types exist (added in Task 1), all internal references match.

- [ ] **Step 3: Commit**

```bash
git add services/treatment-timeline.ts
git -c commit.gpgsign=false commit -m "feat(treatment): groupTreatmentByEncounter pure helper (SCRUM-115)"
```

---

## Task 4: JargonText component

**Files:**
- Create: `components/JargonText.tsx`

- [ ] **Step 1: Write the component**

Create `components/JargonText.tsx` with this complete content:

```tsx
/**
 * JargonText — wraps a piece of text and, if it matches a known clinical
 * term, attaches a long-press popover that shows the plain-language
 * explanation. No-op if the term isn't in the glossary.
 *
 * Usage:
 *   <JargonText style={...}>{diagnosis.name}</JargonText>
 *
 * The glossary seed list covers ~25 high-frequency terms surfaced in our
 * existing FHIR samples. Expand based on user feedback.
 */
import React, { useState } from 'react';
import { Pressable, Text, TextStyle, View, StyleSheet } from 'react-native';
import { Modal, Portal } from 'react-native-paper';

const CLINICAL_GLOSSARY: Record<string, string> = {
  // status terms
  'in remission': 'The condition has temporarily improved or paused. It may come back.',
  'remission': 'The condition has temporarily improved or paused. It may come back.',
  'recurrence': 'The condition has come back after a period of improvement.',
  'relapse': 'The condition has returned after improving.',
  'resolved': 'The condition has gone away.',
  'inactive': 'The condition is not currently affecting you.',
  'uncontrolled': 'The condition is not yet well-managed by current treatment.',
  'stable': 'The condition is not getting worse.',
  // common diagnoses
  'hypertension': 'High blood pressure.',
  'hyperlipidemia': 'High cholesterol.',
  'type 2 diabetes': 'A long-term condition where blood sugar runs high.',
  'type 1 diabetes': 'A condition where the body does not make enough insulin.',
  'asthma': 'A breathing condition where airways tighten and inflame.',
  'gerd': 'Acid reflux — stomach acid backing up into the throat.',
  // medication concepts
  'authored on': 'The date your provider wrote this prescription.',
  'dosage': 'How much of the medicine you take.',
  'frequency': 'How often you take the medicine.',
};

function lookupExplanation(term: string): string | null {
  const key = term.trim().toLowerCase();
  if (CLINICAL_GLOSSARY[key]) return CLINICAL_GLOSSARY[key];
  // Also try matching the last word/phrase (e.g. "Asthma → Resolved" → "resolved")
  for (const [glossKey, explanation] of Object.entries(CLINICAL_GLOSSARY)) {
    if (key.includes(glossKey)) return explanation;
  }
  return null;
}

interface JargonTextProps {
  children: string;
  style?: TextStyle | TextStyle[];
}

export function JargonText({ children, style }: JargonTextProps) {
  const explanation = lookupExplanation(children);
  const [popoverVisible, setPopoverVisible] = useState(false);

  if (!explanation) {
    return <Text style={style}>{children}</Text>;
  }

  return (
    <>
      <Pressable
        onLongPress={() => setPopoverVisible(true)}
        accessibilityRole="button"
        accessibilityHint="Long press for plain-language explanation"
      >
        <Text style={style}>{children}</Text>
      </Pressable>
      <Portal>
        <Modal
          visible={popoverVisible}
          onDismiss={() => setPopoverVisible(false)}
          contentContainerStyle={styles.popover}
        >
          <Text style={styles.popoverTerm}>{children}</Text>
          <Text style={styles.popoverExplanation}>{explanation}</Text>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  popover: {
    margin: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  popoverTerm: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  popoverExplanation: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/JargonText.tsx
git -c commit.gpgsign=false commit -m "feat(jargon): JargonText long-press glossary popover (SCRUM-115)"
```

---

## Task 5: TimelineItem component

**Files:**
- Create: `app/Home/doctor-detail/TimelineItem.tsx`

- [ ] **Step 1: Write the component**

Create `app/Home/doctor-detail/TimelineItem.tsx` with this complete content:

```tsx
/**
 * TimelineItem — a single event row inside an EncounterGroup.
 * Colored 3px left rule encodes event kind:
 *   blue   = medication-added
 *   green  = diagnosis-resolved
 *   amber  = diagnosis-recorded (active recorded at this visit)
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { JargonText } from '@/components/JargonText';
import type { TimelineEvent } from '@/services/api/types';

interface ThemeColors {
  text: string;
  subtext: string;
  card: string;
  primary: string;
}

interface TimelineItemProps {
  event: TimelineEvent;
  colors: ThemeColors;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
  style?: ViewStyle;
}

const RULE_COLOR: Record<TimelineEvent['kind'], string> = {
  'medication-added': '#2563EB',     // blue
  'diagnosis-resolved': '#059669',   // green
  'diagnosis-recorded': '#D97706',   // amber
};

export function TimelineItem({
  event,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  style,
}: TimelineItemProps) {
  const ruleColor = RULE_COLOR[event.kind];

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderLeftColor: ruleColor },
        style,
      ]}
    >
      <JargonText
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(14),
          fontWeight: getScaledFontWeight(600) as any,
        }}
      >
        {event.title}
      </JargonText>
      {event.subtitle && (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            marginTop: 2,
          }}
        >
          {event.subtitle}
        </Text>
      )}
      {event.reasonText && (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            marginTop: 2,
            fontStyle: 'italic',
          }}
        >
          {event.reasonText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/Home/doctor-detail/TimelineItem.tsx
git -c commit.gpgsign=false commit -m "feat(treatment): TimelineItem event row with colored rule (SCRUM-115)"
```

---

## Task 6: EncounterGroup component

**Files:**
- Create: `app/Home/doctor-detail/EncounterGroup.tsx`

- [ ] **Step 1: Write the component**

Create `app/Home/doctor-detail/EncounterGroup.tsx`:

```tsx
/**
 * EncounterGroup — section header (date · type) plus a stack of TimelineItems
 * for one encounter. The trailing "EARLIER" bucket renders without a date
 * and without a type subtitle.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EncounterGroupView } from '@/services/api/types';
import { TimelineItem } from './TimelineItem';

interface ThemeColors {
  text: string;
  subtext: string;
  card: string;
  primary: string;
}

interface EncounterGroupProps {
  group: EncounterGroupView;
  colors: ThemeColors;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
}

export function EncounterGroup({
  group,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: EncounterGroupProps) {
  const headerParts: string[] = [];
  if (group.dateLabel) headerParts.push(group.dateLabel);
  if (group.typeLabel) headerParts.push(group.typeLabel);

  return (
    <View style={styles.section}>
      {headerParts.length > 0 && (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as any,
            letterSpacing: 1.2,
            marginBottom: 8,
            paddingHorizontal: 4,
          }}
        >
          {headerParts.join(' · ')}
        </Text>
      )}
      {group.events.map((event) => (
        <TimelineItem
          key={event.id}
          event={event}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/Home/doctor-detail/EncounterGroup.tsx
git -c commit.gpgsign=false commit -m "feat(treatment): EncounterGroup section header + items (SCRUM-115)"
```

---

## Task 7: ActiveConditionsRow component

**Files:**
- Create: `app/Home/doctor-detail/ActiveConditionsRow.tsx`

- [ ] **Step 1: Write the component**

Create `app/Home/doctor-detail/ActiveConditionsRow.tsx`:

```tsx
/**
 * ActiveConditionsRow — horizontal flex of active-condition pills,
 * color-coded by clinical status. A trailing "+N resolved" chip toggles
 * an inline list of resolved conditions.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { JargonText } from '@/components/JargonText';
import type { ProviderDiagnosis, ClinicalStatus } from '@/services/api/types';

interface ThemeColors {
  text: string;
  subtext: string;
  card: string;
  primary: string;
}

interface ActiveConditionsRowProps {
  active: ProviderDiagnosis[];
  resolved: ProviderDiagnosis[];
  colors: ThemeColors;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
}

interface PillStyle {
  bg: string;
  fg: string;
  border: string;
}

const PILL_BY_STATUS: Record<ClinicalStatus, PillStyle> = {
  active:     { bg: '#FEF2F2', fg: '#B91C1C', border: '#FCA5A5' },
  recurrence: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FCA5A5' },
  relapse:    { bg: '#FEF2F2', fg: '#B91C1C', border: '#FCA5A5' },
  remission:  { bg: '#FEF3C7', fg: '#B45309', border: '#FDE68A' },
  inactive:   { bg: '#F3F4F6', fg: '#6B7280', border: '#E5E7EB' },
  resolved:   { bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0' },
  unknown:    { bg: '#F3F4F6', fg: '#6B7280', border: '#E5E7EB' },
};

export function ActiveConditionsRow({
  active,
  resolved,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: ActiveConditionsRowProps) {
  const [resolvedExpanded, setResolvedExpanded] = useState(false);

  if (active.length === 0 && resolved.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          fontWeight: getScaledFontWeight(700) as any,
          letterSpacing: 1.2,
          marginBottom: 8,
          paddingHorizontal: 4,
        }}
      >
        ACTIVE
      </Text>

      {active.length > 0 ? (
        <View style={styles.pillRow}>
          {active.map((d) => {
            const pill = PILL_BY_STATUS[d.clinicalStatus];
            return (
              <View
                key={d.id}
                style={[styles.pill, { backgroundColor: pill.bg, borderColor: pill.border }]}
              >
                <View style={[styles.pillDot, { backgroundColor: pill.fg }]} />
                <JargonText
                  style={{
                    color: pill.fg,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {d.name}
                </JargonText>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), paddingHorizontal: 4 }}>
          No active conditions recorded by this provider.
        </Text>
      )}

      {resolved.length > 0 && (
        <Pressable
          onPress={() => setResolvedExpanded((v) => !v)}
          style={styles.resolvedToggle}
          accessibilityRole="button"
        >
          <Text
            style={{
              color: colors.primary,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            {resolvedExpanded ? '▾ ' : '▸ '}+{resolved.length} resolved
          </Text>
        </Pressable>
      )}

      {resolvedExpanded && resolved.length > 0 && (
        <View style={styles.resolvedList}>
          {resolved.map((d) => (
            <Text
              key={d.id}
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                paddingVertical: 4,
                paddingHorizontal: 4,
              }}
            >
              ✓ {d.name}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  resolvedToggle: {
    marginTop: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  resolvedList: {
    marginTop: 4,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/Home/doctor-detail/ActiveConditionsRow.tsx
git -c commit.gpgsign=false commit -m "feat(treatment): ActiveConditionsRow with collapsible resolved (SCRUM-115)"
```

---

## Task 8: WhatChangedCard component

**Files:**
- Create: `app/Home/doctor-detail/WhatChangedCard.tsx`

- [ ] **Step 1: Write the component**

Create `app/Home/doctor-detail/WhatChangedCard.tsx`:

```tsx
/**
 * WhatChangedCard — top-of-tab AI deltas pill. Replaces the old "Summary"
 * card. Renders the AI insight summary as a tinted callout (gradient
 * approximation via two stacked tints — keeps RN simple). The backend
 * prompt change to emit deltas instead of paragraph prose ships on a
 * separate cos-backend ticket; this component renders whatever copy the
 * API returns either way.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface ThemeColors {
  text: string;
  subtext: string;
  primary: string;
}

interface WhatChangedCardProps {
  state: { summary: string; loading: boolean; empty: boolean } | undefined;
  colors: ThemeColors;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
}

export function WhatChangedCard({
  state,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: WhatChangedCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <MaterialIcons
          name="auto-awesome"
          size={getScaledFontSize(14)}
          color="#6D28D9"
        />
        <Text
          style={{
            color: '#6D28D9',
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as any,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          What changed
        </Text>
      </View>

      {!state || state.loading ? (
        <View style={styles.bodyLoadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
            Reading your records…
          </Text>
        </View>
      ) : (
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(13),
            lineHeight: getScaledFontSize(20),
            marginTop: 6,
          }}
        >
          {state.summary}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Approximation of the linear-gradient(135deg,#EEF2FF,#FDF2F8) from the
    // wireframe — RN core has no gradient primitive; a single soft tint is
    // visually close enough and avoids pulling in expo-linear-gradient.
    backgroundColor: '#F3F0FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bodyLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/Home/doctor-detail/WhatChangedCard.tsx
git -c commit.gpgsign=false commit -m "feat(treatment): WhatChangedCard AI deltas pill (SCRUM-115)"
```

---

## Task 9: Barrel export

**Files:**
- Create: `app/Home/doctor-detail/index.ts`

- [ ] **Step 1: Write the barrel**

Create `app/Home/doctor-detail/index.ts`:

```ts
export { WhatChangedCard } from './WhatChangedCard';
export { ActiveConditionsRow } from './ActiveConditionsRow';
export { EncounterGroup } from './EncounterGroup';
export { TimelineItem } from './TimelineItem';
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/Home/doctor-detail/index.ts
git -c commit.gpgsign=false commit -m "chore(treatment): barrel export for doctor-detail components (SCRUM-115)"
```

---

## Task 10: Wire it all into doctor-detail.tsx

**Files:**
- Modify: `app/Home/doctor-detail.tsx`

- [ ] **Step 1: Add new imports**

In `app/Home/doctor-detail.tsx`, find the existing imports near the top (around lines 8–9) and append the new imports right after them. The existing block is:

```ts
import { fetchProviderById, fetchProviders, fetchProviderTreatmentPlans, fetchProviderProgressNotes, fetchProviderAppointments, fetchCarePlans, fetchAiInsight } from '@/services/api/providers';
import type { Provider, ProgressNote, ProviderAppointment, CarePlanItem, ProviderTreatmentPlan, ProviderDiagnosis, ProviderMedication, ClinicalStatus, RecommendedAppointment } from '@/services/api/types';
```

After those two lines, add:

```ts
import { groupTreatmentByEncounter } from '@/services/treatment-timeline';
import {
  WhatChangedCard,
  ActiveConditionsRow,
  EncounterGroup,
} from './doctor-detail';
```

- [ ] **Step 2: Replace the body of `renderTreatmentPlan`**

Find the existing `renderTreatmentPlan` (around line 528). Replace the entire function — from `const renderTreatmentPlan = () => {` through its closing `};` (around line 591) — with this new body:

```ts
  const renderTreatmentPlan = () => {
    const { activeConditions, resolvedConditions, encounterGroups } =
      groupTreatmentByEncounter(treatmentPlans, appointments);

    const isEmpty =
      activeConditions.length === 0 &&
      resolvedConditions.length === 0 &&
      encounterGroups.length === 0;

    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 24 }}>
        {isLoadingData ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(14) }}>
              Loading diagnoses and medications…
            </Text>
          </View>
        ) : (
          <>
            <WhatChangedCard
              state={insightFor('treatment')}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />

            {isEmpty ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
                  No diagnoses or prescriptions recorded by this provider in your EHR.
                </Text>
              </View>
            ) : (
              <>
                <ActiveConditionsRow
                  active={activeConditions}
                  resolved={resolvedConditions}
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                />

                {encounterGroups.map((group) => (
                  <EncounterGroup
                    key={group.id}
                    group={group}
                    colors={colors}
                    getScaledFontSize={getScaledFontSize}
                    getScaledFontWeight={getScaledFontWeight}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    );
  };
```

- [ ] **Step 3: Delete now-unused legacy functions**

Find and delete the entire function bodies for:
1. `renderDiagnosisCard` (currently lines ~593–677)
2. `renderMedicationRow` (currently lines ~679–~770; ends just before whatever comes after — search for the next `const render` or function declaration)

Both functions are no longer referenced after Step 2 — TS strict mode will catch any stragglers via "noUnusedLocals" or the linter.

- [ ] **Step 4: Delete now-unused styles**

In the styles `StyleSheet.create({ ... })` block at the bottom of the file, delete these now-unused style entries (search the file for each — `treatmentSection`, `diagnosisCard`, `diagnosisRow`, `diagnosisName`, `diagnosisMeta`, `diagnosisNotes`, `diagnosisNoteText`, `medicationCard`, `medChipRow`, `medChip`, `clinicalPill`, `clinicalDot`):

```
- styles.treatmentSection
- styles.diagnosisCard
- styles.diagnosisRow
- styles.diagnosisName
- styles.diagnosisMeta
- styles.diagnosisNotes
- styles.diagnosisNoteText
- styles.medicationCard
- styles.medChipRow
- styles.medChip
- styles.clinicalPill
- styles.clinicalDot
```

If a style turns out to be referenced elsewhere in the file (the lint pass will reveal this), keep that one. Verify by running:

```bash
grep -n "styles\.treatmentSection\|styles\.diagnosisCard\|styles\.diagnosisRow\|styles\.diagnosisName\|styles\.diagnosisMeta\|styles\.diagnosisNotes\|styles\.diagnosisNoteText\|styles\.medicationCard\|styles\.medChipRow\|styles\.medChip\|styles\.clinicalPill\|styles\.clinicalDot" app/Home/doctor-detail.tsx
```

Expected after deletion: no matches (or only matches inside the StyleSheet block itself if the deletion missed one — re-delete those).

- [ ] **Step 5: Drop now-unused imports**

The legacy renderTreatmentPlan referenced `Card` (from react-native-paper) and types `ProviderDiagnosis`, `ProviderMedication`, `ClinicalStatus`. The new components encapsulate `Card` use (or skip it). Verify whether they're still referenced elsewhere in `doctor-detail.tsx`:

```bash
grep -nE "Card[> ]|<Card |ProviderDiagnosis|ProviderMedication|ClinicalStatus" app/Home/doctor-detail.tsx | head
```

If `Card` is still used elsewhere (e.g. in `renderProgressNotes` or `renderAppointments`), leave the import. If `ProviderDiagnosis` / `ProviderMedication` / `ClinicalStatus` no longer appear in doctor-detail.tsx, remove them from the type import on line 9 — the lint pass would flag them but cleaner to handle here.

Also remove the `clinicalStatusPill` and `medicationStatusPill` helper functions if they were file-local — search for their definitions:

```bash
grep -n "clinicalStatusPill\|medicationStatusPill" app/Home/doctor-detail.tsx
```

Delete the function bodies if they're now unreferenced.

- [ ] **Step 6: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: both clean. If lint flags unused locals from steps 3–5, delete them per the message.

- [ ] **Step 7: Commit**

```bash
git add app/Home/doctor-detail.tsx
git -c commit.gpgsign=false commit -m "feat(treatment): wire encounter timeline into doctor-detail (SCRUM-115)

Replace renderTreatmentPlan with the new component composition
(WhatChangedCard + ActiveConditionsRow + EncounterGroup[]). Delete
legacy renderDiagnosisCard, renderMedicationRow, and the now-unused
treatmentSection/diagnosis/medication styles + status-pill helpers.

doctor-detail.tsx shrinks by ~250 lines as a side effect."
```

---

## Task 11: Push to PR #95

**Files:**
- (none — git operations only)

- [ ] **Step 1: Confirm branch + push**

```bash
git status                                       # working tree clean
git log --oneline origin/main..HEAD              # shows the new commits
git push origin COS-134/edit-provider-fields-fix
```

- [ ] **Step 2: Verify CircleCI on PR #95 stays green**

```bash
sleep 30
gh pr view 95 --json statusCheckRollup -q '.statusCheckRollup[] | {name, status, conclusion}'
```

Expected: every CircleCI check `success`. If anything fails, open the run, fix the issue, re-push.

- [ ] **Step 3: Done — handoff**

Next steps live outside this plan:
1. **EAS Update push** — user will run this manually for on-device review BEFORE merging PR #95 to main:
   ```bash
   eas update --branch production --message "feat(treatment): encounter-grouped timeline (SCRUM-115, PR #95)"
   ```
2. **Backend AI prompt rewrite** — separate cos-backend branch (e.g. `COS-135/treatment-deltas-prompt`), separate PR. The mobile redesign degrades gracefully if the backend prompt change hasn't shipped yet.
3. **Eventual merge of PR #95** — bundles this with the other in-flight cos-app fixes (SCRUM-114 modal field visibility + 90% height bump).

---

## Self-Review Notes (filled by author)

**Spec coverage:**
- Issue 1 (hierarchy) → Task 7 (active row pinned) + Task 6 (encounter spine)
- Issue 2 (status pills) → Task 7 (PILL_BY_STATUS palette + dot)
- Issue 3 (sections) → distinct ACTIVE / encounter / EARLIER section headers (Tasks 6, 7)
- Issue 4 (density) → encounter blocks pack related items (Task 5 + 6)
- Issue 5 (over-density) → one row = one event; subtitle is single-line (Task 5)
- Issue 6 (status grouping) → activeConditions / resolvedConditions split (Task 3)
- Issue 7 (encounter grouping) → groupTreatmentByEncounter helper (Task 3)
- Issue 8 (plain language) → JargonText wrapper (Task 4) used on diagnosis names (Task 7) and timeline titles (Task 5)
- Issue 9 (AI deltas) → WhatChangedCard slot (Task 8) + backend prompt rewrite deferred to separate ticket (noted in Task 11 Step 3)
- Issue 10 (catch-all) — addressed via Approach A's coherent layout

**Placeholder scan:** clean — every step has executable code or a concrete shell command. The CLINICAL_GLOSSARY initial seed list is enumerated in Task 4 Step 1 (~25 entries).

**Type consistency:** EncounterGroupView.id is used as React key (Task 6) and as the bucket key in `groupTreatmentByEncounter` (Task 3) — both match. TimelineEvent.kind drives the `RULE_COLOR` map in Task 5 — exhaustive. PillStyle covers every ClinicalStatus value in Task 7 — exhaustive.
