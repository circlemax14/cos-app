import { useCallback, useState } from 'react';

import type { FeaturePermissionStatus } from '@/services/feature-permissions';

type PermissionMap = Record<string, FeaturePermissionStatus>;

/**
 * Hook to read per-feature permissions.
 *
 * Without a local database, all features default to visible and enabled
 * so the app still works. Permissions will be fetched from the backend
 * API in the future.
 */
export function useFeaturePermissions() {
  const [permissions] = useState<PermissionMap>({});
  const [isLoading] = useState(false);

  const getStatus = useCallback(
    (featureKey: string): FeaturePermissionStatus => {
      // Default to enabled if we have no explicit rule
      return permissions[featureKey] ?? 'enabled';
    },
    [permissions],
  );

  /**
   * Whether a feature should be rendered in the UI at all.
   * Hidden features return false; everything else is visible.
   */
  const isVisible = useCallback(
    (featureKey: string): boolean => {
      const status = getStatus(featureKey);
      return status !== 'hidden';
    },
    [getStatus],
  );

  /**
   * Whether a feature is currently usable (not just purchasable).
   */
  const isUnlocked = useCallback(
    (featureKey: string): boolean => {
      const status = getStatus(featureKey);
      return status === 'enabled' || status === 'purchased';
    },
    [getStatus],
  );

  /**
   * Whether a feature is visible but requires purchase.
   */
  const isPurchasable = useCallback(
    (featureKey: string): boolean => {
      const status = getStatus(featureKey);
      return status === 'purchasable';
    },
    [getStatus],
  );

  return {
    isLoading,
    permissions,
    getStatus,
    isVisible,
    isUnlocked,
    isPurchasable,
  };
}
