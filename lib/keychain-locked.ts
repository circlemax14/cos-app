/**
 * COS-1275 — the iOS Keychain refused a read because the device is locked.
 *
 * errSecInteractionNotAllowed, which expo-secure-store surfaces as "Calling the
 * 'getValueWithKeyAsync' function has failed → Caused by: User interaction is
 * not allowed." UIBackgroundModes has `fetch` and `remote-notification`, so iOS
 * starts the whole app in the background — a locked iPad overnight — and every
 * mount-time read (splash, SecurityProvider, the sync hooks) hits it.
 *
 * It says the device is locked. It does not say the item is missing: the next
 * foreground read answers.
 *
 * Pure so `node --test` can load it (tests/unit/keychain-locked.test.ts).
 */
export function isKeychainLockedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('User interaction is not allowed');
}
