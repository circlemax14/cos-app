/**
 * COS-872 — pure rules for support-ticket attachments and status wording.
 *
 * Lives in lib/ (no `@/` aliases, no native imports) so `node --test` can run
 * it directly — see tests/unit/support-attachments.test.ts. The picker, the
 * network call and the screen all sit on top of these functions; the limits
 * are decided here once so the UI and the upload path cannot disagree.
 */

/** Vishal: "they can send up to ten MB of files together" — TOTAL, not each. */
export const MAX_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024

/** The backend rejects an array longer than this (support-tickets.routes.ts). */
export const MAX_ATTACHMENT_COUNT = 10

/** The only three the backend accepts. Anything else is refused at pick time. */
export const ALLOWED_ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

/** Android content providers hand back this non-canonical spelling. */
const TYPE_ALIASES: Record<string, string> = { 'image/jpg': 'image/jpeg' }

/**
 * Canonical content type for a picked file, or null when it isn't one of the
 * three allowed formats.
 *
 * The MIME type from the picker wins when it is usable; some Android
 * providers return nothing or `application/octet-stream`, so the file
 * extension is the fallback rather than the primary check (a `.pdf` renamed
 * to `.png` still uploads as whatever the OS reports).
 */
export function resolveAttachmentType(name: string, mimeType?: string | null): string | null {
  const reported = (mimeType ?? '').toLowerCase().trim()
  const canonical = TYPE_ALIASES[reported] ?? reported
  if ((ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(canonical)) return canonical

  const ext = name.toLowerCase().split('.').pop() ?? ''
  return EXTENSION_TYPES[ext] ?? null
}

/** "3.4 MB" / "812 KB" — for the running total and the error copy. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.max(0, Math.round(bytes))} B`
}

export interface AttachmentCandidate {
  name: string
  size: number
  mimeType?: string | null
}

export type AttachmentCheck =
  | { ok: true; contentType: string }
  | { ok: false; message: string }

/**
 * Gate one freshly-picked file against the format list and the 10 MB budget.
 * `attachedBytes` is the total already staged, so the cap is enforced across
 * all files rather than per file.
 */
export function checkAttachment(
  candidate: AttachmentCandidate,
  attachedBytes: number,
): AttachmentCheck {
  const contentType = resolveAttachmentType(candidate.name, candidate.mimeType)
  if (!contentType) {
    return {
      ok: false,
      message: `"${candidate.name}" is not a PDF, PNG or JPG. Those are the only formats we can accept.`,
    }
  }
  if (!Number.isFinite(candidate.size) || candidate.size <= 0) {
    return {
      ok: false,
      message: `We could not read "${candidate.name}". Please try attaching it again.`,
    }
  }
  if (attachedBytes + candidate.size > MAX_ATTACHMENT_TOTAL_BYTES) {
    const remaining = Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - attachedBytes)
    return {
      ok: false,
      message: `"${candidate.name}" is ${formatBytes(candidate.size)} and only ${formatBytes(remaining)} of the 10 MB limit is left. Remove a file and try again.`,
    }
  }
  return { ok: true, contentType }
}

/**
 * Plain-language status for the patient. Never render the raw enum: the
 * dashboard writes snake_case values (`in_progress`, `on_hold`) and older
 * tickets carry the pre-COS-872 set (`open`, `resolved`, `closed`).
 * An unknown value is humanised rather than shown as-is, so a status added
 * later by the dashboard still reads as words.
 */
export function ticketStatusLabel(status?: string | null): string {
  const key = (status ?? '').toLowerCase().replace(/-/g, '_').trim()
  switch (key) {
    case '':
    case 'open':
    case 'new':
      return 'Open'
    case 'in_progress':
      return 'In progress'
    case 'on_hold':
    case 'hold':
      return 'On hold'
    case 'rejected':
    case 'declined':
      return 'Rejected'
    // The backend stores a finished ticket as 'resolved' and labels it
    // "Completed" (ticket.service.ts TICKET_STATUS_LABELS). Match that, so the
    // word on the patient's phone is the word on the dashboard.
    case 'completed':
    case 'resolved':
      return 'Completed'
    case 'closed':
      return 'Closed'
    default:
      return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  }
}

export type TicketStatusTone = 'waiting' | 'active' | 'done' | 'stopped'

/** Colour bucket for the status pill. Wording comes from ticketStatusLabel. */
export function ticketStatusTone(status?: string | null): TicketStatusTone {
  switch (ticketStatusLabel(status)) {
    case 'In progress':
      return 'active'
    case 'Completed':
    case 'Closed':
      return 'done'
    case 'Rejected':
      return 'stopped'
    default:
      return 'waiting'
  }
}
