/**
 * React Query hooks for patient-authored PERSONAL GOALS (COS-405 / SCRUM-532).
 *
 * One query (`['personal-goals']`) for the list GET; mutations for create /
 * update / delete / reflection. Each mutation invalidates the list so it
 * re-confirms with the server.
 *
 * FLAG-OFF ⇒ NO NETWORK: the list query is `enabled` only when the client
 * kill-switch `PERSONAL_GOALS_ENABLED` is on, so with the flag off the hook
 * makes ZERO API calls and returns an empty list — the plan renders exactly as
 * today's v3. The service's GET also resolves to [] on a 404 (backend flag off),
 * so even with the client flag flipped on before the backend ships, the feature
 * degrades gracefully (no personal goals, no error spam).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPersonalGoals,
  createPersonalGoal,
  updatePersonalGoal,
  deletePersonalGoal,
  addPersonalGoalReflection,
  type PersonalGoal,
  type PersonalGoalReflectionInput,
} from '@/services/api/personal-goals';
import { PERSONAL_GOALS_ENABLED, type PersonalGoalSubmit } from '@/lib/care-plan';

const PERSONAL_GOALS_KEY = ['personal-goals'] as const;

/**
 * List the patient's personal goals. Returns an empty array (and makes no
 * network call) while `PERSONAL_GOALS_ENABLED` is off.
 */
export function usePersonalGoals() {
  const query = useQuery<PersonalGoal[]>({
    queryKey: PERSONAL_GOALS_KEY,
    queryFn: fetchPersonalGoals,
    enabled: PERSONAL_GOALS_ENABLED,
    staleTime: 60_000,
  });
  return {
    ...query,
    // When the flag is off the query is disabled and never fetches; surface a
    // stable empty list so consumers don't special-case `undefined`.
    goals: PERSONAL_GOALS_ENABLED ? query.data ?? [] : [],
  };
}

export function useCreatePersonalGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ category, body }: { category: string; body: PersonalGoalSubmit }) =>
      createPersonalGoal(category, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSONAL_GOALS_KEY }),
  });
}

export function useUpdatePersonalGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<PersonalGoalSubmit> }) =>
      updatePersonalGoal(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSONAL_GOALS_KEY }),
  });
}

export function useDeletePersonalGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePersonalGoal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSONAL_GOALS_KEY }),
  });
}

export function useAddPersonalGoalReflection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PersonalGoalReflectionInput }) =>
      addPersonalGoalReflection(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSONAL_GOALS_KEY }),
  });
}
