/**
 * COS-791 — talking to /v1/payments.
 *
 * The server decides which gateways this platform may use and re-checks on
 * every call, so nothing here is an authorisation — it is only what to render.
 */

import { Platform } from 'react-native';
import { apiClient } from '@/lib/api-client';

export type PaymentGatewayId = 'stripe' | 'apple-iap' | 'google-play';

export interface AvailableGateway {
  id: PaymentGatewayId;
  /** redirect = open a URL out of process. native = hand to the store SDK. */
  kind: 'redirect' | 'native';
}

/** What this binary reports itself as. `web` covers Expo web builds. */
export function currentPlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export async function fetchAvailableGateways(): Promise<AvailableGateway[]> {
  const res = await apiClient.get('/v1/payments/gateways', {
    params: { platform: currentPlatform() },
  });
  const body = (res.data as { data?: { gateways?: unknown } })?.data;
  return Array.isArray(body?.gateways) ? (body.gateways as AvailableGateway[]) : [];
}

export type StartPurchaseResult =
  | { kind: 'redirect'; url: string; reference: string }
  | { kind: 'native'; productId: string; reference: string };

export async function startPurchase(input: {
  gateway: PaymentGatewayId;
  planKey: string;
  cycle: 'monthly' | 'annual';
}): Promise<StartPurchaseResult> {
  const res = await apiClient.post('/v1/payments/start', {
    ...input,
    platform: currentPlatform(),
  });
  return (res.data as { data: StartPurchaseResult }).data;
}

/**
 * Post a store receipt for verification.
 *
 * Called after a store purchase completes AND on cold start, because a
 * purchase can finish while the app is backgrounded and the receipt is the
 * only record of it. The server is idempotent on the provider's transaction
 * id, which is what makes re-posting safe.
 */
export async function verifyStorePurchase(
  proof:
    | { gateway: 'apple-iap'; transactionId: string; signedPayload: string }
    | { gateway: 'google-play'; purchaseToken: string; productId: string },
): Promise<{ applied: boolean; planKey: string }> {
  const res = await apiClient.post('/v1/payments/verify', proof);
  return (res.data as { data: { applied: boolean; planKey: string } }).data;
}
