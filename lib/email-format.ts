/**
 * COS-1231 — one email-format check for the whole app.
 *
 * It existed already, inline in app/Home/proxy-management.tsx:64, and the
 * invite sheet needed the same thing. Two copies of a validator drift in one
 * direction only: one of them gets a fix and the other keeps rejecting an
 * address a patient can actually read their mail at.
 *
 * Deliberately the same loose shape the server will accept, not a stricter
 * one. zod's `.email()` on POST /v1/patients/me/social/invites is the
 * authority; a client check that is tighter than the server turns a valid
 * address into "that doesn't look like an email" with no way past it, which on
 * a 60+ audience is a support call, not a saved round trip. This exists only
 * so an obvious typo is caught before we mail a stranger.
 */

/** RFC 5321's maximum address length, and the server's `.max(254)`. */
export const MAX_EMAIL_LENGTH = 254;

export function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Trim + lowercase, matching the server's normaliseEmail. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
