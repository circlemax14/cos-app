import { useCallback, useEffect, useState } from 'react';

export interface ProxyData {
  id: string;
  email: string;
  status: 'pending' | 'active' | 'revoked';
  consentGiven: boolean;
  consentDate: string | null;
  patientId: string | null;
}

/**
 * Hook to manage proxy data — no-op until wired to backend API
 */
export function useProxies() {
  const [proxies, setProxies] = useState<ProxyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadProxies = useCallback(async () => {
    // TODO: Fetch proxies from backend API
    setProxies([]);
    setIsLoading(false);
  }, []);

  const addProxy = useCallback(async (_email: string, _patientId?: string) => {
    // TODO: Wire to backend API
    console.warn('addProxy is a no-op until backend API is wired up');
  }, [loadProxies]);

  const removeProxy = useCallback(async (_proxyId: string) => {
    // TODO: Wire to backend API
    console.warn('removeProxy is a no-op until backend API is wired up');
  }, [loadProxies]);

  const updateProxyStatus = useCallback(async (_proxyId: string, _status: 'pending' | 'active' | 'revoked') => {
    // TODO: Wire to backend API
    console.warn('updateProxyStatus is a no-op until backend API is wired up');
  }, [loadProxies]);

  useEffect(() => {
    loadProxies();
  }, [loadProxies]);

  return {
    proxies,
    isLoading,
    addProxy,
    removeProxy,
    updateProxyStatus,
    refreshProxies: loadProxies,
  };
}
