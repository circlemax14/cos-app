/**
 * COS-1268 — Block & Report: the decisions, kept apart from the screens.
 *
 * NO RUNTIME IMPORTS, deliberately: exercised by `node --test`, which resolves
 * neither the '@/' alias nor an extensionless relative TS import. The one
 * import below is type-only and is erased before anything runs. Same
 * constraint as lib/crisis-support.ts.
 */
import type { ReportReason } from '@/services/api/conversations'

/**
 * THE GATE. `=== true`, never a default of true.
 *
 * hooks/use-feature-flags.ts' useIsFeatureFlagEnabled returns TRUE while the
 * flags are loading and when a key is missing. For Block & Report that would
 * show Block on every conversation during the first second of every open, and
 * on any backend that predates cos-backend #536 — where both POSTs 404.
 */
export function isSocialSafetyOn(flags: Readonly<Record<string, boolean>> | undefined): boolean {
  return flags?.social_safety_enabled === true
}

/** In the order a reporter reads them. Keys match REPORT_REASONS on the server. */
export const REPORT_REASONS: readonly { key: ReportReason; label: string }[] = [
  { key: 'harassment', label: 'Harassment' },
  { key: 'spam', label: 'Spam' },
  { key: 'sexual_content', label: 'Sexual content' },
  { key: 'hate_or_threats', label: 'Hate or threats' },
  { key: 'self_harm', label: 'Someone may hurt themselves' },
  { key: 'other', label: 'Other' },
]

/** MAX_REPORT_COMMENT_LENGTH on the server. */
export const MAX_REPORT_COMMENT = 1000

/**
 * What `alsoBlock` to send. The server reads a missing value as false, so the
 * app always sends its own: the box (ticked by default) — except when someone
 * may hurt themselves, where the box is hidden and this is forced false so a
 * tick left over from another reason cannot ride along. Cutting off a person
 * who may be in danger is not what that reporter is asking for.
 */
export function alsoBlockToSend(reason: ReportReason, ticked: boolean): boolean {
  return reason === 'self_harm' ? false : ticked
}

/** Shown with the crisis card when the reason is self_harm — written for someone worried about another person. */
export const WORRIED_ABOUT_SOMEONE_INTRO =
  'If they may be in immediate danger, call 911. 988 also helps people worried about someone else.'

/**
 * The one other member of a conversation, or null when there is not exactly
 * one (my id not loaded yet, or a group). Null hides the person-level actions:
 * the server refuses a person-report without exactly one other member.
 */
export function otherMemberId(
  members: readonly { userId: string }[] | undefined,
  me: string | null,
): string | null {
  if (!me || !members) return null
  const others = members.filter((m) => m.userId !== me)
  return others.length === 1 ? others[0].userId : null
}

/** A blocked row made from an anonymous request never had a name you saw. */
export function blockedPersonName(c: { displayName?: string; anonymous?: boolean }): string {
  return !c.anonymous && c.displayName ? c.displayName : 'Someone you blocked'
}

/** The confirmation line after a report. `reviewWindowText` is server copy, e.g. "within 24 hours". */
export function reportConfirmation(reviewWindowText: string): string {
  return `We'll review this ${reviewWindowText}. We don't monitor conversations. In an emergency, call 911.`
}

/**
 * Friendly text for a failed block, unblock, remove or report.
 *
 * Reads the api-client's two error shapes: an AxiosError carrying the server's
 * `{ code, details }`, and the interceptor's own `code: 'NETWORK_ERROR'`.
 */
export function safetyErrorText(err: unknown): string {
  const e = err as {
    code?: string
    response?: { status?: number; data?: { code?: string; details?: { limit?: number } } }
  } | null
  const status = e?.response?.status
  const code = e?.response?.data?.code ?? e?.code

  if (code === 'NETWORK_ERROR') return 'No connection. Check your internet and try again.'
  if (code === 'REPORT_RATE_LIMITED' || status === 429) {
    const limit = e?.response?.data?.details?.limit
    return `${limit ? `You can send ${limit} reports a day.` : "You've reached today's report limit."} Please try again tomorrow. In an emergency, call 911.`
  }
  if (code === 'NOT_A_MEMBER' || status === 403) return "You're no longer part of this conversation."
  if (code === 'FEATURE_DISABLED') return "This isn't available right now. Please try again later."
  if (code === 'REPORT_TARGET_NOT_FOUND') return "We couldn't find what you're reporting. It may have been removed."
  if (code === 'CANNOT_REPORT_SELF') return "You can't report your own message."
  if (code === 'NO_PENDING_REQUEST') return "You're no longer connected to this person."
  if (code === 'NOT_BLOCKED') return "They're already unblocked."
  if (code === 'VALIDATION_ERROR') {
    return `Choose a reason, and keep any comment under ${MAX_REPORT_COMMENT} characters.`
  }
  return 'Something went wrong. Please try again.'
}
