// tests/unit/immunizations-ehr-hydrate-contract.test.mjs — COS-481 Phase 2
//
// Source-drift trip wires for the EHR-hydrated Vaccines card added on the
// COS-481/vaccines-ehr-hydrate-fe branch. Phase 2 layers an EHR block ("From
// your health records") on top of the Phase-1 patient-added block ("You
// added this") inside the existing Vaccines card, gated by the module-const
// kill switch `IMMUNIZATIONS_EHR_ENABLED`.
//
// WHAT THIS SUITE DEFENDS
//   The Ken-locked Phase 2 shape has to survive future refactors on the
//   report builder + hooks without being silently unwound in a merge. Wires:
//
//     (a) intake-report-builder.ts declares
//         `export const IMMUNIZATIONS_EHR_ENABLED = false as const;`
//         at module scope. Default FALSE per COS-481 dark-launch spec —
//         drift to `true` would flip the feature on for every user on the
//         next OTA without Ken's approval. Also catches drift to
//         `process.env.X === 'true'` (silently resolves to false in stages
//         that never set the var) and drop of the `as const` (widens the
//         type to `boolean` and defeats the trip wire).
//
//     (b) intake-report-builder.ts exports `EhrRowsByGroup` and the
//         `buildReport` signature accepts a third argument. If the third
//         param is removed in a refactor, IntakeReportScreen +
//         ShareIntakeReportSection silently lose their EHR-hydration
//         plumbing and every patient's card falls back to Phase-1 only.
//
//     (c) The `Group` interface carries an optional `ehrRows?: Row[]` field.
//         Drop of this field would break the renderer's discrimination
//         between EHR and patient-added rows and hide Phase-2 records.
//
//     (d) `buildReport` retains the Vaccines group when EHR rows are
//         non-empty but every patient-added row is missing. Behavioral,
//         via a runtime import of the ESM `.ts` source (same Node 24
//         type-stripping trick the vaccines-intake-section-contract test
//         uses for the formatter).
//
//     (e) `buildReport` still silent-drops the Vaccines group when BOTH
//         EHR rows are absent AND every patient-added row is missing
//         (Phase-1 empty-state parity — no bare card for a patient with
//         zero data).
//
//     (f) hooks/use-immunizations.ts sets `enabled: IMMUNIZATIONS_EHR_ENABLED`
//         on the useQuery. Without this, the query fires on every intake
//         screen mount when the flag is off — a wasted BE round-trip that
//         also breaks the "no telemetry until Ken flips" contract.
//
// SELF-CHECKS at the bottom prove the parsers can distinguish drifted
// shapes from the shipped shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { stripComments } from './strip-comments.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const BUILDER_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'patient-intake',
  'intake-report-builder.ts',
);
const HOOK_PATH = join(REPO_ROOT, 'hooks', 'use-immunizations.ts');

const BUILDER_SRC = stripComments(readFileSync(BUILDER_PATH, 'utf8'));
const HOOK_SRC = stripComments(readFileSync(HOOK_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// (a) IMMUNIZATIONS_EHR_ENABLED = true as const at module scope.
// FLIPPED 2026-07-28 alongside cos-backend SSM `immunizations_ehr_enabled=true`
// (release-vaccines-flip-hs3a-2026-07-28) — EHR-hydrated vaccines now surface
// in the intake report. The `as const` guard remains: still a compile-time
// literal, not a runtime toggle, so accidental promotion to
// `process.env.X === 'true'` / hook lookup still trips this contract.
// ---------------------------------------------------------------------------

function killSwitchAsConstTrueRegex() {
  return /(?:^|\n)\s*export\s+const\s+IMMUNIZATIONS_EHR_ENABLED\s*(?::[^=\n]+)?=\s*true\s+as\s+const\b/;
}

function killSwitchAnyEqualsRegex() {
  return /(?:^|\n)\s*(?:export\s+)?const\s+IMMUNIZATIONS_EHR_ENABLED\s*(?::[^=\n]+)?=\s*([^;\n]+)/;
}

test('(a) intake-report-builder.ts declares IMMUNIZATIONS_EHR_ENABLED = true as const at module scope', () => {
  assert.match(
    BUILDER_SRC,
    killSwitchAsConstTrueRegex(),
    'intake-report-builder.ts must declare `export const IMMUNIZATIONS_EHR_ENABLED = true as const` at module scope (COS-481 Phase 2 flip — 2026-07-28). If this fails, either (i) the constant was renamed/removed — the FE lost its one-line OTA-revert lever, (ii) the value drifted back to `false` without an intentional rollback commit — the EHR layer ships DISABLED to every user on the next OTA, (iii) `as const` was dropped — the type widens to `boolean` and future runtime toggling can slip in without a wire like this catching it, or (iv) the RHS was promoted to `process.env.X === "true"` / a hook lookup — silently resolves to false in stages that don\'t set the var and defeats the switch. To revert to `false as const`, update this test in the SAME commit so the intent is explicit.',
  );
});

test('(a-drift) IMMUNIZATIONS_EHR_ENABLED RHS is the literal boolean `true`', () => {
  const m = BUILDER_SRC.match(killSwitchAnyEqualsRegex());
  assert.ok(
    m,
    'expected `const IMMUNIZATIONS_EHR_ENABLED = <RHS>` in intake-report-builder.ts. If this fails, the constant was removed or the declaration reshaped so the RHS could not be extracted.',
  );
  const rhs = m[1].trim();
  assert.ok(
    rhs === 'true' || /^true\s+as\s+const$/.test(rhs),
    `IMMUNIZATIONS_EHR_ENABLED must be the boolean literal \`true\` (optionally with \`as const\`) as of the 2026-07-28 flip. Actual RHS: ${JSON.stringify(rhs)}. Common drift shapes that trip this wire: \`false\` (feature disabled without approval), \`process.env.X === 'true'\` (silently resolves to false in stages), \`Boolean(x)\` (widens the type). Revert to \`= true as const\` unless Ken has explicitly approved a rollback.`,
  );
});

// ---------------------------------------------------------------------------
// (b) buildReport signature carries a third arg + EhrRowsByGroup is exported.
// ---------------------------------------------------------------------------

test('(b) intake-report-builder.ts exports EhrRowsByGroup and buildReport accepts a third arg', () => {
  assert.match(
    BUILDER_SRC,
    /\bexport\s+type\s+EhrRowsByGroup\b/,
    'intake-report-builder.ts must export `type EhrRowsByGroup`. Callers (IntakeReportScreen, ShareIntakeReportSection) type their ehr-rows-by-group payload against this alias — dropping it means every caller falls back to a locally-defined ad-hoc shape that can silently diverge from the builder\'s contract.',
  );
  assert.match(
    BUILDER_SRC,
    /export\s+function\s+buildReport\s*\(\s*intake\s*:[^)]*questions\s*:[^)]*ehrRowsByGroup\s*\?\s*:\s*EhrRowsByGroup\s*,?\s*\)/,
    'buildReport must accept the third optional `ehrRowsByGroup?: EhrRowsByGroup` argument. If this fails, the EHR-hydration plumbing has been ripped out and IntakeReportScreen / ShareIntakeReportSection silently fall back to Phase-1-only for every patient.',
  );
});

// ---------------------------------------------------------------------------
// (c) Group interface carries the optional ehrRows field.
// ---------------------------------------------------------------------------

test('(c) Group interface declares `ehrRows?: Row[]`', () => {
  const idxIface = BUILDER_SRC.search(/\bexport\s+interface\s+Group\s*\{/);
  assert.ok(
    idxIface >= 0,
    'expected `export interface Group { ... }` in intake-report-builder.ts — has the interface been renamed or moved?',
  );
  const rest = BUILDER_SRC.slice(idxIface);
  const brace = rest.indexOf('}');
  assert.ok(brace > 0, 'expected the Group interface to close within the readable window.');
  const ifaceBody = rest.slice(0, brace);
  assert.match(
    ifaceBody,
    /\behrRows\s*\?\s*:\s*Row\[\]/,
    'Group interface must declare `ehrRows?: Row[]` (COS-481 Phase 2). Drop of this field breaks the renderer\'s discrimination between EHR and patient-added rows and hides Phase-2 records.',
  );
});

// ---------------------------------------------------------------------------
// (d) + (e) Behavioral checks — import the .ts source and run buildReport
// against synthetic fixtures. Node 24 built-in TS type-stripping picks it up.
// ---------------------------------------------------------------------------

test('(d) buildReport retains the vaccines group when EHR rows are non-empty but every patient-added row is missing', async () => {
  const mod = await import(
    '../../components/health-plan/patient-intake/intake-report-builder.ts'
  );
  const intake = {
    userId: 'test-user',
    version: 1,
    status: 'complete',
    startedAt: '2026-07-24T00:00:00Z',
    completedAt: '2026-07-24T00:30:00Z',
    // Intentionally NO vaccines answer — patient never opened the intake
    // vaccines add_list.
    answers: { sex_at_birth: 'female' },
  };
  const questions = [
    {
      key: 'sex_at_birth',
      section: 'body',
      prompt: 'Sex at birth',
      type: 'single',
      options: [
        { value: 'female', label: 'Female' },
        { value: 'male', label: 'Male' },
      ],
    },
    { key: 'vaccines', section: 'body', prompt: 'Vaccines', type: 'add_list' },
  ];
  const ehrRowsByGroup = {
    vaccines: [
      {
        key: 'ehr-immunization-1',
        label: 'Mar 2024',
        value: 'Influenza',
        missing: false,
      },
    ],
  };
  const groups = mod.buildReport(intake, questions, ehrRowsByGroup);
  const vaccines = groups.find((g) => g.id === 'vaccines');
  assert.ok(
    vaccines,
    'buildReport must retain the vaccines group when ehrRowsByGroup.vaccines is non-empty, even if the patient never answered the vaccines intake question. If this fails, patients with EHR-only immunization history see no Vaccines card at all — Phase-2 hydration is invisible for exactly the users it was built for.',
  );
  assert.equal(vaccines.ehrRows?.length, 1);
  assert.equal(vaccines.ehrRows?.[0].value, 'Influenza');
});

test('(e) buildReport silent-drops the vaccines group when BOTH EHR rows are absent AND patient answered nothing (Phase-1 parity)', async () => {
  const mod = await import(
    '../../components/health-plan/patient-intake/intake-report-builder.ts'
  );
  const intake = {
    userId: 'test-user',
    version: 1,
    status: 'complete',
    startedAt: '2026-07-24T00:00:00Z',
    completedAt: '2026-07-24T00:30:00Z',
    answers: { sex_at_birth: 'female' },
  };
  const questions = [
    {
      key: 'sex_at_birth',
      section: 'body',
      prompt: 'Sex at birth',
      type: 'single',
      options: [{ value: 'female', label: 'Female' }],
    },
    { key: 'vaccines', section: 'body', prompt: 'Vaccines', type: 'add_list' },
  ];
  // No third arg — same call shape every pre-Phase-2 caller uses.
  const groups = mod.buildReport(intake, questions);
  const vaccines = groups.find((g) => g.id === 'vaccines');
  assert.equal(
    vaccines,
    undefined,
    'buildReport must still silent-drop the vaccines group when EHR rows are absent AND the patient did not answer (Phase-1 empty-state parity). If this fails, a first-time patient sees a bare Vaccines card with nothing but "Not shared" italics — the exact "no bare cards" rule Ken locked in COS-480.',
  );
});

// ---------------------------------------------------------------------------
// (f) hooks/use-immunizations.ts gates the query with `enabled:
// IMMUNIZATIONS_EHR_ENABLED`.
// ---------------------------------------------------------------------------

test('(f) hooks/use-immunizations.ts gates the useQuery with enabled: IMMUNIZATIONS_EHR_ENABLED', () => {
  assert.match(
    HOOK_SRC,
    /\benabled\s*:\s*IMMUNIZATIONS_EHR_ENABLED\b/,
    'hooks/use-immunizations.ts must pass `enabled: IMMUNIZATIONS_EHR_ENABLED` to useQuery. If this fails, the query fires on every IntakeReportScreen mount even when the kill switch is off, wasting a BE round-trip and breaking the "no telemetry until Ken flips" dark-launch contract. Do NOT hard-code `enabled: true` — the whole point of the module-const kill switch is that flipping it flips both the render path AND the network call in one edit.',
  );
});

// =========================================================================
// SELF-VERIFICATION (chunk 98/103/107/109/113/116/119/120 discipline —
// prove the trap snaps shut).
// =========================================================================

test('self-check: wire (a) fails when IMMUNIZATIONS_EHR_ENABLED drifts back to false', () => {
  const brokenSrc =
    "export const IMMUNIZATIONS_EHR_ENABLED = false as const;\n";
  const stripped = stripComments(brokenSrc);
  assert.doesNotMatch(
    stripped,
    killSwitchAsConstTrueRegex(),
    'self-check: wire (a) must NOT match `= true as const` when the source declared `= false as const`. If this passes, the regex is broken and wire (a) cannot detect a silent rollback of the 2026-07-28 flip.',
  );
});

test('self-check: wire (a-drift) fails when RHS is promoted to process.env', () => {
  const brokenSrc =
    "export const IMMUNIZATIONS_EHR_ENABLED = process.env.IMMUNIZATIONS_EHR_ENABLED === 'true';\n";
  const stripped = stripComments(brokenSrc);
  const m = stripped.match(killSwitchAnyEqualsRegex());
  assert.ok(m, 'self-check: RHS-extraction regex must capture the mutated declaration.');
  const rhs = m[1].trim();
  assert.notEqual(
    rhs,
    'false',
    `self-check: wire (a-drift) must observe the mutated RHS, not 'false'. Actual: ${JSON.stringify(rhs)}. If this equals 'false', the regex greedy-matched past the RHS and cannot distinguish a runtime lookup from the shipped literal.`,
  );
  assert.ok(
    !/^false(\s+as\s+const)?$/.test(rhs),
    `self-check: wire (a-drift)'s "literal false" acceptance test must reject the mutated RHS ${JSON.stringify(rhs)}. If it accepts, the wire silently passes a runtime env lookup.`,
  );
});

test('self-check: wire (b) fails when buildReport drops the third arg', () => {
  const brokenSrc = [
    'export function buildReport(',
    '  intake: PatientIntakeRecord,',
    '  questions: IntakeQuestion[],',
    '): Group[] {',
    '  return [];',
    '}',
  ].join('\n');
  const stripped = stripComments(brokenSrc);
  assert.doesNotMatch(
    stripped,
    /export\s+function\s+buildReport\s*\(\s*intake\s*:[^)]*questions\s*:[^)]*ehrRowsByGroup\s*\?\s*:\s*EhrRowsByGroup\s*,?\s*\)/,
    'self-check: wire (b) must NOT match a two-arg buildReport signature. If this flips true, the regex is under-anchored and cannot detect a removed third parameter.',
  );
});
