import { useCallback, useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/lib/api-client';

export interface DoctorData {
  id: string;
  name: string;
  specialty?: string;
  phone?: string;
  email?: string;
  address?: string;
  photoUrl?: string;
  providerId?: string;
  clinicId?: string;
  clinicName?: string;
}

const STORAGE_KEY_PREFIX = 'doctor_data_';

function storageKey(providerId: string) {
  return `${STORAGE_KEY_PREFIX}${providerId}`;
}

export function useDoctor(providerId: string) {
  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load saved doctor data from local storage on mount
  useEffect(() => {
    if (!providerId) return;

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const stored = await AsyncStorage.getItem(storageKey(providerId));
        if (stored && !cancelled) {
          setDoctor(JSON.parse(stored));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error('Failed to load doctor data'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [providerId]);

  const updateDoctor = useCallback(async (updates: Partial<DoctorData>) => {
    if (!providerId) return;

    const current = doctor ?? { id: providerId, name: '' };
    const updated: DoctorData = { ...current, ...updates };

    // If photo changed and it's a local file, upload to S3
    if (updates.photoUrl && updates.photoUrl.startsWith('file://')) {
      const uploadedUrl = await uploadPhoto(providerId, updates.photoUrl);
      updated.photoUrl = uploadedUrl;
    }

    // Save locally
    await AsyncStorage.setItem(storageKey(providerId), JSON.stringify(updated));
    setDoctor(updated);
  }, [providerId, doctor]);

  const pickImage = useCallback(async (): Promise<string | undefined> => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error(
        'Photo library access was denied. Please enable it in Settings to upload a photo.',
      );
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return undefined;
    }

    return result.assets[0].uri;
  }, []);

  const refresh = useCallback(async () => {
    if (!providerId) return;
    setIsLoading(true);
    try {
      const stored = await AsyncStorage.getItem(storageKey(providerId));
      if (stored) {
        setDoctor(JSON.parse(stored));
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to refresh doctor data'));
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  return { doctor, isLoading, error, updateDoctor, pickImage, refresh };
}

// ── Upload helper ──────────────────────────────────────────────────────────

async function uploadPhoto(providerId: string, localUri: string): Promise<string> {
  // Determine content type from file extension
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentTypeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  const contentType = contentTypeMap[ext] ?? 'image/jpeg';

  // Step 1: Get presigned upload URL from backend
  const { data: presignData } = await apiClient.post('/v1/uploads/provider-photo/presign', {
    providerId,
    contentType,
  });

  const { uploadUrl, photoUrl } = presignData.data;

  // Step 2: Upload file to S3 via presigned URL using fetch
  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });

  // Step 3: Confirm upload with backend
  await apiClient.post('/v1/uploads/provider-photo/confirm', {
    providerId,
    photoUrl,
  });

  return photoUrl;
}
