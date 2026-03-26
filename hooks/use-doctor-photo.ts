import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = 'doctor_data_';

/**
 * Hook to get doctor photo URL by provider ID.
 * Reads from the locally persisted doctor data in AsyncStorage.
 */
export function useDoctorPhoto(providerId: string | undefined): string | null {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId) return;

    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}${providerId}`);
        if (stored && !cancelled) {
          const data = JSON.parse(stored);
          setPhotoUrl(data.photoUrl ?? null);
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
 * Hook to get multiple doctor photos by provider IDs.
 * Reads from AsyncStorage for each provider.
 */
export function useDoctorPhotos(providerIds: (string | undefined)[]): Map<string, string> {
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const validIds = providerIds.filter((id): id is string => !!id);
    if (validIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const result = new Map<string, string>();
      const keys = validIds.map((id) => `${STORAGE_KEY_PREFIX}${id}`);

      try {
        const pairs = await AsyncStorage.multiGet(keys);
        for (const [key, value] of pairs) {
          if (value) {
            const data = JSON.parse(value);
            if (data.photoUrl) {
              const id = key.replace(STORAGE_KEY_PREFIX, '');
              result.set(id, data.photoUrl);
            }
          }
        }
      } catch {
        // Silently fail — photos are optional
      }

      if (!cancelled) {
        setPhotos(result);
      }
    })();

    return () => { cancelled = true; };
  // Stringify to avoid infinite re-renders from array reference changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(providerIds)]);

  return photos;
}
