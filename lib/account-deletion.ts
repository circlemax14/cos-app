/**
 * Account deletion — the pure half (no React Native imports, so node --test
 * can load it). The interactive flow lives in services/account-deletion.ts.
 *
 * Apple 5.1.1(v) / Google Play account deletion. Two defects this fixes:
 *
 *  1. The old handler swallowed every error from DELETE /v1/auth/account and
 *     then ALWAYS said "Your account and data have been deleted". Offline, a
 *     5xx or a dead refresh token left the account fully active while the
 *     patient was told it was gone.
 *  2. Even a 200 does not prove deletion: softDeleteAccount (cos-backend
 *     src/services/account-deletion.service.ts) never throws — it records
 *     DynamoDB / Cognito failures as false flags and the route still answers
 *     200 { deleted: true }. So we read the flags, not the status code.
 *
 * The copy also stopped saying "permanently ... cannot be undone": the backend
 * soft-deletes with a 30-day window support can reverse, and Privacy Policy §7
 * keeps legally required health records for 7 years.
 */

/** Public web deletion page (cos-frontend /delete-account, live on prod). */
export const ACCOUNT_DELETION_WEB_URL = 'https://circlesupporthealth.ai/delete-account';

/** Must match GRACE_WINDOW_DAYS in cos-backend account-deletion.service.ts. */
export const DELETION_GRACE_DAYS = 30;

/**
 * True only when the server says the two load-bearing steps happened:
 * the users row carries scheduledPurgeAt (so the nightly purge will erase it)
 * and the Cognito user is disabled (so nobody can sign back in).
 *
 * `body` is the raw axios `response.data` — `{ success, data: {...} }`.
 */
export function isDeletionConfirmed(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const env = body as { success?: unknown; data?: unknown };
  if (env.success === false) return false;
  const d = env.data as Record<string, unknown> | null | undefined;
  if (!d || typeof d !== 'object') return false;
  return d.deleted === true && d.userRowMarkedDeleted === true && d.cognitoDisabled === true;
}

export interface DeletionCopy {
  confirmTitle: string;
  confirmBody: string;
  lastChanceTitle: string;
  lastChanceBody: string;
  successTitle: string;
  successBody: string;
  failureTitle: string;
  failureBody: string;
}

export function deletionCopy(platform: string): DeletionCopy {
  const store = platform === 'android' ? 'Google Play' : 'the App Store';
  return {
    confirmTitle: 'Delete account?',
    confirmBody:
      `This closes your Circle Support Health account and signs you out everywhere. ` +
      `For ${DELETION_GRACE_DAYS} days support can still restore it; after that it is permanently erased. ` +
      `Health records we are required by law to keep are held encrypted for that period and then deleted (Privacy Policy, section 7). ` +
      `Deleting your account does not cancel a subscription bought through ${store} — cancel it there.`,
    lastChanceTitle: 'Last chance',
    lastChanceBody: 'Tap Delete to close your account. You will be signed out immediately.',
    successTitle: 'Account deleted',
    successBody:
      `Your account is closed and is scheduled to be permanently erased in ${DELETION_GRACE_DAYS} days. We're sorry to see you go.`,
    failureTitle: 'Account not deleted',
    failureBody:
      `We could not confirm the deletion, so your account has NOT been deleted and you are still signed in. ` +
      `Check your connection and try again, or delete it on the web at ${ACCOUNT_DELETION_WEB_URL.replace('https://', '')}.`,
  };
}
