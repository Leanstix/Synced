import { describe, expect, it, vi } from 'vitest';
vi.mock('buffer', async () => { const { createRequire } = await import('node:module'); return createRequire(import.meta.url)('buffer/') as typeof import('buffer'); });
import { base64 } from '../src/core/protocol';
import { SecureSession, type SessionOptions } from '../src/core/session';
const id = (n: number) => base64(new Uint8Array(32).fill(n));
function pair(hostNonce = 10, hostOptions: SessionOptions = { identity: { id: id(1), name: 'Host' }, trustedPeer: { id: id(2), secret: id(9) } }) {
  const h: unknown[] = [], c: unknown[] = [];
  const approvedH = vi.fn(), approvedC = vi.fn(), verified = vi.fn(), payloadH = vi.fn();
  const host = new SecureSession('HOST', id(9), () => id(hostNonce), { send: m => c.push(m), onVerified: verified, onApproved: approvedH, onPayload: payloadH }, hostOptions);
  const controller = new SecureSession('CONTROLLER', id(9), () => id(11), { send: m => h.push(m), onVerified: verified, onApproved: approvedC, onPayload: vi.fn() }, { identity: { id: id(2), name: 'Controller' }, trustedPeer: { id: id(1), secret: id(9) } });
  const handshake = () => { controller.start(); host.receive(h.shift()); controller.receive(c.shift()); host.receive(h.shift()); controller.receive(c.shift()); };
  return { host, controller, h, c, approvedH, approvedC, verified, payloadH, handshake };
}
describe('authenticated saved peer resumption', () => {
  it('authenticates a matching saved pair without granting screen or control', () => { const p = pair(); p.handshake(); expect(p.host.ready).toBe(true); expect(p.controller.ready).toBe(true); expect(p.approvedH).toHaveBeenCalledTimes(1); expect(p.approvedC).toHaveBeenCalledTimes(1); expect(p.verified).not.toHaveBeenCalled(); expect(p.payloadH).not.toHaveBeenCalled(); expect(p.h).toEqual([]); expect(p.c).toEqual([]); expect(() => p.host.savePairing()).toThrow(); });
  it('refuses trusted hello on an ordinary invitation listener', () => { const p = pair(10, {}); p.controller.start(); expect(() => p.host.receive(p.h.shift())).toThrow('mismatched'); expect(p.approvedH).not.toHaveBeenCalled(); });
  it('rejects an unknown sender identity before approving', () => { const p = pair(); p.controller.start(); const hello = p.h.shift() as object; expect(() => p.host.receive({ ...hello, from: id(3) })).toThrow(); expect(p.approvedH).not.toHaveBeenCalled(); });
  it('rejects a changed target identity', () => { const p = pair(); p.controller.start(); const hello = p.h.shift() as object; expect(() => p.host.receive({ ...hello, to: id(3) })).toThrow(); expect(p.approvedH).not.toHaveBeenCalled(); });
  it('rejects captured proof with a fresh host nonce', () => { const p = pair(); p.controller.start(); const hello = p.h.shift(); p.host.receive(hello); p.controller.receive(p.c.shift()); const proof = p.h.shift(); const fresh = pair(12); fresh.host.receive(hello); expect(() => fresh.host.receive(proof)).toThrow(); expect(fresh.approvedH).not.toHaveBeenCalled(); });
  it('uses a separate key context from invitation mode and rejects replayed messages', () => { const p = pair(); p.handshake(); p.controller.send({ type: 'ping' }); const ping = p.h.shift(); p.host.receive(ping); expect(() => p.host.receive(ping)).toThrow(); expect(p.payloadH).not.toHaveBeenCalled(); });
  it('rejects a mismatched PSK and self identity', () => { expect(() => new SecureSession('HOST', id(9), () => id(10), { send: vi.fn(), onApproved: vi.fn(), onVerified: vi.fn(), onPayload: vi.fn() }, { identity: { id: id(1), name: 'Host' }, trustedPeer: { id: id(1), secret: id(9) } })).toThrow(); const p = pair(10, { identity: { id: id(1), name: 'Host' }, trustedPeer: { id: id(2), secret: id(9) } }); const wrong = new SecureSession('CONTROLLER', id(8), () => id(11), { send: m => p.h.push(m), onApproved: vi.fn(), onVerified: vi.fn(), onPayload: vi.fn() }, { identity: { id: id(2), name: 'Wrong key' }, trustedPeer: { id: id(1), secret: id(8) } }); wrong.start(); p.host.receive(p.h.shift()); expect(() => wrong.receive(p.c.shift())).toThrow(); });
  it('does not allow repeated start or grants after closing', () => { const p = pair(); p.handshake(); expect(() => p.controller.start()).toThrow(); p.host.close(); expect(() => p.host.send({ type: 'permissions', screenSharing: true, controlEnabled: true })).toThrow(); expect(() => p.host.approve()).toThrow(); });
});
