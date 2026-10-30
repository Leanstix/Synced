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
    connectOptions: null as unknown,
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
    transport.state.connectOptions = _options;
    const socket = new transport.FakeSocket(); transport.state.socket = socket; transport.state.onConnect = callback; return socket;
  },
} }));
import { LocalConnection } from '../src/core/connection';

const callbacks = () => ({ onListening: vi.fn(), onConnecting: vi.fn(), onVerified: vi.fn(), onApproved: vi.fn(), onPayload: vi.fn(), onClosed: vi.fn() });
const invitation = encodeInvitation({ version: 1, address: '192.168.1.2', port: 5000, secret: base64(new Uint8Array(32).fill(8)) });
beforeEach(() => { vi.useFakeTimers(); transport.state.autoListen = true; transport.state.connectOptions = null; transport.state.network.mockResolvedValue('192.168.1.2'); });
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

import { encodeFrame } from '../src/core/protocol';
import { SecureSession } from '../src/core/session';
async function approvedHost() {
  const cb = callbacks(); const connection = new LocalConnection(cb); await connection.host();
  const socket = new transport.FakeSocket(); transport.state.server!.accept(socket);
  const controller = new SecureSession('CONTROLLER', deviceId(8), () => deviceId(7), {
    send: frame => socket.emit('data', encodeFrame(frame)), onVerified: vi.fn(), onApproved: vi.fn(), onPayload: vi.fn(),
  });
  controller.start(); controller.receive(JSON.parse(new TextDecoder().decode(socket.write.mock.calls[0]![0].subarray(4))));
  connection.approve(); controller.receive(JSON.parse(new TextDecoder().decode(socket.write.mock.calls[1]![0].subarray(4))));
  return { cb, connection, socket, controller };
}
describe('authenticated TCP liveness and observer cancellation', () => {
  it('does not extend an approved session with empty native reads', async () => {
    const { cb, connection, socket } = await approvedHost();
    vi.advanceTimersByTime(20000); socket.emit('data', new Uint8Array()); vi.advanceTimersByTime(10000);
    expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('disconnected')); expect(socket.destroy).toHaveBeenCalled(); connection.dispose();
  });
  it('does not extend an approved session with an incomplete frame header', async () => {
    const { cb, connection, socket } = await approvedHost();
    vi.advanceTimersByTime(20000); socket.emit('data', new Uint8Array([0])); vi.advanceTimersByTime(10000);
    expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('disconnected')); expect(vi.getTimerCount()).toBe(0); connection.dispose();
  });
  it('refreshes liveness only when the complete authenticated frame arrives', async () => {
    const { cb, connection, socket, controller } = await approvedHost();
    // Capture an authentic frame and deliver its final byte after another heartbeat.
    let frame!: Uint8Array;
    const original = socket.emit.bind(socket); socket.emit = (event, ...args) => { if (event === 'data') frame = args[0] as Uint8Array; else original(event, ...args); };
    controller.send({ type: 'pong' }); socket.emit = original;
    vi.advanceTimersByTime(15000); socket.emit('data', frame.subarray(0, -1));
    vi.advanceTimersByTime(5000); socket.emit('data', frame.subarray(-1));
    vi.advanceTimersByTime(20000); expect(cb.onClosed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000); expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('disconnected')); connection.dispose();
  });
  it('does not leave an invitation timer after a listening observer cancels', async () => {
    const cb = callbacks(); const connection = new LocalConnection(cb); cb.onListening.mockImplementation(() => connection.close(false));
    await expect(connection.host()).rejects.toThrow('cancelled'); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not create a socket after a connecting observer cancels', async () => {
    const cb = callbacks(); const connection = new LocalConnection(cb); const previous = transport.state.socket;
    cb.onConnecting.mockImplementation(() => connection.close(false));
    await expect(connection.connect(invitation)).rejects.toThrow('cancelled'); expect(transport.state.socket).toBe(previous); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not revive a host session after an attachment observer cancels', async () => {
    const cb = callbacks(); const connection = new LocalConnection(cb); await connection.host();
    cb.onConnecting.mockImplementation(() => connection.close(false)); const socket = new transport.FakeSocket(); transport.state.server!.accept(socket);
    expect(socket.destroy).toHaveBeenCalled(); expect(socket.setNoDelay).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});

const routeFlush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
describe('Wi-Fi-bound local socket routing',()=>{
 async function inspectDial(trusted=false,override=false){
  const trust=new TrustManager({read:async()=>null,write:async()=>{}},length=>new Uint8Array(length).fill(1));
  await trust.initialize();const peerId=base64(new Uint8Array(32).fill(9));
  await trust.save({id:peerId,name:'LAN host',role:'HOST',secret:base64(new Uint8Array(32).fill(8)),savedAt:12,endpoint:{address:'192.168.1.2',port:5000}});
  const connection=new LocalConnection(callbacks(),trusted?trust:undefined);
  const pending=trusted?connection.connectTrusted(peerId,override?{address:'10.42.0.1',port:47631}:undefined):connection.connect(invitation);
  const cancelled=expect(pending).rejects.toThrow('cancelled');await routeFlush();const options=transport.state.connectOptions;
  connection.dispose();await cancelled;return options;
 }
 it('binds a fresh invitation to Wi-Fi even if Android prefers cellular data',async()=>expect(await inspectDial()).toMatchObject({interface:'wifi',host:'192.168.1.2',port:5000}));
 it('retains Wi-Fi routing for a saved host endpoint',async()=>expect(await inspectDial(true)).toMatchObject({interface:'wifi',host:'192.168.1.2'}));
 it('uses the new hotspot endpoint with Wi-Fi routing after a subnet change',async()=>expect(await inspectDial(true,true)).toMatchObject({interface:'wifi',host:'10.42.0.1',port:47631}));
 it('fails closed when the requested Wi-Fi interface is unavailable',async()=>{
  const cb=callbacks(),connection=new LocalConnection(cb);const pending=connection.connect(invitation);const rejected=expect(pending).rejects.toThrow('wifi unreachable');await routeFlush();
  transport.state.socket!.emit('error',new Error('Interface wifi unreachable'));await rejected;
  expect(transport.state.connectOptions).toMatchObject({interface:'wifi'});expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('Could not reach'));connection.dispose();
 });
 it('does not allocate a default-network socket for a public endpoint',async()=>{
  const connection=new LocalConnection(callbacks());const bad='synced://'+base64(new TextEncoder().encode(JSON.stringify({version:1,address:'8.8.8.8',port:5000,secret:base64(new Uint8Array(32).fill(8))})));
  await expect(connection.connect(bad)).rejects.toThrow('private');expect(transport.state.connectOptions).toBeNull();connection.dispose();
 });
 it('preserves the bounded native connection timeout on the Wi-Fi interface',async()=>expect(await inspectDial()).toMatchObject({interface:'wifi',connectTimeout:12000}));
});
