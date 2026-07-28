import { useQuery } from '@tanstack/react-query';
import {
  fetchImmunizations,
  type Immunization,
} from '@/services/api/patient-immunizations';
import { IMMUNIZATIONS_EHR_ENABLED } from '@/components/health-plan/patient-intake/intake-report-builder';

/**
 * useImmunizations — COS-481 Phase 2 (EHR-hydrated vaccines).
 *
 * React Query wrapper around `GET /v1/patients/me/immunizations`. Follows the
 * flat kebab-case query-key convention shared across cos-app hooks
 * (`['biopsychosocial-plan']`, `['patient-intake']`, ...).
 *
 * The `enabled` guard is critical: without it the query would fire on every
 * IntakeReportScreen mount even when the FE kill switch is off, so we would
 * poll the BE (which itself dark-launches to `data: []` today) for nothing.
 * Belt-and-braces on top of the BE flag — the FE const is the OTA-revertible
 * escape hatch; the BE flag is the SSM-flip lever.
 *
 * staleTime + gcTime mirror sibling hydration hooks (allergies, meds) — 5 min
 * fresh, standard React Query gcTime — because the underlying HealthLake data
 * only turns over on Fasten webhook ingest (event-driven), not tick-driven.
 */
export const IMMUNIZATIONS_QUERY_KEY = ['immunizations'] as const;

export function useImmunizations() {
  return useQuery<Immunization[]>({
    queryKey: IMMUNIZATIONS_QUERY_KEY,
    queryFn: fetchImmunizations,
    staleTime: 5 * 60 * 1000,
    enabled: IMMUNIZATIONS_EHR_ENABLED,
  });
}
