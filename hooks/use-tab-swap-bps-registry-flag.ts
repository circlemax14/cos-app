import { useFeatureFlags } from './use-feature-flags';

/**
 * SCRUM-651 — backend-driven registry gate for the ADR-0005 tab-swap
 * that temp-retires the classic Plan tab and mounts the BPS view in
 * its slot. Strict `=== true` default-OFF while flags load, so the
 * legacy Plan render stays live until we positively know the backend
 * has flipped the flag on.
 *
 * FLAG_KEY matches the backend registry symbol `TAB_SWAP_BPS_ENABLED`.
 *
 * Temp file name (`_registry`) so it doesn't collide with the existing
 * `use-tab-swap-bps-flag.ts` during the transitional migration.
 */
const TAB_SWAP_BPS_FLAG = 'TAB_SWAP_BPS_ENABLED';

export function useTabSwapBpsRegistryFlag(): boolean {
  const { data } = useFeatureFlags();
  return data?.[TAB_SWAP_BPS_FLAG] === true;
}
