import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchIntake,
  startIntake,
  patchIntakeAnswers,
  completeIntake,
  retakeIntake,
  listIntakeVersions,
  IntakeConflictError,
} from '@/services/api/patient-intake'
import type { IntakeAnswerValue, PatientIntakeRecord } from '@/types/patient-intake'

/**
 * HS-1 (SCRUM-590): React Query wrappers for the six `/v1/patients/me/intake`
 * endpoints. Flat kebab-case query keys keep parity with the rest of cos-app
 * (`['biopsychosocial-plan']`, `['ai-health-plan']`, …).
 *
 * Cache invalidation follows the bio-plan precedent: on completeIntake we also
 * bust the downstream plan caches so the Care Plan surfaces recompute against
 * the freshly-completed intake.
 */

export const INTAKE_QUERY_KEY = ['patient-intake'] as const
export const INTAKE_VERSIONS_QUERY_KEY = ['patient-intake-versions'] as const

type IntakeQueryData = { intake: PatientIntakeRecord | null; questions: unknown[] }

/**
 * `GET /v1/patients/me/intake` — returns the in-progress or most recent
 * completed intake plus the current question set. The service swallows
 * `NO_INTAKE_IN_PROGRESS` to `intake: null`, so this hook never errors purely
 * because the patient has no intake yet — treat `data?.intake == null` as
 * "wizard should auto-start".
 */
export function usePatientIntake() {
  return useQuery({
    queryKey: INTAKE_QUERY_KEY,
    queryFn: fetchIntake,
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * `POST /v1/patients/me/intake` — starts a new intake.
 *
 * Duplicate-tap policy: if the server responds `409 INTAKE_IN_PROGRESS`, an
 * intake is already open for this patient. We swallow it and let the
 * `onSuccess` invalidation refetch the existing in-flight record instead of
 * bubbling an error — this matches the bio-plan `RegenerationInFlightError`
 * pattern (see `useRegenerateBiopsychosocialPlan`). Every other error still
 * throws for the caller's `onError` handler.
 */
export function useStartIntake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<PatientIntakeRecord | null> => {
      try {
        return await startIntake()
      } catch (err) {
        if (err instanceof IntakeConflictError && err.code === 'INTAKE_IN_PROGRESS') {
          return null
        }
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INTAKE_QUERY_KEY })
    },
  })
}

/**
 * `PATCH /v1/patients/me/intake` — saves a partial answers map. We seed the
 * cache with the returned record so the wizard stays in sync without a full
 * refetch round-trip on every Next. `IntakeAnswerError` (INVALID_ANSWER with
 * `details.key`) propagates to the caller so the wizard can highlight the
 * offending field.
 */
export function usePatchIntakeAnswers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (answers: Record<string, IntakeAnswerValue>) => patchIntakeAnswers(answers),
    onSuccess: (intake) => {
      qc.setQueryData<IntakeQueryData | undefined>(INTAKE_QUERY_KEY, (prev) =>
        prev ? { ...prev, intake } : prev,
      )
    },
  })
}

/**
 * `POST /v1/patients/me/intake/complete` — marks the intake complete. Also
 * invalidates the downstream plan caches so bio-plan / ai-health-plan /
 * health-plan surfaces refresh against the newly-completed intake, and the
 * versions list so any history view picks up the new pointer.
 */
export function useCompleteIntake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: completeIntake,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INTAKE_QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['biopsychosocial-plan'] })
      void qc.invalidateQueries({ queryKey: ['ai-health-plan'] })
      void qc.invalidateQueries({ queryKey: ['health-plan'] })
      void qc.invalidateQueries({ queryKey: INTAKE_VERSIONS_QUERY_KEY })
    },
  })
}

/**
 * `POST /v1/patients/me/intake/retake` — begins a fresh intake version. Unlike
 * `useStartIntake`, we do NOT swallow `INTAKE_IN_PROGRESS` here — a retake
 * conflict is a genuine "finish your current intake first" state the caller
 * should surface (typically in the completed-intake CTA).
 */
export function useRetakeIntake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: retakeIntake,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INTAKE_QUERY_KEY })
      void qc.invalidateQueries({ queryKey: INTAKE_VERSIONS_QUERY_KEY })
    },
  })
}

/**
 * `GET /v1/patients/me/intake/versions` — list of intake pointers (version,
 * status, timestamps). Slightly longer staleTime than the primary query since
 * the version list only grows on complete/retake.
 */
export function usePatientIntakeVersions() {
  return useQuery({
    queryKey: INTAKE_VERSIONS_QUERY_KEY,
    queryFn: listIntakeVersions,
    staleTime: 5 * 60 * 1000,
  })
}
