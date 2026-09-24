/**
 * COS-1102 — the root-level screens that are presented AS modals.
 *
 * ─── WHY THIS LIST EXISTS ────────────────────────────────────────────
 *
 * These five are siblings of /Home rather than children of it, and each is
 * declared with `presentation: 'modal'` (or 'fullScreenModal'). A modal is
 * drawn OVER something. When one of them is the only entry on the stack there
 * is nothing underneath, so it fills the screen and `router.back()` — which is
 * how every one of them dismisses — has nowhere to go.
 *
 * That is not hypothetical. Reported 2026-09-24: the app reopened straight
 * into the Supports modal, full screen, with no way out. The chain:
 *
 *   1. patient is on /modal when the app backgrounds
 *   2. use-app-lock saves '/modal' as the pre-lock route and locks
 *   3. the app is killed
 *   4. on relaunch and unlock, resumeAfterUnlock does router.replace('/modal')
 *   5. replace on a fresh stack makes it the ONLY entry
 *   6. the X button calls router.back(), which is a no-op — trapped
 *
 * Steps 4-6 are fixed in two independent places, deliberately: restoreTarget()
 * stops creating the situation, and dismissTo() survives it if anything else
 * ever does. One guard would have been enough for this bug and not for the
 * next one.
 */

export const ROOT_MODAL_ROUTES = [
  '/modal',
  '/appointments-modal',
  '/calendar-event-detail',
  '/calendar-event-editor',
  '/jenny-schedule',
] as const;

/** Is this path one of the root-level modals? Prefix match, so params are fine. */
export function isRootModalRoute(path: string | null | undefined): boolean {
  if (!path) return false;
  return ROOT_MODAL_ROUTES.some((r) => path === r || path.startsWith(`${r}?`) || path.startsWith(`${r}/`));
}

/**
 * Where a restored route should actually be re-entered.
 *
 * A modal needs a base underneath it. Returning both tells the caller to put
 * /Home down first and then push the modal on top — which preserves the
 * feature's intent (land back where you were) without producing a modal that
 * covers everything and cannot be closed.
 */
export function restoreTarget(saved: string): { base: string; push?: string } {
  if (isRootModalRoute(saved)) return { base: '/Home', push: saved };
  return { base: saved };
}
