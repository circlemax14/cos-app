import * as SecureStore from 'expo-secure-store';
import { cognitoSignIn, cognitoSignOut } from '@/lib/cognito';
import { storeTokens, clearTokens, hasStoredSession } from '@/lib/auth-tokens';
import { apiClient } from '@/lib/api-client';

export type SignInPayload = { username: string; password: string };
export type SignUpPayload = {
  puid: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

export interface UserProfile {
  sub: string;
  email: string;
  role: string;
  allowedServices: string[];
  termsAccepted: boolean;
  fastenConnected: boolean;
  dataReady: boolean;
}

/**
 * Sign in via Cognito, store tokens securely, return user profile.
 */
export async function signIn(
  payload: SignInPayload,
): Promise<{ success: boolean; user?: UserProfile; message?: string }> {
  try {
    const tokens = await cognitoSignIn(payload.username, payload.password);
    await storeTokens(tokens.accessToken, tokens.refreshToken, tokens.idToken);
    // Store username for token refresh
    await SecureStore.setItemAsync('cos_username', payload.username);

    const res = await apiClient.get<{ success: boolean; data: UserProfile }>('/v1/auth/me');
    return { success: true, user: res.data.data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Sign in failed';
    return { success: false, message: msg };
  }
}

/**
 * Check if the user has a valid stored session.
 * Returns the user profile if session is valid, null otherwise.
 */
export async function checkSession(): Promise<{ authenticated: boolean; user?: UserProfile }> {
  const hasSession = await hasStoredSession();
  if (!hasSession) return { authenticated: false };

  try {
    const res = await apiClient.get<{ success: boolean; data: UserProfile }>('/v1/auth/me');
    return { authenticated: true, user: res.data.data };
  } catch {
    await clearTokens();
    return { authenticated: false };
  }
}

/**
 * Sign out: clear tokens and Cognito session.
 */
export async function signOut(): Promise<void> {
  cognitoSignOut();
  await clearTokens();
  await SecureStore.deleteItemAsync('cos_username');
}

/**
 * Sign up — calls backend which creates the Cognito user.
 * (Cognito sign-up can also be done client-side if preferred.)
 */
export async function signUp(
  payload: SignUpPayload,
): Promise<{ success: boolean; message?: string }> {
  try {
    await apiClient.post('/v1/auth/sign-up', payload);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Sign up failed';
    return { success: false, message: msg };
  }
}
