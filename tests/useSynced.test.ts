import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncedState } from '../src/model/types';

type ConnectionCallbacks = ConstructorParameters<typeof import('../src/core/connection').LocalConnection>[0];
type MediaCallbacks = ConstructorParameters<typeof import('../src/core/media').MediaSession>[0];
const h = vi.hoisted(() => ({
  state: null as SyncedState | null,
  cleanup: null as null | (() => void),
  connectionCallbacks: null as ConnectionCallbacks | null,
  mediaCallbacks: null as MediaCallbacks | null,
  allow: null as null | (() => void),
  appChange: null as null | ((next: string) => void),
  btCallbacks: null as ConnectionCallbacks | null,
  peers: [] as Array<{ id: string; name: string; role: 'HOST' | 'CONTROLLER'; secret: string; savedAt: number; endpoint?: { address: string; port: number } }>,
  trustListener: null as null | ((id?: string) => void),
  trust: { initialize: vi.fn(async () => undefined), list: vi.fn(), get: vi.fn(), subscribe: vi.fn(), remove: vi.fn(async () => undefined), allowNewPairing: vi.fn() },
  voiceCallbacks: null as ConstructorParameters<typeof import('../src/core/calls').VoiceSession>[0] | null,
  voice: { requestCall: vi.fn(async () => undefined), acceptCall: vi.fn(async () => undefined), rejectCall: vi.fn(), endCall: vi.fn(), setMuted: vi.fn(), handleSignal: vi.fn(async () => undefined) },
  bluetooth: { listBondedDevices: vi.fn(async () => [{ address: 'AA:BB:CC:DD:EE:FF', name: 'phone' }]), requestBluetoothEnable: vi.fn(async () => undefined), requestBluetoothDiscoverable: vi.fn(async () => undefined), openBluetoothPairingSettings: vi.fn(async () => undefined) },
  bt: { host: vi.fn(async () => undefined), connect: vi.fn(async () => undefined), hostTrusted: vi.fn(async () => undefined), connectTrusted: vi.fn(async () => undefined), send: vi.fn(), approve: vi.fn(), close: vi.fn(), savePairing: vi.fn() },
  connection: { hostTrusted: vi.fn(async () => undefined), connectTrusted: vi.fn(async () => undefined), savePairing: vi.fn(), host: vi.fn(async () => undefined), connect: vi.fn(async () => undefined), send: vi.fn(), approve: vi.fn(), close: vi.fn() },
  input: { setBluetoothControlAllowed: vi.fn(), isAvailable: vi.fn(async () => true), requestService: vi.fn(async () => undefined), grant: vi.fn(async (): Promise<void> => undefined), revoke: vi.fn(), setSharing: vi.fn(), dispose: vi.fn(), execute: vi.fn(async () => undefined) },
  media: { startController: vi.fn(), startHost: vi.fn(async () => undefined), stop: vi.fn(), handleSignal: vi.fn(async () => undefined) },
}));
vi.mock('react', () => ({
  useState: (initial: SyncedState) => { h.state = initial; return [initial, (value: SyncedState) => { h.state = value; }]; },
  useRef: (initial: unknown) => ({ current: initial }),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => () => void) => { h.cleanup = effect(); },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: (_event: string, cb: (next: string) => void) => { h.appChange = cb; return { remove: vi.fn() }; } },
  Alert: { alert: (_title: string, _message: string, buttons: Array<{ onPress: () => void }>) => { h.allow = buttons[1]!.onPress; } },
}));
vi.mock('../src/core/connection', () => ({ LocalConnection: class {
  constructor(callbacks: ConnectionCallbacks) { h.connectionCallbacks = callbacks; return h.connection; }
} }));
vi.mock('../src/core/input', () => ({ InputController: class { constructor() { return h.input; } }, isRemoteInput: () => true }));
vi.mock('../src/core/media', () => ({ MediaSession: class {
  constructor(callbacks: MediaCallbacks) { h.mediaCallbacks = callbacks; return h.media; }
} }));
vi.mock('expo-device', () => ({ deviceName: 'Local phone' }));
vi.mock('../src/core/secureStorage', () => ({ createSecureTrustManager: () => h.trust }));
vi.mock('../src/core/bluetooth', () => ({ BluetoothConnection: class { constructor(callbacks: ConnectionCallbacks) { h.btCallbacks = callbacks; return h.bt; } } }));
vi.mock('../src/core/bluetoothAdapter', () => h.bluetooth);
vi.mock('../src/core/calls', () => ({ requestMicrophonePermission: vi.fn(async () => true), VoiceSession: class { constructor(callbacks: typeof h.voiceCallbacks) { h.voiceCallbacks = callbacks; return h.voice; } } }));
import { useSynced } from '../src/controller/useSynced';

beforeEach(() => {
  vi.clearAllMocks(); h.allow = null; h.peers = [];
  h.trust.initialize.mockResolvedValue(undefined);
  h.trust.list.mockImplementation(() => h.peers);
  h.trust.get.mockImplementation((id: string) => h.peers.find(p => p.id === id));
  h.trust.subscribe.mockImplementation((cb: typeof h.trustListener) => { h.trustListener = cb; return vi.fn(); });
  h.trust.remove.mockImplementation(async id => { h.peers = h.peers.filter(p => p.id !== id); h.trustListener?.(id); });
  h.connection.connectTrusted.mockResolvedValue(undefined);
  h.bluetooth.listBondedDevices.mockResolvedValue([{ address: 'AA:BB:CC:DD:EE:FF', name: 'phone' }]);
  h.input.grant.mockResolvedValue(undefined);
  h.connection.approve.mockImplementation(() => h.connectionCallbacks!.onApproved());
  h.media.startHost.mockImplementation(async () => { h.mediaCallbacks!.onSharingChanged(true); });
});

async function approvedHost() {
  const { actions } = useSynced();
  await actions.startHost();
  h.connectionCallbacks!.onListening('invitation', '192.168.1.2');
  h.connectionCallbacks!.onConnecting('HOST', '192.168.1.3');
  h.connectionCallbacks!.onVerified('123 456', '192.168.1.3');
  expect(h.state!.status).toBe('awaiting-approval');
  actions.approvePeer(); await actions.startScreenSharing();
  return actions;
}

describe('session controller consent and teardown', () => {
  it('invalidates an unanswered control dialog when control is disabled', async () => {
    const actions = await approvedHost();
    const pending = actions.setControlEnabled(true);
    await actions.setControlEnabled(false); h.allow!(); await pending;
    expect(h.input.grant).not.toHaveBeenCalled(); expect(h.state!.controlEnabled).toBe(false);
    h.cleanup!();
  });
  it('invalidates an unanswered control dialog on disconnect', async () => {
    const actions = await approvedHost();
    const pending = actions.setControlEnabled(true);
    actions.disconnect(); h.allow!(); await pending;
    expect(h.input.grant).not.toHaveBeenCalled(); expect(h.state!.role).toBe('IDLE');
    expect(h.media.stop).toHaveBeenCalled(); h.cleanup!();
  });
  it('rechecks consent after a pending accessibility grant, and propagates revocation', async () => {
    const actions = await approvedHost();
    let resolveGrant!: () => void;
    h.input.grant.mockImplementationOnce(() => new Promise<void>(resolve => { resolveGrant = resolve; }));
    const pending = actions.setControlEnabled(true); h.allow!(); await Promise.resolve();
    actions.stopScreenSharing(); resolveGrant(); await pending;
    expect(h.state!.controlEnabled).toBe(false);
    expect(h.connection.send).toHaveBeenCalledWith({ type: 'permissions', screenSharing: false, controlEnabled: false, controlMode: 'screen' });
    expect(h.input.revoke).toHaveBeenCalled(); h.cleanup!();
  });
  it('shares host permission only after local approval and tears down all resources on unmount', async () => {
    const actions = await approvedHost();
    const pending = actions.setControlEnabled(true); h.allow!(); await pending;
    expect(h.state!.controlEnabled).toBe(true);
    expect(h.connection.send).toHaveBeenCalledWith({ type: 'permissions', screenSharing: true, controlEnabled: true, controlMode: 'screen' });
    h.cleanup!();
    expect(h.connection.close).toHaveBeenCalledWith(false); expect(h.input.dispose).toHaveBeenCalled(); expect(h.media.stop).toHaveBeenCalled();
  });
});
