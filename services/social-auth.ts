import axios from 'axios';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { Linking, Platform, TurboModuleRegistry } from 'react-native';
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

type AppleSignInResult = {
  identityToken: string;
  fullName?: { givenName?: string; familyName?: string };
  /** COS-1251 — Android only: the backend accepts that token only with this. */
  nonce?: string;
};

const appleCancelled = () => Object.assign(new Error('Apple sign-in cancelled'), { code: 'ERR_REQUEST_CANCELED' });
const APPLE_WEB_RETURN = 'cos://auth/apple';

/*
 * COS-1251 — Android has no Apple sign-in kit, so it uses Apple's web page.
 *
 * Apple only answers with a form POST to an https address, so it posts to the
 * backend, which hands it straight back as a cos://auth/apple link. Another
 * app could claim that link, so Apple stamps the token with sha256(nonce) and
 * only this function knows the nonce — the backend refuses the token without
 * it. `state` proves the link answers THIS request.
 *
 * Cancelling (Apple's Cancel, or closing the page) throws ERR_REQUEST_CANCELED,
 * the same code the iOS kit uses, so the screens need no Android branch.
 */
async function signInWithAppleWeb(): Promise<AppleSignInResult> {
  const nonce = Crypto.randomUUID();
  const state = Crypto.randomUUID();
  const query = {
    client_id: 'ai.circlesupporthealth.csh.web',
    redirect_uri: `${API_BASE.replace(/\/+$/, '')}/v1/auth/social/apple/callback`,
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope: 'name email',
    state,
    nonce: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce),
  };
  const authorizeUrl = `https://appleid.apple.com/auth/authorize?${Object.entries(query)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')}`;

  // Android reports the app coming back to the front as a "dismiss", and that
  // can beat the link itself — so catch the link here as well.
  let answer: string | undefined;
  const sub = Linking.addEventListener('url', ({ url }) => {
    if (url.startsWith(APPLE_WEB_RETURN)) answer = url;
  });
  try {
    const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, APPLE_WEB_RETURN);
    if (result.type === 'success') answer = result.url;
    else if (!answer) await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    sub.remove();
  }
  if (!answer) throw appleCancelled();

  const p: Record<string, string> = {};
  for (const pair of (answer.split('?')[1] ?? '').split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k) p[k] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  if (p.state !== state) throw new Error('Apple sign-in failed: the answer was not for this request');
  if (p.error === 'user_cancelled_authorize') throw appleCancelled();
  if (p.error || !p.id_token) throw new Error(`Apple sign-in failed: ${p.error ?? 'no identity token received'}`);

  // Apple sends the name once, on the first sign-in, as JSON.
  let name: { firstName?: string; lastName?: string } | undefined;
  try {
    name = JSON.parse(p.user ?? '{}').name;
  } catch {
    // No name is fine — the backend falls back to the email.
  }
  return {
    identityToken: p.id_token,
    fullName: name ? { givenName: name.firstName, familyName: name.lastName } : undefined,
    nonce,
  };
}

// Apple Sign-In — returns identity token and optional name from credential
export async function signInWithApple(): Promise<AppleSignInResult> {
  if (Platform.OS === 'android') return signInWithAppleWeb();
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

/*
 * COS-928 — Android signs in to Google natively. Google no longer accepts the
 * custom-scheme redirect expo-auth-session needs on Android ("Custom URI
 * schemes are no longer supported on Android"), so that flow cannot work there
 * whatever is configured. iOS keeps expo-auth-session and never links this
 * library (react-native.config.js).
 *
 * The library's import calls TurboModuleRegistry.getEnforcing('RNGoogleSignin'),
 * which THROWS on a binary built without it — every iOS build and Android
 * 1.6.0 (69) — and an OTA can reach those. So: check with the non-throwing
 * get() first, import lazily, and hide the button when the module is absent.
 */
export function isNativeGoogleSignInAvailable(): boolean {
  return Platform.OS === 'android' && TurboModuleRegistry.get('RNGoogleSignin') != null;
}

/** The Google ID token, or null when the user closed the account picker. */
export async function signInWithGoogleNative(): Promise<string | null> {
  const { GoogleSignin, isSuccessResponse } = await import(
    '@react-native-google-signin/google-signin'
  );
  // webClientId makes Google issue the token to the WEB client — an audience
  // the backend already accepts, so the backend needs no Android client id.
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  // ponytail: forget the last account so the picker always shows — otherwise a
  // patient who signed out could never choose a different Google account.
  await GoogleSignin.signOut();
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) return null;
  if (!res.data.idToken) throw new Error('Google sign-in returned no ID token');
  return res.data.idToken;
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
    nonce?: string;
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
  nonce?: string,
): Promise<{ linked: boolean }> {
  const res = await apiClient.post('/v1/auth/social/link', { provider, idToken, nonce });
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
