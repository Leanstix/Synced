import { describe, expect, it, vi } from 'vitest';
vi.mock('buffer', async () => { const { createRequire } = await import('node:module'); return createRequire(import.meta.url)('buffer/') as typeof import('buffer'); });
import { base64 } from '../src/core/protocol';
import { MAX_SAVED_PEERS, parseTrustDocument, sanitizeDeviceName } from '../src/core/trust';
const id = (n: number) => base64(new Uint8Array(32).fill(n));
const peer = (n = 2) => ({ id: id(n), name: 'Peer', role: 'HOST' as const, secret: id(200), savedAt: 1 });
const doc = (peers = [peer()]) => ({ version: 1, identity: { id: id(1), name: 'Me' }, peers });
describe('saved peer schema', () => {
  it('permits more than twenty peers and sanitizes display names', () => { const d = doc(Array.from({ length: 21 }, (_, i) => peer(i + 2))); d.identity.name = '\u202e Me\n'; expect(parseTrustDocument(JSON.stringify(d)).peers).toHaveLength(21); expect(parseTrustDocument(JSON.stringify(d)).identity.name).toBe('Me'); });
  it('rejects duplicate or self identities', () => { expect(() => parseTrustDocument(JSON.stringify(doc([peer(), peer()])))).toThrow(); expect(() => parseTrustDocument(JSON.stringify(doc([peer(1)])))).toThrow(); });
  it('rejects unknown version and malformed secrets', () => { expect(() => parseTrustDocument(JSON.stringify({ ...doc(), version: 2 }))).toThrow(); expect(() => parseTrustDocument(JSON.stringify(doc([{ ...peer(), secret: 'invitation' }])))).toThrow(); });
  it('rejects unsafe endpoints and timestamps', () => { expect(() => parseTrustDocument(JSON.stringify(doc([{ ...peer(), endpoint: { address: '8.8.8.8', port: 5000 } }])))).toThrow(); expect(() => parseTrustDocument(JSON.stringify(doc([{ ...peer(), savedAt: -1 }])))).toThrow(); });
  it('caps file size and peer count', () => { expect(() => parseTrustDocument(' '.repeat(65537))).toThrow(); expect(() => parseTrustDocument(JSON.stringify(doc(Array.from({ length: MAX_SAVED_PEERS + 1 }, (_, i) => peer(i + 2)))))).toThrow(); });
  it('removes control and bidi characters and bounds names', () => { expect(sanitizeDeviceName('\n\u2066')).toBe('Synced device'); expect(sanitizeDeviceName('a'.repeat(100))).toHaveLength(80); });
});
