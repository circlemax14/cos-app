// tests/unit/vaccines-ehr-hydrate-contract.test.mjs — COS-481 Phase 2
//
// Complementary source-drift trip-wire suite for the EHR-hydrated Vaccines
// card shipped on COS-481/vaccines-ehr-hydrate-fe. Runs alongside (and is
// intentionally partially redundant with) tests/unit/immunizations-ehr-
// hydrate-contract.test.mjs — belt-and-braces on the dark-launched kill
// switch, per the "kill switches deserve two independent wires" pattern
// established in tests/unit/kill-switches-contract.test.mjs.
//
// Where the sibling suite focuses on the intake-report-builder shape and a
// behavioral buildReport check, this suite anchors the *render surfaces*:
//   - hooks/use-immunizations.ts (existence, query key shape, gating)
//   - components/health-plan/patient-intake/IntakeReportScreen.tsx
//   - components/health-plan/patient-intake/ShareIntakeReportSection.tsx
// plus a co-located reprise of the VACCINES GroupSpec entry (chunk 129 /
// COS-480 preservation).
//
// WIRES
//   (a) intake-report-builder.ts declares
//       `export const IMMUNIZATIONS_EHR_ENABLED = false as const;` at
//       module scope. Default FALSE per COS-481 dark-launch spec. Drift to
//       `true` flips the feature on for every user on the next OTA
//       without Ken's approval. Drift to `process.env.X === 'true'`
//       silently resolves to false in stages that never set the var and
//       breaks the "one-line OTA revert" contract. Drop of `as const`
//       widens the type to `boolean` and defeats future wires.
//
//   (b) hooks/use-immunizations.ts exists and exports the `useImmunizations`
//       hook. If the file is renamed or the hook is deleted, both
//       IntakeReportScreen and ShareIntakeReportSection lose their EHR
//       data source and every Vaccines card silently falls back to
//       Phase-1-only rendering — the exact regression Phase 2 was built
//       to close.
//
//   (c) useImmunizations declares its React Query key as the flat
//       `['immunizations']` tuple. cos-app hydration hooks share the
//       flat-kebab-case convention (`['biopsychosocial-plan']`,
//       `['patient-intake']`, ...); nesting or renaming the key breaks
//       invalidation from Fasten-webhook onCompleteIntake fan-out paths
//       that will be added in the fast-follow and silently stales the
//       card for hours.
//
//   (d) useImmunizations passes `enabled: IMMUNIZATIONS_EHR_ENABLED` to
//       the useQuery. Without this, the query fires on every intake
//       screen mount even when the kill switch is off — wasted BE
//       round-trip and, more importantly, breaks the "no telemetry
//       until Ken flips" dark-launch contract.
//
//   (e) IntakeReportScreen.tsx layers the two block sub-headers when
//       both EHR and self-reported rows are present, using the exact
//       Ken-approved copy `FROM YOUR HEALTH RECORDS` and `YOU ADDED
//       THIS`. If either string drifts (copy edit, i18n swap without
//       a matching test-copy update, casing flip) the shipped design
//       is silently unwound. Both must live in the same render path.
//
//   (e-pdf) ShareIntakeReportSection.tsx uses the parity PDF copy
//       `From your health records` and `You added this`. Keeping the
//       PDF and the on-screen card in lockstep is what makes Phase 2
//       "the doctor sees the same thing the patient sees" — drift
//       here means the printed handoff loses the EHR block entirely
//       or mis-labels it.
//
//   (f) The VACCINES GroupSpec entry in intake-report-builder.ts is
//       unchanged from chunk 129 / COS-480: `id: 'vaccines'`,
//       `icon: 'vaccines'`, `color: '#0F766E'`, `keys: ['vaccines']`.
//       Phase 2 layers on top of Phase 1; a merge that reshapes the
//       group to accommodate the new field must not silently retitle,
//       recolor, or move the card. The sibling
//       vaccines-intake-section-contract.test.mjs owns the canonical
//       version; this co-located reprise catches the specific
//       "Phase 2 merge re-wrote the spec" failure mode where the
//       Phase-1 wire is deleted by mistake as "duplicated coverage".
//
//   (g) IntakeReportScreen.tsx and ShareIntakeReportSection.tsx build
//       their `ehrRowsByGroup` payload behind an
//       `IMMUNIZATIONS_EHR_ENABLED` gate — the useMemo/inline gate
//       must short-circuit BEFORE reading `immunizations.data` so a
//       renderer with the kill switch off is indistinguishable from
//       the pre-Phase-2 code path at the buildReport call site. If
//       this fails, the flag flip goes from "one FE constant" to "one
//       FE constant plus a matching wizard change" and the OTA revert
//       stops being atomic.
//
// SELF-VERIFICATION (bottom of file) proves each parser can distinguish
// mutated shapes from the shipped shape — no wire is allowed to be
// unfalsifiable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
const SCREEN_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'patient-intake',
  'IntakeReportScreen.tsx',
);
const SHARE_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'patient-intake',
  'ShareIntakeReportSection.tsx',
);

const BUILDER_SRC = stripComments(readFileSync(BUILDER_PATH, 'utf8'));
const SCREEN_SRC = stripComments(readFileSync(SCREEN_PATH, 'utf8'));
const SHARE_SRC = stripComments(readFileSync(SHARE_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// (a) IMMUNIZATIONS_EHR_ENABLED = false as const at module scope.
// ---------------------------------------------------------------------------

function killSwitchAsConstFalseRegex() {
  return /(?:^|\n)\s*export\s+const\s+IMMUNIZATIONS_EHR_ENABLED\s*(?::[^=\n]+)?=\s*false\s+as\s+const\b/;
}

test('(a) intake-report-builder.ts declares IMMUNIZATIONS_EHR_ENABLED = false as const at module scope', () => {
  assert.match(
    BUILDER_SRC,
    killSwitchAsConstFalseRegex(),
    'intake-report-builder.ts must declare `export const IMMUNIZATIONS_EHR_ENABLED = false as const` at module scope (COS-481 Phase 2 dark-launch kill switch). Redundant with immunizations-ehr-hydrate-contract.test.mjs wire (a) on purpose — the kill switch is the OTA-revert lever for the entire Phase-2 feature; per the kill-switches-contract pattern it earns two independent trip wires. If ONLY this wire fires, the sibling wire has drifted; if BOTH fire, the constant itself moved and every render surface below is unreachable.',
  );
});

// ---------------------------------------------------------------------------
// (b) hooks/use-immunizations.ts exists and exports useImmunizations.
// ---------------------------------------------------------------------------

test('(b) hooks/use-immunizations.ts exists and exports the useImmunizations hook', () => {
  assert.ok(
    existsSync(HOOK_PATH),
    `hooks/use-immunizations.ts must exist at ${HOOK_PATH}. If this fails, the FE has no data source for the EHR block — IntakeReportScreen and ShareIntakeReportSection will lose their import target and every Vaccines card silently falls back to Phase-1-only rendering. If the hook was moved, update HOOK_PATH here in lockstep with the rename.`,
  );
  const src = stripComments(readFileSync(HOOK_PATH, 'utf8'));
  assert.match(
    src,
    /\bexport\s+function\s+useImmunizations\s*\(/,
    'hooks/use-immunizations.ts must export `useImmunizations` as a named function (React hook naming convention). Renaming or converting to a default export breaks the eager-import wiring in IntakeReportScreen + ShareIntakeReportSection.',
  );
});

// ---------------------------------------------------------------------------
// (c) The hook uses queryKey ['immunizations'].
// ---------------------------------------------------------------------------

test('(c) useImmunizations uses the flat `["immunizations"]` React Query key', () => {
  const src = stripComments(readFileSync(HOOK_PATH, 'utf8'));
  assert.match(
    src,
    /\[\s*['"]immunizations['"]\s*\]/,
    'hooks/use-immunizations.ts must declare its query key as the flat tuple `["immunizations"]` (matches the cos-app convention: `["biopsychosocial-plan"]`, `["patient-intake"]`, etc.). Nesting the key (e.g. `["patient", "immunizations"]`) or renaming to a scoped name will break the fast-follow onCompleteIntake / Fasten-webhook invalidation calls that assume this exact key shape and silently stales the card for hours.',
  );
});

// ---------------------------------------------------------------------------
// (d) The hook's query is gated on IMMUNIZATIONS_EHR_ENABLED.
// ---------------------------------------------------------------------------

test('(d) useImmunizations gates useQuery with `enabled: IMMUNIZATIONS_EHR_ENABLED`', () => {
  const src = stripComments(readFileSync(HOOK_PATH, 'utf8'));
  assert.match(
    src,
    /\benabled\s*:\s*IMMUNIZATIONS_EHR_ENABLED\b/,
    'hooks/use-immunizations.ts must pass `enabled: IMMUNIZATIONS_EHR_ENABLED` to useQuery. If this fails, the query fires on every IntakeReportScreen mount even when the kill switch is off, wasting a BE round-trip and — worse — breaking the "no telemetry until Ken flips" dark-launch contract. Do NOT hard-code `enabled: true` or drop the `enabled` field entirely; the whole point of the module-const kill switch is that flipping it flips both the render path AND the network call in one edit.',
  );
});

// ---------------------------------------------------------------------------
// (e) IntakeReportScreen.tsx layers the two subheaders in the render path.
// ---------------------------------------------------------------------------

test('(e) IntakeReportScreen.tsx renders both `FROM YOUR HEALTH RECORDS` and `YOU ADDED THIS` subheaders', () => {
  assert.match(
    SCREEN_SRC,
    /FROM YOUR HEALTH RECORDS/,
    'IntakeReportScreen.tsx must render the exact Ken-approved copy `FROM YOUR HEALTH RECORDS` (uppercase) as the EHR-block subheader. Drift here (title-case, i18n key, "From EHR", ...) silently unwinds the Phase-2 layered layout — the block still renders but the header the design was locked around is gone.',
  );
  assert.match(
    SCREEN_SRC,
    /YOU ADDED THIS/,
    'IntakeReportScreen.tsx must render the exact Ken-approved copy `YOU ADDED THIS` (uppercase) as the patient-added-block subheader. If only the EHR header is present, the two blocks visually merge and the "these came from your records / these you entered yourself" distinction disappears.',
  );
});

// ---------------------------------------------------------------------------
// (e-pdf) ShareIntakeReportSection.tsx keeps the PDF in lockstep with the
// on-screen card.
// ---------------------------------------------------------------------------

test('(e-pdf) ShareIntakeReportSection.tsx renders `From your health records` and `You added this` in the PDF path', () => {
  assert.match(
    SHARE_SRC,
    /From your health records/,
    'ShareIntakeReportSection.tsx must render the parity PDF copy `From your health records` (Title Case for HTML rendering — the on-screen uppercase is a styling choice, the PDF uses text-transform:uppercase via CSS). Drift here means the printed handoff loses the EHR block subheader and the doctor can no longer tell EHR-sourced rows apart from patient-entered rows.',
  );
  assert.match(
    SHARE_SRC,
    /You added this/,
    'ShareIntakeReportSection.tsx must render the parity PDF copy `You added this`. Drift breaks the "the doctor sees the same thing the patient sees" contract that Phase 2 was built around.',
  );
});

// ---------------------------------------------------------------------------
// (f) VACCINES GroupSpec entry unchanged (chunk 129 preservation).
// ---------------------------------------------------------------------------

test('(f) intake-report-builder.ts VACCINES GroupSpec entry preserves id/icon/color/keys from COS-480', () => {
  // Find the vaccines spec block. The chunk-129 shape is a small object
  // literal with exactly those four fields — pull it out and grep each.
  const idxVaccinesId = BUILDER_SRC.indexOf("id: 'vaccines' as const");
  assert.ok(
    idxVaccinesId >= 0,
    "intake-report-builder.ts must contain the GroupSpec entry `id: 'vaccines' as const` (COS-480 chunk 129). Renaming the id breaks the ehrRowsByGroup keying (`{ vaccines: ... }`) and every EHR row silently vanishes from the report.",
  );
  // Read a small window around the id declaration — the spec closes at
  // the next `},` within a couple hundred characters.
  const window = BUILDER_SRC.slice(idxVaccinesId, idxVaccinesId + 400);
  assert.match(
    window,
    /title:\s*['"]Vaccines['"]/,
    "VACCINES GroupSpec must keep `title: 'Vaccines'` (chunk 129 lock). A retitle here shows up in the card header on every user's report and reads as a design regression, not a copy update.",
  );
  assert.match(
    window,
    /icon:\s*['"]vaccines['"]/,
    "VACCINES GroupSpec must keep `icon: 'vaccines'` (MaterialIcons name — chunk 129 lock). Swapping the icon breaks the locked visual palette.",
  );
  assert.match(
    window,
    /color:\s*['"]#0F766E['"]/i,
    "VACCINES GroupSpec must keep `color: '#0F766E'` (approved teal — chunk 129 lock). The color was chosen to be distinct from the other six group colors; drift moves the card out of the locked palette.",
  );
  assert.match(
    window,
    /keys:\s*\[\s*['"]vaccines['"]\s*\]/,
    "VACCINES GroupSpec must keep `keys: ['vaccines']` (single-key add_list — chunk 129 lock). Adding keys here pulls unrelated intake answers into the Vaccines card; removing the key severs the patient-added block from its data source.",
  );
});

// ---------------------------------------------------------------------------
// (g) Both render surfaces gate ehrRowsByGroup construction on
// IMMUNIZATIONS_EHR_ENABLED — the kill switch is the FIRST predicate,
// short-circuiting BEFORE any read of `immunizations.data`.
// ---------------------------------------------------------------------------

test('(g-screen) IntakeReportScreen.tsx short-circuits ehrRowsByGroup construction on IMMUNIZATIONS_EHR_ENABLED', () => {
  // The Ken-locked shape is a useMemo whose FIRST statement is
  // `if (!IMMUNIZATIONS_EHR_ENABLED) return undefined;`. That ordering
  // guarantees a flag-off render is byte-identical (at the buildReport
  // call site) to the pre-Phase-2 code path, so the OTA revert stays
  // atomic on the single FE constant.
  assert.match(
    SCREEN_SRC,
    /if\s*\(\s*!\s*IMMUNIZATIONS_EHR_ENABLED\s*\)\s*return\s+undefined\s*;?/,
    'IntakeReportScreen.tsx must open its `ehrRowsByGroup` useMemo with `if (!IMMUNIZATIONS_EHR_ENABLED) return undefined;` — the kill-switch guard has to be the FIRST predicate so a flag-off render passes `undefined` (not `{}`, not `{ vaccines: [] }`) to buildReport and looks byte-identical to the pre-Phase-2 code path. Drift here means the flag flip stops being a single-const OTA revert.',
  );
});

test('(g-share) ShareIntakeReportSection.tsx also gates ehrRowsByGroup construction on IMMUNIZATIONS_EHR_ENABLED', () => {
  // The PDF path uses an inline ternary rather than a useMemo — either
  // way, `IMMUNIZATIONS_EHR_ENABLED` must appear as a predicate on the
  // ehrRowsByGroup construction line so the flag flip flips both surfaces
  // in lockstep.
  const idx = SHARE_SRC.indexOf('ehrRowsByGroup');
  assert.ok(
    idx >= 0,
    "ShareIntakeReportSection.tsx must construct an `ehrRowsByGroup` payload for the PDF — has the Phase-2 plumbing been removed from the share surface?",
  );
  // Look at the construction site (a few hundred chars around the first
  // ehrRowsByGroup mention) and require IMMUNIZATIONS_EHR_ENABLED to
  // appear as a gate.
  const window = SHARE_SRC.slice(Math.max(0, idx - 100), idx + 400);
  assert.match(
    window,
    /IMMUNIZATIONS_EHR_ENABLED/,
    'ShareIntakeReportSection.tsx must reference IMMUNIZATIONS_EHR_ENABLED at the ehrRowsByGroup construction site. If this fails, flipping the kill switch off will hide the on-screen EHR block but the PDF will keep including it — the exact split-brain state the two-surface parity was designed to prevent.',
  );
});

// =========================================================================
// SELF-VERIFICATION — prove each wire snaps shut on the mutation it claims
// to catch (chunk 98/103/107/109/113/116/119/120 discipline).
// =========================================================================

test('self-check: wire (a) fails when IMMUNIZATIONS_EHR_ENABLED default drifts to true', () => {
  const brokenSrc =
    'export const IMMUNIZATIONS_EHR_ENABLED = true as const;\n';
  const stripped = stripComments(brokenSrc);
  assert.doesNotMatch(
    stripped,
    killSwitchAsConstFalseRegex(),
    'self-check: wire (a) must NOT match `= false as const` when the source declared `= true as const`. If this flips true, the regex is broken and wire (a) cannot detect a silent default flip.',
  );
});

test('self-check: wire (c) fails when the query key is nested / renamed', () => {
  const brokenSrc =
    "return useQuery({ queryKey: ['patient', 'immunizations'], queryFn });\n";
  const stripped = stripComments(brokenSrc);
  // The wire (c) regex looks for the FLAT tuple. On this mutated source,
  // the immediately-adjacent `'immunizations'` string DOES appear inside a
  // 2-element tuple — assert the wire is strict enough to reject that.
  const flatOnly = /\[\s*['"]immunizations['"]\s*\]/;
  assert.doesNotMatch(
    stripped,
    flatOnly,
    "self-check: wire (c) must NOT match `['patient', 'immunizations']` (two-element tuple). If this flips true, the wire cannot distinguish the flat convention from a nested key and Fasten-webhook invalidation drift goes unnoticed.",
  );
});

test('self-check: wire (e) fails when a subheader string is retitled', () => {
  const brokenSrc = [
    '<Text>FROM EHR</Text>',
    '<Text>YOU ADDED THIS</Text>',
  ].join('\n');
  const stripped = stripComments(brokenSrc);
  assert.doesNotMatch(
    stripped,
    /FROM YOUR HEALTH RECORDS/,
    'self-check: wire (e) must NOT match `FROM YOUR HEALTH RECORDS` when the source rendered `FROM EHR`. If this flips true, the wire is doing substring-of-substring matching and cannot detect a copy retitle.',
  );
});

test('self-check: wire (g-screen) fails when the flag guard is dropped', () => {
  const brokenSrc = [
    'const ehrRowsByGroup = React.useMemo(() => {',
    '  const list = immunizations.data;',
    '  if (!list || list.length === 0) return undefined;',
    '  return { vaccines: list.map(immunizationToRow) };',
    '}, [immunizations.data]);',
  ].join('\n');
  const stripped = stripComments(brokenSrc);
  assert.doesNotMatch(
    stripped,
    /if\s*\(\s*!\s*IMMUNIZATIONS_EHR_ENABLED\s*\)\s*return\s+undefined\s*;?/,
    'self-check: wire (g-screen) must NOT match when the flag guard is removed. If this flips true, the kill switch could be silently bypassed without the wire firing.',
  );
});

test('self-check: wire (f) fails when the vaccines GroupSpec is recolored', () => {
  // Simulate a "Phase 2 merge re-wrote the spec" failure mode where the
  // color drifted while everything else stayed put. The window regex must
  // reject the mutated color.
  const brokenSrc = [
    "id: 'vaccines' as const,",
    "title: 'Vaccines',",
    "icon: 'vaccines',",
    "color: '#123456',",
    "keys: ['vaccines'],",
  ].join('\n');
  const stripped = stripComments(brokenSrc);
  assert.doesNotMatch(
    stripped,
    /color:\s*['"]#0F766E['"]/i,
    "self-check: wire (f) color assertion must NOT match `#123456`. If this flips true, the wire is color-agnostic and a palette drift goes undetected.",
  );
});
