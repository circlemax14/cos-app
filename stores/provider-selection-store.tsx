import React, { createContext, ReactNode, useContext, useEffect, useState, useCallback } from 'react';
import type { Provider } from '@/services/fasten-health';
import { getFastenPractitioners } from '@/services/fasten-health';

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
  const [isLoading, setIsLoading] = useState(true);

  // Load selected providers — TODO: wire to backend API
  const loadSelectedProviders = useCallback(async () => {
    try {
      // TODO: Fetch selected providers from backend API
      setSelectedProviders([]);
      console.log('Provider selection: no local database, returning empty list');
    } catch (error) {
      console.error('Error loading selected providers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Validate and remove providers that don't exist in current data
  const validateAndCleanProviders = useCallback(async () => {
    try {
      console.log('Validating selected providers against current data...');

      // Get all current providers from Fasten Health data
      const currentProviders = await getFastenPractitioners();
      const currentProviderIds = new Set(currentProviders.map(p => String(p.id)));

      setSelectedProviders(prev => {
        const valid = prev.filter(p => {
          // Keep manual providers (user-added) even if not in current data
          if (p.isManual) return true;
          return currentProviderIds.has(String(p.id));
        });

        if (valid.length !== prev.length) {
          console.log(`Removed ${prev.length - valid.length} invalid providers`);
        } else {
          console.log('All selected providers are valid');
        }

        return valid;
      });
    } catch (error) {
      console.error('Error validating providers:', error);
    }
  }, []);

  useEffect(() => {
    loadSelectedProviders();
  }, [loadSelectedProviders]);

  // Validate providers after initial load
  useEffect(() => {
    if (!isLoading) {
      validateAndCleanProviders();
    }
  }, [isLoading, validateAndCleanProviders]);

  const addProvider = async (provider: SelectedProvider) => {
    const providerId = String(provider.id);

    // Check if already selected
    if (selectedProviders.some(item => item.id === providerId)) {
      return;
    }

    // Check max limit
    if (selectedProviders.length >= MAX_SELECTED_PROVIDERS) {
      console.warn(`Maximum ${MAX_SELECTED_PROVIDERS} providers allowed`);
      return;
    }

    const newProvider: SelectedProvider = {
      ...provider,
      id: providerId,
      image: undefined, // Don't store image reference
    };

    // TODO: Save to backend API
    setSelectedProviders(prev => [...prev, newProvider]);
    console.log(`Added provider: ${newProvider.name}`);
  };

  const removeProvider = async (providerId: string) => {
    const normalizedId = String(providerId);

    // TODO: Remove from backend API
    setSelectedProviders(prev => prev.filter(item => item.id !== normalizedId));
    console.log(`Removed provider: ${providerId}`);
  };

  const clearProviders = async () => {
    // TODO: Clear from backend API
    setSelectedProviders([]);
    console.log('Cleared all providers');
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
