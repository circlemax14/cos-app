/**
 * Keeps clinic photos loadable on a screen that outlives their signature.
 *
 * A provider's `photoUrl` is presigned for about six hours, but Home is the
 * root tab and stays mounted for days. Without this, every avatar on it turns
 * into a dead URL six hours after launch until the patient pulls to refresh —
 * the same expiring-URL, immortal-cache defect stores/user-photo-store.tsx was
 * rewritten to fix.
 *
 * When the app returns to the foreground holding a list that is old enough
 * (see needsPhotoRefetch), the list is fetched again and handed to `apply`,
 * which merges the fresh photos into whatever the screen holds. The list's
 * age is when its identity last changed, i.e. when the screen last set it.
 *
 * ponytail: foreground only. An app left awake on Home for 6h+ refreshes on
 * its next background → foreground; add a timer if that ever shows up.
 */

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { needsPhotoRefetch } from '@/lib/provider-photo-url';
import { fetchProviders } from '@/services/api/providers';
import type { Provider } from '@/services/api/types';

export function useRefreshExpiringPhotos(
  providers: readonly { photoUrl?: string }[],
  apply: (fresh: Provider[]) => void,
): void {
  const fetchedAt = useRef(Date.now());
  const latest = useRef({ providers, apply });

  useEffect(() => {
    fetchedAt.current = Date.now();
  }, [providers]);
  useEffect(() => {
    latest.current = { providers, apply };
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      const { providers: held, apply } = latest.current;
      if (state !== 'active' || !needsPhotoRefetch(held, fetchedAt.current, Date.now())) return;
      void fetchProviders().then((fresh) => {
        // fetchProviders answers [] on failure. Keep the photos we hold (and the
        // old age, so the next foreground retries) rather than blank them.
        if (fresh.length) apply(fresh);
      });
    });
    return () => sub.remove();
  }, []);
}
