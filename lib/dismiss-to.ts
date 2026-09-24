/**
 * COS-1102 — dismissing a screen must never be a no-op.
 *
 * Every root-level modal in this app closes with a bare `router.back()`, and
 * none of them checked whether there was anything to go back TO. On a stack
 * where the modal is the only entry — see lib/root-modal-routes.ts for the
 * chain that produces one — back() silently does nothing and the patient is
 * trapped on a full-screen sheet with a close button that does not close.
 *
 * `canGoBack()` is the whole fix. The fallback is a `replace`, not a `push`,
 * because pushing /Home under a modal that is already the root would leave the
 * modal on the stack and the patient still looking at it.
 */

import { router } from 'expo-router';

export function dismissTo(fallback = '/Home'): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback as never);
}
