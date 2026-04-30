import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { fetchPatientInfo } from '@/services/api/patient';
import { getPhotoDownloadUrl } from '@/services/user-photo';

/**
 * Single source of truth for the signed-in user's profile photo.
 *
 * Why this exists: previously each screen (Home, drawer, personal-info)
 * fetched the photo URL independently with its own useEffect-on-mount.
 * After uploading a new photo, only the personal-info screen's local
 * state updated; Home and the drawer kept showing the old image (or a
 * blank circle when the URL was stale or pointed at a missing object).
 *
 * Now: the personal-info screen calls `setPhotoUrl(newUrl)` after a
 * successful upload, and every consumer of `useUserPhoto()` rerenders
 * with the new value.
 */

interface UserPhotoContextType {
  /** Presigned download URL safe to feed straight into <Image source={{uri}}>. Null while loading or when no photo is set. */
  photoUrl: string | null;
  /** Loading state for the initial fetch. */
  isLoading: boolean;
  /** Override the URL after an upload completes locally. */
  setPhotoUrl: (url: string | null) => void;
  /** Re-fetch from the backend (e.g. after sign-in or pull-to-refresh). */
  refresh: () => Promise<void>;
}

const UserPhotoContext = createContext<UserPhotoContextType | undefined>(undefined);

export function UserPhotoProvider({ children }: { children: ReactNode }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const patient = await fetchPatientInfo();
      if (!patient?.photoUrl) {
        setPhotoUrl(null);
        return;
      }
      // Always re-fetch a fresh presigned download URL — the stored
      // photoUrl is the unsigned S3 URL and isn't directly fetchable
      // (bucket is private). getPhotoDownloadUrl returns a signed URL.
      try {
        const downloadUrl = await getPhotoDownloadUrl();
        setPhotoUrl(downloadUrl || patient.photoUrl);
      } catch {
        setPhotoUrl(patient.photoUrl);
      }
    } catch {
      // Don't clobber an existing URL on a transient fetch failure.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <UserPhotoContext.Provider value={{ photoUrl, isLoading, setPhotoUrl, refresh }}>
      {children}
    </UserPhotoContext.Provider>
  );
}

export function useUserPhoto() {
  const ctx = useContext(UserPhotoContext);
  if (!ctx) throw new Error('useUserPhoto must be used within UserPhotoProvider');
  return ctx;
}
