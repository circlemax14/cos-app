/**
 * Patient-to-patient connections (SCRUM-686).
 *
 * Thin wrappers over /v1/patients/me/connections. Every route 404s
 * FEATURE_DISABLED unless social_connect_enabled is true in SSM for the stage,
 * so callers must treat 404 as "feature off", not "something broke".
 */

import { apiClient } from '@/lib/api-client'

const BASE = '/v1/patients/me/connections'

/** Ken's chips, 2026-08-01. Must stay in step with the backend enum. */
export const SOCIAL_CATEGORIES = [
  { id: 'proxy', label: 'Health proxy' },
  { id: 'friend', label: 'Friend' },
  { id: 'family', label: 'Family' },
  { id: 'peer-support', label: 'Peer support' },
  { id: 'health-coach', label: 'Health coach' },
  { id: 'nutrition-coach', label: 'Nutrition coach' },
  { id: 'physical-trainer', label: 'Physical trainer' },
  { id: 'helper', label: 'Helper' },
  { id: 'faith', label: 'Faith' },
  { id: 'leisure', label: 'Leisure' },
] as const

export const PSYCHOLOGICAL_CATEGORIES = [
  { id: 'therapist', label: 'Therapist' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'psychiatry', label: 'Psychiatry' },
  { id: 'peer', label: 'Peer' },
  { id: 'faith-based', label: 'Faith based' },
  { id: 'parole-officer', label: 'Parole officer' },
  { id: 'aa-sponsor', label: 'AA sponsor' },
  { id: 'mentor', label: 'Mentor' },
  { id: 'case-manager', label: 'Case manager' },
] as const

export type ConnectionStatus =
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'accepted'
  | 'blocked'

export interface Connection {
  userId: string
  peerId: string
  status: ConnectionStatus
  category: string
  /**
   * Whether I have added this accepted connection to my circle (SCRUM-692).
   * A per-user inner-circle, separate from the clinical care team. Absent on
   * rows written before this field existed → treat as "not in circle".
   */
  inCircle?: boolean
  requestedBy: string
  createdAt: string
  updatedAt: string
}

export interface DiscoverableProfile {
  userId: string
  displayName: string
}

/** True when the backend has this feature switched off for the stage. */
export function isFeatureOff(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === 404
}

export async function getDiscoverability(): Promise<boolean> {
  const res = await apiClient.get(`${BASE}/discoverability`)
  return res?.data?.data?.enabled === true
}

export async function setDiscoverability(enabled: boolean): Promise<boolean> {
  const res = await apiClient.put(`${BASE}/discoverability`, { enabled })
  return res?.data?.data?.enabled === true
}

/**
 * Exact email only. `null` means "nobody connectable" and covers no-such-user,
 * not-discoverable, not-a-patient and yourself — the backend deliberately does
 * not distinguish them, so neither does this.
 */
export async function searchByEmail(email: string): Promise<DiscoverableProfile | null> {
  const res = await apiClient.get(`${BASE}/search`, { params: { email } })
  return res?.data?.data?.result ?? null
}

export async function listConnections(): Promise<Connection[]> {
  const res = await apiClient.get(BASE)
  const list = res?.data?.data?.connections
  return Array.isArray(list) ? (list as Connection[]) : []
}

export async function requestConnection(peerId: string, category: string): Promise<void> {
  await apiClient.post(BASE, { peerId, category })
}

export async function acceptConnection(peerId: string): Promise<void> {
  await apiClient.post(`${BASE}/${encodeURIComponent(peerId)}/accept`)
}

/** Decline, revoke or disconnect — one operation on the backend. */
export async function removeConnection(peerId: string): Promise<void> {
  await apiClient.delete(`${BASE}/${encodeURIComponent(peerId)}`)
}

/**
 * Re-file an accepted connection under a different sub-category (SCRUM-691).
 * Per-user — only my own view of the peer changes.
 */
export async function updateCategory(peerId: string, category: string): Promise<void> {
  await apiClient.put(`${BASE}/${encodeURIComponent(peerId)}/category`, { category })
}

/** Add an accepted connection to my circle (SCRUM-692). */
export async function addToCircle(peerId: string): Promise<void> {
  await apiClient.post(`${BASE}/${encodeURIComponent(peerId)}/circle`)
}

/** Remove a connection from my circle (SCRUM-692). */
export async function removeFromCircle(peerId: string): Promise<void> {
  await apiClient.delete(`${BASE}/${encodeURIComponent(peerId)}/circle`)
}

export async function blockPeer(peerId: string): Promise<void> {
  await apiClient.post(`${BASE}/${encodeURIComponent(peerId)}/block`)
}
