import Ably from 'ably'
import { apiClient } from '@/lib/api-client'

let ablyClient: Ably.Realtime | null = null
let currentChannelId: string | null = null

async function fetchToken(type: 'ai' | 'care_manager' = 'ai'): Promise<{ token: string; channelId: string }> {
  const res = await apiClient.get(`/v1/patients/me/chat/token?type=${type}`)
  return res.data.data
}

export async function initializeAbly(type: 'ai' | 'care_manager' = 'ai'): Promise<{ client: Ably.Realtime; channelId: string }> {
  const { token, channelId } = await fetchToken(type)
  if (ablyClient) {
    ablyClient.close()
    ablyClient = null
  }
  ablyClient = new Ably.Realtime({ token })
  currentChannelId = channelId
  return { client: ablyClient, channelId }
}

export async function subscribeToChannel(
  channelId: string,
  onMessage: (msg: Ably.Message) => void
): Promise<() => void> {
  if (!ablyClient) throw new Error('Ably not initialized. Call initializeAbly first.')
  const channel = ablyClient.channels.get(channelId)
  await channel.subscribe(onMessage)
  return () => channel.unsubscribe(onMessage)
}

export async function publishMessage(channelId: string, name: string, data: unknown): Promise<void> {
  if (!ablyClient) throw new Error('Ably not initialized.')
  const channel = ablyClient.channels.get(channelId)
  await channel.publish(name, data)
}

export function closeAbly(): void {
  if (ablyClient) {
    ablyClient.close()
    ablyClient = null
    currentChannelId = null
  }
}

// ---------------------------------------------------------------------------
// Deprecated helpers — kept for inbox.tsx compatibility during migration.
// TODO: Remove once inbox.tsx is updated to the new token-based API.
// ---------------------------------------------------------------------------

/** @deprecated Use the unsubscribe function returned by subscribeToChannel instead. */
export function unsubscribeFromChannel(channelId: string): void {
  if (!ablyClient) return
  const channel = ablyClient.channels.get(channelId)
  channel.unsubscribe()
}

/** @deprecated Presence is not supported with token-scoped channels. */
export async function enterPresence(_channelId: string, _data?: Record<string, unknown>): Promise<void> {
  // no-op: presence requires a clientId, which is not set on token-auth clients
}

/** @deprecated Presence is not supported with token-scoped channels. */
export async function leavePresence(_channelId: string): Promise<void> {
  // no-op
}
