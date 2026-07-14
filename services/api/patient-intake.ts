import { apiClient } from '@/lib/api-client';
import type {
  IntakeAnswerValue,
  IntakeQuestion,
  PatientIntakePointer,
  PatientIntakeRecord,
} from '@/types/patient-intake';

/**
 * Patient intake API client — HS-1 / SCRUM-590.
 *
 * Six thin wrappers around `/v1/patients/me/intake` served by cos-backend
 * PR #265. Envelope typing stays inline on the axios generic per house style
 * (no shared `ApiEnvelope<T>` helper — see `services/api/biopsychosocial-plan.ts`
 * for the same pattern).
 *
 * Error surfaces (see `IntakeErrorCode` in `@/types/patient-intake`):
 *  - GET  swallows `NO_INTAKE_IN_PROGRESS` → `{ intake: null, questions: [] }`
 *    so the wizard's auto-start path collapses "no intake yet" and "flag off"
 *    into a single falsy branch. Defensive — BE does not currently throw this
 *    on GET, but is documented as reserved.
 *  - POST / and POST /retake throw `IntakeConflictError('INTAKE_IN_PROGRESS')`.
 *  - PATCH throws `IntakeAnswerError` (carrying `details.key` for inline field
 *    UX) on `INVALID_ANSWER`, and `IntakeConflictError('NO_INTAKE_IN_PROGRESS')`
 *    when the intake was completed/discarded mid-session.
 *  - POST /complete throws `IntakeConflictError('NO_INTAKE_IN_PROGRESS')`.
 *  - `INVALID_BODY` and `INTAKE_MISSING` are not translated — they bubble as
 *    plain axios errors and surface via the wizard's passive error text.
 */

const BASE = '/v1/patients/me/intake';

/**
 * 409-conflict surface for the two "wrong intake state" codes. Callers catch
 * this to branch UI (e.g. `useStartIntake` swallows `INTAKE_IN_PROGRESS` so
 * a double-tap simply refetches the in-flight record).
 */
export class IntakeConflictError extends Error {
  code: 'NO_INTAKE_IN_PROGRESS' | 'INTAKE_IN_PROGRESS';
  constructor(
    code: 'NO_INTAKE_IN_PROGRESS' | 'INTAKE_IN_PROGRESS',
    message: string,
  ) {
    super(message);
    this.name = 'IntakeConflictError';
    this.code = code;
  }
}

/**
 * 400 `INVALID_ANSWER` surface. `key` mirrors the offending
 * `IntakeQuestion.key` from the BE's `details.key` so the wizard can
 * highlight the specific question card without a second lookup.
 */
export class IntakeAnswerError extends Error {
  code = 'INVALID_ANSWER' as const;
  key?: string;
  constructor(message: string, key?: string) {
    super(message);
    this.name = 'IntakeAnswerError';
    this.key = key;
  }
}

function readCode(err: unknown): string | undefined {
  return (
    err as {
      response?: { data?: { code?: string; details?: { key?: string } } };
    }
  )?.response?.data?.code;
}

function readDetailKey(err: unknown): string | undefined {
  return (
    err as {
      response?: { data?: { details?: { key?: string } } };
    }
  )?.response?.data?.details?.key;
}

/**
 * GET `/v1/patients/me/intake` → the caller's current intake record plus the
 * question set to render. Returns `{ intake: null, questions: [] }` on
 * `NO_INTAKE_IN_PROGRESS` so the wizard can auto-start without an extra try.
 */
export async function fetchIntake(): Promise<{
  intake: PatientIntakeRecord | null;
  questions: IntakeQuestion[];
}> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: {
        intake: PatientIntakeRecord | null;
        questions: IntakeQuestion[];
      };
    }>(BASE);
    return {
      intake: res.data.data.intake ?? null,
      questions: res.data.data.questions ?? [],
    };
  } catch (err) {
    if (readCode(err) === 'NO_INTAKE_IN_PROGRESS') {
      return { intake: null, questions: [] };
    }
    throw err;
  }
}

/**
 * POST `/v1/patients/me/intake` — start a new intake. Throws
 * `IntakeConflictError('INTAKE_IN_PROGRESS')` when the BE reports one is
 * already open (the hook layer swallows this and refetches).
 */
export async function startIntake(): Promise<PatientIntakeRecord> {
  try {
    const res = await apiClient.post<{
      success: boolean;
      data: { intake: PatientIntakeRecord };
    }>(BASE);
    return res.data.data.intake;
  } catch (err) {
    if (readCode(err) === 'INTAKE_IN_PROGRESS') {
      throw new IntakeConflictError(
        'INTAKE_IN_PROGRESS',
        'Intake already in progress',
      );
    }
    throw err;
  }
}

/**
 * PATCH `/v1/patients/me/intake` — persist a partial answer map and receive
 * the updated record. Throws `IntakeAnswerError` (with `key`) on
 * `INVALID_ANSWER` and `IntakeConflictError` on `NO_INTAKE_IN_PROGRESS`.
 */
export async function patchIntakeAnswers(
  answers: Record<string, IntakeAnswerValue>,
): Promise<PatientIntakeRecord> {
  // Mirror BE's INVALID_BODY 400 short-circuit so we don't burn a round-trip
  // (and a Sentry breadcrumb) on an empty patch. Thrown as IntakeAnswerError
  // with a synthetic 'empty' key so the wizard can surface it uniformly.
  if (Object.keys(answers).length === 0) {
    throw new IntakeAnswerError('No answers provided', 'empty');
  }
  try {
    const res = await apiClient.patch<{
      success: boolean;
      data: { intake: PatientIntakeRecord };
    }>(BASE, { answers });
    return res.data.data.intake;
  } catch (err) {
    const code = readCode(err);
    if (code === 'INVALID_ANSWER') {
      throw new IntakeAnswerError('Invalid answer', readDetailKey(err));
    }
    if (code === 'NO_INTAKE_IN_PROGRESS') {
      throw new IntakeConflictError(
        'NO_INTAKE_IN_PROGRESS',
        'No intake in progress',
      );
    }
    throw err;
  }
}

/**
 * POST `/v1/patients/me/intake/complete` — mark the current intake complete
 * and return the finalized record. Throws `IntakeConflictError` when there is
 * nothing open to complete.
 */
export async function completeIntake(): Promise<PatientIntakeRecord> {
  try {
    const res = await apiClient.post<{
      success: boolean;
      data: { intake: PatientIntakeRecord };
    }>(`${BASE}/complete`);
    return res.data.data.intake;
  } catch (err) {
    if (readCode(err) === 'NO_INTAKE_IN_PROGRESS') {
      throw new IntakeConflictError(
        'NO_INTAKE_IN_PROGRESS',
        'No intake in progress',
      );
    }
    throw err;
  }
}

/**
 * POST `/v1/patients/me/intake/retake` — open a fresh intake version. Throws
 * `IntakeConflictError('INTAKE_IN_PROGRESS')` if the caller must finish the
 * current one first (surfaced to the future retake CTA).
 */
export async function retakeIntake(): Promise<PatientIntakeRecord> {
  try {
    const res = await apiClient.post<{
      success: boolean;
      data: { intake: PatientIntakeRecord };
    }>(`${BASE}/retake`);
    return res.data.data.intake;
  } catch (err) {
    if (readCode(err) === 'INTAKE_IN_PROGRESS') {
      throw new IntakeConflictError(
        'INTAKE_IN_PROGRESS',
        'Finish current intake first',
      );
    }
    throw err;
  }
}

/**
 * GET `/v1/patients/me/intake/versions` — lightweight pointer list for the
 * "past intakes" view. No conflict codes here; any failure bubbles unchanged.
 */
export async function listIntakeVersions(): Promise<PatientIntakePointer[]> {
  const res = await apiClient.get<{
    success: boolean;
    data: { versions: PatientIntakePointer[] };
  }>(`${BASE}/versions`);
  return res.data.data.versions ?? [];
}
