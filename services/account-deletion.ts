/**
 * The ONE in-app account-deletion flow (Apple 5.1.1(v), Google Play account
 * deletion). Used by Profile and by onboarding's fasten-connect screen, so the
 * two entry points cannot drift. Pure logic + copy: lib/account-deletion.ts.
 */
import { Alert, Linking, Platform } from 'react-native';
import { router } from 'expo-router';

import { apiClient } from '@/lib/api-client';
import { ACCOUNT_DELETION_WEB_URL, deletionCopy, isDeletionConfirmed } from '@/lib/account-deletion';
import { queryClient } from '@/providers/QueryProvider';
import { signOut } from '@/services/auth';

/**
 * Two-step confirm, then DELETE /v1/auth/account. Success is announced only
 * when the server confirms it; otherwise the patient stays signed in and is
 * offered Retry or the web deletion page.
 *
 * `setBusy(true)` fires when the network call starts; `setBusy(false)` only on
 * failure (on success the screen is replaced, and staying latched prevents a
 * double-fire during the navigation frame).
 */
export function confirmAndDeleteAccount(setBusy: (busy: boolean) => void): void {
  const copy = deletionCopy(Platform.OS);

  const run = async () => {
    setBusy(true);
    let confirmed = false;
    try {
      const res = await apiClient.delete('/v1/auth/account');
      confirmed = isDeletionConfirmed(res?.data);
    } catch {
      confirmed = false;
    }

    if (confirmed) {
      try {
        await signOut();
      } catch {
        // Best-effort; the account is already disabled server-side.
      }
      queryClient.clear();
      router.replace('/(auth)/sign-in' as never);
      setTimeout(() => Alert.alert(copy.successTitle, copy.successBody), 400);
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
