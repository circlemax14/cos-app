import * as SecureStore from 'expo-secure-store';

const KEYS = {
  access: 'cos_access_token',
  refresh: 'cos_refresh_token',
  id: 'cos_id_token',
} as const;

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  idToken: string,
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.access, accessToken),
    SecureStore.setItemAsync(KEYS.refresh, refreshToken),
    SecureStore.setItemAsync(KEYS.id, idToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.access);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.refresh);
}

export async function getIdToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.id);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.access),
    SecureStore.deleteItemAsync(KEYS.refresh),
    SecureStore.deleteItemAsync(KEYS.id),
  ]);
}

/** Returns true if an access token is stored (does not validate expiry). */
export async function hasStoredSession(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null && token.length > 0;
}
