import { useState } from 'react';

export interface LabData {
  id: string;
  name: string;
  identifier?: string;
  address?: {
    line?: string[];
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
}

/**
 * Hook to fetch labs for report filters.
 * Previously backed by WatermelonDB — now stubbed until an API endpoint is available.
 * TODO: replace stub with a React Query call to the labs API endpoint.
 */
export function useLabs() {
  const [labs] = useState<LabData[]>([]);

  return {
    labs,
    isLoading: false,
    refreshLabs: () => Promise.resolve(),
  };
}
