import { useCallback, useEffect, useState } from 'react';

import { useDatabaseReady, useDatabaseSafe } from '@/database/DatabaseProvider';
import type FeaturePermission from '@/database/models/FeaturePermission';
import type { FeaturePermissionStatus } from '@/services/feature-permissions';

type PermissionMap = Record<string, FeaturePermissionStatus>;

/**
 * Hook to read per-feature permissions from the local database and expose
 * simple helpers for gating features in the UI.
 *
 * If the database is not ready or there are no rows yet, all features are
 * treated as visible and enabled by default so the app still works.
 */
export function useFeaturePermissions() {
  const isDatabaseReady = useDatabaseReady();
  const database = useDatabaseSafe();

  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isDatabaseReady || !database) {
      // When DB is not available (e.g. Expo Go), fall back to "all enabled"
      setPermissions({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const collection = database.get<FeaturePermission>('feature_permissions');
        const rows = await collection.query().fetch();

        if (cancelled) return;

        const next: PermissionMap = {};
        for (const row of rows) {
          const status = (row.status as FeaturePermissionStatus) ?? 'enabled';
          next[row.featureKey] = status;
        }
        setPermissions(next);
      } catch (error) {
        console.warn('[useFeaturePermissions] Failed to load from database:', error);
        if (!cancelled) {
          setPermissions({});
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [isDatabaseReady, database]);

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

