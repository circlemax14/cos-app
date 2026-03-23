import { useState, useEffect } from 'react';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Hook to get a single doctor's photo URL by provider ID.
 * Fetches from the backend user-providers table.
 */
export function useDoctorPhoto(providerId: string | undefined): string | null {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId || !API_BASE) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/patients/me/providers`, {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const providers = data?.data ?? [];
        const match = providers.find((p: any) => p.id === providerId || p.fhirId === providerId);
        if (!cancelled && match?.photoUrl) {
          setPhotoUrl(match.photoUrl);
        }
      } catch {
        // Silently fail — photo is optional
      }
    })();

    return () => { cancelled = true; };
  }, [providerId]);

  return photoUrl;
}

/**
 * Hook to get multiple doctors' photo URLs by provider IDs.
 * Returns a Map of providerId → photoUrl.
 */
export function useDoctorPhotos(providerIds: (string | undefined)[]): Map<string, string> {
  const [photoMap, setPhotoMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const validIds = providerIds.filter(Boolean) as string[];
    if (validIds.length === 0 || !API_BASE) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/patients/me/providers`, {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const providers = data?.data ?? [];
        const map = new Map<string, string>();
        for (const p of providers) {
          const id = p.id || p.fhirId;
          if (id && p.photoUrl && validIds.includes(id)) {
            map.set(id, p.photoUrl);
          }
        }
        if (!cancelled) setPhotoMap(map);
      } catch {
        // Silently fail — photos are optional
      }
    })();

    return () => { cancelled = true; };
  }, [providerIds.join(',')]);

  return photoMap;
}
