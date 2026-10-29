import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64, encodeFrame } from '../src/core/protocol';
import { BluetoothFrameDecoder, bluetoothRecords } from '../src/core/bluetoothFraming';
import { SecureSession } from '../src/core/session';

const native = vi.hoisted(() => {
  const state = {
    accept: vi.fn(), connect: vi.fn(), cancelAccept: vi.fn(async () => true), enabled: vi.fn(async (): Promise<void> => undefined),
    bonded: vi.fn(async () => [{ address: 'AA:BB:CC:DD:EE:FF', name: 'Phone' }]),
    disconnected: null as null | ((event: { device: { address: string } }) => void),
    disabled: null as null | (() => void), remove: vi.fn(),
  };
  return state;
});
vi.mock('expo-crypto', () => ({ getRandomBytes: (length: number) => new Uint8Array(length).fill(7) }));
vi.mock('../src/core/bluetoothAdapter', () => ({
  requestBluetoothEnable: native.enabled, listBondedDevices: native.bonded, BLUETOOTH_OPTIONS: { delimiter: '' },
  bluetoothAddress: (value: string) => { if (!/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(value)) throw new Error('address'); return value.toUpperCase(); },
}));
vi.mock('react-native-bluetooth-classic', () => ({ default: {
  accept: native.accept, connectToDevice: native.connect, cancelAccept: native.cancelAccept,
  onDeviceDisconnected: (fn: typeof native.disconnected) => { native.disconnected = fn; return { remove: native.remove }; },
  onBluetoothDisabled: (fn: typeof native.disabled) => { native.disabled = fn; return { remove: native.remove }; },
} }));
import { BluetoothConnection, parseBluetoothInvitation } from '../src/core/bluetooth';

const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const peer = () => {
  let receive: ((event: { data: string }) => void) | null = null;
  return {
    address: 'AA:BB:CC:DD:EE:FF', disconnect: vi.fn(async () => true), write: vi.fn(async (_data: string) => true),
    onDataReceived: vi.fn((fn: typeof receive) => { receive = fn; return { remove: native.remove }; }),
    receive: (data: string) => receive?.({ data }),
  };
};
const callbacks = () => ({ onListening: vi.fn(), onConnecting: vi.fn(), onVerified: vi.fn(), onApproved: vi.fn(), onPayload: vi.fn(), onClosed: vi.fn() });
const invitation = `synced-bt://${base64(new Uint8Array(32).fill(7))}`;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); native.enabled.mockResolvedValue(undefined);
  native.bonded.mockResolvedValue([{ address: 'AA:BB:CC:DD:EE:FF', name: 'Phone' }]); });
afterEach(() => { vi.useRealTimers(); });

describe('Bluetooth invitation and connection lifetime', () => {
  it('rejects invalid invitations before opening a native connection', async () => {
    for (const value of ['', 'synced://foo', 'synced-bt://short', `${invitation}x`]) expect(() => parseBluetoothInvitation(value)).toThrow();
    const connection = new BluetoothConnection(callbacks());
    await expect(connection.connect('bad', 'AA:BB:CC:DD:EE:FF')).rejects.toThrow();
    expect(native.connect).not.toHaveBeenCalled();
  });
  it('expires invitations and cancels the native accept', async () => {
    native.accept.mockReturnValue(new Promise(() => undefined));
    const cb = callbacks(); const connection = new BluetoothConnection(cb); await connection.host();
    expect(parseBluetoothInvitation(cb.onListening.mock.calls[0]![0] as string)).toHaveLength(43);
    vi.advanceTimersByTime(600000);
    expect(native.cancelAccept).toHaveBeenCalled(); expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('expired'));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('disconnects an accepted device arriving after local cancellation', async () => {
    const accept = deferred<ReturnType<typeof peer>>(); native.accept.mockReturnValue(accept.promise);
    const cb = callbacks(); const connection = new BluetoothConnection(cb); await connection.host(); connection.close(false);
    const device = peer(); accept.resolve(device); await flush();
    expect(device.disconnect).toHaveBeenCalledOnce(); expect(cb.onConnecting).not.toHaveBeenCalled();
  });
  it('settles cancelled client promises and ignores late connections', async () => {
    const connect = deferred<ReturnType<typeof peer>>(); native.connect.mockReturnValue(connect.promise);
    const cb = callbacks(); const connection = new BluetoothConnection(cb);
    const result = connection.connect(invitation, 'AA:BB:CC:DD:EE:FF'); await flush(); connection.close(false);
    await expect(result).rejects.toThrow('cancelled');
    const device = peer(); connect.resolve(device); await flush();
    expect(device.disconnect).toHaveBeenCalled(); expect(cb.onVerified).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('refuses unbonded targets without opening RFCOMM', async () => {
    native.bonded.mockResolvedValue([]);
    await expect(new BluetoothConnection(callbacks()).connect(invitation, 'AA:BB:CC:DD:EE:FF')).rejects.toThrow('Pair');
    expect(native.connect).not.toHaveBeenCalled();
  });
  it('does not revive a host cancelled during permission request', async () => {
    const enable = deferred<void>(); native.enabled.mockReturnValue(enable.promise);
    const connection = new BluetoothConnection(callbacks()); const result = connection.host(); connection.close(false);
    enable.resolve(); await expect(result).rejects.toThrow('cancelled'); expect(native.accept).not.toHaveBeenCalled();
  });
  it('times out connects and blocks overlapping uncancellable native connectors', async () => {
    native.connect.mockReturnValue(new Promise(() => undefined));
    const cb = callbacks(); const connection = new BluetoothConnection(cb);
    const result = connection.connect(invitation, 'AA:BB:CC:DD:EE:FF'); await flush(); vi.advanceTimersByTime(15000);
    await expect(result).rejects.toThrow('cancelled');
    expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    await expect(connection.host()).rejects.toThrow('finishing'); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('authenticated Bluetooth frames', () => {
  async function hostPeer() {
    const device = peer(); native.accept.mockResolvedValue(device);
    const cb = callbacks(); const connection = new BluetoothConnection(cb); await connection.host(); await flush();
    const decoder = new BluetoothFrameDecoder(); const received: unknown[] = [];
    const remote = new SecureSession('CONTROLLER', parseBluetoothInvitation(cb.onListening.mock.calls[0]![0] as string),
      () => base64(new Uint8Array(32).fill(8)), {
        send: frame => bluetoothRecords(encodeFrame(frame)).forEach(record => device.receive(record)),
        onVerified: vi.fn(), onApproved: vi.fn(), onPayload: value => received.push(value),
      });
    device.write.mockImplementation(async data => { for (const frame of decoder.push(data)) remote.receive(frame); return true; });
    return { device, cb, connection, remote, received };
  }
  it('uses the same authenticated handshake and host approval as LAN', async () => {
    const { connection, remote, cb, received } = await hostPeer(); remote.start(); await flush();
    expect(cb.onVerified).toHaveBeenCalled(); expect(remote.ready).toBe(false);
    connection.approve(); await flush(); expect(remote.ready).toBe(true);
    connection.send({ type: 'input', command: { type: 'back' } }); await flush();
    expect(received).toEqual([{ type: 'input', command: { type: 'back' } }]); connection.close(false);
  });
  it('fails closed on malformed records and removes subscriptions', async () => {
    const { connection, device, cb } = await hostPeer(); device.receive('bad!\n');
    expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('validation'));
    expect(device.disconnect).toHaveBeenCalled(); expect(native.remove).toHaveBeenCalledTimes(3);
    expect(() => connection.send({ type: 'ping' })).toThrow(); expect(vi.getTimerCount()).toBe(0);
  });
  it('ignores stale reads and disconnection callbacks after cleanup', async () => {
    const { connection, device, cb } = await hostPeer(); const disconnected = native.disconnected!;
    connection.close(false); device.receive('bad!\n'); disconnected({ device: { address: device.address } });
    expect(cb.onClosed).not.toHaveBeenCalled();
  });
  it('ignores unrelated disconnects but ends on local radio disable', async () => {
    const { device, cb } = await hostPeer(); native.disconnected!({ device: { address: '11:22:33:44:55:66' } });
    expect(device.disconnect).not.toHaveBeenCalled(); native.disabled!();
    expect(device.disconnect).toHaveBeenCalled(); expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('turned off'));
  });
  it('times out a stalled write and discards queued control frames', async () => {
    const { connection, remote, device, cb } = await hostPeer(); remote.start(); await flush(); connection.approve(); await flush();
    device.write.mockReturnValue(new Promise(() => undefined)); connection.send({ type: 'ping' });
    vi.advanceTimersByTime(5000); expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('write timed out'));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds outgoing queues when a device stops draining', async () => {
    const { connection, remote, device, cb } = await hostPeer(); remote.start(); await flush(); connection.approve(); await flush();
    device.write.mockReturnValue(new Promise(() => undefined));
    const send = () => connection.send({ type: 'input', command: 'x'.repeat(100000) });
    send(); send(); expect(send).toThrow('queue');
    expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('too slow')); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not let partial unauthenticated bytes reset peer liveness', async () => {
    const { connection, remote, device, cb } = await hostPeer(); remote.start(); await flush(); connection.approve(); await flush();
    vi.advanceTimersByTime(20000); device.receive('A'); vi.advanceTimersByTime(10000);
    expect(cb.onClosed).toHaveBeenCalledWith(expect.stringContaining('stopped responding')); expect(vi.getTimerCount()).toBe(0);
  });
});
