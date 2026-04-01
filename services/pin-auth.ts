import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const PIN_HASH_KEY = 'cos_pin_hash';
const BIOMETRIC_ENABLED_KEY = 'cos_biometric_enabled';
const PIN_SETUP_COMPLETE_KEY = 'cos_pin_setup_complete';
const FAILED_ATTEMPTS_KEY = 'cos_failed_pin_attempts';
const LOCK_TIMEOUT_KEY = 'cos_lock_timeout';

export async function hashPin(pin: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin,
  );
}

export async function storePin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
  await SecureStore.setItemAsync(PIN_SETUP_COMPLETE_KEY, 'true');
  await resetFailedAttempts();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = await SecureStore.getItemAsync(PIN_HASH_KEY);
  if (!storedHash) return false;
  const inputHash = await hashPin(pin);
  return storedHash === inputHash;
}

export async function isPinSetup(): Promise<boolean> {
  const result = await SecureStore.getItemAsync(PIN_SETUP_COMPLETE_KEY);
  return result === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function isBiometricEnabled(): Promise<boolean> {
  const result = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  return result === 'true';
}

export async function getFailedAttempts(): Promise<number> {
  const result = await SecureStore.getItemAsync(FAILED_ATTEMPTS_KEY);
  return result ? parseInt(result, 10) : 0;
}

export async function incrementFailedAttempts(): Promise<number> {
  const current = await getFailedAttempts();
  const next = current + 1;
  await SecureStore.setItemAsync(FAILED_ATTEMPTS_KEY, next.toString());
  return next;
}

export async function resetFailedAttempts(): Promise<void> {
  await SecureStore.setItemAsync(FAILED_ATTEMPTS_KEY, '0');
}

export async function clearPinData(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  await SecureStore.deleteItemAsync(PIN_SETUP_COMPLETE_KEY);
  await SecureStore.deleteItemAsync(FAILED_ATTEMPTS_KEY);
}

export async function getLockTimeout(): Promise<number> {
  const result = await SecureStore.getItemAsync(LOCK_TIMEOUT_KEY);
  return result ? parseInt(result, 10) : 30000; // Default 30 seconds
}

export async function setLockTimeout(ms: number): Promise<void> {
  await SecureStore.setItemAsync(LOCK_TIMEOUT_KEY, ms.toString());
}
