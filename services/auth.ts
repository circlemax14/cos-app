import * as SecureStore from 'expo-secure-store';
import { AxiosError } from 'axios';
import { cognitoSignOut } from '@/lib/cognito';
import { storeTokens, clearTokens, hasStoredSession } from '@/lib/auth-tokens';
import { apiClient } from '@/lib/api-client';

export type SignInPayload = { username: string; password: string };
export type SignUpPayload = {
  email: string;
  password: string;
  confirmPassword: string;
  role?: string;
};

export interface UserProfile {
  sub: string;
  email: string;
  role: string;
  allowedServices: string[];
  termsAccepted: boolean;
  fastenConnected: boolean;
  dataReady: boolean;
  ehiExportPending: boolean;
}

/**
 * Sign in via backend API, store tokens securely, return user profile.
 */
export async function signIn(
  payload: SignInPayload,
): Promise<{ success: boolean; user?: UserProfile; message?: string; notConfirmed?: boolean }> {
  try {
    const loginRes = await apiClient.post<{
      success: boolean;
      data: {
        sub: string;
        accessToken: string;
        idToken: string;
        refreshToken: string;
        termsAccepted: boolean;
        fastenConnected: boolean;
        dataReady: boolean;
      };
    }>('/v1/auth/login', { email: payload.username, password: payload.password });

    const { accessToken, idToken, refreshToken } = loginRes.data.data;
    await storeTokens(accessToken, refreshToken, idToken);
    await SecureStore.setItemAsync('cos_username', payload.username);

    const meRes = await apiClient.get<{ success: boolean; data: UserProfile }>('/v1/auth/me');
    return { success: true, user: meRes.data.data };
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      // TODO: remove before production
      console.warn('[DEBUG signIn] status:', err.response?.status, 'data:', JSON.stringify(err.response?.data));
      const code: string | undefined = err.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        return { success: false, notConfirmed: true, message: 'Please verify your email before signing in.' };
      }
      const apiMsg: string | undefined = err.response?.data?.error ?? err.response?.data?.message;
      if (apiMsg) return { success: false, message: apiMsg };
    }
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
 * Sign up — registers a new user. Cognito sends a verification code to the email.
 */
export async function signUp(
  payload: SignUpPayload,
): Promise<{ success: boolean; message?: string }> {
  try {
    await apiClient.post('/v1/auth/signup', payload);
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      const code: string | undefined = err.response?.data?.code ?? err.response?.data?.error;
      if (code === 'UsernameExistsException' || code?.includes('UsernameExists')) {
        return { success: false, message: 'An account with this email already exists. Please sign in instead.' };
      }
      const apiMsg: string | undefined = err.response?.data?.message ?? err.response?.data?.error;
      if (apiMsg) return { success: false, message: apiMsg };
    }
    const msg = err instanceof Error ? err.message : 'Sign up failed';
    return { success: false, message: msg };
  }
}

/**
 * Confirm sign up — verifies the email address using the code sent by Cognito.
 */
export async function confirmSignUp(
  email: string,
  code: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    await apiClient.post('/v1/auth/confirm-signup', { email, code });
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      const apiMsg: string | undefined = err.response?.data?.error ?? err.response?.data?.message;
      if (apiMsg) return { success: false, message: apiMsg };
    }
    const msg = err instanceof Error ? err.message : 'Verification failed';
    return { success: false, message: msg };
  }
}

/**
 * Resend the email verification code to an unconfirmed user.
 */
export async function resendCode(
  email: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    await apiClient.post('/v1/auth/resend-code', { email });
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      const apiMsg: string | undefined = err.response?.data?.error ?? err.response?.data?.message;
      if (apiMsg) return { success: false, message: apiMsg };
    }
    const msg = err instanceof Error ? err.message : 'Failed to resend code';
    return { success: false, message: msg };
  }
}
