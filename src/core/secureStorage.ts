import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { TrustManager, type TrustStorage } from './trust';

const KEY = 'synced.saved-trust.v1';
const OPTIONS: SecureStore.SecureStoreOptions = { keychainService: 'Synced.savedTrust', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
/** Device-only OS-backed storage. Unavailable/locked storage fails closed. */
export const secureTrustStorage: TrustStorage = {
  async read() {
    if (!await SecureStore.isAvailableAsync()) throw new Error('Secure pairing storage is unavailable on this device.');
    return SecureStore.getItemAsync(KEY, OPTIONS);
  },
  async write(value) {
    if (!await SecureStore.isAvailableAsync()) throw new Error('Secure pairing storage is unavailable on this device.');
    await SecureStore.setItemAsync(KEY, value, OPTIONS);
  },
};
export function createSecureTrustManager(deviceName?: string): TrustManager {
  return new TrustManager(secureTrustStorage, length => Crypto.getRandomBytes(length), deviceName);
}
