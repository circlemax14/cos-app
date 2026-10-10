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

/** Privacy Policy §7: Cal. Health & Safety Code § 123145 minimum. */
export const HEALTH_RECORD_RETENTION_YEARS = 7;

const SUPPORT_EMAIL = 'support@circlesupporthealth.ai';

/**
 * What the server actually did, read from the flags (not the status code):
 *
 *  - 'confirmed': the users row carries scheduledPurgeAt (so the nightly purge
 *    will erase it) AND the Cognito user is disabled (nobody can sign back in).
 *  - 'requested': the row IS marked for purge, but disabling the sign-in failed.
 *    The deletion will still happen (markUserSoftDeleted is idempotent and the
 *    accountPurge lambda acts on the row), so telling the patient "NOT deleted"
 *    would be false. Seen every time for test-pool accounts, whose Cognito pool
 *    adminDisableCognitoUser does not target.
 *  - 'failed': nothing durable happened (error, offline, row not marked).
 *
 * `body` is the raw axios `response.data` — `{ success, data: {...} }`.
 */
export type DeletionOutcome = 'confirmed' | 'requested' | 'failed';

export function deletionOutcome(body: unknown): DeletionOutcome {
  if (!body || typeof body !== 'object') return 'failed';
  const env = body as { success?: unknown; data?: unknown };
  if (env.success === false) return 'failed';
  const d = env.data as Record<string, unknown> | null | undefined;
  if (!d || typeof d !== 'object' || d.deleted !== true || d.userRowMarkedDeleted !== true) return 'failed';
  return d.cognitoDisabled === true ? 'confirmed' : 'requested';
}

export interface DeletionCopy {
  confirmTitle: string;
  confirmBody: string;
  lastChanceTitle: string;
  lastChanceBody: string;
  successTitle: string;
  successBody: string;
  requestedTitle: string;
  requestedBody: string;
  failureTitle: string;
  failureBody: string;
}

export function deletionCopy(platform: string): DeletionCopy {
  const store = platform === 'android' ? 'Google Play' : 'the App Store';
  // Must say the same thing as Privacy Policy §7 and the public web page
  // (cos-frontend src/pages/marketing/DeleteAccount.tsx): profile 30 days,
  // health records at least 7 years, audit logs 6 years.
  const retention =
    `Your account profile is kept for ${DELETION_GRACE_DAYS} days so support can restore it, then deleted. ` +
    `Health records the law requires us to keep are held encrypted for at least ${HEALTH_RECORD_RETENTION_YEARS} years, ` +
    `and audit logs for 6 years, then deleted (Privacy Policy, section 7).`;
  return {
    confirmTitle: 'Delete account?',
    confirmBody:
      `This closes your Circle Support Health account and signs you out everywhere. ${retention} ` +
      `Deleting your account does not cancel a subscription bought through ${store} — cancel it there.`,
    lastChanceTitle: 'Last chance',
    lastChanceBody: 'Tap Delete to close your account. You will be signed out immediately.',
    successTitle: 'Account deleted',
    successBody: `Your account is closed. ${retention} We're sorry to see you go.`,
    requestedTitle: 'Deletion requested',
    requestedBody:
      `We've recorded your request, scheduled your account for deletion and signed you out on this device. ` +
      `One step is still finishing on our side; if you need confirmation, email ${SUPPORT_EMAIL}. ${retention}`,
    failureTitle: 'Account not deleted',
    failureBody:
      `We could not confirm the deletion, so your account has NOT been deleted and you are still signed in. ` +
      `Check your connection and try again, or delete it on the web at ${ACCOUNT_DELETION_WEB_URL.replace('https://', '')}.`,
  };
}
