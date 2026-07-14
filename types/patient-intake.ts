// Mirror of cos-backend PR #265 PatientIntake contract. Domain-only.
// Kept in sync with the backend types module; do NOT add envelope wrappers here
// (envelope stays inline at call sites per house style).

export type IntakeStatus = 'in_progress' | 'complete';

export type IntakeAddListItem = { label: string; note?: string };

export type IntakeAnswerValue =
  | string
  | number
  | boolean
  | Array<string | number>
  | IntakeAddListItem[]
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
  // Max character length for `text` type inputs.
  maxLength?: number;
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
