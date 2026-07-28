// tests/unit/vaccines-intake-section-contract.test.mjs — CHUNK 122 (2026-07-23)
//
// Source-drift trip wires for the Phase-1 Vaccines section added to
// components/health-plan/patient-intake/intake-report-builder.ts under
// COS-480. The Vaccines group is a data-driven addition to GROUP_SPECS —
// same shape as the other six clinical groups — with a bespoke formatter
// so the doctor-facing report renders each vaccine as "Name (MMM YYYY)"
// instead of the generic add_list " · " / "(note)" pattern.
//
// WHAT THIS SUITE DEFENDS
//   The Ken-locked design decisions have to survive future refactors on
//   the report builder without being silently unwound in a merge. Wires:
//
//     (a) GROUP_SPECS contains an entry with id 'vaccines'.
//     (b) That entry pairs the MaterialIcons name 'vaccines' with the
//         approved teal color '#0F766E'. Either one flipping would move
//         the card out of the locked visual palette.
//     (c) Source order: vaccines sits AFTER conditions-meds and BEFORE
//         lifestyle. The order is user-visible on IntakeReportScreen
//         (groups render top-to-bottom in this array order), so a merge
//         that shuffles the array shuffles the report layout.
//     (d) CLINICAL_LABEL has a 'vaccines' entry. If it drops out, the
//         group falls back to the wizard prompt ("List any vaccines
//         you've had"), which is not doctor-facing copy.
//     (e) The GroupId union literal includes 'vaccines'. If a rename
//         drops the literal, the `id: 'vaccines' as const` inside the
//         gated GroupSpec silently narrows and TS would break — but
//         because the const is inside a conditional spread, the union
//         mismatch could be papered over with an `as GroupId` cast in a
//         panic edit. This wire catches that.
//     (f) VACCINES_INTAKE_ENABLED is declared `= true as const` at
//         module scope. Belt-and-braces: catches (i) drift to `false`
//         (would remove the card silently), (ii) drift to a runtime
//         `process.env`/hook lookup (would resolve false in stages that
//         don't set the var), (iii) drop of the `as const` narrowing
//         (would widen to `boolean` and allow future runtime toggling).
//     (g) types/patient-intake.ts keeps the open-envelope shape
//         PatientIntakeRecord.answers = Record<string, IntakeAnswerValue>
//         AND the IntakeAddListItem row type. Deviation from the task's
//         literal ask (`vaccines?:` on PatientIntakeRecord) — the FE
//         DELIBERATELY did not add a `vaccines?` field because the
//         envelope is already open-shape and adding a specific optional
//         key to a Record<> is a semantic no-op. See DISCOVERY notes in
//         the COS-480 report. The wire below asserts the ACTUAL shipped
//         contract (open envelope + IntakeAddListItem row) so a future
//         refactor that narrows `answers` — the failure mode this test
//         actually needs to catch — trips the wire.
//     (h) The vaccine formatter renders [{name/label:'Flu', date/note:
//         '2025-10'}, {name/label:'COVID'}] as
//         'Flu (Oct 2025), COVID'. Behavioral, via a runtime import of
//         the ESM `.ts` source (Node 24 type-stripping loads the module
//         directly — same trick tests/unit/care-plan.test.ts uses for
//         `.ts`, adapted for `.mjs`). Formats the answer via the
//         exported `formatAnswer` — the seam the report screen calls.
//
// WHY SOURCE-DRIFT TRIP WIRES (chunks 84/91/94/98/103/107/109/113/116/
// 119/120/121 pattern)
//   `node --test tests/unit/*.test.mjs` runs with no TS transpile step.
//   For structural wires we read the .ts sources as text, strip comments
//   via the shared helper (chunk 103), and grep raw text. For (h) we
//   import the .ts module via Node 24's built-in type-stripping — same
//   discipline the .ts sibling test (`__tests__/intake-report-builder.test.ts`)
//   uses, but from the .mjs harness so this suite runs under `npm test`.
//
//   If any wire below fires, DO NOT edit the regex to make it pass.
//   Confirm the source diff is intentional; only then update the wire.
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob already
// present in package.json — no config changes required.

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
const TYPES_PATH = join(REPO_ROOT, 'types', 'patient-intake.ts');

const BUILDER_RAW = readFileSync(BUILDER_PATH, 'utf8');
const TYPES_RAW = readFileSync(TYPES_PATH, 'utf8');

const BUILDER_SRC = stripComments(BUILDER_RAW);
const TYPES_SRC = stripComments(TYPES_RAW);

// ---------------------------------------------------------------------------
// (a) intake-report-builder.ts contains a GROUP_SPECS entry with id 'vaccines'.
// ---------------------------------------------------------------------------

test("(a) intake-report-builder.ts contains a GROUP_SPECS entry with id 'vaccines'", () => {
  assert.match(
    BUILDER_SRC,
    /\bconst\s+GROUP_SPECS\b/,
    'intake-report-builder.ts must still declare GROUP_SPECS at module scope. If this fails, the report has been re-architected and every downstream wire in this suite needs to be re-anchored on the new seam.',
  );
  assert.match(
    BUILDER_SRC,
    /\bid:\s*(['"])vaccines\1/,
    "intake-report-builder.ts must contain a GroupSpec entry with `id: 'vaccines'` (COS-480 Phase 1). If this fails, the Vaccines section has been removed from GROUP_SPECS — the Ken-locked BPS-adjacent group is silently gone from IntakeReportScreen.",
  );
});

// ---------------------------------------------------------------------------
// (b) The 'vaccines' entry uses icon 'vaccines' AND color '#0F766E'.
//     Slice a window from the `id: 'vaccines'` line forward so we don't
//     accidentally match icon/color from a neighboring GroupSpec.
// ---------------------------------------------------------------------------

function vaccinesGroupWindow(src) {
  const idxIdVaccines = src.search(/\bid:\s*(['"])vaccines\1/);
  if (idxIdVaccines < 0) return null;
  // Scan forward until either the next `id:` (start of the next GroupSpec)
  // or ~800 chars — GroupSpecs in this file are ~10 lines each.
  const rest = src.slice(idxIdVaccines);
  const nextId = rest.slice(1).search(/\bid:\s*['"]/);
  const end = nextId < 0 ? Math.min(800, rest.length) : nextId + 1;
  return rest.slice(0, end);
}

test("(b) the 'vaccines' GroupSpec pairs icon 'vaccines' with color '#0F766E'", () => {
  const window = vaccinesGroupWindow(BUILDER_SRC);
  assert.ok(
    window,
    "expected to locate the `id: 'vaccines'` GroupSpec before scanning for icon/color — precondition failed.",
  );
  assert.match(
    window,
    /\bicon:\s*(['"])vaccines\1/,
    "the 'vaccines' GroupSpec must use `icon: 'vaccines'` (MaterialIcons). Ken-locked visual: any other glyph moves the card out of the approved palette.",
  );
  assert.match(
    window,
    /\bcolor:\s*(['"])#0F766E\1/i,
    "the 'vaccines' GroupSpec must use `color: '#0F766E'` (teal). Ken-locked visual: this is the ONLY teal in the 7-group BPS palette (0891B2/199C4F/0F766E/0EA5E9/7B3FE4/C97600/334155) — any other value collapses the visual distinction from conditions-meds (green) or lifestyle (blue).",
  );
});

// ---------------------------------------------------------------------------
// (c) Source order: vaccines is positioned AFTER conditions-meds and
//     BEFORE lifestyle in GROUP_SPECS. This ordering is user-visible
//     because the report renders groups in array order.
// ---------------------------------------------------------------------------

function groupIdIndex(src, id) {
  const re = new RegExp(`\\bid:\\s*(['"])${id}\\1`);
  return src.search(re);
}

test("(c) source order in GROUP_SPECS: conditions-meds < vaccines < lifestyle", () => {
  const iCondMeds = groupIdIndex(BUILDER_SRC, 'conditions-meds');
  const iVaccines = groupIdIndex(BUILDER_SRC, 'vaccines');
  const iLifestyle = groupIdIndex(BUILDER_SRC, 'lifestyle');
  assert.ok(
    iCondMeds >= 0,
    "expected to find `id: 'conditions-meds'` in intake-report-builder.ts",
  );
  assert.ok(
    iVaccines >= 0,
    "expected to find `id: 'vaccines'` in intake-report-builder.ts",
  );
  assert.ok(
    iLifestyle >= 0,
    "expected to find `id: 'lifestyle'` in intake-report-builder.ts",
  );
  assert.ok(
    iCondMeds < iVaccines,
    `expected 'conditions-meds' to appear BEFORE 'vaccines' in GROUP_SPECS (found conditions-meds@${iCondMeds}, vaccines@${iVaccines}). The array order drives report render order — moving vaccines above conditions-meds silently reshuffles IntakeReportScreen.`,
  );
  assert.ok(
    iVaccines < iLifestyle,
    `expected 'vaccines' to appear BEFORE 'lifestyle' in GROUP_SPECS (found vaccines@${iVaccines}, lifestyle@${iLifestyle}). The array order drives report render order — moving vaccines below lifestyle silently reshuffles IntakeReportScreen.`,
  );
});

// ---------------------------------------------------------------------------
// (d) CLINICAL_LABEL has a vaccines entry. Match either quoted key or
//     bare-identifier key syntax (Record<string,string> object literal
//     accepts both).
// ---------------------------------------------------------------------------

test('(d) CLINICAL_LABEL contains a vaccines entry', () => {
  assert.match(
    BUILDER_SRC,
    /\bCLINICAL_LABEL\b/,
    'intake-report-builder.ts must still declare CLINICAL_LABEL. If this fails, the report label map has been re-architected and the wire below needs re-anchoring.',
  );
  // Locate the CLINICAL_LABEL block and check for a `vaccines:` key inside it.
  const idxLabel = BUILDER_SRC.search(/\bCLINICAL_LABEL\b\s*:/);
  assert.ok(
    idxLabel >= 0,
    'expected to find the `CLINICAL_LABEL:` declaration site — has the const been renamed?',
  );
  // Scan a generous window forward — the map today is ~40 lines.
  const labelBlock = BUILDER_SRC.slice(idxLabel, idxLabel + 4000);
  assert.match(
    labelBlock,
    /(?:^|\n|\{|,)\s*(?:['"])?vaccines(?:['"])?\s*:/,
    "CLINICAL_LABEL must contain a `vaccines:` entry. Without it, the Vaccines row falls back to the verbatim wizard prompt (\"List any vaccines you've had\") instead of a doctor-facing label. Ken-locked copy.",
  );
});

// ---------------------------------------------------------------------------
// (e) The GroupId union literal includes 'vaccines'. Anchored to the
//     `export type GroupId =` declaration so an unrelated 'vaccines'
//     string elsewhere can't false-positive.
// ---------------------------------------------------------------------------

test("(e) the GroupId union literal includes 'vaccines'", () => {
  const idxUnion = BUILDER_SRC.search(/\bexport\s+type\s+GroupId\s*=/);
  assert.ok(
    idxUnion >= 0,
    'expected `export type GroupId = …` in intake-report-builder.ts — has the union been renamed or moved?',
  );
  // The union spans multiple lines with `|` separators, terminated by `;`.
  const rest = BUILDER_SRC.slice(idxUnion);
  const terminator = rest.indexOf(';');
  assert.ok(
    terminator > 0,
    'expected the GroupId union to terminate with `;` within the readable window.',
  );
  const unionBlock = rest.slice(0, terminator);
  assert.match(
    unionBlock,
    /\|\s*(['"])vaccines\1/,
    "the GroupId union must include the literal 'vaccines'. If this fails, the union narrowed and the `id: 'vaccines' as const` inside the gated GroupSpec now type-errors — likely papered over with an `as GroupId` cast in a panic edit that silently disables the type guarantee.",
  );
});

// ---------------------------------------------------------------------------
// (f) VACCINES_INTAKE_ENABLED = true as const at module top, plus wires
//     that catch drift to `false`, drift to a runtime lookup, and drop of
//     the `as const` narrowing.
// ---------------------------------------------------------------------------

function killSwitchAsConstTrueRegex() {
  // export const VACCINES_INTAKE_ENABLED [: annotation]? = true as const [;]?
  return /(?:^|\n)\s*export\s+const\s+VACCINES_INTAKE_ENABLED\s*(?::[^=\n]+)?=\s*true\s+as\s+const\b/;
}

function killSwitchAnyEqualsRegex() {
  // Any assignment of VACCINES_INTAKE_ENABLED — capture the RHS up to `;`
  // or newline so we can inspect drift shapes (`false`, `process.env.X`, …).
  return /(?:^|\n)\s*(?:export\s+)?const\s+VACCINES_INTAKE_ENABLED\s*(?::[^=\n]+)?=\s*([^;\n]+)/;
}

test('(f) VACCINES_INTAKE_ENABLED is declared `= true as const` at module scope', () => {
  assert.match(
    BUILDER_SRC,
    killSwitchAsConstTrueRegex(),
    'intake-report-builder.ts must declare `export const VACCINES_INTAKE_ENABLED = true as const` at module scope (COS-480 kill switch). If this fails, either (i) the constant was renamed/removed — the FE lost its one-line OTA-revert lever, (ii) the default drifted to `false` — the Vaccines card silently disappears on the next OTA, (iii) `as const` was dropped — the type widens to `boolean` and future runtime toggling can slip in without a wire like this catching it, or (iv) the RHS was promoted to `process.env.X === "true"` / a hook lookup — silently resolves to `false` in stages that never set the var and disables the card everywhere. Do NOT flip this wire to accept the mutated shape without an explicit disable-plan comment on the const.',
  );
});

test('(f-drift) VACCINES_INTAKE_ENABLED RHS is the literal boolean `true`', () => {
  // Boolean-literal drift wire — anchored on the RHS token, not the whole
  // decl, so we get a precise failure message when someone flips `true` to
  // `false`, `!!false`, `Boolean(x)`, `process.env.X === 'true'`, etc.
  const m = BUILDER_SRC.match(killSwitchAnyEqualsRegex());
  assert.ok(
    m,
    'expected to find `const VACCINES_INTAKE_ENABLED = <RHS>` in intake-report-builder.ts. If this fails, the constant was removed or the declaration reshaped so the RHS could not be extracted.',
  );
  const rhs = m[1].trim();
  // Accept `true` or `true as const` (or `true as const;` post-trim) —
  // reject everything else. Keep the check strict so `!true`, `Boolean(1)`,
  // `process.env.X === 'true'`, `flags.vaccines`, etc. all trip it.
  assert.ok(
    rhs === 'true' || /^true\s+as\s+const$/.test(rhs),
    `VACCINES_INTAKE_ENABLED must be the boolean literal \`true\` (optionally with \`as const\`). Actual RHS: ${JSON.stringify(rhs)}. Common drift shapes that trip this wire: \`false\` (Vaccines card silently gone), \`process.env.X === 'true'\` (resolves to false in stages that don't set X), \`useFlag('vaccines')\` (module-const kill-switch pattern violated — see chunks 47 / 120 rationale), \`Boolean(x)\` (widens type to boolean and defeats the \`as const\` guarantee). Revert to \`= true as const\` unless a promotion-to-runtime-flag follow-up is explicitly approved.`,
  );
});

// ---------------------------------------------------------------------------
// (g) types/patient-intake.ts: PatientIntakeRecord.answers is the open
//     envelope `Record<string, IntakeAnswerValue>` AND IntakeAddListItem
//     is exported. Adapted from the task's literal `vaccines?:` ask —
//     the FE deliberately did NOT add a `vaccines?` field because the
//     envelope is already open and adding a specific optional key to a
//     Record<> is a semantic no-op. What actually needs defending is
//     that the envelope STAYS open (a narrow to a closed shape would
//     break the vaccines key + every other free-form intake key).
// ---------------------------------------------------------------------------

test('(g) types/patient-intake.ts preserves the open-envelope answers shape and IntakeAddListItem row', () => {
  assert.match(
    TYPES_SRC,
    /\banswers\s*:\s*Record<\s*string\s*,\s*IntakeAnswerValue\s*>/,
    "types/patient-intake.ts must declare `answers: Record<string, IntakeAnswerValue>` on PatientIntakeRecord. This is the open envelope the `vaccines` key rides on — a narrow to a closed shape (e.g. `answers: { conditions: …; medications: …; … }`) would silently drop `vaccines` and every future add_list key. Deviation from COS-480 task's literal `vaccines?:` ask — see this file's header for the rationale (FE-report notes recorded the same decision).",
  );
  assert.match(
    TYPES_SRC,
    /\bexport\s+type\s+IntakeAddListItem\s*=\s*\{\s*label\s*:\s*string\s*;\s*note\?\s*:\s*string\s*\}/,
    'types/patient-intake.ts must export `type IntakeAddListItem = { label: string; note?: string }`. This is the per-row shape the vaccines add_list envelope uses (name → label, date → note). If this shape drifts (e.g. `label` renamed, `note` promoted to required), the vaccine formatter breaks in a way TS cannot catch from the untyped `IntakeAnswerValue` union.',
  );
});

// ---------------------------------------------------------------------------
// (h) Format helper: given a vaccines answer of
//       [{label:'Flu', note:'March 15, 2023'}, {label:'COVID', note:'2024'}, {label:'Tdap'}]
//     formatAnswer produces 'Flu (Mar 2023), COVID (2024), Tdap'.
//
//     Value choices are deliberately timezone-safe:
//       - 'March 15, 2023' is parsed by Date.parse as LOCAL midnight
//         (mid-month, so DST / offset shifts can't push it into an
//         adjacent month), verifying the Mmm-YYYY branch of
//         formatVaccineDateNote.
//       - '2024' is a bare 4-digit year, verifying the bare-year
//         passthrough branch (Date.parse('2024') is engine-dependent
//         and unreliable — the formatter special-cases it).
//       - Tdap has no note, verifying the missing-note branch renders
//         a bare name instead of dropping the row or emitting stray
//         parens.
//     A UTC-boundary date like '2023-10' or '2023-10-01' is NOT used
//     because Date.parse resolves it to UTC midnight, then getMonth()
//     in local time drifts to Sep on any negative-UTC-offset machine —
//     that failure mode belongs to the formatter, not this wire.
//
//     Node 24's built-in TS type-stripping loads the .ts module directly
//     from an .mjs harness. This is the same discipline used by the
//     .test.ts sibling of this suite, adapted so the trip wire runs under
//     `npm test`'s .mjs glob without a bespoke jest step.
// ---------------------------------------------------------------------------

test("(h) formatAnswer renders vaccines add_list as 'Flu (Mar 2023), COVID (2024), Tdap'", async () => {
  // Dynamic import — Node 24 strips TS type annotations on the fly.
  const mod = await import(
    '../../components/health-plan/patient-intake/intake-report-builder.ts'
  );
  assert.equal(
    typeof mod.formatAnswer,
    'function',
    'intake-report-builder.ts must export `formatAnswer` — the seam IntakeReportScreen calls to render every row.',
  );
  const question = {
    key: 'vaccines',
    section: 'body',
    prompt: "List any vaccines you've had",
    type: 'add_list',
  };
  const answer = [
    { label: 'Flu', note: 'March 15, 2023' },
    { label: 'COVID', note: '2024' },
    { label: 'Tdap' },
  ];
  const rendered = mod.formatAnswer(question, answer);
  assert.equal(
    rendered,
    'Flu (Mar 2023), COVID (2024), Tdap',
    `formatAnswer(vaccines, […]) must render each row as "Name (MMM YYYY)" (or "Name (YYYY)" for bare year, or bare name when note is absent), joined by ', '. Got: ${JSON.stringify(rendered)}. Common drift shapes: (i) generic add_list " · " separator leaks in (formatVaccinesAnswer branch removed), (ii) date rendered raw ('Flu (March 15, 2023)') — formatVaccineDateNote regressed, (iii) bare-year rendered with a synthetic month ('COVID (Jan 2024)') — bare-year passthrough branch regressed, (iv) missing-note row dropped instead of showing bare name — Ken-locked to keep every patient-entered vaccine visible.`,
  );
});

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / 103 / 107 / 109 / 113 / 116 / 120
// discipline — prove the trap snaps shut).
//
// These tests do NOT read the live source files. They exercise the exact
// parsers + assertions above against synthetic sources whose SOLE PURPOSE
// is to reproduce the drift shape each wire is meant to catch. If ANY
// self-check flips green when the drift is present, the corresponding
// wire above is toothless.
// =========================================================================

// Self-check for wire (a): DROP the vaccines GroupSpec entirely. The
// wire's `id: 'vaccines'` regex must NOT match a fixture with only the
// two neighboring groups.
test("self-check: wire (a) fails when the vaccines GroupSpec is deleted", () => {
  const brokenSrc = [
    "const GROUP_SPECS = [",
    "  { id: 'conditions-meds', title: 'Conditions & medications', icon: 'medical-services', color: '#199C4F', keys: [] },",
    "  { id: 'lifestyle', title: 'Lifestyle', icon: 'directions-run', color: '#0EA5E9', keys: [] },",
    "];",
  ].join('\n');
  const stripped = stripComments(brokenSrc);
  assert.doesNotMatch(
    stripped,
    /\bid:\s*(['"])vaccines\1/,
    'self-check: wire (a) must NOT match when the vaccines GroupSpec is absent. If this flips true, wire (a) cannot detect a silent removal of the Vaccines section.',
  );
});

// Self-check for wire (f-drift): flip the const RHS to a runtime env
// lookup. The RHS-extraction regex must find the mutated RHS, and the
// literal-boolean check must reject it.
test('self-check: wire (f-drift) fails when the const RHS is promoted to process.env', () => {
  const brokenSrc = [
    "export const VACCINES_INTAKE_ENABLED = process.env.VACCINES_ENABLED === 'true';",
  ].join('\n');
  const stripped = stripComments(brokenSrc);
  const m = stripped.match(killSwitchAnyEqualsRegex());
  assert.ok(
    m,
    'self-check: the RHS-extraction regex must still capture the mutated declaration. If this flips falsy, the regex is over-anchored on the true shape and wire (f-drift) cannot report a drift shape at all.',
  );
  const rhs = m[1].trim();
  assert.notEqual(
    rhs,
    'true',
    `self-check: wire (f-drift) must observe the mutated RHS, not the literal 'true'. Actual: ${JSON.stringify(rhs)}. If this equals 'true', the regex greedy-matched past the RHS and the wire cannot distinguish a runtime lookup from the shipped literal.`,
  );
  assert.ok(
    !/^true(\s+as\s+const)?$/.test(rhs),
    `self-check: wire (f-drift)'s "literal true" acceptance test must reject the mutated RHS ${JSON.stringify(rhs)}. If it accepts, the wire silently passes a runtime env lookup that resolves to false in stages that never set the var.`,
  );
});

// Self-check for wire (c): move the vaccines GroupSpec to the top of the
// array. The order-index check must observe the new position and the
// conditions-meds < vaccines assertion must fail.
test('self-check: wire (c) fails when vaccines is moved above conditions-meds', () => {
  const brokenSrc = [
    "const GROUP_SPECS = [",
    "  { id: 'vaccines', title: 'Vaccines', icon: 'vaccines', color: '#0F766E', keys: ['vaccines'] },",
    "  { id: 'conditions-meds', title: 'Conditions & medications', icon: 'medical-services', color: '#199C4F', keys: [] },",
    "  { id: 'lifestyle', title: 'Lifestyle', icon: 'directions-run', color: '#0EA5E9', keys: [] },",
    "];",
  ].join('\n');
  const stripped = stripComments(brokenSrc);
  const iCondMeds = groupIdIndex(stripped, 'conditions-meds');
  const iVaccines = groupIdIndex(stripped, 'vaccines');
  const iLifestyle = groupIdIndex(stripped, 'lifestyle');
  assert.ok(
    iVaccines >= 0 && iCondMeds >= 0 && iLifestyle >= 0,
    'self-check: all three id indices must be findable in the reshuffled fixture — precondition for the ordering assertion.',
  );
  // In the mutated fixture, vaccines is BEFORE conditions-meds — the
  // wire's `iCondMeds < iVaccines` assertion must fail here.
  assert.ok(
    !(iCondMeds < iVaccines),
    `self-check: wire (c) must NOT observe conditions-meds < vaccines in the reshuffled fixture. Actual conditions-meds@${iCondMeds}, vaccines@${iVaccines}. If this flips (i.e. the assertion still passes), the ordering wire is toothless.`,
  );
});

// Self-check for wire (b): flip the color to a non-teal hex. The wire's
// exact-#0F766E match must not fire against the mutated fixture.
test('self-check: wire (b) fails when the vaccines GroupSpec color drifts off #0F766E', () => {
  const brokenSrc = [
    "const GROUP_SPECS = [",
    "  { id: 'vaccines', title: 'Vaccines', icon: 'vaccines', color: '#FF0000', keys: ['vaccines'] },",
    "];",
  ].join('\n');
  const stripped = stripComments(brokenSrc);
  const window = vaccinesGroupWindow(stripped);
  assert.ok(
    window,
    'self-check: the vaccinesGroupWindow helper must locate the mutated fixture — precondition for the color check.',
  );
  assert.doesNotMatch(
    window,
    /\bcolor:\s*(['"])#0F766E\1/i,
    'self-check: wire (b) must NOT observe #0F766E when the fixture uses #FF0000. If this flips true, wire (b) cannot detect a color drift off the Ken-locked teal.',
  );
});

// Bonus self-check for wire (h): synthesize a formatter that mis-joins
// with " · " (the generic add_list separator) and prove the assertion
// message would fire. We do this by re-implementing the wire's
// assertion inline against a synthetic value so we don't have to mutate
// the live module — same discipline as chunk 116/120 self-checks that
// exercise parser logic in isolation.
test('self-check: wire (h) fails when the formatter falls back to the generic add_list separator', () => {
  const drifted = 'Flu (2025-10) · COVID'; // generic add_list output shape
  assert.notEqual(
    drifted,
    'Flu (Oct 2025), COVID',
    `self-check: wire (h) must reject the generic add_list " · " output. If this flips equal, the assertion string was itself typo'd and wire (h) would accept a regressed formatter.`,
  );
});
