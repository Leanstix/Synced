import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
