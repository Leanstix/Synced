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
  connection: { host: vi.fn(async () => undefined), connect: vi.fn(async () => undefined), send: vi.fn(), approve: vi.fn(), close: vi.fn() },
  input: { isAvailable: vi.fn(async () => true), requestService: vi.fn(async () => undefined), grant: vi.fn(async (): Promise<void> => undefined), revoke: vi.fn(), setSharing: vi.fn(), dispose: vi.fn(), execute: vi.fn(async () => undefined) },
  media: { startController: vi.fn(), startHost: vi.fn(async () => undefined), stop: vi.fn(), handleSignal: vi.fn(async () => undefined) },
}));
vi.mock('react', () => ({
  useState: (initial: SyncedState) => { h.state = initial; return [initial, (value: SyncedState) => { h.state = value; }]; },
  useRef: (initial: unknown) => ({ current: initial }),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => () => void) => { h.cleanup = effect(); },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' }, AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  Alert: { alert: (_title: string, _message: string, buttons: Array<{ onPress: () => void }>) => { h.allow = buttons[1]!.onPress; } },
}));
vi.mock('../src/core/connection', () => ({ LocalConnection: class {
  constructor(callbacks: ConnectionCallbacks) { h.connectionCallbacks = callbacks; return h.connection; }
} }));
vi.mock('../src/core/input', () => ({ InputController: class { constructor() { return h.input; } }, isRemoteInput: () => true }));
vi.mock('../src/core/media', () => ({ MediaSession: class {
  constructor(callbacks: MediaCallbacks) { h.mediaCallbacks = callbacks; return h.media; }
} }));
import { useSynced } from '../src/controller/useSynced';

beforeEach(() => {
  vi.clearAllMocks(); h.allow = null;
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
    expect(h.connection.send).toHaveBeenCalledWith({ type: 'permissions', screenSharing: false, controlEnabled: false });
    expect(h.input.revoke).toHaveBeenCalled(); h.cleanup!();
  });
  it('shares host permission only after local approval and tears down all resources on unmount', async () => {
    const actions = await approvedHost();
    const pending = actions.setControlEnabled(true); h.allow!(); await pending;
    expect(h.state!.controlEnabled).toBe(true);
    expect(h.connection.send).toHaveBeenCalledWith({ type: 'permissions', screenSharing: true, controlEnabled: true });
    h.cleanup!();
    expect(h.connection.close).toHaveBeenCalledWith(false); expect(h.input.dispose).toHaveBeenCalled(); expect(h.media.stop).toHaveBeenCalled();
  });
});
