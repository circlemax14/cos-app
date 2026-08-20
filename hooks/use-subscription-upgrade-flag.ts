/**
 * COS-740 — is the in-app upgrade action live?
 *
 * ─── WHY THIS IS FLAGGED RATHER THAN JUST SHIPPED ────────────────────
 *
 * There is no payment integration. cos-backend has Stripe SCHEMA FIELDS
 * (`stripeSubscriptionId`, `stripeProductId`) and nothing else — no SDK, no
 * API keys, no checkout endpoint, no webhook handler.
 *
 * An Upgrade button with no working checkout is precisely what got the
 * Services menu entry pulled before shipping (SCRUM-319): App Store Guideline
 * 2.1 treats a premium surface that cannot actually transact as placeholder
 * content. A button that silently did nothing would also teach patients the
 * app is broken, and one that self-assigned a paid plan would let anyone grant
 * themselves `advanced` for free.
 *
 * So the code ships complete and dark. When Stripe is wired the flag flips and
 * the button appears with no new release — which is the house pattern for
 * exactly this reason.
 *
 * ─── ONE THING TO SETTLE BEFORE FLIPPING IT ──────────────────────────
 *
 * Apple Guideline 3.1.1 requires In-App Purchase for digital content consumed
 * in the app. A Stripe checkout inside the binary is the case Apple rejects
 * most often. Flagged when Stripe was chosen; noted here because this flag is
 * the switch that makes it real, not hypothetical.
 *
 * Default FALSE on every stage. SSM key:
 *   /cos/{stage}/backend/subscription_upgrade_enabled  (+ _beta override)
 */

import { useFeatureFlags } from './use-feature-flags'

const SUBSCRIPTION_UPGRADE_FLAG = 'subscription_upgrade_enabled'

export function useSubscriptionUpgradeFlag(): boolean {
  // `=== true` and not a truthy check: a missing flag, a failed fetch and an
  // unparsed value must all read as OFF. The whole point is that this cannot
  // switch itself on by accident.
  const { data } = useFeatureFlags()
  return data?.[SUBSCRIPTION_UPGRADE_FLAG] === true
}
