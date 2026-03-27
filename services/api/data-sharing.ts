import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/lib/api-client';

const STORAGE_KEY = 'data_shares';

export interface DataShare {
  patientId: string;
  providerId: string;
  providerName: string;
  providerEmail: string;
  status: 'active' | 'revoked';
  grantedAt: string;
  revokedAt?: string;
}

// ── Local persistence helpers ────────────────────────────────────────────

async function getLocalShares(): Promise<DataShare[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

async function saveLocalShares(shares: DataShare[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(shares));
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Fetch active data shares for the current patient.
 * Tries backend first, falls back to local storage.
 */
export async function fetchDataShares(): Promise<DataShare[]> {
  try {
    const { data } = await apiClient.get('/v1/patients/me/data-sharing');
    const shares: DataShare[] = data.data?.shares ?? [];
    // Sync backend state to local storage
    await saveLocalShares(shares);
    return shares;
  } catch {
    // Backend unavailable — return locally persisted shares
    return (await getLocalShares()).filter(s => s.status === 'active');
  }
}

/**
 * Grant data sharing access to a provider.
 * Persists locally and tries backend (email notification on success).
 */
export async function grantDataShare(
  providerId: string,
  providerName: string,
  providerEmail: string,
  patientName: string,
): Promise<DataShare> {
  const share: DataShare = {
    patientId: '',
    providerId,
    providerName,
    providerEmail,
    status: 'active',
    grantedAt: new Date().toISOString(),
  };

  // Persist locally first
  const local = await getLocalShares();
  const existing = local.findIndex(s => s.providerId === providerId);
  if (existing >= 0) {
    local[existing] = share;
  } else {
    local.push(share);
  }
  await saveLocalShares(local);

  // Try backend (non-blocking for caller)
  try {
    const { data } = await apiClient.post('/v1/patients/me/data-sharing/grant', {
      providerId,
      providerName,
      providerEmail,
      patientName,
    });
    return data.data?.share ?? share;
  } catch {
    return share;
  }
}

/**
 * Revoke data sharing access from a provider.
 * Updates local storage and tries backend.
 */
export async function revokeDataShare(providerId: string): Promise<void> {
  // Update locally first
  const local = await getLocalShares();
  const updated = local.map(s =>
    s.providerId === providerId
      ? { ...s, status: 'revoked' as const, revokedAt: new Date().toISOString() }
      : s,
  );
  await saveLocalShares(updated);

  // Try backend
  try {
    await apiClient.post('/v1/patients/me/data-sharing/revoke', { providerId });
  } catch {
    // Backend unavailable — local state already updated
  }
}
