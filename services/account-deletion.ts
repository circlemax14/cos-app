/**
 * The ONE in-app account-deletion flow (Apple 5.1.1(v), Google Play account
 * deletion). Used by Profile and by onboarding's fasten-connect screen, so the
 * two entry points cannot drift. Pure logic + copy: lib/account-deletion.ts.
 */
import { Alert, Linking, Platform } from 'react-native';
import { router } from 'expo-router';

import { apiClient } from '@/lib/api-client';
import { ACCOUNT_DELETION_WEB_URL, deletionCopy, deletionOutcome, type DeletionOutcome } from '@/lib/account-deletion';
import { queryClient } from '@/providers/QueryProvider';
import { signOut } from '@/services/auth';

/**
 * Two-step confirm, then DELETE /v1/auth/account. Success is announced only
 * when the server confirms it. If the row is marked for purge but the sign-in
 * could not be disabled, the patient is told the deletion is REQUESTED (true:
 * the purge will run) and signed out — never "NOT deleted". Otherwise the
 * patient stays signed in and is offered Retry or the web deletion page.
 *
 * `setBusy(true)` fires when the network call starts; `setBusy(false)` only on
 * failure (on success the screen is replaced, and staying latched prevents a
 * double-fire during the navigation frame).
 */
export function confirmAndDeleteAccount(setBusy: (busy: boolean) => void): void {
  const copy = deletionCopy(Platform.OS);

  const run = async () => {
    setBusy(true);
    let outcome: DeletionOutcome = 'failed';
    try {
      const res = await apiClient.delete('/v1/auth/account');
      outcome = deletionOutcome(res?.data);
    } catch {
      outcome = 'failed';
    }

    if (outcome !== 'failed') {
      try {
        await signOut();
      } catch {
        // Best-effort; the account is already marked for purge server-side.
      }
      queryClient.clear();
      router.replace('/(auth)/sign-in' as never);
      const [title, body] = outcome === 'confirmed'
        ? [copy.successTitle, copy.successBody]
        : [copy.requestedTitle, copy.requestedBody];
      setTimeout(() => Alert.alert(title, body), 400);
      return;
    }

    setBusy(false);
    Alert.alert(copy.failureTitle, copy.failureBody, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete on the web', onPress: () => { Linking.openURL(ACCOUNT_DELETION_WEB_URL).catch(() => {}); } },
      { text: 'Try again', onPress: () => { run(); } },
    ]);
  };

  Alert.alert(copy.confirmTitle, copy.confirmBody, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete account',
      style: 'destructive',
      onPress: () => {
        Alert.alert(copy.lastChanceTitle, copy.lastChanceBody, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => { run(); } },
        ]);
      },
    },
  ]);
}
