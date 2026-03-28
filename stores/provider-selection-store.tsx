/**
 * Provider selection store — WatermelonDB removed.
 * Uses in-memory state with DynamoDB persistence via backend API.
 */
import React, { createContext, ReactNode, useContext, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import type { Provider } from '@/services/api/types';

export const MAX_SELECTED_PROVIDERS = 7;

export type SelectedProvider = Provider & {
  isManual?: boolean;
  relationship?: string;
};

export type SelectedCareManager = {
  id: string;
  name: string;
  agencyName?: string;
  logoUrl?: string;
};

interface ProviderSelectionContextType {
  selectedProviders: SelectedProvider[];
  selectedCareManager: SelectedCareManager | null;
  addProvider: (provider: SelectedProvider) => void;
  removeProvider: (providerId: string) => void;
  clearProviders: () => void;
  setSelectedCareManager: (cm: SelectedCareManager | null) => void;
  isLoading: boolean;
  validateAndCleanProviders: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  saveToServer: () => Promise<void>;
}

const ProviderSelectionContext = createContext<ProviderSelectionContextType | undefined>(undefined);

export function ProviderSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedProviders, setSelectedProviders] = useState<SelectedProvider[]>([]);
  const [selectedCareManager, setSelectedCareManagerState] = useState<SelectedCareManager | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const saveToServer = useCallback(async () => {
    try {
      await apiClient.put('/v1/auth/selected-providers', {
        selectedProviders: selectedProviders.map(p => ({
          id: p.id,
          name: p.name,
          qualifications: p.qualifications,
          specialty: p.specialty,
          photoUrl: p.photoUrl,
        })),
        selectedCareManager,
      });
    } catch (error) {
      console.error('Failed to save provider selection to server:', error);
    }
  }, [selectedProviders, selectedCareManager]);

  const addProvider = useCallback((provider: SelectedProvider) => {
    setSelectedProviders(prev => {
      if (prev.some(p => p.id === provider.id)) return prev;
      if (prev.length >= MAX_SELECTED_PROVIDERS) return prev;
      const next = [...prev, provider];
      // Persist after state update (use setTimeout to ensure state is set)
      setTimeout(() => {
        apiClient.put('/v1/auth/selected-providers', {
          selectedProviders: next.map(p => ({
            id: p.id,
            name: p.name,
            qualifications: p.qualifications,
            specialty: p.specialty,
            photoUrl: p.photoUrl,
          })),
          selectedCareManager,
        }).catch(err => console.error('Failed to persist provider addition:', err));
      }, 0);
      return next;
    });
  }, [selectedCareManager]);

  const removeProvider = useCallback((providerId: string) => {
    setSelectedProviders(prev => {
      const next = prev.filter(p => p.id !== providerId);
      setTimeout(() => {
        apiClient.put('/v1/auth/selected-providers', {
          selectedProviders: next.map(p => ({
            id: p.id,
            name: p.name,
            qualifications: p.qualifications,
            specialty: p.specialty,
            photoUrl: p.photoUrl,
          })),
          selectedCareManager,
        }).catch(err => console.error('Failed to persist provider removal:', err));
      }, 0);
      return next;
    });
  }, [selectedCareManager]);

  const clearProviders = useCallback(() => {
    setSelectedProviders([]);
    setSelectedCareManagerState(null);
    apiClient.put('/v1/auth/selected-providers', {
      selectedProviders: [],
      selectedCareManager: null,
    }).catch(err => console.error('Failed to persist provider clear:', err));
  }, []);

  const setSelectedCareManager = useCallback((cm: SelectedCareManager | null) => {
    setSelectedCareManagerState(cm);
    // Persist immediately with current providers
    setTimeout(() => {
      apiClient.put('/v1/auth/selected-providers', {
        selectedProviders: selectedProviders.map(p => ({
          id: p.id,
          name: p.name,
          qualifications: p.qualifications,
          specialty: p.specialty,
          photoUrl: p.photoUrl,
        })),
        selectedCareManager: cm,
      }).catch(err => console.error('Failed to persist care manager selection:', err));
    }, 0);
  }, [selectedProviders]);

  const loadFromServer = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<{
        success: boolean;
        data: {
          selectedProviders: SelectedProvider[];
          selectedCareManager: SelectedCareManager | null;
        };
      }>('/v1/auth/selected-providers');
      if (res.data?.data) {
        const { selectedProviders: providers, selectedCareManager: cm } = res.data.data;
        if (Array.isArray(providers)) {
          setSelectedProviders(providers);
        }
        setSelectedCareManagerState(cm ?? null);
      }
    } catch (error) {
      console.error('Failed to load provider selection from server:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const validateAndCleanProviders = useCallback(async () => {
    // no-op stub — TODO: validate providers against backend
  }, []);

  const value: ProviderSelectionContextType = {
    selectedProviders,
    selectedCareManager,
    addProvider,
    removeProvider,
    clearProviders,
    setSelectedCareManager,
    isLoading,
    validateAndCleanProviders,
    loadFromServer,
    saveToServer,
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
