import { describe, expect, it, vi } from 'vitest';
vi.mock('buffer', async () => { const { createRequire } = await import('node:module'); return createRequire(import.meta.url)('buffer/') as typeof import('buffer'); });
import { base64, CipherDirection, deriveSession } from '../src/core/protocol';
import { SecureSession } from '../src/core/session';
const id = (n: number) => base64(new Uint8Array(32).fill(n));
function pair() {
  const h: unknown[] = [], c: unknown[] = [], wire: unknown[] = [];
  const saveH = vi.fn(async () => {}), saveC = vi.fn(async () => {}), saved = vi.fn(), payload = vi.fn();
  const callbacks = (queue: unknown[], persist: typeof saveH) => ({ send: (m: unknown) => { queue.push(m); wire.push(m); }, onApproved: vi.fn(), onVerified: vi.fn(), onPayload: payload, persist });
  const hostCallbacks = callbacks(c, saveH), controllerCallbacks = callbacks(h, saveC);
  const host = new SecureSession('HOST', id(9), () => id(10), hostCallbacks, { identity: { id: id(1), name: 'Host' }, pairing: { persist: saveH, rollback: vi.fn(async () => {}), onPairingSaved: saved } });
  const controller = new SecureSession('CONTROLLER', id(9), () => id(11), controllerCallbacks, { identity: { id: id(2), name: 'Controller' }, pairing: { persist: saveC, rollback: vi.fn(async () => {}), onPairingSaved: saved } });
  const handshake = () => { controller.start(); host.receive(h.shift()); controller.receive(c.shift()); host.receive(h.shift()); };
  const flush = async () => { for (let i = 0; i < 20; i++) { while (h.length) host.receive(h.shift()); while (c.length) controller.receive(c.shift()); await Promise.resolve(); } };
  return { host, controller, h, c, wire, saveH, saveC, saved, payload, handshake, flush };
}
describe('encrypted pairing session integration', () => {
  it('does not exchange identity or persist before explicit host comparison approval', () => { const p = pair(); p.handshake(); expect(p.host.peerIdentity).toBeNull(); expect(() => p.host.savePairing()).toThrow('comparison'); expect(p.saveH).not.toHaveBeenCalled(); expect(p.saveC).not.toHaveBeenCalled(); });
  it('keeps identity and a fresh trust PSK inside encrypted frames', async () => { const p = pair(); p.handshake(); p.host.approve(); await p.flush(); p.host.savePairing(); await p.flush(); expect(p.saveH).not.toHaveBeenCalled(); p.controller.savePairing(); await p.flush(); expect(p.saved).toHaveBeenCalledTimes(2); expect(p.saveH).toHaveBeenCalledWith(expect.objectContaining({ id: id(2), secret: id(10) })); expect(p.saveC).toHaveBeenCalledWith(expect.objectContaining({ id: id(1), secret: id(10) })); const visible = JSON.stringify(p.wire); expect(visible).not.toContain(id(1)); expect(visible).not.toContain(id(2)); expect(visible).not.toContain('save-offer'); expect(p.payload).not.toHaveBeenCalled(); });
  it('rejects malformed authenticated permission flags and closes the session', async () => { const p = pair(); p.handshake(); p.host.approve(); await p.flush(); const key = deriveSession(id(9), id(11), id(10)).controllerKey; const rogue = new CipherDirection(key); rogue.seal({ type: 'controller-proof' }); rogue.seal({ type: 'trust', message: { type: 'identity', id: id(2), name: 'Controller' } }); expect(() => p.host.receive(rogue.seal({ type: 'permissions', screenSharing: 'yes', controlEnabled: true }))).toThrow('permissions'); expect(p.host.ready).toBe(false); expect(() => p.host.approve()).toThrow(); });
  it('rejects an authenticated unsolicited trust offer and cannot resume after protocol failure', async () => { const p = pair(); p.handshake(); p.host.approve(); await p.flush(); const key = deriveSession(id(9), id(11), id(10)).controllerKey; const rogue = new CipherDirection(key); rogue.seal({ type: 'controller-proof' }); rogue.seal({ type: 'trust', message: { type: 'identity', id: id(2), name: 'Controller' } }); expect(() => p.host.receive(rogue.seal({ type: 'trust', message: { type: 'save-offer', secret: id(20) } }))).toThrow('Both owners'); expect(p.saveH).not.toHaveBeenCalled(); expect(p.host.ready).toBe(false); expect(() => p.host.receive({})).toThrow('closed'); });
  it('allows no data or save consent after manual close', async () => { const p = pair(); p.handshake(); p.host.approve(); await p.flush(); p.host.close(); expect(() => p.host.savePairing()).toThrow(); expect(() => p.host.send({ type: 'call', signal: {} })).toThrow(); expect(p.saveH).not.toHaveBeenCalled(); });
});
