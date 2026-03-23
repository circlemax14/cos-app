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
 * No-op: Previously persisted permissions into WatermelonDB.
 * TODO: Wire to backend API for persistence.
 */
export async function saveFeaturePermissions(
  _permissions: FeaturePermissionDTO[],
): Promise<void> {
  // no-op
}

/**
 * Returns an empty array — no local database.
 * TODO: Wire to backend API.
 */
export async function loadFeaturePermissions(): Promise<FeaturePermissionDTO[]> {
  return [];
}

/**
 * Fetches permissions from an API endpoint.
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

  // TODO: persist via backend API instead of local DB
  await saveFeaturePermissions(data);

  return data;
}
