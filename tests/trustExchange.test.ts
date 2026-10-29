import { describe, expect, it, vi } from 'vitest';
vi.mock('buffer', async () => { const { createRequire } = await import('node:module'); return createRequire(import.meta.url)('buffer/') as typeof import('buffer'); });
import { base64 } from '../src/core/protocol';
import { TrustExchange } from '../src/core/trustExchange';
const id = (n: number) => base64(new Uint8Array(32).fill(n));
function pair() {
  const h: unknown[] = [], c: unknown[] = [];
  const hostSave = vi.fn(async () => {}), controllerSave = vi.fn(async () => {});
  const hostRollback = vi.fn(async () => {}), controllerRollback = vi.fn(async () => {});
  const savedH = vi.fn(), savedC = vi.fn(), errorH = vi.fn(), errorC = vi.fn();
  const host = new TrustExchange('HOST', { id: id(1), name: 'Host' }, () => id(9), { send: m => c.push(m), persist: hostSave, rollback: hostRollback, onPairingSaved: savedH, onPairingError: errorH });
  const controller = new TrustExchange('CONTROLLER', { id: id(2), name: 'Controller' }, () => id(8), { send: m => h.push(m), persist: controllerSave, rollback: controllerRollback, onPairingSaved: savedC, onPairingError: errorC });
  const flush = async () => { for (let i = 0; i < 20; i++) { while (h.length) host.receive(h.shift()); while (c.length) controller.receive(c.shift()); await Promise.resolve(); } };
  host.start(); controller.start();
  return { host, controller, h, c, flush, hostSave, controllerSave, hostRollback, controllerRollback, savedH, savedC, errorH, errorC };
}
describe('bilateral pairing transaction', () => {
  it('exchanges identities without saving and requires both explicit consents', async () => { const p = pair(); await p.flush(); p.host.savePairing(); await p.flush(); expect(p.hostSave).not.toHaveBeenCalled(); expect(p.controllerSave).not.toHaveBeenCalled(); p.controller.savePairing(); await p.flush(); expect(p.hostSave).toHaveBeenCalledTimes(1); expect(p.controllerSave).toHaveBeenCalledTimes(1); expect(p.savedH).toHaveBeenCalledTimes(1); expect(p.savedC).toHaveBeenCalledTimes(1); expect(p.hostSave.mock.calls[0]).toEqual([expect.objectContaining({ id: id(2), secret: id(9), role: 'CONTROLLER' })]); });
  it('rejects unsolicited offers before local consent', async () => { const p = pair(); await p.flush(); expect(() => p.controller.receive({ type: 'save-offer', secret: id(9) })).toThrow('Both owners'); expect(p.controllerSave).not.toHaveBeenCalled(); });
  it('rejects duplicate consent and identity reflection', async () => { const p = pair(); await p.flush(); p.host.savePairing(); expect(() => p.host.savePairing()).toThrow(); expect(() => p.host.receive({ type: 'identity', id: id(1), name: 'Me' })).toThrow(); });
  it('rolls back both sides when controller secure storage fails', async () => { const p = pair(); await p.flush(); p.controllerSave.mockRejectedValue(new Error('locked')); p.host.savePairing(); p.controller.savePairing(); await p.flush(); expect(p.hostRollback).toHaveBeenCalledWith(id(2)); expect(p.controllerRollback).toHaveBeenCalledWith(id(1)); expect(p.savedH).not.toHaveBeenCalled(); expect(p.savedC).not.toHaveBeenCalled(); expect(p.errorH).toHaveBeenCalled(); });
  it('does not persist controller if host storage fails', async () => { const p = pair(); await p.flush(); p.hostSave.mockRejectedValue(new Error('full')); p.host.savePairing(); p.controller.savePairing(); await p.flush(); expect(p.controllerSave).not.toHaveBeenCalled(); expect(p.savedH).not.toHaveBeenCalled(); expect(p.savedC).not.toHaveBeenCalled(); });
  it('rolls back an in-flight write after disconnect without reviving the channel', async () => { const p = pair(); await p.flush(); let finish!: () => void; p.hostSave.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; })); p.host.savePairing(); p.controller.savePairing(); await p.flush(); p.host.close(); finish(); await p.flush(); expect(p.hostRollback).toHaveBeenCalledWith(id(2)); expect(p.controllerSave).not.toHaveBeenCalled(); expect(p.savedH).not.toHaveBeenCalled(); });
  it('bounds and sanitizes encrypted peer display names', () => { const p = pair(); p.host.receive({ type: 'identity', id: id(2), name: '\u202ePeer\n' }); expect(p.host.peerIdentity?.name).toBe('Peer'); expect(() => p.controller.receive({ type: 'identity', id: id(1), name: 'x'.repeat(257) })).toThrow(); });
});
