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
  /**
   * COS-793 — optional, and optional on purpose. The server may start naming
   * the methods itself (an operator renaming "Card" is a dashboard change, not
   * a release); until it does, services/payments-provider.ts supplies the
   * label. Reading it as optional means neither side has to ship first.
   */
  label?: string;
}

/** What this binary reports itself as. `web` covers Expo web builds. */
export function currentPlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/**
 * COS-794 — the device's ISO country, for the iOS Stripe link-out.
 *
 * Apple permits an external purchase link in the UNITED STATES storefront
 * only, so the server needs to know where we are. Returning undefined means
 * no link-out — the server fails closed on an absent region.
 *
 * PURE JS ON PURPOSE. `expo-localization` is the obvious library and it is
 * neither installed nor in the shipped binary, so importing it would break the
 * OTA bundle and crash every device on load — the expo-clipboard failure this
 * app has already had once. Intl ships with Hermes; NativeModules is core RN.
 * Both are already there.
 *
 * A locale is a proxy for the storefront, not the storefront itself. When
 * StoreKit lands, send Storefront.countryCode instead — that is the value
 * Apple's rule actually keys on.
 */
export function currentRegion(): string | undefined {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale?.split(/[-_]/)[1];
    if (region && region.length === 2) return region.toUpperCase();
  } catch {
    // Intl missing or throwing — fall through rather than failing the call.
  }
  try {
    const nm = (
      require('react-native') as { NativeModules?: Record<string, unknown> }
    ).NativeModules;
    const raw =
      Platform.OS === 'ios'
        ? (nm?.SettingsManager as { settings?: { AppleLocale?: string } } | undefined)?.settings
            ?.AppleLocale
        : (nm?.I18nManager as { localeIdentifier?: string } | undefined)?.localeIdentifier;
    const region = raw?.split(/[-_]/)[1];
    if (region && region.length === 2) return region.toUpperCase();
  } catch {
    // Nothing to read. Undefined = no link-out, which is the safe direction.
  }
  return undefined;
}

export async function fetchAvailableGateways(): Promise<AvailableGateway[]> {
  const res = await apiClient.get('/v1/payments/gateways', {
    params: { platform: currentPlatform(), region: currentRegion() },
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
    region: currentRegion(),
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

/* ── COS-792: managing an existing subscription ──────────────────────── */

export interface PaymentHistoryItem {
  paymentId: string;
  planName: string;
  cycle: 'monthly' | 'annual';
  status: 'succeeded' | 'refunded' | 'failed' | 'pending';
  amountCents: number | null;
  currency: string | null;
  createdAt: string;
  periodEnd: string | null;
}

export async function fetchPaymentHistory(): Promise<PaymentHistoryItem[]> {
  const res = await apiClient.get('/v1/payments/history');
  const body = (res.data as { data?: { payments?: unknown } })?.data;
  return Array.isArray(body?.payments) ? (body.payments as PaymentHistoryItem[]) : [];
}

export interface CancellationOutcome {
  /** True when the provider has it scheduled. False = finish in the store. */
  scheduled: boolean;
  effectiveAt: string | null;
  /** Apple / Google only — where the patient has to go to finish. */
  manageUrl?: string;
  message: string;
}

export async function cancelSubscription(reason?: string): Promise<CancellationOutcome> {
  const res = await apiClient.post('/v1/payments/cancel', reason ? { reason } : {});
  return (res.data as { data: CancellationOutcome }).data;
}

export async function resumeSubscription(): Promise<void> {
  await apiClient.post('/v1/payments/resume', {});
}

/** `$39.99`, or an em dash when the provider never told us the amount. */
export function formatPaymentAmount(cents: number | null, currency: string | null): string {
  if (cents === null || cents === undefined) return '—';
  const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
