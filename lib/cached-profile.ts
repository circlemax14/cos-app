import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfile } from '@/services/auth';

const KEY = 'cos_cached_user_profile_v1';

export async function getCachedProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export async function setCachedProfile(profile: UserProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Cache write failures should never block auth flows — silently ignore.
  }
}

export async function clearCachedProfile(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
