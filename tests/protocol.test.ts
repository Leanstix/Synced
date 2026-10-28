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
