# Provider Detail — Diagnosis & Treatment Plan Tab Redesign

**Date:** 2026-04-30
**Tracker:** SCRUM-115 (to be filed before implementation)
**Branch:** `COS-134/edit-provider-fields-fix` (layered onto in-flight cos-app fixes batch)
**Status:** Design approved — ready for implementation plan

---

## Problem

The current Diagnosis & Treatment Plan tab on the provider-detail screen suffers from ten compounding issues — visual hierarchy is flat, status pills are weak, sections (Diagnoses / Medications) read as one wall, density is wrong (sparse cards but dense within), nothing is grouped by status or by encounter, clinical jargon has no plain-language layer, and the AI Summary is generic paragraph prose rather than meaningful deltas.

The result is a tab that lists what the EHR contains but doesn't help the patient *understand* their care with this provider.

## Goals

A redesign that, in a single coherent layout, delivers:

1. Clear visual hierarchy — the eye lands on what matters (active conditions, recent changes)
2. Bold, scannable status pills that read at a glance
3. Two clearly distinct sections that don't run together
4. Right-sized cards — packed enough to be useful, sparse enough to scan
5. Status-aware grouping (Active first, Resolved collapsed)
6. Encounter-aware grouping (what came out of which visit)
7. Plain-language layer over clinical jargon
8. AI summary that calls out specific deltas, not paragraph prose

## Non-goals

- No changes to Progress Notes / Appointments / Care Plans tabs
- No changes to the FHIR fetch shape — encounter attribution already landed in COS-124 (PR #85)
- No changes to the per-tab AI insights infrastructure — only the prompt content changes
- No new backend endpoints

---

## Approach: Encounter-grouped Timeline (Approach A)

The selected direction. Other options considered (Active-vs-Past split, two-row dashboard) had merit but a visit-anchored timeline best surfaces "what happened at my last visit with this provider," which is the primary task.

### Layout (top → bottom)

```
┌─────────────────────────────────────────────┐
│ ✨ What changed (AI deltas card)             │  ← replaces "Summary"
├─────────────────────────────────────────────┤
│ ACTIVE                                       │
│ [Hypertension] [Type 2 Diabetes] [...] ●●   │  ← color-coded pill row
│ ▸ + 2 resolved (tap to expand)              │  ← collapsed by default
├─────────────────────────────────────────────┤
│ APR 12 · ANNUAL PHYSICAL                    │  ← encounter section
│ ┌─ blue rule ─ Lipitor 20mg · daily ──────┐ │  ← med added at this visit
│ │             for High Cholesterol         │ │
│ ├─ green rule ─ Asthma → Resolved ────────┤ │  ← state change
│ └───────────────────────────────────────────┘ │
│                                              │
│ MAR 4 · FOLLOW-UP                           │
│ ┌─ blue rule ─ Metformin 500mg · 2×/day ──┐ │
│ └───────────────────────────────────────────┘ │
│                                              │
│ + Show older visits (3 more)                │  ← progressive disclosure
└─────────────────────────────────────────────┘
```

### Why this solves all 10 issues

- **Hierarchy** — Active row is the visual anchor at top; encounters provide a temporal spine
- **Status pills** — bold tinted pills with leading dot, color-coded by clinical status
- **Sections distinct** — Active row, AI deltas, and each encounter group are visually separate panels
- **Density** — encounter blocks pack together related items; one row = one event
- **Status grouping** — Active pinned at top, Resolved collapsed
- **Encounter grouping** — built into the layout itself
- **Plain-language layer** — `<JargonText>` wrapper renders tooltips on known clinical terms
- **AI deltas** — the "What changed" card lists specific changes (new meds, state changes), not paragraph prose

---

## Components

| Component | File | Purpose |
|---|---|---|
| `<WhatChangedCard>` | `app/Home/doctor-detail/WhatChangedCard.tsx` | AI deltas pill at top. Renders 1–3 bullet lines from `aiInsights.treatment.summary`. Replaces the current `renderOverviewCard('treatment', 'Summary')` call. |
| `<ActiveConditionsRow>` | `app/Home/doctor-detail/ActiveConditionsRow.tsx` | Horizontal flex of active-condition pills, color-coded. Last item is a `+N resolved` chip that expands inline to a vertical resolved list. |
| `<EncounterGroup>` | `app/Home/doctor-detail/EncounterGroup.tsx` | Section header (`MMM D · ENCOUNTER TYPE`) + a stack of `<TimelineItem>` children. |
| `<TimelineItem>` | `app/Home/doctor-detail/TimelineItem.tsx` | Single event row. Colored left rule (blue = med added/changed, green = diagnosis state change, amber = note). Tap opens the existing detail sheet (no new modal). |
| `<JargonText>` | `components/JargonText.tsx` | Inline `<Text>` wrapper that detects known clinical terms (from a `CLINICAL_GLOSSARY` map) and renders a long-press popover with plain-language text. |

The new components live under `app/Home/doctor-detail/` (new directory) so the doctor-detail.tsx file shrinks and each component has a clear single responsibility. `<JargonText>` is more broadly useful, lives at `components/`.

## Data flow

```
doctor-detail.tsx
   ├── treatmentPlans  ← fetchProviderTreatmentPlans()  (unchanged)
   ├── appointments    ← fetchProviderAppointments()    (unchanged)
   └── aiInsights      ← fetchAiInsight('treatment')    (unchanged)
        │
        ▼
groupTreatmentByEncounter(treatmentPlans, appointments)
        │
        ▼
[ encounterGroups, activeConditions, resolvedConditions ]
        │
        ▼
<WhatChangedCard insights={aiInsights} />
<ActiveConditionsRow active={...} resolved={...} />
{encounterGroups.map(g => <EncounterGroup key={g.encounterId} group={g} />)}
```

`groupTreatmentByEncounter` is a pure helper in a new `services/treatment-timeline.ts` (kept out of `services/api/providers.ts` so the API layer stays a thin fetch wrapper, free of view-layer derivations):

```ts
function groupTreatmentByEncounter(
  plans: ProviderTreatmentPlan,
  appointments: ProviderAppointment[]
): {
  encounterGroups: EncounterGroup[];   // sorted reverse-chronological
  activeConditions: ProviderDiagnosis[];
  resolvedConditions: ProviderDiagnosis[];
}
```

`EncounterGroup` shape:

```ts
interface EncounterGroup {
  encounterId: string;
  date: string;                  // ISO
  type: string;                  // "Annual Physical", "Follow-up", "Earlier"
  events: TimelineEvent[];       // medications + diagnosis-state-changes
}
```

Items without a matching encounter fall into a single trailing `"Earlier"` group rather than failing.

## AI prompt change

`cos-backend/src/services/ai-insights.service.ts` — `treatment` tab prompt updated to ask for **1–3 short bullets describing recent CHANGES** (new meds, state changes, dose changes) rather than a paragraph summary.

This is a **separate backend branch** (e.g. `COS-135/treatment-deltas-prompt`) since cos-app and cos-backend have independent CI/deploy pipelines. The mobile redesign degrades gracefully if the backend prompt change hasn't shipped yet — it just shows whatever paragraph the API returned in the same `<WhatChangedCard>` slot.

## States

| State | Treatment |
|---|---|
| Loading | Skeleton: 1 shimmer rect for AI card + 3 grey pills for active row + 2 grey encounter blocks |
| Empty (no data) | Existing copy "No diagnoses or prescriptions recorded by this provider in your EHR" rendered inside a small empty-state card with the brand mascot (80px, not flat text) |
| AI generation failure | `<WhatChangedCard>` shows the existing graceful fallback ("Unable to generate insights at this time.") inline; rest of timeline renders normally |
| No encounter attribution on any item | Everything falls into the trailing `"Earlier"` group |
| Provider has no appointments table | Same as above — `"Earlier"` group only |

## Testing

- **Unit** — `groupTreatmentByEncounter()`: empty input, fully-attributed, none-attributed, mixed, single-encounter, multiple-same-day
- **Snapshot** — `<TimelineItem>` for each rule color (med / state-change / note)
- **Integration** — extend `app/Home/doctor-detail.test.tsx` with: "renders Active row with N pills", "renders encounter group headers reverse-chronological", "tapping resolved chip expands the list"

## Files changed

```
cos-app/
├── app/Home/doctor-detail.tsx                              (renderTreatmentPlan rewrite + extracted components)
├── app/Home/doctor-detail/WhatChangedCard.tsx              (NEW)
├── app/Home/doctor-detail/ActiveConditionsRow.tsx          (NEW)
├── app/Home/doctor-detail/EncounterGroup.tsx               (NEW)
├── app/Home/doctor-detail/TimelineItem.tsx                 (NEW)
├── components/JargonText.tsx                               (NEW)
├── services/treatment-timeline.ts                          (NEW — groupTreatmentByEncounter helper)
├── services/api/types.ts                                   (add EncounterGroup, TimelineEvent types)
└── app/Home/doctor-detail.test.tsx                         (extend with Active row + encounter group assertions)

cos-backend/  (separate branch / PR)
└── src/services/ai-insights.service.ts                     (treatment-tab prompt rewrite for deltas)
```

## Rollout

1. Implement on existing `COS-134/edit-provider-fields-fix` branch (cos-app fixes batch).
2. Push EAS Update to production for on-device review (per user request — review with EAS Update before merge).
3. After review, merge PR #95 to main + bring backend prompt change onto its own track.

---

## Open questions / explicit deferrals

- **Detail sheet** when tapping a `<TimelineItem>` — reuses the existing detail modal, no new design. If review reveals it's the wrong host for full clinical detail, that becomes a follow-up ticket.
- **`CLINICAL_GLOSSARY`** initial term list — start with the ~30 most-frequent terms surfaced in our existing FHIR samples (e.g. "in remission," "uncontrolled," "stable"), expand based on user feedback. Spec deliberately doesn't enumerate the list — that's an implementation-time decision.
- **Color rules for `<TimelineItem>`** (blue/green/amber) use the existing palette tokens; no new theme additions.
