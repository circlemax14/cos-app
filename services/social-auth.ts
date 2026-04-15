import axios from 'axios';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { apiClient } from '@/lib/api-client';
import { storeTokens } from '@/lib/auth-tokens';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

// Public API client — no auth interceptor, used for social sign-in endpoints
const publicApi = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

WebBrowser.maybeCompleteAuthSession();

// Check Apple availability (iOS only)
export async function isAppleAuthAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

// Apple Sign-In — returns identity token and optional name from credential
export async function signInWithApple(): Promise<{
  identityToken: string;
  fullName?: { givenName?: string; familyName?: string };
}> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    ],
  });
  if (!credential.identityToken) {
    throw new Error('Apple sign-in failed: no identity token received');
  }
  return {
    identityToken: credential.identityToken,
    fullName: credential.fullName
      ? {
          givenName: credential.fullName.givenName ?? undefined,
          familyName: credential.fullName.familyName ?? undefined,
        }
      : undefined,
  };
}

// Send social auth token to backend and store resulting tokens
export async function socialSignInWithBackend(
  provider: 'google' | 'apple',
  payload: {
    idToken?: string;
    identityToken?: string;
    fullName?: { givenName?: string; familyName?: string };
  },
): Promise<{ success: boolean; user?: Record<string, unknown>; message?: string }> {
  try {
    const endpoint =
      provider === 'google' ? '/v1/auth/social/google' : '/v1/auth/social/apple';
    // Use publicApi (no auth interceptor) to avoid sending stale tokens
    const res = await publicApi.post(endpoint, payload);
    const data: Record<string, unknown> = res.data?.data ?? res.data;

    const accessToken = data.accessToken as string | undefined;
    const refreshToken = data.refreshToken as string | undefined;
    const idToken = data.idToken as string | undefined;

    if (accessToken) {
      await storeTokens(
        accessToken,
        refreshToken ?? '',
        idToken ?? '',
      );
      const meRes = await apiClient.get('/v1/auth/me');
      return { success: true, user: meRes.data?.data ?? meRes.data };
    }
    return { success: false, message: 'No tokens received from server' };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
    return {
      success: false,
      message:
        axiosErr.response?.data?.error ??
        axiosErr.message ??
        'Social sign-in failed',
    };
  }
}

// Link a social provider to an existing account (from settings)
export async function linkProvider(
  provider: 'google' | 'apple',
  idToken: string,
): Promise<{ linked: boolean }> {
  const res = await apiClient.post('/v1/auth/social/link', { provider, idToken });
  return (res.data?.data as { linked: boolean }) ?? { linked: true };
}

// Get which social providers are already linked for the current user
export async function getLinkedProviders(): Promise<{
  google: boolean;
  apple: boolean;
}> {
  const res = await apiClient.get('/v1/auth/social/providers');
  return (
    (res.data?.data?.providers as { google: boolean; apple: boolean }) ?? {
      google: false,
      apple: false,
    }
  );
}
