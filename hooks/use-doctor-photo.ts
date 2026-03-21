/**
 * Hook to get doctor photo URL by provider ID.
 * Previously fetched photos from WatermelonDB — stubbed with null until a
 * dedicated photo API endpoint is available.
 * TODO: replace stub with a React Query call to the doctor photo API endpoint.
 */
export function useDoctorPhoto(_providerId: string | undefined): string | null {
  return null;
}

/**
 * Hook to get multiple doctor photos by provider IDs.
 * Returns an empty map until a photo API endpoint is available.
 * TODO: replace stub with React Query calls to the doctor photo API endpoint.
 */
export function useDoctorPhotos(_providerIds: (string | undefined)[]): Map<string, string> {
  return new Map();
}
