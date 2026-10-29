import { describe, expect, it, vi } from 'vitest';
vi.mock('buffer', async () => { const { createRequire } = await import('node:module'); return createRequire(import.meta.url)('buffer/') as typeof import('buffer'); });
import { base64, CipherDirection, deriveSession } from '../src/core/protocol';
import { SecureSession } from '../src/core/session';

function pair() {
  const secret = base64(new Uint8Array(32).fill(3));
  const toHost: unknown[] = [];
  const toController: unknown[] = [];
  const hostPayload = vi.fn();
  const controllerPayload = vi.fn();
  const hostVerified = vi.fn();
  const controllerVerified = vi.fn();
  const host = new SecureSession('HOST', secret, () => base64(new Uint8Array(32).fill(4)), {
    send: value => toController.push(value), onVerified: hostVerified, onApproved: vi.fn(), onPayload: hostPayload,
  });
  const controller = new SecureSession('CONTROLLER', secret, () => base64(new Uint8Array(32).fill(5)), {
    send: value => toHost.push(value), onVerified: controllerVerified, onApproved: vi.fn(), onPayload: controllerPayload,
  });
  const handshake = () => { controller.start(); host.receive(toHost.shift()); controller.receive(toController.shift()); host.receive(toHost.shift()); };
  return { host, controller, toHost, toController, hostPayload, controllerPayload, hostVerified, controllerVerified, handshake };
}

describe('deliberate session approval', () => {
  it('shows the same authenticated comparison code and gates every payload until host approval', () => {
    const p = pair(); p.handshake();
    expect(p.hostVerified.mock.calls[0]).toEqual(p.controllerVerified.mock.calls[0]);
    expect(p.host.ready).toBe(false);
    expect(() => p.controller.send({ type: 'input', command: {} })).toThrow('approval');
    expect(() => p.host.send({ type: 'media', signal: {} })).toThrow('approval');
    p.host.approve(); p.controller.receive(p.toController.shift());
    p.controller.send({ type: 'input', command: { type: 'tap', x: 0.3, y: 0.4 } });
    p.host.receive(p.toHost.shift());
    expect(p.hostPayload).toHaveBeenCalledWith({ type: 'input', command: { type: 'tap', x: 0.3, y: 0.4 } });
  });
  it('answers ping once without a ping-pong loop and rejects traffic after close', () => {
    const p = pair(); p.handshake(); p.host.approve(); p.controller.receive(p.toController.shift());
    p.controller.send({ type: 'ping' }); p.host.receive(p.toHost.shift());
    expect(p.toController).toHaveLength(1);
    p.controller.receive(p.toController.shift());
    expect(p.toHost).toHaveLength(0);
    p.host.close();
    expect(() => p.host.send({ type: 'ping' })).toThrow();
    expect(() => p.host.receive({})).toThrow('closed');
  });
  it('does not allow the controller to approve itself', () => {
    const p = pair(); p.handshake();
    expect(() => p.controller.approve()).toThrow();
    expect(p.hostPayload).not.toHaveBeenCalled();
  });
  it('rejects even authenticated input while host comparison approval is pending', () => {
    const p = pair(); p.handshake();
    const keys = deriveSession(base64(new Uint8Array(32).fill(3)), base64(new Uint8Array(32).fill(5)), base64(new Uint8Array(32).fill(4)));
    const rogue = new CipherDirection(keys.controllerKey);
    rogue.seal({ type: 'controller-proof' });
    expect(() => p.host.receive(rogue.seal({ type: 'input', command: { type: 'globalAction', action: 'home' } }))).toThrow('approval');
    expect(p.hostPayload).not.toHaveBeenCalled();
  });
  it('fails authentication with the wrong invitation secret', () => {
    const p = pair();
    const wrong = new SecureSession('CONTROLLER', base64(new Uint8Array(32).fill(7)), () => base64(new Uint8Array(32).fill(5)), {
      send: value => p.toHost.push(value), onVerified: vi.fn(), onApproved: vi.fn(), onPayload: vi.fn(),
    });
    wrong.start(); p.host.receive(p.toHost.shift());
    expect(() => wrong.receive(p.toController.shift())).toThrow();
    expect(p.hostVerified).not.toHaveBeenCalled();
  });
  it('rejects a recorded controller proof after a fresh host nonce and closes rejected pairing', () => {
    const p = pair();
    p.controller.start(); const hello = p.toHost.shift();
    p.host.receive(hello); p.controller.receive(p.toController.shift());
    const oldProof = p.toHost.shift();
    const sent: unknown[] = [];
    const freshHost = new SecureSession('HOST', base64(new Uint8Array(32).fill(3)), () => base64(new Uint8Array(32).fill(99)), {
      send: value => sent.push(value), onVerified: vi.fn(), onApproved: vi.fn(), onPayload: vi.fn(),
    });
    freshHost.receive(hello);
    expect(() => freshHost.receive(oldProof)).toThrow();
    p.host.receive(oldProof); p.host.close();
    expect(() => p.host.approve()).toThrow();
    expect(p.host.ready).toBe(false);
  });
});
