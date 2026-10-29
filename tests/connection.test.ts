import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('buffer', async () => { const { createRequire } = await import('node:module'); return createRequire(import.meta.url)('buffer/') as typeof import('buffer'); });
import { base64, encodeInvitation, parseInvitation } from '../src/core/protocol';

const transport = vi.hoisted(() => {
  class Events {
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    on(event: string, fn: (...args: unknown[]) => void) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]); return this; }
    once(event: string, fn: (...args: unknown[]) => void) { const once = (...args: unknown[]) => { this.handlers.set(event, (this.handlers.get(event) ?? []).filter(cb => cb !== once)); fn(...args); }; return this.on(event, once); }
    emit(event: string, ...args: unknown[]) { for (const fn of [...(this.handlers.get(event) ?? [])]) fn(...args); }
  }
  class FakeSocket extends Events {
    remoteAddress = '192.168.1.3'; destroyed = false;
    destroy = vi.fn(() => { this.destroyed = true; this.emit('close'); });
    write = vi.fn(); setNoDelay = vi.fn();
  }
  class FakeServer extends Events {
    accept!: (socket: FakeSocket) => void;
    listening!: () => void;
    close = vi.fn();
    listen = vi.fn((_options: unknown, fn: () => void) => { this.listening = fn; if (state.autoListen) fn(); });
    address = () => ({ port: 5000 });
  }
  const state = {
    autoListen: true,
    server: null as FakeServer | null,
    socket: null as FakeSocket | null,
    onConnect: null as null | (() => void),
    network: vi.fn(async () => '192.168.1.2'),
  };
  return { state, FakeSocket, FakeServer };
});
vi.mock('expo-network', () => ({ getIpAddressAsync: transport.state.network }));
vi.mock('expo-crypto', () => ({ getRandomBytes: (length: number) => new Uint8Array(length).fill(8) }));
vi.mock('react-native-tcp-socket', () => ({ default: {
  createServer: (callback: (socket: InstanceType<typeof transport.FakeSocket>) => void) => {
    const server = new transport.FakeServer(); server.accept = callback; transport.state.server = server; return server;
  },
  createConnection: (_options: unknown, callback: () => void) => {
    const socket = new transport.FakeSocket(); transport.state.socket = socket; transport.state.onConnect = callback; return socket;
  },
} }));
import { LocalConnection } from '../src/core/connection';

const callbacks = () => ({ onListening: vi.fn(), onConnecting: vi.fn(), onVerified: vi.fn(), onApproved: vi.fn(), onPayload: vi.fn(), onClosed: vi.fn() });
const invitation = encodeInvitation({ version: 1, address: '192.168.1.2', port: 5000, secret: base64(new Uint8Array(32).fill(8)) });
beforeEach(() => { vi.useFakeTimers(); transport.state.autoListen = true; transport.state.network.mockResolvedValue('192.168.1.2'); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('local transport lifetime', () => {
  it('expires an unused invitation and releases the listener', async () => {
    const cb = callbacks(); const connection = new LocalConnection(cb);
    await connection.host();
    expect(parseInvitation(cb.onListening.mock.calls[0]![0] as string).address).toBe('192.168.1.2');
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(transport.state.server!.close).toHaveBeenCalled();
    expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('expired'));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('closes the listener after one peer without destroying that accepted socket', async () => {
    const cb = callbacks(); const connection = new LocalConnection(cb); await connection.host();
    const socket = new transport.FakeSocket(); transport.state.server!.accept(socket);
    expect(transport.state.server!.close).toHaveBeenCalled(); expect(socket.destroy).not.toHaveBeenCalled();
    expect(cb.onConnecting).toHaveBeenCalledWith('HOST', '192.168.1.3');
    vi.advanceTimersByTime(15000);
    expect(socket.destroy).toHaveBeenCalled(); expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('settles a pending connect on local cancellation and removes all timers', async () => {
    const cb = callbacks(); const connection = new LocalConnection(cb);
    const connecting = connection.connect(invitation);
    connection.close(false);
    await expect(connecting).rejects.toThrow('cancelled');
    expect(transport.state.socket!.destroy).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    // A late native callback cannot revive the cancelled transport.
    transport.state.onConnect!();
    expect(cb.onVerified).not.toHaveBeenCalled(); expect(cb.onClosed).not.toHaveBeenCalled();
  });
  it('settles a pending server listen on cancellation', async () => {
    transport.state.autoListen = false;
    const cb = callbacks(); const connection = new LocalConnection(cb);
    const listening = connection.host(); await Promise.resolve();
    connection.close(false);
    await expect(listening).rejects.toThrow('cancelled');
    transport.state.server!.listening();
    expect(cb.onListening).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects nonprivate interfaces without opening a listening socket', async () => {
    const cb = callbacks(); const connection = new LocalConnection(cb);
    await expect(connection.host('127.0.0.1')).rejects.toThrow('private');
    await expect(connection.host('8.8.8.8')).rejects.toThrow('private');
    connection.close(false);
  });
});

import { TrustManager, type SavedPeer } from '../src/core/trust';
const deviceId = (n: number) => base64(new Uint8Array(32).fill(n));
async function trusted(role: 'HOST' | 'CONTROLLER' = 'CONTROLLER') {
  let raw: string | null = null;
  const manager = new TrustManager({ read: async () => raw, write: async value => { raw = value; } }, () => new Uint8Array(32).fill(1));
  await manager.initialize();
  const peer: SavedPeer = { id: deviceId(2), name: 'Desk', role, secret: deviceId(9), savedAt: 1, endpoint: { address: '192.168.1.2', port: 5000 } };
  await manager.save(peer); return { manager, peer };
}
describe('intentional trusted transport lifetime', () => {
  it('creates a trusted listener only explicitly and never exposes a reusable invitation', async () => { const { manager, peer } = await trusted(); const cb = { ...callbacks(), onTrustedListening: vi.fn() }; const connection = new LocalConnection(cb, manager); expect(cb.onTrustedListening).not.toHaveBeenCalled(); await connection.hostTrusted(peer.id); expect(cb.onListening).not.toHaveBeenCalled(); expect(cb.onTrustedListening).toHaveBeenCalledWith('192.168.1.2', 5000, peer); expect(transport.state.server!.listen).toHaveBeenCalledWith({ port: 5000, host: '0.0.0.0' }, expect.any(Function)); connection.dispose(); });
  it('requires the correct remote role and a still saved identity', async () => { const { manager, peer } = await trusted('HOST'); const connection = new LocalConnection(callbacks(), manager); await expect(connection.hostTrusted(peer.id)).rejects.toThrow('controller'); await manager.remove(peer.id); await expect(connection.connectTrusted(peer.id)).rejects.toThrow('revoked'); connection.dispose(); });
  it('validates manual address overrides before native connection creation', async () => { const { manager, peer } = await trusted('HOST'); const connection = new LocalConnection(callbacks(), manager); await expect(connection.connectTrusted(peer.id, { address: '8.8.8.8', port: 5000 })).rejects.toThrow('private'); await expect(connection.connectTrusted(peer.id, { address: '10.0.0.2', port: 1 })).rejects.toThrow('private'); connection.dispose(); });
  it('closes an active trusted listener immediately when its peer is revoked', async () => { const { manager, peer } = await trusted(); const cb = callbacks(); const connection = new LocalConnection(cb, manager); await connection.hostTrusted(peer.id); const server = transport.state.server!; await manager.remove(peer.id); expect(server.close).toHaveBeenCalled(); expect(connection.currentPeerId).toBeNull(); expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('revoked')); expect(vi.getTimerCount()).toBe(0); await expect(connection.hostTrusted(peer.id)).rejects.toThrow(); connection.dispose(); });
  it('expires trusted listeners without creating an automatic replacement', async () => { const { manager, peer } = await trusted(); const cb = { ...callbacks(), onTrustedListening: vi.fn() }; const connection = new LocalConnection(cb, manager); await connection.hostTrusted(peer.id); vi.advanceTimersByTime(10 * 60 * 1000); expect(cb.onTrustedListening).toHaveBeenCalledTimes(1); expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('expired')); expect(vi.getTimerCount()).toBe(0); connection.dispose(); });
  it('cancels a pending trusted dial and ignores a late native connect callback', async () => { const { manager, peer } = await trusted('HOST'); const cb = callbacks(); const connection = new LocalConnection(cb, manager); const pending = connection.connectTrusted(peer.id); await vi.advanceTimersByTimeAsync(0); connection.close(false); await expect(pending).rejects.toThrow('cancelled'); transport.state.onConnect!(); expect(cb.onApproved).not.toHaveBeenCalled(); expect(transport.state.socket!.destroy).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); connection.dispose(); });
});
