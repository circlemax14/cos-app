import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  fetchPhotoDownloadUrl,
  isSignedPhotoUrl,
  registerPhotoResigner,
  PHOTO_RESIGN_MIN_INTERVAL_MS,
  PHOTO_URL_CLIENT_TTL_MS,
} from '@/services/user-photo';
import {
  getCachedUserSummary,
  updateCachedUserSummary,
} from '@/lib/cached-user-summary';

/**
 * Single source of truth for the signed-in user's profile photo.
 *
 * Why this exists: previously each screen (Home, drawer, personal-info)
 * fetched the photo URL independently with its own useEffect-on-mount.
 * After uploading a new photo, only the personal-info screen's local
 * state updated; Home and the drawer kept showing the old image (or a
 * blank circle when the URL was stale or pointed at a missing object).
 *
 * Now: the personal-info screen calls `setPhotoUrl(newUrl)` after a
 * successful upload, and every consumer of `useUserPhoto()` rerenders
 * with the new value.
 *
 * ── BUG FIX (photo showed correctly, then only initials) ────────────────
 *
 * WHY THIS FILE CHANGED. Three defects stacked into one symptom:
 *
 *  1. EXPIRING URL, IMMORTAL CACHE. The backend signs the S3 GET with
 *     `expiresIn: 3600` (cos-backend/src/routes/upload.routes.ts). This
 *     store fetched it exactly once, in a mount effect, and then held it
 *     in React state forever. React Native processes routinely survive for
 *     days across background/foreground cycles, so ~1h after launch every
 *     avatar was pointing at a URL S3 answers with 403. Nothing re-signed
 *     it, and because the URL string never changed, EntityIcon's
 *     reset-on-url-change effect never fired — the initials fallback
 *     latched permanently. This alone reproduces "worked for a while,
 *     then stopped" exactly.
 *
 *  2. UNRENDERABLE FALLBACK. On any failure of the download call we fell
 *     back to `patient.photoUrl`, which is the UNSIGNED canonical object
 *     URL. The bucket is private, so that URL can never load — it 403s
 *     100% of the time. One transient failure at launch therefore produced
 *     a permanently broken image for the whole session, visually identical
 *     to "no photo set".
 *
 *  3. NEGATIVE RESULT NEVER RETRIED. `getPhotoDownloadUrl()` collapsed
 *     every error into `null`, and nothing re-ran after the mount effect —
 *     no focus retry, no foreground retry, no retry on image failure.
 *
 * The fixes, in order: cache the freshness timestamp and re-sign whenever
 * the URL is older than PHOTO_URL_CLIENT_TTL_MS (45m, comfortably inside
 * the 60m signature); re-sign on every foreground transition past that
 * age; never store an unsigned URL as something to render; distinguish
 * "no photo" (cache it) from "call failed" (retry it, keep showing what
 * we have); and expose a re-signer so a failing <Image> can pull one fresh
 * URL before giving up.
 *
 * NOTE: we do not log URLs here. A presigned S3 URL is a bearer credential
 * for a patient's photo.
 */

interface UserPhotoContextType {
  /** Presigned download URL safe to feed straight into <Image source={{uri}}>. Null while loading or when no photo is set. */
  photoUrl: string | null;
  /** Loading state for the initial fetch. */
  isLoading: boolean;
  /**
   * True when the user record says a photo exists, regardless of whether we
   * currently hold a usable signed URL for it. Lets a consumer tell "no photo
   * set" apart from "photo temporarily unavailable".
   */
  hasPhoto: boolean;
  /** Override the URL after an upload completes locally. */
  setPhotoUrl: (url: string | null) => void;
  /** Re-fetch from the backend (e.g. after sign-in or pull-to-refresh). */
  refresh: () => Promise<void>;
  /**
   * Mint a fresh signed URL on demand — used when an <Image> reports that the
   * current URL failed to load. Rate-limited internally. Resolves to the new
   * URL, or null when there is nothing better to offer.
   */
  resignPhotoUrl: () => Promise<string | null>;
}

const UserPhotoContext = createContext<UserPhotoContextType | undefined>(undefined);

export function UserPhotoProvider({ children }: { children: ReactNode }) {
  const [photoUrl, setPhotoUrlState] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  /** Wall-clock ms when the current `photoUrl` was signed. 0 = nothing held. */
  const signedAtRef = useRef(0);
  /** Mirror of `photoUrl` readable from callbacks without stale-closure risk. */
  const photoUrlRef = useRef<string | null>(null);
  /** De-dupes concurrent re-sign attempts and enforces the min interval. */
  const inFlightRef = useRef<Promise<string | null> | null>(null);
  const lastAttemptAtRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /*
   * COS-891 — every commit writes through to the device.
   *
   * This is the single place a signed URL becomes "the current photo", so it
   * is the single place the on-device copy has to be kept in step. Before,
   * the only writer of the cached photo was the drawer's own profile fetch,
   * so an upload updated memory and the device kept serving the previous
   * photo until that fetch next ran.
   *
   * Fire-and-forget: an AsyncStorage write must never delay the photo
   * appearing, and its failure is recoverable on the next commit.
   */
  const commitUrl = useCallback((url: string | null) => {
    photoUrlRef.current = url;
    signedAtRef.current = url ? Date.now() : 0;
    if (mountedRef.current) setPhotoUrlState(url);
    void updateCachedUserSummary({
      photoUrl: url ?? undefined,
      photoSignedAt: url ? Date.now() : undefined,
    });
  }, []);

  /**
   * Public setter used by the personal-info screen after an upload.
   *
   * Guard: if the caller hands us an unsigned URL (the upload flow falls back
   * to the canonical object URL when the download call fails) we still accept
   * it so the user sees *something* change, but we mark it as already stale so
   * the very next freshness check re-signs it instead of leaving a URL that
   * can only 403.
   */
  const setPhotoUrl = useCallback(
    (url: string | null) => {
      photoUrlRef.current = url;
      setHasPhoto(!!url);
      if (url && !isSignedPhotoUrl(url)) {
        signedAtRef.current = 0;
      } else {
        signedAtRef.current = url ? Date.now() : 0;
      }
      if (mountedRef.current) setPhotoUrlState(url);
      /*
       * COS-891 — the upload path writes through too. An UNSIGNED url is
       * cached with no photoSignedAt, so the hydrate below treats it as
       * already stale and re-signs rather than showing a URL that can only
       * 403. Same three-way judgement the in-memory clock makes.
       */
      void updateCachedUserSummary({
        photoUrl: url ?? undefined,
        photoSignedAt: url && isSignedPhotoUrl(url) ? Date.now() : undefined,
      });
    },
    [],
  );

  /**
   * Fetch a fresh signed URL. Shared by `refresh`, the foreground check and
   * the on-error re-sign so all three obey the same de-dupe + rate limit.
   */
  const signFresh = useCallback(async (): Promise<string | null> => {
    if (inFlightRef.current) return inFlightRef.current;

    const now = Date.now();
    if (now - lastAttemptAtRef.current < PHOTO_RESIGN_MIN_INTERVAL_MS) {
      // Too soon since the last attempt. Returning the current value (rather
      // than null) keeps a genuinely-broken image from triggering a re-sign
      // storm while still letting a later attempt succeed.
      return photoUrlRef.current;
    }
    lastAttemptAtRef.current = now;

    const task = (async (): Promise<string | null> => {
      const result = await fetchPhotoDownloadUrl();
      if (result.status === 'ok') {
        commitUrl(result.url);
        if (mountedRef.current) setHasPhoto(true);
        return result.url;
      }
      if (result.status === 'none') {
        // Authoritative: the backend checked DynamoDB and S3 and there is
        // nothing to show. Safe to cache this negative — it only changes via
        // an upload, which calls setPhotoUrl().
        commitUrl(null);
        if (mountedRef.current) setHasPhoto(false);
        return null;
      }
      // status === 'error' — transient. Do NOT cache the failure and do NOT
      // clear what we're already showing. Leave signedAt untouched so the
      // next freshness check tries again.
      return null;
    })();

    inFlightRef.current = task;
    try {
      return await task;
    } finally {
      inFlightRef.current = null;
    }
  }, [commitUrl]);

  const refresh = useCallback(async () => {
    /*
     * COS-873 — ask the DOWNLOAD endpoint, not the profile.
     *
     * Ken uploaded a photo and it stopped appearing. This used to call
     * fetchPatientInfo() first and treat a missing photoUrl as "no photo":
     *
     *     const patient = await fetchPatientInfo();
     *     if (!patient?.photoUrl) { setHasPhoto(false); commitUrl(null); return; }
     *
     * with a comment claiming that was safe because it only ran "when the
     * profile call actually succeeded". It cannot be. fetchPatientInfo
     * (services/api/patient.ts:53-102) never throws and never distinguishes
     * failure from absence — it swallows a failed /v1/auth/me AND a failed
     * /v1/patients/me and returns null either way. So EVERY transient failure
     * arrived as `patient === null`, took the early return, and was cached as
     * an authoritative "this user has no photo". The catch below was
     * unreachable for exactly the case it was written to protect.
     *
     * That is defect #3 in this file's own header — "NEGATIVE RESULT NEVER
     * RETRIED" — fixed once for the download call and reintroduced a layer up.
     *
     * signFresh already has the right three-way semantics: 'ok' commits the
     * signed URL, 'none' commits null, and 'error' touches nothing. The
     * download endpoint is authoritative — it reads photoUrl server-side, HEADs
     * the object and checks its storage class. Asking the profile first only
     * added two more ways to get a false negative.
     */
    try {
      await signFresh();
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [signFresh]);

  /**
   * On-demand re-sign for a URL that just failed to load in an <Image>.
   * Bypasses the age check (the whole point is that the URL is bad even
   * though it may look young — e.g. device clock skew, or the object was
   * replaced), but still honours the de-dupe and rate limit.
   */
  const resignPhotoUrl = useCallback(async (): Promise<string | null> => {
    // Force the freshness clock to zero so the next age check can't decide
    // the current (known-bad) URL is still good.
    signedAtRef.current = 0;
    return signFresh();
  }, [signFresh]);

  /*
   * COS-891 — paint from the device first, and skip the network entirely when
   * what we have is still valid.
   *
   * The signature lives an hour server-side and PHOTO_URL_CLIENT_TTL_MS (45m)
   * is the app's safety margin inside that. A cached URL younger than the
   * margin is as good as one we would have just fetched, so a cold start
   * inside that window costs zero requests — and because it is the SAME url
   * string, expo-image serves the bytes from its own disk cache rather than
   * re-downloading them.
   *
   * Older than the margin, or unsigned, or absent: fall through to refresh()
   * exactly as before. The cache can only save a request, never cause a
   * wrong one.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await getCachedUserSummary();
      if (cancelled) return;

      const url = cached?.photoUrl;
      const signedAt = cached?.photoSignedAt ?? 0;
      const fresh =
        !!url &&
        signedAt > 0 &&
        Date.now() - signedAt < PHOTO_URL_CLIENT_TTL_MS &&
        isSignedPhotoUrl(url);

      if (fresh && url) {
        photoUrlRef.current = url;
        signedAtRef.current = signedAt;
        if (mountedRef.current) {
          setPhotoUrlState(url);
          setHasPhoto(true);
          setIsLoading(false);
        }
        return;
      }

      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  /**
   * Re-sign before the signature dies.
   *
   * Two triggers, both cheap:
   *  • foreground transition — the common case, since the app is usually
   *    backgrounded between sessions and that's exactly when an hour passes;
   *  • a slow interval, for the user who leaves the app open on one screen
   *    (our patients skew older and do exactly this).
   */
  useEffect(() => {
    const refreshIfStale = () => {
      if (!photoUrlRef.current) return;
      const age = Date.now() - signedAtRef.current;
      if (signedAtRef.current === 0 || age >= PHOTO_URL_CLIENT_TTL_MS) {
        void signFresh();
      }
    };

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') refreshIfStale();
    });

    // 5-minute poll: granular enough that a URL is never more than 5 minutes
    // past the 45-minute client TTL, i.e. always re-signed with ~10 minutes of
    // signature life left.
    const timer = setInterval(refreshIfStale, 5 * 60 * 1000);

    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [signFresh]);

  /**
   * Publish the re-signer so the generic avatar component can ask for a fresh
   * URL when an image load fails, without importing this store.
   *
   * The guard matters: EntityIcon renders doctors, agencies and clinics too.
   * We only answer for the URL we currently own; every other failed URL gets
   * null and falls through to initials immediately.
   */
  useEffect(() => {
    return registerPhotoResigner(async (failedUrl: string) => {
      if (failedUrl !== photoUrlRef.current) return null;
      return resignPhotoUrl();
    });
  }, [resignPhotoUrl]);

  return (
    <UserPhotoContext.Provider
      value={{ photoUrl, isLoading, hasPhoto, setPhotoUrl, refresh, resignPhotoUrl }}
    >
      {children}
    </UserPhotoContext.Provider>
  );
}

export function useUserPhoto() {
  const ctx = useContext(UserPhotoContext);
  if (!ctx) throw new Error('useUserPhoto must be used within UserPhotoProvider');
  return ctx;
}
