import * as SecureStore from 'expo-secure-store';
import { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cognitoSignOut } from '@/lib/cognito';
import { storeTokens, clearTokens, hasStoredSession } from '@/lib/auth-tokens';
import { apiClient } from '@/lib/api-client';
import { setCachedProfile, clearCachedProfile } from '@/lib/cached-profile';
import { clearCachedUserSummary } from '@/lib/cached-user-summary';
import { queryClient } from '@/providers/QueryProvider';

/**
 * Key prefixes that hold per-user, PHI-bearing state in AsyncStorage and
 * MUST be purged on sign-out. Audit SCRUM-365 STORAGE-003/004 found these
 * keys leaking between users on a shared device.
 *
 *  - 'doctor_data_<providerId>' — cached doctor lookups (PHI: who the user sees).
 *  - 'assessment-draft:<instrumentId>' — in-flight PROMIS / PHQ-9 / etc. drafts.
 *  - 'assessment_' — defensive: catches any legacy/alternate assessment key naming.
 */
export const PHI_KEY_PREFIXES_TO_PURGE_ON_SIGNOUT = [
  'doctor_data_',
  'assessment-draft:',
  'assessment_',
] as const;

/**
 * Best-effort sweep of all AsyncStorage keys whose prefix matches one of
 * PHI_KEY_PREFIXES_TO_PURGE_ON_SIGNOUT. Exported for testability.
 *
 * Returns the list of keys it removed (handy for tests / debugging).
 */
export async function purgePhiAsyncStorageKeys(
  storage: Pick<typeof AsyncStorage, 'getAllKeys' | 'multiRemove'> = AsyncStorage,
): Promise<string[]> {
  try {
    const all = await storage.getAllKeys();
    const matches = all.filter((k) =>
      PHI_KEY_PREFIXES_TO_PURGE_ON_SIGNOUT.some((prefix) => k.startsWith(prefix)),
    );
    if (matches.length > 0) {
      await storage.multiRemove(matches);
    }
    return [...matches];
  } catch {
    // Sign-out cleanup is best-effort — a storage failure must not block
    // the user from signing out (auth tokens are already cleared by the
    // caller before this runs).
    return [];
  }
}

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
  ehiExportFailed: boolean;
  firstName?: string | null;
  lastName?: string | null;
  hasSeenWelcome?: boolean;
}

/**
 * Flag the one-time welcome screen as seen on the server. Idempotent — safe
 * to call multiple times; swallows errors so a network blip doesn't trap the
 * user on the welcome screen.
 */
export async function markWelcomeSeen(): Promise<void> {
  try {
    await apiClient.post('/v1/auth/welcome-seen');
  } catch (err) {
    console.warn('[auth] markWelcomeSeen failed:', err);
  }
}

/**
 * Sign in via backend API, store tokens securely, return user profile.
 */
export async function signIn(
  payload: SignInPayload,
): Promise<{
  success: boolean;
  user?: UserProfile;
  message?: string;
  notConfirmed?: boolean;
  /**
   * True when the backend returned ACCOUNT_INACTIVE (COS-354 / SCRUM-573)
   * — the account is soft-deleted and awaiting hard-purge. Sign-in
   * screen surfaces a dedicated UI with a Contact Support link so the
   * user knows how to recover within the 30-day grace window.
   */
  accountInactive?: boolean;
}> {
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
    await setCachedProfile(meRes.data.data);
    return { success: true, user: meRes.data.data };
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      // TODO: remove before production
      console.warn('[DEBUG signIn] status:', err.response?.status, 'data:', JSON.stringify(err.response?.data));
      const code: string | undefined = err.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        return { success: false, notConfirmed: true, message: 'Please verify your email before signing in.' };
      }
      if (code === 'ACCOUNT_INACTIVE') {
        // Backend returns 403 with this code when the Cognito user is
        // Enabled=false — almost always because the user (or an admin)
        // requested account deletion within the last 30 days.
        // Distinct return field so the sign-in screen can show a
        // dedicated recovery CTA instead of the generic "wrong
        // credentials" toast.
        return {
          success: false,
          accountInactive: true,
          message:
            err.response?.data?.error ??
            'This account has been deactivated. If you did not request deletion, contact support at support@circlesupporthealth.ai to recover it.',
        };
      }
      const apiMsg: string | undefined = err.response?.data?.error ?? err.response?.data?.message;
      if (apiMsg) return { success: false, message: apiMsg };
    }
    const msg = err instanceof Error ? err.message : 'Sign in failed';
    return { success: false, message: msg };
  }
}

/**
 * Why a session check did not come back authenticated. Callers MUST
 * branch on this — see BUG #17 below.
 *
 *   'no_tokens'      — nothing in Keychain. Genuinely signed out.
 *   'unauthenticated'— backend said 401/403. Session is dead; tokens cleared.
 *   'indeterminate'  — network error / 5xx / timeout. We DO NOT KNOW whether
 *                      the session is valid. Tokens are intact. Treat the
 *                      user as still-signed-in and retry later.
 */
export type SessionCheckReason = 'no_tokens' | 'unauthenticated' | 'indeterminate';

export interface SessionCheckResult {
  authenticated: boolean;
  user?: UserProfile;
  /** Present whenever `authenticated` is false. */
  reason?: SessionCheckReason;
}

/**
 * Check if the user has a valid stored session.
 *
 * ─── BUG #17 FIX (Ken 2026-08-07) ───────────────────────────────────
 * REPORTED: "I open the app every day or after a few hours and the sign-in
 * screen opens directly — the app isn't checking with the backend whether my
 * session is active. If I force-close and reopen, it finds my session and
 * works."
 *
 * ROOT CAUSE: this function previously collapsed EVERY failure into a bare
 * `{ authenticated: false }`. A transient network error — which
 * lib/api-client.ts throws as a plain `Error` with `code: 'NETWORK_ERROR'`,
 * NOT an AxiosError, so the 401/403 branch below correctly leaves tokens
 * alone — still reported "not authenticated" to callers.
 *
 * app/index.tsx then called `requestSignIn('splash_revalidate_failed')`, and
 * that reason is in BYPASS_LOCK_REASONS (lib/lock-gate.ts), so it routed
 * straight to /(auth)/sign-in — bypassing the PIN screen entirely — while
 * the user's Cognito tokens were still perfectly valid.
 *
 * Hence the asymmetry the user noticed: a cold start is local-first
 * (hasStoredSession() is a local token-presence check and never touches the
 * network), so force-quitting "fixed" it; a warm path that happened to hit a
 * flaky moment did not.
 *
 * THE FIX: distinguish "the backend told us this session is dead" from "we
 * could not reach the backend". Only the former may sign the user out.
 */
export async function checkSession(): Promise<SessionCheckResult> {
  const hasSession = await hasStoredSession();
  if (!hasSession) return { authenticated: false, reason: 'no_tokens' };

  try {
    const res = await apiClient.get<{ success: boolean; data: UserProfile }>('/v1/auth/me');
    await setCachedProfile(res.data.data);
    return { authenticated: true, user: res.data.data };
  } catch (err) {
    // Only clear tokens on definitive auth failures (401/403). Network errors
    // and server 5xx must not log the user out — they should fall back to
    // cached data on the startup path instead.
    const status = err instanceof AxiosError ? err.response?.status : undefined;
    if (status === 401 || status === 403) {
      await clearTokens();
      await clearCachedProfile();
      return { authenticated: false, reason: 'unauthenticated' };
    }
    // Everything else — NETWORK_ERROR (thrown as a plain Error by the
    // api-client interceptor), 5xx, timeouts, DNS failures — is
    // INDETERMINATE. The tokens are still in Keychain and may well be
    // valid. Callers must NOT route to sign-in on this.
    return { authenticated: false, reason: 'indeterminate' };
  }
}

/**
 * Sign out: clear tokens and Cognito session. Also clear any user-
 * scoped local caches that could leak PHI to the next user on the
 * device (React Query cache, profile cache, user-summary cache,
 * doctor_data_* and assessment-draft:* AsyncStorage keys, calendar
 * mirror map, etc.).
 *
 * Audit SCRUM-365 SESSION-001 + STORAGE-003/004: prior implementation
 * left React Query state and per-user AsyncStorage keys behind, so the
 * next user on a shared device could see the previous user's PHI.
 */
export async function signOut(): Promise<void> {
  // Capture the outgoing user's sub before clearing the cached profile
  // so we can scope the cache wipes correctly.
  let outgoingSub: string | undefined
  try {
    const res = await apiClient.get<{ success: boolean; data: UserProfile }>('/v1/auth/me')
    outgoingSub = res.data?.data?.sub
  } catch { /* swallow — sign-out is best-effort cleanup */ }

  cognitoSignOut();
  await clearTokens();
  await clearCachedProfile();
  await clearCachedUserSummary();
  await SecureStore.deleteItemAsync('cos_username');

  // Nuke the React Query cache so PHI-bearing query responses (patients,
  // health plans, providers, etc.) can't be observed by the next signed-in
  // user. .clear() removes all queries + mutations and resets internal state.
  try {
    queryClient.clear();
  } catch { /* non-fatal — never block sign-out */ }

  // Sweep PHI-bearing AsyncStorage keys (doctor_data_*, assessment-draft:*,
  // assessment_*) — see PHI_KEY_PREFIXES_TO_PURGE_ON_SIGNOUT above.
  await purgePhiAsyncStorageKeys();

  if (outgoingSub) {
    // Lazy-import to avoid pulling AsyncStorage into every consumer of
    // auth.ts at module-load time. Best-effort: a failure here doesn't
    // block sign-out, the next read will fail closed (mirror map only
    // acts when ownerSub matches the current session).
    try {
      const { clearMirrorMap } = await import('./calendar-mirror')
      await clearMirrorMap(outgoingSub)
    } catch { /* non-fatal */ }

    // SCRUM-367: sweep this user's in-progress assessment drafts
    // (clinical questionnaire answers — PHI) so the next user on the
    // device cannot inherit them.
    try {
      const { clearAllAssessmentDraftsForUser } = await import('@/lib/assessment-draft-storage')
      await clearAllAssessmentDraftsForUser(outgoingSub)
    } catch { /* non-fatal */ }
  }
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
