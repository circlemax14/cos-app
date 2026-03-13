import Ably from 'ably';

/**
 * Ably Chat Service
 * 
 * Setup Instructions:
 * 1. Get your Ably API key from https://ably.com
 * 2. Create a .env file in the root directory (if it doesn't exist)
 * 3. Add: EXPO_PUBLIC_ABLY_API_KEY=your_ably_api_key_here
 * 4. Restart your Expo development server
 * 
 * For production, consider using token authentication instead of API keys
 * See: https://ably.com/docs/auth/token-authentication
 */

// Initialize Ably client
// Note: In production, you should use token authentication or get the API key from environment variables
// For now, using a placeholder - replace with your actual Ably API key
const ABLY_API_KEY = process.env.EXPO_PUBLIC_ABLY_API_KEY || 'YOUR_ABLY_API_KEY';

let ablyClient: Ably.Realtime | null = null;

/**
 * Initialize Ably client
 * Call this once when the app starts
 * Returns null if API key is not configured
 */
export function initializeAbly(apiKey?: string): Ably.Realtime | null {
  if (ablyClient) {
    return ablyClient;
  }

  const key = apiKey || ABLY_API_KEY;
  
  // Check if key is valid (not placeholder)
  if (!key || key === 'YOUR_ABLY_API_KEY' || key.trim() === '') {
    console.warn('Ably API key not configured. Please set EXPO_PUBLIC_ABLY_API_KEY in your .env file');
    console.warn('Chat functionality will be disabled until a valid API key is provided');
    return null;
  }

  try {
    ablyClient = new Ably.Realtime({
      key: key,
      clientId: `user-${Date.now()}`, // In production, use actual user ID
    });

    return ablyClient;
  } catch (error) {
    console.error('Failed to initialize Ably:', error);
    return null;
  }
}

/**
 * Get the Ably client instance
 */
export function getAblyClient(): Ably.Realtime | null {
  return ablyClient;
}

/**
 * Subscribe to a channel
 */
export function subscribeToChannel(
  channelName: string,
  callback: (message: Ably.Message) => void
): Ably.RealtimeChannel | null {
  if (!ablyClient) {
    console.error('Ably client not initialized. Call initializeAbly() first.');
    return null;
  }

  const channel = ablyClient.channels.get(channelName);
  channel.subscribe(callback);
  
  return channel;
}

/**
 * Unsubscribe from a channel
 */
export function unsubscribeFromChannel(channelName: string): void {
  if (!ablyClient) {
    return;
  }

  const channel = ablyClient.channels.get(channelName);
  channel.unsubscribe();
}

/**
 * Publish a message to a channel
 */
export async function publishMessage(
  channelName: string,
  message: Record<string, unknown>
): Promise<void> {
  if (!ablyClient) {
    console.error('Ably client not initialized. Call initializeAbly() first.');
    return;
  }

  const channel = ablyClient.channels.get(channelName);
  await channel.publish('message', message);
}

/**
 * Get channel presence
 */
export function getChannelPresence(channelName: string): Ably.RealtimePresence | null {
  if (!ablyClient) {
    return null;
  }

  const channel = ablyClient.channels.get(channelName);
  return channel.presence;
}

/**
 * Enter presence on a channel
 */
export async function enterPresence(channelName: string, data?: Record<string, unknown>): Promise<void> {
  if (!ablyClient) {
    return;
  }

  const channel = ablyClient.channels.get(channelName);
  await channel.presence.enter(data);
}

/**
 * Leave presence on a channel
 */
export async function leavePresence(channelName: string): Promise<void> {
  if (!ablyClient) {
    return;
  }

  const channel = ablyClient.channels.get(channelName);
  await channel.presence.leave();
}

/**
 * Cleanup - disconnect Ably client
 */
export function disconnectAbly(): void {
  if (ablyClient) {
    ablyClient.close();
    ablyClient = null;
  }
}
