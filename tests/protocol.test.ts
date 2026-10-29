import { describe, expect, it, vi } from 'vitest';
vi.mock('buffer', async () => {
  const { createRequire } = await import('node:module');
  return createRequire(import.meta.url)('buffer/') as typeof import('buffer');
});
import { base64, CipherDirection, deriveSession, encodeFrame, encodeInvitation, FrameDecoder, MAX_FRAME_BYTES, parseInvitation } from '../src/core/protocol';

const secret = base64(new Uint8Array(32).fill(9));
const cNonce = base64(new Uint8Array(32).fill(10));
const hNonce = base64(new Uint8Array(32).fill(11));

describe('LAN invitation and framing', () => {
  it('uses Hermes buffer polyfill supported base64 with URL-safe normalization', () => {
    expect(base64(new Uint8Array([255, 255]))).toBe('__8');
    expect(secret).toHaveLength(43);
  });
  it('round trips an invitation with a 256 bit secret', () => {
    const data = { version: 1 as const, address: '192.168.43.1', port: 12345, secret };
    expect(parseInvitation(encodeInvitation(data))).toEqual(data);
    expect(() => encodeInvitation({ ...data, secret: '123456' })).toThrow();
    expect(() => encodeInvitation({ ...data, address: '8.8.8.8' })).toThrow();
  });
  it('reassembles fragmented/coalesced frames and rejects oversized lengths', () => {
    const frame = encodeFrame({ hello: 'there' });
    const decoder = new FrameDecoder();
    expect(decoder.push(frame.subarray(0, 2))).toEqual([]);
    expect(decoder.push(frame.subarray(2, 8))).toEqual([]);
    expect(decoder.push(frame.subarray(8))).toEqual([{ hello: 'there' }]);
    expect(decoder.push(new Uint8Array([...frame, ...frame]))).toHaveLength(2);
    const invalid = new Uint8Array(4);
    new DataView(invalid.buffer).setUint32(0, MAX_FRAME_BYTES + 1);
    expect(() => new FrameDecoder().push(invalid)).toThrow('Invalid frame length');
  });
});

describe('authenticated direction keys', () => {
  it('authenticates data, rejects replay, and separates both directions', () => {
    const keys = deriveSession(secret, cNonce, hNonce);
    expect(keys.hostKey).not.toEqual(keys.controllerKey);
    const sender = new CipherDirection(keys.hostKey);
    const receiver = new CipherDirection(keys.hostKey);
    const frame = sender.seal({ hello: 'world' });
    expect(receiver.open(frame)).toEqual({ hello: 'world' });
    expect(() => receiver.open(frame)).toThrow();
    expect(() => new CipherDirection(keys.controllerKey).open(frame)).toThrow();
  });
  it('rejects tampering, changed secret, and out-of-order packets', () => {
    const keys = deriveSession(secret, cNonce, hNonce);
    const sender = new CipherDirection(keys.hostKey);
    const first = sender.seal({ value: 1 });
    const second = sender.seal({ value: 2 });
    expect(() => new CipherDirection(keys.hostKey).open(second)).toThrow();
    expect(() => new CipherDirection(keys.hostKey).open({ ...first, ciphertext: `A${first.ciphertext.slice(1)}` })).toThrow();
    const other = deriveSession(base64(new Uint8Array(32).fill(8)), cNonce, hNonce);
    expect(() => new CipherDirection(other.hostKey).open(first)).toThrow();
  });
});

describe('malformed cryptographic material', () => {
  it('rejects noncanonical final base64 bits instead of accepting secret aliases', () => { const alias = secret.slice(0, -1) + 'l'; expect(() => deriveSession(alias, cNonce, hNonce)).toThrow(); });
  it('rejects malformed nonce encodings and weak secret lengths', () => { expect(() => deriveSession(secret, 'A'.repeat(42), hNonce)).toThrow(); expect(() => deriveSession('A'.repeat(44), cNonce, hNonce)).toThrow(); expect(() => deriveSession(secret, cNonce + '=', hNonce)).toThrow(); });
  it('never advances receiving sequence after failed authentication', () => { const key = deriveSession(secret, cNonce, hNonce).hostKey; const sender = new CipherDirection(key), receiver = new CipherDirection(key); const frame = sender.seal({ ping: true }); expect(() => receiver.open({ ...frame, ciphertext: `${frame.ciphertext.slice(0, -1)}A` })).toThrow(); expect(receiver.open(frame)).toEqual({ ping: true }); });
  it('rejects negative fractional and unsafe sequence numbers', () => { const key = deriveSession(secret, cNonce, hNonce).hostKey; const frame = new CipherDirection(key).seal({ ping: true }); for (const sequence of [-1, 0.5, Number.MAX_SAFE_INTEGER]) expect(() => new CipherDirection(key).open({ ...frame, sequence })).toThrow(); });
  it('does not allow session contexts to share directional keys', () => { expect(deriveSession(secret, cNonce, hNonce, 'trusted:a:b').hostKey).not.toEqual(deriveSession(secret, cNonce, hNonce).hostKey); });
});

it('owns an independent directional key copy after construction', () => {
  const original = deriveSession(secret, cNonce, hNonce).hostKey;
  const receiver = new CipherDirection(original);
  const sender = new CipherDirection(original);
  original.fill(0);
  expect(receiver.open(sender.seal({ value: 'intact' }))).toEqual({ value: 'intact' });
});

it('destroys owned key material without mutating callers and never reuses a closed cipher', () => {
  const key = deriveSession(secret, cNonce, hNonce).hostKey; const before = new Uint8Array(key);
  const direction = new CipherDirection(key); const frame = direction.seal({ hello: true });
  direction.destroy(); direction.destroy();
  expect(key).toEqual(before); expect(() => direction.seal({ hello: true })).toThrow('closed'); expect(() => direction.open(frame)).toThrow('closed');
});
