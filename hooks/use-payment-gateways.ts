/**
 * COS-791 — which payment gateways this device may use right now.
 *
 * Answers from the server, never from a constant here. Two reasons:
 *
 *   The switch has to be flippable without a release. If the app decided, then
 *   turning Stripe off would need an OTA at best and a binary at worst, which
 *   is not a switch.
 *
 *   Which gateway is LEGAL on which platform is a compliance decision, and
 *   compliance decisions that live in client code drift. The server declares
 *   it structurally (stripe = web, apple-iap = ios, google-play = android) and
 *   refuses the rest, so a mistake here can only under-offer, never
 *   mis-charge.
 *
 * Empty list = no way to pay on this device today. That is the DEFAULT while
 * loading and on error: showing a Subscribe button that cannot complete is
 * worse than showing none, and on iOS it is the thing that gets an app
 * rejected.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAvailableGateways, type AvailableGateway } from '@/services/api/payments';

export function usePaymentGateways(): {
  gateways: AvailableGateway[];
  isLoading: boolean;
  canPay: boolean;
} {
  const q = useQuery({
    queryKey: ['payment-gateways'],
    queryFn: fetchAvailableGateways,
    staleTime: 5 * 60 * 1000,
  });
  const gateways = q.data ?? [];
  return { gateways, isLoading: q.isLoading, canPay: gateways.length > 0 };
}
