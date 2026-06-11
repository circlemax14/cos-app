import axios, { AxiosError } from 'axios';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { getAccessToken, getRefreshToken, storeTokens, clearTokens } from './auth-tokens';
import { CLIENT_INFO_HEADERS } from './client-info';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Clear all auth state and redirect to sign-in.
 * Called when token refresh fails — the session is unrecoverable.
 * Guarded against re-entry to prevent navigation loops.
 */
let isSigningOut = false;
async function forceSignOut(): Promise<void> {
  if (isSigningOut) return;
  isSigningOut = true;
  await clearTokens();
  await SecureStore.deleteItemAsync('cos_username');
  try {
    router.replace('/(auth)/sign-in' as never);
  } finally {
    // Reset after a short delay to allow navigation to settle
    setTimeout(() => { isSigningOut = false; }, 2000);
  }
}

// ─── Request interceptor: attach stored access token + client telemetry ───
// Client-info headers (app version, build number, runtime, OTA update id,
// channel, platform) are attached to EVERY request so the backend can
// answer "which version is this user on?" for support + rollout tracking.
// Captured once at module load — these don't change during a launch.
apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  for (const [k, v] of Object.entries(CLIENT_INFO_HEADERS)) {
    config.headers[k] = v;
  }
  return config;
});

// ─── Response interceptor: handle 401 refresh + network errors ─────────────
let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // No response at all → network error
    if (!error.response) {
      const networkErr = new Error('No internet connection') as Error & { code: string };
      networkErr.code = 'NETWORK_ERROR';
      throw networkErr;
    }

    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    // 401 → try token refresh once
    if (error.response.status === 401 && !originalRequest?._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve) => {
          pendingRequests.push((newToken: string) => {
            if (originalRequest) {
              originalRequest.headers = originalRequest.headers ?? {};
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(apiClient(originalRequest));
            }
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          await forceSignOut();
          throw error;
        }

        // Detect token type: social (app-signed JWT) vs Cognito.
        // SCRUM-279 (2026-06-11 build 41): previously used atob() which
        // chokes on the base64url alphabet (- and _) that JWTs use,
        // mis-classifying social tokens as Cognito → refresh tried the
        // Cognito path (which needs cos_username — not set for social
        // users) → forced sign-out every time the token expired.
        // Fix: base64url-safe decode + fall through to backend refresh
        // if Cognito refresh fails.
        const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
          try {
            const part = jwt.split('.')[1];
            if (!part) return null;
            // Base64url → base64: replace -/_ and pad to length % 4 === 0.
            let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4 !== 0) b64 += '=';
            return JSON.parse(atob(b64));
          } catch { return null; }
        };
        const currentToken = await getAccessToken();
        const payload = currentToken ? decodeJwtPayload(currentToken) : null;
        const isSocialToken = payload?.tokenType === 'social';

        let newAccess: string;
        let newRefresh: string;
        let newId: string;

        const tryBackendRefresh = async (): Promise<{ a: string; r: string; i: string }> => {
          // Backend `/v1/auth/refresh` is the catch-all path: accepts
          // refresh tokens for both social-signed JWTs and Cognito.
          // No auth interceptor on this axios instance — can't loop.
          const publicHttp = axios.create({
            baseURL: API_BASE,
            timeout: 30_000,
            headers: { 'Content-Type': 'application/json' },
          });
          const refreshRes = await publicHttp.post<{
            success: boolean;
            data?: { accessToken?: string; idToken?: string; refreshToken?: string };
          }>('/v1/auth/refresh', { refreshToken });
          const data = refreshRes.data?.data;
          if (!data?.accessToken || !data.refreshToken || !data.idToken) {
            throw new Error('Refresh response missing tokens');
          }
          return { a: data.accessToken, r: data.refreshToken, i: data.idToken };
        };

        if (isSocialToken) {
          const t = await tryBackendRefresh();
          newAccess = t.a; newRefresh = t.r; newId = t.i;
        } else {
          // Cognito email/password path — refresh via amazon-cognito-identity-js
          // directly. If it fails (e.g. cos_username missing because the
          // user actually signed up via social and we mis-classified —
          // belt-and-suspenders for the atob bug above), fall back to
          // the backend refresh endpoint before giving up.
          try {
            const { refreshCognitoTokens } = await import('./cognito');
            const storedUsername = await import('expo-secure-store').then((m) =>
              m.getItemAsync('cos_username'),
            );
            if (!storedUsername) {
              throw new Error('cos_username missing — likely social user');
            }
            const newTokens = await refreshCognitoTokens(storedUsername, refreshToken);
            newAccess = newTokens.accessToken;
            newRefresh = refreshToken; // Cognito doesn't rotate the refresh token
            newId = newTokens.idToken;
          } catch (cognitoErr) {
            console.warn('[auth] Cognito refresh failed, falling back to backend:', cognitoErr);
            const t = await tryBackendRefresh();
            newAccess = t.a; newRefresh = t.r; newId = t.i;
          }
        }

        await storeTokens(newAccess, newRefresh, newId);

        pendingRequests.forEach((cb) => cb(newAccess));
        pendingRequests = [];

        if (originalRequest) {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return apiClient(originalRequest);
        }
      } catch {
        pendingRequests = [];
        await forceSignOut();
        throw error;
      } finally {
        isRefreshing = false;
      }
    }

    throw error;
  },
);
