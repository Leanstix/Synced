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
  trust: { initialize: vi.fn(async (): Promise<void> => undefined), list: vi.fn(), get: vi.fn(), subscribe: vi.fn(), remove: vi.fn(async (id: string): Promise<void> => { void id; }), allowNewPairing: vi.fn() },
  voiceCallbacks: null as ConstructorParameters<typeof import('../src/core/calls').VoiceSession>[0] | null,
  voice: { requestCall: vi.fn(async () => undefined), acceptCall: vi.fn(async () => undefined), rejectCall: vi.fn(), endCall: vi.fn(), setMuted: vi.fn(), handleSignal: vi.fn(async () => undefined) },
  bluetooth: { listBondedDevices: vi.fn(async () => [{ address: 'AA:BB:CC:DD:EE:FF', name: 'phone' }]), requestBluetoothEnable: vi.fn(async () => undefined), requestBluetoothDiscoverable: vi.fn(async () => undefined), openBluetoothPairingSettings: vi.fn(async () => undefined) },
  bt: { host: vi.fn(async () => undefined), connect: vi.fn(async () => undefined), hostTrusted: vi.fn(async () => undefined), connectTrusted: vi.fn(async () => undefined), send: vi.fn(), approve: vi.fn(), dispose: vi.fn(), revokePeer: vi.fn(async (id: string) => { await h.trust.remove(id); }), close: vi.fn(), savePairing: vi.fn() },
  connection: { hostTrusted: vi.fn(async () => undefined), connectTrusted: vi.fn(async () => undefined), savePairing: vi.fn(), host: vi.fn(async () => undefined), connect: vi.fn(async () => undefined), send: vi.fn(), approve: vi.fn(), dispose: vi.fn(), revokePeer: vi.fn(async (id: string) => { await h.trust.remove(id); }), close: vi.fn() },
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
    expect(h.connection.dispose).toHaveBeenCalled(); expect(h.input.dispose).toHaveBeenCalled(); expect(h.media.stop).toHaveBeenCalled();
  });
});

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const saved = (role: 'HOST' | 'CONTROLLER' = 'HOST') => ({ id: 'saved-id', name: 'Saved phone', role, secret: 'NEVER-EXPOSE', savedAt: 12, endpoint: { address: '192.168.1.7', port: 4000 } });
async function savedHook(role: 'HOST' | 'CONTROLLER' = 'HOST') {
  h.peers = [saved(role)]; const hook = useSynced(); await flush(); return hook.actions;
}
async function connectedController(transport: 'wifi' | 'bluetooth' = 'wifi') {
  const { actions } = useSynced(); await flush();
  if (transport === 'wifi') await actions.connect('invitation'); else await actions.connectBluetooth('invitation', 'AA:BB:CC:DD:EE:FF');
  const cb = transport === 'wifi' ? h.connectionCallbacks! : h.btCallbacks!;
  cb.onConnecting('CONTROLLER', 'remote'); cb.onApproved(); return { actions, cb };
}

describe('phase2 hook trust initialization and public state', () => {
  it('publishes only whitelisted metadata after durable initialization', async () => {
    await savedHook(); expect(h.state!.trustReady).toBe(true);
    expect(h.state!.savedPeers[0]).toEqual({ id: 'saved-id', name: 'Saved phone', role: 'HOST', savedAt: 12, endpoint: { address: '192.168.1.7', port: 4000 } });
    expect(JSON.stringify(h.state)).not.toContain('NEVER-EXPOSE'); h.cleanup!();
  });
  it('fails closed when secure storage is unavailable', async () => {
    h.trust.initialize.mockRejectedValueOnce(new Error('locked')); useSynced(); await flush();
    expect(h.state!.trustReady).toBe(false); expect(h.state!.capabilities.persistentPairing).toBe(false); expect(h.state!.error).toBe('locked'); h.cleanup!();
  });
  it('does not publish late secure initialization after unmount', async () => {
    let done!: () => void; h.trust.initialize.mockImplementationOnce(() => new Promise<void>(resolve => { done = resolve; }));
    useSynced(); h.cleanup!(); done(); await flush(); expect(h.state!.trustReady).toBe(false);
  });
  it('preserves saved metadata and trust readiness through disconnect', async () => {
    const actions = await savedHook(); await actions.connect('invitation'); actions.disconnect();
    expect(h.state!.savedPeers).toHaveLength(1); expect(h.state!.trustReady).toBe(true); expect(h.state!.peerIdentity).toBeNull(); h.cleanup!();
  });
  it('subscribes to metadata changes without publishing secrets', async () => {
    useSynced(); await flush(); h.peers = [saved()]; h.trustListener!();
    expect(h.state!.savedPeers).toHaveLength(1); expect(h.state!.savedPeers[0]).not.toHaveProperty('secret'); h.cleanup!();
  });
});

describe('phase2 hook save consent', () => {
  async function available() {
    const pair = await connectedController(); pair.cb.onPeerIdentity!({ id: 'new-peer', name: 'Remote' }); return pair;
  }
  it('requires explicit local consent before requesting mutual save', async () => {
    const { actions } = await available(); const request = actions.savePairing();
    expect(h.connection.savePairing).not.toHaveBeenCalled(); h.allow!(); await request;
    expect(h.connection.savePairing).toHaveBeenCalledOnce(); expect(h.state!.pairingState).toBe('requested'); h.cleanup!();
  });
  it('does not save after disconnect while the consent dialog is open', async () => {
    const { actions } = await available(); const request = actions.savePairing(); actions.disconnect(); h.allow!(); await request;
    expect(h.connection.savePairing).not.toHaveBeenCalled(); h.cleanup!();
  });
  it('does not save a replacement peer using consent for an older peer', async () => {
    const { actions, cb } = await available(); const request = actions.savePairing(); cb.onPeerIdentity!({ id: 'replacement', name: 'Other' }); h.allow!(); await request;
    expect(h.connection.savePairing).not.toHaveBeenCalled(); h.cleanup!();
  });
  it('waits for mutual save completion before displaying saved', async () => {
    const { actions, cb } = await available(); const request = actions.savePairing(); h.allow!(); await request;
    expect(h.state!.pairingState).toBe('requested'); cb.onPairingSaved!({ ...saved(), id: 'new-peer' }); expect(h.state!.pairingState).toBe('saved'); h.cleanup!();
  });
  it('rejects save without an authenticated identity', async () => {
    const { actions } = await connectedController(); await actions.savePairing();
    expect(h.connection.savePairing).not.toHaveBeenCalled(); expect(h.state!.error).toContain('verified peer'); h.cleanup!();
  });
});

describe('phase2 hook forgetting and durable retry', () => {
  it('removes a saved public row after durable deletion', async () => {
    const actions = await savedHook(); await actions.forgetPeer('saved-id'); expect(h.state!.savedPeers).toEqual([]); h.cleanup!();
  });
  it('retains only public retry metadata when secure deletion fails', async () => {
    const actions = await savedHook(); h.trust.remove.mockImplementationOnce(async id => { h.peers = []; h.trustListener!(id); throw new Error('retry Forget'); });
    await actions.forgetPeer('saved-id'); expect(h.state!.savedPeers[0]?.revocationPending).toBe(true); expect(JSON.stringify(h.state)).not.toContain('NEVER-EXPOSE'); expect(h.state!.error).toBe('retry Forget'); h.cleanup!();
  });
  it('allows retrying a blocked row until deletion succeeds', async () => {
    const actions = await savedHook(); h.trust.remove.mockImplementationOnce(async id => { h.peers = []; h.trustListener!(id); throw new Error('retry'); });
    await actions.forgetPeer('saved-id'); await actions.forgetPeer('saved-id'); expect(h.trust.remove).toHaveBeenCalledTimes(2); expect(h.state!.savedPeers).toEqual([]); h.cleanup!();
  });
  it('ends an active session immediately on peer revocation', async () => {
    const actions = await savedHook(); await actions.connect('invitation'); h.connectionCallbacks!.onPeerIdentity!({ id: 'saved-id', name: 'Saved phone' }); h.connectionCallbacks!.onApproved();
    await actions.forgetPeer('saved-id'); expect(h.state!.status).toBe('idle'); expect(h.input.revoke).toHaveBeenCalled(); expect(h.voice.endCall).toHaveBeenCalled(); h.cleanup!();
  });
  it('does not reconnect a revoked pending-delete row', async () => {
    const actions = await savedHook(); h.trust.remove.mockImplementationOnce(async () => { h.peers = []; throw new Error('retry'); });
    await actions.forgetPeer('saved-id'); await actions.reconnectPeer('saved-id'); expect(h.connection.connectTrusted).not.toHaveBeenCalled(); h.cleanup!();
  });
});

describe('phase2 hook explicit trusted reconnect', () => {
  it('never auto-connects or starts a trusted listener on initialization', async () => {
    await savedHook(); expect(h.connection.connectTrusted).not.toHaveBeenCalled(); expect(h.connection.hostTrusted).not.toHaveBeenCalled(); h.cleanup!();
  });
  it('waits for cryptographic approval after native connect resolves', async () => {
    const actions = await savedHook(); let finished = false;
    const request = actions.reconnectPeer('saved-id').then(() => { finished = true; }); await flush();
    expect(h.connection.connectTrusted).toHaveBeenCalledWith('saved-id', undefined); expect(finished).toBe(false); expect(h.state!.reconnect.active).toBe(true);
    h.connectionCallbacks!.onApproved(); await request; expect(finished).toBe(true); expect(h.state!.status).toBe('connected'); expect(h.state!.controlEnabled).toBe(false); expect(h.state!.screenSharing).toBe(false); h.cleanup!();
  });
  it('cancels a pending authenticated attempt without late approval', async () => {
    const actions = await savedHook(); const request = actions.reconnectPeer('saved-id', { retry: true }); await flush();
    const old = h.connectionCallbacks!; actions.cancelReconnect(); await request; old.onApproved();
    expect(h.state!.status).toBe('idle'); expect(h.state!.reconnect.active).toBe(false); h.cleanup!();
  });
  it('does not retry an authentication failure even when retry is selected', async () => {
    const actions = await savedHook(); const request = actions.reconnectPeer('saved-id', { retry: true }); await flush();
    h.connectionCallbacks!.onClosed('Peer authentication proof failed.'); await request;
    expect(h.connection.connectTrusted).toHaveBeenCalledOnce(); expect(h.state!.error).toContain('authentication'); h.cleanup!();
  });
  it('only retries transient network failures when explicitly requested', async () => {
    vi.useFakeTimers(); const actions = await savedHook(); const request = actions.reconnectPeer('saved-id', { retry: true }); await flush();
    h.connectionCallbacks!.onClosed('Network connection lost.'); await flush(); await vi.advanceTimersByTimeAsync(500); await flush();
    expect(h.connection.connectTrusted).toHaveBeenCalledTimes(2); h.connectionCallbacks!.onApproved(); await request; h.cleanup!(); vi.useRealTimers();
  });
  it('starts a saved controller listener only on explicit receive action', async () => {
    const actions = await savedHook('CONTROLLER'); await actions.receiveTrustedPeer('saved-id', { privateAddress: '192.168.1.2', port: 4010 });
    expect(h.connection.hostTrusted).toHaveBeenCalledWith('saved-id', '192.168.1.2', 4010); expect(h.state!.controlEnabled).toBe(false); h.cleanup!();
  });
  it('rejects incorrect saved roles for both trusted operations', async () => {
    const actions = await savedHook('CONTROLLER'); await actions.reconnectPeer('saved-id'); expect(h.connection.connectTrusted).not.toHaveBeenCalled();
    h.peers = [saved('HOST')]; await actions.receiveTrustedPeer('saved-id'); expect(h.connection.hostTrusted).not.toHaveBeenCalled(); h.cleanup!();
  });
});

describe('phase2 hook Bluetooth setup and transport isolation', () => {
  it('lists bonded phones and clears the loading indicator', async () => {
    const { actions } = useSynced(); await actions.refreshBluetoothDevices(); expect(h.state!.bluetooth).toEqual({ devices: [{ address: 'AA:BB:CC:DD:EE:FF', name: 'phone' }], enabled: true, loading: false }); h.cleanup!();
  });
  it('reports a listing permission failure and clears loading', async () => {
    h.bluetooth.listBondedDevices.mockRejectedValueOnce(new Error('Nearby devices denied')); const { actions } = useSynced(); await actions.refreshBluetoothDevices(); expect(h.state!.bluetooth.loading).toBe(false); expect(h.state!.error).toBe('Nearby devices denied'); h.cleanup!();
  });
  it('routes explicit enable discoverability and system settings separately', async () => {
    const { actions } = useSynced(); await actions.enableBluetooth(); await actions.makeBluetoothDiscoverable(); await actions.openBluetoothSettings();
    expect(h.bluetooth.requestBluetoothEnable).toHaveBeenCalledOnce(); expect(h.bluetooth.requestBluetoothDiscoverable).toHaveBeenCalledOnce(); expect(h.bluetooth.openBluetoothPairingSettings).toHaveBeenCalledOnce(); expect(h.state!.bluetooth.enabled).toBe(true); h.cleanup!();
  });
  it('starts Bluetooth host without a Wi-Fi listener or capture', async () => {
    const { actions } = useSynced(); await actions.startBluetoothHost(); h.btCallbacks!.onListening('bt-invite', 'Bluetooth'); h.btCallbacks!.onApproved(); await actions.startScreenSharing();
    expect(h.bt.host).toHaveBeenCalledOnce(); expect(h.connection.host).not.toHaveBeenCalled(); expect(h.media.startHost).not.toHaveBeenCalled(); expect(h.state!.transport).toBe('bluetooth'); h.cleanup!();
  });
  it('connects a selected paired phone and never starts video for it', async () => {
    const { cb } = await connectedController('bluetooth'); expect(h.bt.connect).toHaveBeenCalledWith('invitation', 'AA:BB:CC:DD:EE:FF');
    cb.onPayload({ type: 'media', signal: { type: 'offer' } }); expect(h.media.startController).not.toHaveBeenCalled(); expect(h.media.handleSignal).not.toHaveBeenCalled(); h.cleanup!();
  });
  it('ignores late Wi-Fi approval and permissions after switching to Bluetooth', async () => {
    const { actions, cb } = await connectedController(); await actions.startBluetoothHost(); cb.onApproved(); cb.onPayload({ type: 'permissions', screenSharing: true, controlEnabled: true });
    expect(h.state!.status).toBe('connecting'); expect(h.state!.controlEnabled).toBe(false); expect(h.state!.transport).toBe('bluetooth'); h.cleanup!();
  });
  it('uses Bluetooth trusted listeners and waits for trusted Bluetooth approval', async () => {
    const actions = await savedHook('CONTROLLER'); await actions.receiveTrustedPeer('saved-id', { transport: 'bluetooth' }); expect(h.bt.hostTrusted).toHaveBeenCalledWith('saved-id');
    h.peers = [saved('HOST')]; const pending = actions.reconnectPeer('saved-id', { transport: 'bluetooth', address: 'AA:BB:CC:DD:EE:FF' }); await flush();
    expect(h.bt.connectTrusted).toHaveBeenCalledWith('saved-id', 'AA:BB:CC:DD:EE:FF'); expect(h.state!.reconnect.active).toBe(true); h.btCallbacks!.onApproved(); await pending; expect(h.state!.status).toBe('connected'); h.cleanup!();
  });
});

describe('phase2 hook intercom consent and lifecycle', () => {
  it('permits calls only for approved foreground Wi-Fi sessions', async () => {
    const { actions } = useSynced(); expect(h.voiceCallbacks!.canCall()).toBe(false); await actions.connect('invitation'); expect(h.voiceCallbacks!.canCall()).toBe(false);
    h.connectionCallbacks!.onApproved(); expect(h.voiceCallbacks!.canCall()).toBe(true); expect(h.voice.requestCall).not.toHaveBeenCalled(); h.cleanup!();
  });
  it('routes incoming signals without automatically accepting microphone consent', async () => {
    const { cb, actions } = await connectedController(); cb.onPayload({ type: 'call', signal: { type: 'invite' } });
    expect(h.voice.handleSignal).toHaveBeenCalledWith({ type: 'invite' }); expect(h.voice.acceptCall).not.toHaveBeenCalled(); await actions.acceptVoiceCall(); expect(h.voice.acceptCall).toHaveBeenCalledOnce(); h.cleanup!();
  });
  it('routes independent call request reject hangup and mute controls', async () => {
    const { actions } = await connectedController(); await actions.requestVoiceCall(); actions.rejectVoiceCall(); actions.endVoiceCall(); actions.setVoiceMuted(true);
    expect(h.voice.requestCall).toHaveBeenCalledOnce(); expect(h.voice.rejectCall).toHaveBeenCalledOnce(); expect(h.voice.setMuted).toHaveBeenCalledWith(true); expect(h.voice.endCall).toHaveBeenCalled(); h.cleanup!();
  });
  it('ends audio immediately on background and refuses further incoming signals', async () => {
    const { cb } = await connectedController(); h.voice.endCall.mockClear(); h.appChange!('inactive'); expect(h.voice.endCall).toHaveBeenCalledOnce(); expect(h.voiceCallbacks!.canCall()).toBe(false);
    cb.onPayload({ type: 'call', signal: { type: 'invite' } }); expect(h.voice.handleSignal).not.toHaveBeenCalled(); h.appChange!('active'); expect(h.voiceCallbacks!.canCall()).toBe(true); h.cleanup!();
  });
  it('blocks Bluetooth audio and ignores call signaling on that transport', async () => {
    const { cb } = await connectedController('bluetooth'); expect(h.voiceCallbacks!.canCall()).toBe(false); cb.onPayload({ type: 'call', signal: { type: 'invite' } }); expect(h.voice.handleSignal).not.toHaveBeenCalled(); h.cleanup!();
  });
  it('ends calls on transport switch disconnect and unmount', async () => {
    const { actions } = await connectedController(); h.voice.endCall.mockClear(); await actions.startBluetoothHost(); expect(h.voice.endCall).toHaveBeenCalledOnce();
    actions.disconnect(); expect(h.voice.endCall).toHaveBeenCalledTimes(2); h.cleanup!(); expect(h.voice.endCall).toHaveBeenCalledTimes(3); expect(h.voiceCallbacks!.canCall()).toBe(false);
  });
  it('publishes call state independently of screen and control grants', async () => {
    await connectedController(); h.voiceCallbacks!.onState({ phase: 'incoming', muted: false }); expect(h.state!.voice.phase).toBe('incoming'); expect(h.state!.screenSharing).toBe(false); expect(h.state!.controlEnabled).toBe(false); h.cleanup!();
  });
});

describe('phase2 hook transport-specific control consent', () => {
  async function bluetoothHost() {
    const { actions } = useSynced(); await actions.startBluetoothHost(); h.btCallbacks!.onConnecting('HOST', 'Bluetooth'); h.btCallbacks!.onApproved(); return actions;
  }
  it('requires explicit blind-control approval before granting Bluetooth input', async () => {
    const actions = await bluetoothHost(); const pending = actions.setControlEnabled(true);
    expect(h.input.grant).not.toHaveBeenCalled(); h.allow!(); await pending;
    expect(h.input.setBluetoothControlAllowed).toHaveBeenLastCalledWith(true); expect(h.input.grant).toHaveBeenCalledOnce();
    expect(h.bt.send).toHaveBeenLastCalledWith({ type: 'permissions', screenSharing: false, controlEnabled: true, controlMode: 'bluetooth' }); h.cleanup!();
  });
  it('invalidates Bluetooth control consent when the transport changes', async () => {
    const actions = await bluetoothHost(); const pending = actions.setControlEnabled(true); await actions.startHost(); h.allow!(); await pending;
    expect(h.input.grant).not.toHaveBeenCalled(); expect(h.state!.controlEnabled).toBe(false); h.cleanup!();
  });
  it('clears Bluetooth permission after a failed accessibility grant', async () => {
    const actions = await bluetoothHost(); h.input.grant.mockRejectedValueOnce(new Error('accessibility unavailable')); const pending = actions.setControlEnabled(true); h.allow!(); await pending;
    expect(h.input.setBluetoothControlAllowed).toHaveBeenLastCalledWith(false); expect(h.state!.controlEnabled).toBe(false); expect(h.state!.error).toBe('accessibility unavailable'); h.cleanup!();
  });
  it('rejects Bluetooth-mode permissions over Wi-Fi', async () => {
    const { cb } = await connectedController(); cb.onPayload({ type: 'permissions', screenSharing: true, controlEnabled: true, controlMode: 'bluetooth' });
    expect(h.state!.controlEnabled).toBe(false); expect(h.state!.screenSharing).toBe(false); h.cleanup!();
  });
  it('rejects Wi-Fi-mode permissions over Bluetooth', async () => {
    const { cb } = await connectedController('bluetooth'); cb.onPayload({ type: 'permissions', screenSharing: false, controlEnabled: true, controlMode: 'screen' });
    expect(h.state!.controlEnabled).toBe(false); h.cleanup!();
  });
  it('allows controller input after explicit Bluetooth permission without video', async () => {
    const { cb, actions } = await connectedController('bluetooth'); cb.onPayload({ type: 'permissions', screenSharing: false, controlEnabled: true, controlMode: 'bluetooth' });
    actions.sendInput({ type: 'globalAction', action: 'back' }); expect(h.bt.send).toHaveBeenCalledWith({ type: 'input', command: { type: 'globalAction', action: 'back' } }); expect(h.state!.screenSharing).toBe(false); h.cleanup!();
  });
  it('rejects Wi-Fi input when screen capture is absent despite a remote control flag', async () => {
    const { cb, actions } = await connectedController(); cb.onPayload({ type: 'permissions', screenSharing: false, controlEnabled: true, controlMode: 'screen' }); actions.sendInput({ type: 'tap', x: 0.5, y: 0.5 });
    expect(h.connection.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'input' })); h.cleanup!();
  });
  it('sends immediate grant revocation when Bluetooth control is disabled', async () => {
    const actions = await bluetoothHost(); const pending = actions.setControlEnabled(true); h.allow!(); await pending; await actions.setControlEnabled(false);
    expect(h.bt.send).toHaveBeenLastCalledWith({ type: 'permissions', screenSharing: false, controlEnabled: false, controlMode: 'bluetooth' }); expect(h.input.setBluetoothControlAllowed).toHaveBeenLastCalledWith(false); h.cleanup!();
  });
  it('invalidates an accessibility grant completing after disconnect', async () => {
    const actions = await bluetoothHost(); let done!: () => void; h.input.grant.mockImplementationOnce(() => new Promise<void>(resolve => { done = resolve; }));
    const pending = actions.setControlEnabled(true); h.allow!(); await flush(); actions.disconnect(); done(); await pending;
    expect(h.state!.controlEnabled).toBe(false); expect(h.input.setBluetoothControlAllowed).toHaveBeenLastCalledWith(false); h.cleanup!();
  });
});
