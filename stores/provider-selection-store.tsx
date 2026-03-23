/**
 * Provider selection store — WatermelonDB removed.
 * Uses in-memory state. Persistence via backend API (/patients/me/provider-selection).
 * TODO: wire addProvider/removeProvider to the backend provider-selection endpoints.
 */
import React, { createContext, ReactNode, useContext, useState } from 'react';
import type { Provider } from '@/services/api/types';

export const MAX_SELECTED_PROVIDERS = 8;

export type SelectedProvider = Provider & {
  isManual?: boolean;
  relationship?: string;
};

interface ProviderSelectionContextType {
  selectedProviders: SelectedProvider[];
  addProvider: (provider: SelectedProvider) => void;
  removeProvider: (providerId: string) => void;
  clearProviders: () => void;
  isLoading: boolean;
  validateAndCleanProviders: () => Promise<void>;
}

const ProviderSelectionContext = createContext<ProviderSelectionContextType | undefined>(undefined);

export function ProviderSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedProviders, setSelectedProviders] = useState<SelectedProvider[]>([]);
  const [isLoading] = useState(false);

  const addProvider = (provider: SelectedProvider) => {
    setSelectedProviders(prev => {
      if (prev.some(p => p.id === provider.id)) return prev;
      if (prev.length >= MAX_SELECTED_PROVIDERS) return prev;
      return [...prev, provider];
    });
  };

  const removeProvider = (providerId: string) => {
    setSelectedProviders(prev => prev.filter(p => p.id !== providerId));
  };

  const clearProviders = () => {
    setSelectedProviders([]);
  };

  const validateAndCleanProviders = async () => {
    // no-op stub — TODO: validate providers against backend
  };

  const value: ProviderSelectionContextType = {
    selectedProviders,
    addProvider,
    removeProvider,
    clearProviders,
    isLoading,
    validateAndCleanProviders,
  };

  return (
    <ProviderSelectionContext.Provider value={value}>
      {children}
    </ProviderSelectionContext.Provider>
  );
}

export function useProviderSelection() {
  const context = useContext(ProviderSelectionContext);
  if (!context) {
    throw new Error('useProviderSelection must be used within a ProviderSelectionProvider');
  }
  return context;
}
