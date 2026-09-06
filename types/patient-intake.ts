// Mirror of cos-backend PR #265 PatientIntake contract. Domain-only.
// Kept in sync with the backend types module; do NOT add envelope wrappers here
// (envelope stays inline at call sites per house style).

export type IntakeStatus = 'in_progress' | 'complete';

// SCRUM-659 followup (2026-08-05): `linkedIds` threads each add_list
// item to the labels of an earlier add_list question. Used for
// medications → conditions and psychotropic meds → mental health dx.
export type IntakeAddListItem = { label: string; note?: string; linkedIds?: string[] };

// SCRUM-659 followup — single-choice answer with an optional "specify"
// free text (rendered when the selected option has `specifyOnSelect`).
// Legacy single-choice answers remain bare strings.
export type IntakeSingleWithSpecify = { choice: string; specify?: string };

export type IntakeAnswerValue =
  | string
  | number
  | boolean
  | Array<string | number>
  | IntakeAddListItem[]
  | IntakeSingleWithSpecify
  | null;

export type IntakeSection = 'body' | 'mind' | 'life';

export type IntakeQuestionType =
  | 'text'
  | 'number'
  | 'single'
  | 'multi'
  | 'scale'
  | 'add_list';

export type IntakeScreenerKind = 'phq2' | 'gad2' | 'pss4' | 'lsns6';

export interface IntakeQuestionOption {
  // BE ships numbers for scale options and `age_bracket` style; strings elsewhere.
  value: string | number;
  label: string;
  // SCRUM-659 followup — when this option is selected on a `single`
  // question, the FE renders a companion free-text field whose answer
  // is persisted as `{ choice, specify }` (see IntakeSingleWithSpecify).
  specifyOnSelect?: boolean;
}

export interface IntakeQuestion {
  key: string;
  section: IntakeSection;
  prompt: string;
  type: IntakeQuestionType;
  // Required for `single` / `multi`; screener scales derive options from screener kind.
  options?: IntakeQuestionOption[];
  // When present, ScaleQuestion uses validated PHQ/GAD/PSS/LSNS ranges.
  screener?: IntakeScreenerKind;
  // Human helper copy shown below the prompt.
  hint?: string;
  // Bounds for `number` type inputs.
  min?: number;
  max?: number;
  /**
   * COS-927 — a richer INPUT for a question whose stored answer is unchanged.
   *
   * 'height': still a `number` of INCHES, still the same min/max, but rendered
   * as feet+inches or centimetres instead of an unlabelled box.
   *
   * A HINT rather than a new `type` on purpose: the renderer's switch has a
   * `default` arm that returns null, so a new type would show the prompt with
   * NO INPUT on any build that predates the component. An unknown optional
   * field is simply ignored, so an older build keeps the number box it has
   * always shown. Backward compatible by construction, no flag to sequence.
   */
  inputHint?: 'height';
  // Max character length for `text` type inputs.
  maxLength?: number;
  // `add_list`-only: contextual placeholder copy for the per-row label + optional
  // note inputs the wizard's AddListQuestion already renders. When absent the
  // wizard falls through to its generic defaults ("Add an item…" / "Optional
  // note"). BE source of truth: cos-backend/src/config/intake-questions.ts
  // (`IntakeQuestion.addListLabelPlaceholder` / `addListNotePlaceholder`) —
  // introduced with the Vaccines section (COS-480) so patients see
  // "Vaccine name" / "Date (optional)" without inventing a new question type.
  addListLabelPlaceholder?: string;
  addListNotePlaceholder?: string;
  // SCRUM-659 followup — add_list rows can link to items of another
  // add_list question by label. FE renders a compact multi-select on
  // each row offering the source question's current item labels. When
  // absent, no link picker is rendered (byte-identical add_list UX).
  linkSourceKey?: string;
  linkPickerLabel?: string;
  // Machine-only prefill signal (NOT user copy) — BE union of supported sources.
  ehrPrefillHint?:
    | 'conditions'
    | 'medications'
    | 'allergies'
    | 'demographics'
    | 'health_metrics';
  required?: boolean;
}

export interface PatientIntakeRecord {
  userId: string;
  version: number;
  status: IntakeStatus;
  startedAt: string;
  completedAt?: string;
  answers: Record<string, IntakeAnswerValue>;
}

export interface PatientIntakePointer {
  version: number;
  status: IntakeStatus;
  startedAt: string;
  completedAt?: string;
}

export type IntakeErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_ANSWER'
  | 'NO_INTAKE_IN_PROGRESS'
  | 'INTAKE_IN_PROGRESS'
  | 'INTAKE_MISSING';
