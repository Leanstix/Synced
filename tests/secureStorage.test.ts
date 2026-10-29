import { beforeEach, describe, expect, it, vi } from 'vitest';
const secure = vi.hoisted(() => ({ isAvailableAsync: vi.fn(async () => true), getItemAsync: vi.fn(async (): Promise<string | null> => null), setItemAsync: vi.fn(async () => {}), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
vi.mock('expo-secure-store', () => secure);
vi.mock('expo-crypto', () => ({ getRandomBytes: (length: number) => new Uint8Array(length).fill(7) }));
import { createSecureTrustManager, secureTrustStorage } from '../src/core/secureStorage';
beforeEach(() => { vi.clearAllMocks(); secure.isAvailableAsync.mockResolvedValue(true); secure.getItemAsync.mockResolvedValue(null); secure.setItemAsync.mockResolvedValue(); });
describe('device-only secure storage', () => {
  it('reads only the versioned private namespace', async () => { await secureTrustStorage.read(); expect(secure.getItemAsync).toHaveBeenCalledWith('synced.saved-trust.v1', expect.objectContaining({ keychainService: 'Synced.savedTrust', keychainAccessible: 6 })); });
  it('writes with device-only unlocked accessibility', async () => { await secureTrustStorage.write('data'); expect(secure.setItemAsync).toHaveBeenCalledWith('synced.saved-trust.v1', 'data', expect.objectContaining({ keychainAccessible: 6 })); });
  it('never reads or writes when secure storage is unavailable', async () => { secure.isAvailableAsync.mockResolvedValue(false); await expect(secureTrustStorage.read()).rejects.toThrow('unavailable'); await expect(secureTrustStorage.write('data')).rejects.toThrow('unavailable'); expect(secure.getItemAsync).not.toHaveBeenCalled(); expect(secure.setItemAsync).not.toHaveBeenCalled(); });
  it('propagates locked keystore failures without a plaintext fallback', async () => { secure.getItemAsync.mockRejectedValueOnce(new Error('locked')); await expect(secureTrustStorage.read()).rejects.toThrow('locked'); expect(secure.setItemAsync).not.toHaveBeenCalled(); });
  it('does not claim persistence when secure write fails', async () => { secure.setItemAsync.mockRejectedValueOnce(new Error('full')); const manager = createSecureTrustManager('Phone'); await expect(manager.initialize()).rejects.toThrow('full'); expect(() => manager.identity).toThrow(); });
  it('creates its identity using injected Expo secure random bytes', async () => { const manager = createSecureTrustManager('  Phone\n'); await manager.initialize(); expect(manager.identity.name).toBe('Phone'); expect(manager.identity.id).toHaveLength(43); expect(secure.setItemAsync).toHaveBeenCalledTimes(1); });
});
