import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AxiosError, type AxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cognitoSignOut } from '@/lib/cognito';
import { storeTokens, clearTokens, hasStoredSession, getAccessToken, writeSecure } from '@/lib/auth-tokens';
import { clearPinData } from '@/services/pin-auth';
import { apiClient } from '@/lib/api-client';
import { setCachedProfile, clearCachedProfile } from '@/lib/cached-profile';
import { purgeLocalPhi } from '@/lib/purge-local-phi';
import { queryClient } from '@/providers/QueryProvider';

/*
 * COS-1152 — the PHI purge moved to lib/purge-local-phi.ts.
 *
 * It lived here and was called from this file's signOut() alone, while
 * api-client's forceSignOut — the involuntary path, and the common one —
 * cleared tokens and nothing else. Two sign-outs, one cleanup. Moving it to a
 * module both can import is what stops them drifting apart again.
 */

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
  /**
   * COS-1235 — the server's word that this account is here for a CARE CIRCLE
   * rather than for its own medical records (a live invitation, or any row in the
   * social graph), so connecting a clinic is optional for them.
   *
   * It is what stops a brand-new invitee being funnelled into "connect your
   * clinic" — a screen whose only two exits are connecting one and signing out —
   * with their invitation on the far side of it. Read by lib/onboarding-gate.ts,
   * and ABSENT on a profile cached by an older build, which reads as false.
   */
  ehrOnboardingOptional?: boolean;
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
    await writeSecure('cos_username', payload.username);

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
      /*
       * COS-1152 — the third partial purge. This verdict means the session is
       * gone, so the outgoing account's cached responses must go with it. It
       * used to clear the profile alone and leave the React Query cache
       * whole.
       */
      await clearTokens();
      await purgeLocalPhi();
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
const PUSH_PROJECT_ID =
  Constants.expoConfig?.extra?.eas?.projectId ?? '30bc49bd-ee12-4a06-86b3-ee4f23690114';

/**
 * COS-1243 — forget this phone on the account, so a shared phone stops
 * receiving the previous account's notifications (which can name medications).
 *
 * Best effort, capped at 3s so sign-out never hangs: no permission means no
 * token was ever registered, and a backend without the route answers 404.
 */
async function unregisterPushToken(asOutgoingUser: AxiosRequestConfig): Promise<void> {
  const attempt = (async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PUSH_PROJECT_ID });
    await apiClient.post('/v1/notifications/unregister-token', { token }, asOutgoingUser);
  })().catch(() => {});
  await Promise.race([attempt, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
}

export async function signOut(): Promise<void> {
  /*
   * COS-1250 — the phone forgets the account FIRST, before any network call.
   *
   * Vishal, Android, 2026-10-07: tapped Sign Out, closed the app, reopened —
   * PIN screen, then straight back in, signed in. Two holes:
   *  - the wipe ran AFTER a GET /auth/me and the push unregister, a second or
   *    two of spinner; closing the app then killed sign-out before it had
   *    deleted anything.
   *  - the PIN was never deleted. A PIN with no login is what the splash reads
   *    as "the login is there, the Keychain is just slow" — so it opened on
   *    the PIN screen, and the api-client never signs out an empty store
   *    while a PIN exists (COS-1032).
   * The PIN goes before the tokens: dying between the two must leave a plain
   * signed-in phone, never a PIN with nothing behind it.
   *
   * The network calls still need the session, so they carry its token.
   */
  const token = await getAccessToken();
  const asOutgoingUser: AxiosRequestConfig = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

  await clearPinData();
  cognitoSignOut();
  await clearTokens();
  await SecureStore.deleteItemAsync('cos_username');

  /*
   * COS-1152 — the same purge the involuntary path now runs.
   *
   * This used to be three inline steps here and nothing at all in
   * api-client's forceSignOut. Sharing one function is what stops the two
   * paths drifting apart again: the next thing worth forgetting gets added
   * once, and both sign-outs get it.
   */
  await purgeLocalPhi();

  // Best effort from here — the phone is already signed out.
  let outgoingSub: string | undefined
  try {
    const res = await apiClient.get<{ success: boolean; data: UserProfile }>('/v1/auth/me', asOutgoingUser)
    outgoingSub = res.data?.data?.sub
  } catch { /* swallow — sign-out is best-effort cleanup */ }

  await unregisterPushToken(asOutgoingUser);

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
