import { describe, expect, it, vi } from 'vitest';
vi.mock('buffer', async () => { const { createRequire } = await import('node:module'); return createRequire(import.meta.url)('buffer/') as typeof import('buffer'); });
import { base64 } from '../src/core/protocol';
import type { SavedPeer } from '../src/core/trust';
import { MAX_SAVED_PEERS, parseTrustDocument, sanitizeDeviceName } from '../src/core/trust';
const id = (n: number) => base64(new Uint8Array(32).fill(n));
const peer = (n = 2) => ({ id: id(n), name: 'Peer', role: 'HOST' as const, secret: id(200), savedAt: 1 });
const doc = (peers: SavedPeer[] = [peer()]) => ({ version: 1, identity: { id: id(1), name: 'Me' }, peers });
describe('saved peer schema', () => {
  it('permits more than twenty peers and sanitizes display names', () => { const d = doc(Array.from({ length: 21 }, (_, i) => peer(i + 2))); d.identity.name = '\u202e Me\n'; expect(parseTrustDocument(JSON.stringify(d)).peers).toHaveLength(21); expect(parseTrustDocument(JSON.stringify(d)).identity.name).toBe('Me'); });
  it('rejects duplicate or self identities', () => { expect(() => parseTrustDocument(JSON.stringify(doc([peer(), peer()])))).toThrow(); expect(() => parseTrustDocument(JSON.stringify(doc([peer(1)])))).toThrow(); });
  it('rejects unknown version and malformed secrets', () => { expect(() => parseTrustDocument(JSON.stringify({ ...doc(), version: 2 }))).toThrow(); expect(() => parseTrustDocument(JSON.stringify(doc([{ ...peer(), secret: 'invitation' }])))).toThrow(); });
  it('rejects unsafe endpoints and timestamps', () => { expect(() => parseTrustDocument(JSON.stringify(doc([{ ...peer(), endpoint: { address: '8.8.8.8', port: 5000 } }])))).toThrow(); expect(() => parseTrustDocument(JSON.stringify(doc([{ ...peer(), savedAt: -1 }])))).toThrow(); });
  it('caps file size and peer count', () => { expect(() => parseTrustDocument(' '.repeat(65537))).toThrow(); expect(() => parseTrustDocument(JSON.stringify(doc(Array.from({ length: MAX_SAVED_PEERS + 1 }, (_, i) => peer(i + 2)))))).toThrow(); });
  it('removes control and bidi characters and bounds names', () => { expect(sanitizeDeviceName('\n\u2066')).toBe('Synced device'); expect(sanitizeDeviceName('a'.repeat(100))).toHaveLength(80); });
});

import { TrustManager, type TrustStorage } from '../src/core/trust';
function storage(raw: string | null = null) { let value = raw; const adapter: TrustStorage = { read: vi.fn(async () => value), write: vi.fn(async next => { value = next; }) }; return adapter; }
describe('secure trust manager', () => {
  it('creates one stable random identity even with concurrent initialization', async () => { const s = storage(); const random = vi.fn(() => new Uint8Array(32).fill(9)); const a = new TrustManager(s, random); await Promise.all([a.initialize(), a.initialize()]); const b = new TrustManager(s, random); await b.initialize(); expect(a.identity).toEqual(b.identity); expect(random).toHaveBeenCalledTimes(1); });
  it('never replaces corrupt data with a new identity', async () => { const s = storage('{bad'); const a = new TrustManager(s, () => new Uint8Array(32)); await expect(a.initialize()).rejects.toThrow(); expect(s.write).not.toHaveBeenCalled(); });
  it('fails closed when storage cannot create the identity', async () => { const s = storage(); vi.mocked(s.write).mockRejectedValue(new Error('locked')); const a = new TrustManager(s, () => new Uint8Array(32)); await expect(a.initialize()).rejects.toThrow('locked'); expect(() => a.identity).toThrow(); });
  it('serializes concurrent peer saves without losing records', async () => { const a = new TrustManager(storage(), () => new Uint8Array(32).fill(1)); await a.initialize(); await Promise.all([a.save(peer(2)), a.save(peer(3))]); expect(a.list()).toHaveLength(2); });
  it('keeps memory unchanged after save failure and permits the next write', async () => { const s = storage(); const a = new TrustManager(s, () => new Uint8Array(32).fill(1)); await a.initialize(); vi.mocked(s.write).mockRejectedValueOnce(new Error('full')); await expect(a.save(peer())).rejects.toThrow(); expect(a.list()).toEqual([]); await a.save(peer(3)); expect(a.get(id(3))).toBeDefined(); });
  it('returns defensive copies and validates endpoint updates', async () => { const a = new TrustManager(storage(), () => new Uint8Array(32).fill(1)); await a.initialize(); await a.save(peer()); const copy = a.get(id(2))!; copy.secret = 'bad'; expect(a.get(id(2))!.secret).toBe(id(200)); await expect(a.updateEndpoint(id(2), { address: 'localhost', port: 5000 })).rejects.toThrow(); await expect(a.updateEndpoint(id(3), { address: '10.0.0.2', port: 5000 })).rejects.toThrow(); });
});

describe('local revocation', () => {
  async function ready() { const s = storage(); const manager = new TrustManager(s, () => new Uint8Array(32).fill(1)); await manager.initialize(); await manager.save(peer()); return { manager, s }; }
  it('immediately notifies active-session owners and persists peer removal', async () => { const { manager, s } = await ready(); const observer = vi.fn(); manager.subscribe(observer); const removing = manager.remove(id(2)); expect(observer).toHaveBeenCalledWith(id(2)); expect(manager.get(id(2))).toBeUndefined(); await removing; const restored = new TrustManager(s, () => new Uint8Array(32)); await restored.initialize(); expect(restored.get(id(2))).toBeUndefined(); });
  it('keeps a peer revoked in memory even if secure storage fails', async () => { const { manager, s } = await ready(); vi.mocked(s.write).mockRejectedValueOnce(new Error('locked')); await expect(manager.remove(id(2))).rejects.toThrow('locked'); expect(manager.get(id(2))).toBeUndefined(); await expect(manager.save(peer())).rejects.toThrow('revoked'); });
  it('does not revive a removed peer from queued stale save', async () => { const { manager } = await ready(); const staleSave = manager.save(peer()); const removing = manager.remove(id(2)); await expect(staleSave).rejects.toThrow('revoked'); await removing; expect(manager.list()).toEqual([]); });
  it('permits pairing again only after explicit new-session consent', async () => { const { manager } = await ready(); await manager.remove(id(2)); await expect(manager.save(peer())).rejects.toThrow('revoked'); manager.allowNewPairing(id(2)); await manager.save({ ...peer(), secret: id(201) }); expect(manager.get(id(2))!.secret).toBe(id(201)); });
  it('isolates observers and supports unsubscribing', async () => { const { manager } = await ready(); const observer = vi.fn(); const unsubscribe = manager.subscribe(observer); manager.subscribe(() => { throw new Error('bad UI'); }); unsubscribe(); await manager.remove(id(2)); expect(observer).not.toHaveBeenCalled(); expect(manager.get(id(2))).toBeUndefined(); });
  it('can remove an unknown peer without affecting another saved peer', async () => { const { manager } = await ready(); await manager.remove(id(3)); expect(manager.get(id(2))).toBeDefined(); });
});
