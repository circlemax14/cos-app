import { useCallback, useEffect, useState } from 'react';

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
 * Hook to fetch labs — returns empty array until wired to backend API
 */
export function useLabs() {
  const [labs, setLabs] = useState<LabData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadLabs = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Fetch labs from backend API
      setLabs([]);
    } catch (error) {
      console.error('Error loading labs:', error);
      setLabs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLabs();
  }, [loadLabs]);

  return {
    labs,
    isLoading,
    refreshLabs: loadLabs,
  };
}
