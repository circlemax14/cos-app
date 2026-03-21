/**
 * Stub — WatermelonDB removed. Non-EHR provider local processing is no longer supported.
 * These exports exist only to prevent import errors in index.tsx while that screen is migrated.
 * TODO: replace non-EHR provider integration with API-backed approach.
 */

export interface NonEhrProvider {
  id: string
  name: string
  specialty?: string
  address?: string
  phone?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getNonEhrProviders(): Promise<NonEhrProvider[]> {
  return []
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function processAndStoreFiles(_files: unknown[], _concurrency?: number): Promise<void> {
  // no-op stub
}
