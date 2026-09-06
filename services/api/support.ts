import * as FileSystem from 'expo-file-system/legacy';
import { apiClient } from '@/lib/api-client';
import { checkAttachment } from '@/lib/support-attachments';

/** Server-side routing target. Uppercase — matches the backend enum exactly. */
export type SupportRoutedTo = 'CSH' | 'AGENCY';

/** What the ticket stores about one uploaded file. Bytes live in S3. */
export interface SupportAttachment {
  name: string;
  contentType: string;
  size: number;
  /** S3 object key, when the presign endpoint returns one. */
  key?: string;
  /** Absolute object URL, when the presign endpoint returns one instead. */
  url?: string;
}

/** A file chosen in the picker but not yet uploaded. */
export interface PickedFile {
  uri: string;
  name: string;
  contentType: string;
  size: number;
}

export interface SupportTicketRequest {
  subject: string;
  description: string;
  routedTo?: SupportRoutedTo;
  attachments?: SupportAttachment[];
  deviceInfo: {
    platform: string;
    osVersion: string;
    appVersion: string;
    deviceModel: string;
  };
}

export interface SupportTicket {
  ticketId: string;
  /** Human-readable id (CSH-XXXX-XXXX). Absent on pre-COS-872 rows. */
  reference?: string;
  subject: string;
  description: string;
  /*
   * Deliberately a plain string, not a union. The dashboard writes
   * open | in_progress | on_hold | rejected | resolved | closed and can add
   * more; a union here would only produce a type error on the day the server
   * adds a value, while the screen would render it either way. Wording is
   * ALWAYS produced by ticketStatusLabel() — never render this field raw.
   */
  status: string;
  routedTo?: SupportRoutedTo;
  attachments?: SupportAttachment[];
  /**
   * The reply thread. Only GET /:id and the reply route carry it — the LIST
   * route spreads the same row, so it is present there too, but a list row is
   * not a promise of one: a ticket nobody has replied to has no `messages`
   * attribute at all. Always read it as `?? []`.
   */
  messages?: SupportTicketMessage[];
  createdAt: string;
  updatedAt: string;
}

/** What POST /tickets returns — a receipt, not a full ticket. */
export interface CreatedSupportTicket {
  ticketId: string;
  reference?: string;
  status: string;
  routedTo?: SupportRoutedTo;
  createdAt: string;
}

/*
 * COS-872 — UNWRAP TWICE.
 *
 * The API wraps every payload as `{ success, data }` (utils/response.ts
 * sendSuccess). axios then wraps THAT as `response.data`. So the payload is
 * `response.data.data`, which is what every other service in this app reads —
 * see hooks/use-health-summary.ts.
 *
 * This file unwrapped once. Two visible consequences, both reported by Vishal:
 *
 *   create → returned `{ success, data: { ticketId } }`, so `result.ticketId`
 *            was undefined and the confirmation read
 *            "Your ticket ID is undefined."
 *   list   → returned an OBJECT `{ success, data: { tickets: [...] } }` where
 *            the screen expects an array, so "Your requests" was always empty
 *            even though the tickets existed.
 */
export async function createSupportTicket(
  data: SupportTicketRequest,
): Promise<CreatedSupportTicket> {
  const response = await apiClient.post<{ success: boolean; data: CreatedSupportTicket }>(
    '/v1/support/tickets',
    data,
  );
  return response.data.data;
}

/**
 * The list route spreads the stored row, whose primary key is `id`; only the
 * create route mirrors it as `ticketId`. Reading `ticket.ticketId` off a list
 * row was the second half of the "undefined id" report, so normalise here —
 * one place, every caller — rather than at each render site.
 */
type RawTicket = Omit<SupportTicket, 'ticketId'> & { id?: string; ticketId?: string };

function normalizeTicket(raw: RawTicket): SupportTicket {
  const { id, ...rest } = raw;
  return { ...rest, ticketId: raw.ticketId ?? id ?? '' };
}

export async function getSupportTickets(): Promise<SupportTicket[]> {
  const response = await apiClient.get<{ success: boolean; data: { tickets: RawTicket[] } }>(
    '/v1/support/tickets',
  );
  // The route sends `{ tickets: items }`; the screen wants the array itself.
  return (response.data.data.tickets ?? []).map(normalizeTicket);
}

/**
 * Turn a raw picker result into an attachment the screen can stage, or an
 * error message it can show. Size is re-read from disk when the picker did not
 * report one (some Android providers don't) so the 10 MB budget is never
 * counted against a guess.
 */
export async function prepareAttachment(input: {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}, attachedBytes: number): Promise<{ ok: true; file: PickedFile } | { ok: false; message: string }> {
  let size = input.size ?? 0;
  if (!size) {
    try {
      const info = await FileSystem.getInfoAsync(input.uri);
      size = info.exists ? info.size : 0;
    } catch {
      size = 0;
    }
  }

  const check = checkAttachment({ name: input.name, size, mimeType: input.mimeType }, attachedBytes);
  if (!check.ok) return check;

  return { ok: true, file: { uri: input.uri, name: input.name, size, contentType: check.contentType } };
}

/**
 * Upload one staged file and return the descriptor the ticket stores.
 *
 * Presign → binary PUT → descriptor, the same shape as the profile-photo
 * upload in app/Home/personal-info.tsx. FileSystem.uploadAsync streams the
 * file from disk: do NOT swap in fetch(uri).blob(), which yields 0 bytes for
 * file:// URIs in React Native and silently uploads an empty object.
 *
 * ⚠️ Requires POST /v1/uploads/support-attachment/presign, which does not
 * exist yet — every /v1/uploads/*\/presign route today hard-codes an image
 * contentType enum, so none of them will sign a PDF. Until it lands this call
 * 404s and the screen tells the patient the upload failed. The ticket body
 * itself (description + routing) works without it.
 */
export async function uploadSupportAttachment(file: PickedFile): Promise<SupportAttachment> {
  const response = await apiClient.post<{
    success: boolean;
    data: { uploadUrl: string; key?: string; url?: string; fileUrl?: string; attachmentUrl?: string };
  }>('/v1/uploads/support-attachment/presign', {
    fileName: file.name,
    contentType: file.contentType,
    size: file.size,
  });

  const signed = response.data.data;
  // The uploads family names the readback field per resource (photoUrl,
  // logoUrl, ...), so accept the plausible spellings rather than breaking on
  // the one that ships.
  const url = signed.url ?? signed.fileUrl ?? signed.attachmentUrl;
  if (!signed.uploadUrl || (!signed.key && !url)) {
    throw new Error('presign response is missing an upload target');
  }

  const result = await FileSystem.uploadAsync(signed.uploadUrl, file.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': file.contentType },
  });
  if (result.status >= 400) {
    throw new Error(`attachment upload failed: HTTP ${result.status}`);
  }

  return { name: file.name, contentType: file.contentType, size: file.size, key: signed.key, url };
}

/* ─────────────────────────── one ticket, with its thread ───────────────────
 *
 * COS-882 — Vishal: "i can see my request in app but i am not able to click on
 * it to see replies or functionality to send new messages."
 *
 * Both routes below already exist on the backend
 * (cos-backend/src/routes/support-tickets.routes.ts) and both send the WHOLE
 * ticket through forWire(), so a reply needs no follow-up GET.
 */

/** One entry in the ticket thread. `staff` covers CSH and agency alike — the
 *  backend writes only 'patient' | 'staff' (ticket.service.ts TicketMessage). */
export interface SupportTicketMessage {
  id: string;
  authorKind: 'patient' | 'staff';
  /** Present only when the dashboard supplied a name. */
  authorLabel?: string;
  text: string;
  createdAt: string;
}

/**
 * GET /v1/support/tickets/:id — 404s unless the ticket is the caller's own
 * (the route compares `createdBy` to the token sub), so no client-side
 * ownership check is needed or wanted here.
 *
 * Same double unwrap as everything above, and the same normalise: this route
 * spreads the stored row, whose key is `id`, not `ticketId`.
 */
export async function getSupportTicket(ticketId: string): Promise<SupportTicket> {
  const response = await apiClient.get<{ success: boolean; data: RawTicket }>(
    `/v1/support/tickets/${encodeURIComponent(ticketId)}`,
  );
  return normalizeTicket(response.data.data);
}

/**
 * POST /v1/support/tickets/:id/messages — appends a patient reply and returns
 * the ticket with the new message already in `messages`, so the caller can
 * seed the cache instead of refetching.
 *
 * The server caps `text` at 4000 characters and rejects an empty string; the
 * screen enforces the same two rules so a patient learns about it before the
 * round trip rather than after.
 *
 * NOTE: appendTicketMessage applies NO status guard — a reply on a resolved,
 * rejected or closed ticket is stored exactly like any other. The screen says
 * so out loud rather than pretending otherwise; see support-ticket-detail.tsx.
 */
export async function replyToSupportTicket(
  ticketId: string,
  text: string,
): Promise<SupportTicket> {
  const response = await apiClient.post<{ success: boolean; data: RawTicket }>(
    `/v1/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    { text },
  );
  return normalizeTicket(response.data.data);
}
