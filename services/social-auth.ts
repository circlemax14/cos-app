import axios from 'axios';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { apiClient } from '@/lib/api-client';
import { storeTokens } from '@/lib/auth-tokens';
import { isTransientApiError, retryAsync } from '@/lib/retry-async';

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

export interface SocialSignInResult {
  success: boolean;
  user?: Record<string, unknown>;
  message?: string;
  /**
   * True when the tokens were already stored but the /v1/auth/me load failed
   * transiently after retryAsync exhausted its attempts. The caller can then
   * retry JUST that load via fetchSocialSignInUser() — no second trip through
   * Google/Apple. A transient failure on the token EXCHANGE does not set this:
   * nothing was stored, so the only correct affordance is re-tapping the
   * provider button (the provider token may itself have expired by now).
   */
  retryableDataLoad?: boolean;
}

/**
 * COS-C6: the ONE authenticated data load on the post-social-signin path.
 *
 * Exported so the sign-in screen's retry button can re-run JUST this load —
 * the tokens are already in the Keychain by the time we get here, so a
 * failure at this step must not cost the user the whole sign-in (or a
 * relaunch). Do not inline it back into socialSignInWithBackend.
 */
export async function fetchSocialSignInUser(): Promise<Record<string, unknown>> {
  const meRes = await retryAsync(() => apiClient.get('/v1/auth/me'));
  return meRes.data?.data ?? meRes.data;
}

// Send social auth token to backend and store resulting tokens
export async function socialSignInWithBackend(
  provider: 'google' | 'apple',
  payload: {
    idToken?: string;
    identityToken?: string;
    fullName?: { givenName?: string; familyName?: string };
  },
): Promise<SocialSignInResult> {
  let tokensStored = false;
  try {
    const endpoint =
      provider === 'google' ? '/v1/auth/social/google' : '/v1/auth/social/apple';
    /*
     * COS-C6 — Google/Apple sign-up landed on a blank screen with no name and
     * no data.
     *
     * WHY: these two awaits were the ONLY blocking data load on the whole
     * social path, and they fired with no retry immediately before the ~8-way
     * prefetchAfterAuth burst that routinely trips the Lambda concurrency
     * ceiling. Every downstream consumer swallows a failed request into an
     * empty success (fetchPatientInfo → null, Home's loadPatient clears the
     * spinner, prefetchAfterAuth is allSettled), so "throttled" and "this user
     * has no data" rendered identically — an empty Home.
     *
     * retryAsync (default 3 attempts, 400ms exponential backoff) turns that
     * blank screen into a brief delay. isTransientApiError deliberately does
     * NOT retry 401/403, so a genuinely rejected Google/Apple token still
     * fails fast — do not pass a shouldRetry override that weakens that.
     */
    // Use publicApi (no auth interceptor) to avoid sending stale tokens
    const res = await retryAsync(() => publicApi.post(endpoint, payload));
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
      tokensStored = true;
      return { success: true, user: await fetchSocialSignInUser() };
    }
    return { success: false, message: 'No tokens received from server' };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
    return {
      success: false,
      // Retries are already exhausted by here; flag the case the caller can
      // recover from on its own (signed in, data load failed) so it can offer
      // a retry screen rather than a dead-end error string.
      retryableDataLoad: tokensStored && isTransientApiError(err),
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
