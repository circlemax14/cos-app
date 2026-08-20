/**
 * COS-734 — plan-type card copy, fetched from the backend.
 *
 * The cards on the care-intensity chooser used to be a hardcoded array, so
 * nothing an admin edited could ever reach a patient. This fetches them instead.
 *
 * ─── THE FALLBACK IS THE POINT ───────────────────────────────────────
 *
 * This screen is how a patient chooses their assessment intensity, and that
 * choice drives real clinical behaviour — screener depth and assessment expiry.
 * A network blip must not leave them staring at an empty screen, so there are
 * three layers before that can happen:
 *
 *   1. the endpoint merges stored copy over server-side defaults
 *   2. the endpoint falls back to those defaults if DynamoDB is unreachable
 *   3. THIS module falls back to the caller's embedded copy if the request
 *      fails entirely
 *
 * Layer 3 is why `fetchPlanTypeCards` takes the embedded array as an argument
 * rather than importing it: the screen owns its own last-resort copy, and this
 * module stays a thin transport that cannot itself go stale.
 *
 * ─── WHAT THE SERVER IS NOT ALLOWED TO CHANGE ────────────────────────
 *
 * `type` and `assessmentLevel` are clinical. The backend already refuses to let
 * a stored row alter them, and this module re-checks on the way in: a response
 * naming an unknown type is dropped rather than rendered. Two independent
 * checks because the consequence is a patient silently moved onto different
 * screener logic, which nothing would surface as an error.
 */

import { apiClient } from '@/lib/api-client';
import { selectCards, type PlanTypeCardCopy } from '@/lib/plan-type-card-select';

export type { PlanTypeCardCopy, AssessmentLevel } from '@/lib/plan-type-card-select';

/**
 * Fetch the card copy, falling back to `embedded` on any problem.
 *
 * Never throws and never returns an empty array — the caller always has
 * something to render. A thin adapter over selectCards, which holds the logic.
 */
export async function fetchPlanTypeCards<T extends { type: string }>(
  embedded: readonly T[],
): Promise<PlanTypeCardCopy[] | readonly T[]> {
  try {
    const res = await apiClient.get('/v1/patients/me/plan-type/cards');
    return selectCards((res.data as { data?: { cards?: unknown } })?.data?.cards, embedded);
  } catch {
    return embedded;
  }
}
