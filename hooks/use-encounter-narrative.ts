import { useQuery } from '@tanstack/react-query';
import { fetchEncounterNarrative } from '../services/api/encounter-narrative';

export function useEncounterNarrative(encounterId: string | undefined) {
  return useQuery({
    queryKey: ['encounter-narrative', encounterId],
    queryFn: () => fetchEncounterNarrative(encounterId!),
    enabled: !!encounterId,
    staleTime: 60_000 * 60,
    retry: 1,
  });
}
