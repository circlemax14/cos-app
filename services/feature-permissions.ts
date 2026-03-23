import { getDatabase } from '@/database';
import type FeaturePermission from '@/database/models/FeaturePermission';

export type FeaturePermissionStatus =
  | 'enabled'
  | 'disabled'
  | 'purchasable'
  | 'purchased'
  | 'hidden';

export interface FeaturePermissionDTO {
  featureKey: string;
  status: FeaturePermissionStatus;
}

/**
 * Persist the latest feature permissions from the API into WatermelonDB.
 *
 * Call this right after sign-in / session refresh when your backend returns
 * the current user's feature permissions.
 */
export async function saveFeaturePermissions(
  permissions: FeaturePermissionDTO[],
): Promise<void> {
  const database = getDatabase();

  if (!database) {
    console.warn(
      '[feature-permissions] Database not initialized – skipping permission save.',
    );
    return;
  }

  await database.write(async () => {
    const collection = database.get<FeaturePermission>('feature_permissions');

    // Clear existing rows – we always store the latest full snapshot
    const existing = await collection.query().fetch();
    for (const record of existing) {
      await record.destroyPermanently();
    }

    const now = new Date();

    for (const item of permissions) {
      const status = item.status ?? 'enabled';
      await collection.create((record) => {
        record.featureKey = item.featureKey;
        record.status = status;
        // @ts-expect-error Watermelon uses number under the hood; decorator converts
        record.createdAt = now;
        // @ts-expect-error Watermelon uses number under the hood; decorator converts
        record.updatedAt = now;
      });
    }
  });
}

/**
 * Load all stored feature permissions as a plain array.
 * Returns an empty array if the database is not available.
 */
export async function loadFeaturePermissions(): Promise<FeaturePermissionDTO[]> {
  const database = getDatabase();

  if (!database) {
    return [];
  }

  const collection = database.get<FeaturePermission>('feature_permissions');
  const rows = await collection.query().fetch();

  return rows.map((row) => ({
    featureKey: row.featureKey,
    status: (row.status as FeaturePermissionStatus) ?? 'enabled',
  }));
}

/**
 * Optional helper to fetch permissions from an API endpoint and persist them.
 * Adjust the URL / response shape to match your backend.
 */
export async function fetchAndStoreFeaturePermissionsFromApi(
  endpoint: string,
): Promise<FeaturePermissionDTO[]> {
  const res = await fetch(endpoint, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch feature permissions: ${res.status}`);
  }

  const data = (await res.json()) as FeaturePermissionDTO[];

  await saveFeaturePermissions(data);

  return data;
}

