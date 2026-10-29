import type { SavedDevice, SyncedState } from '../model/types';

/** Only public device metadata may reach React state or the saved-device UI. */
export function publicDevice(peer: SavedDevice): SavedDevice {
  return {
    id: peer.id, name: peer.name, role: peer.role, savedAt: peer.savedAt,
    ...(peer.endpoint ? { endpoint: { address: peer.endpoint.address, port: peer.endpoint.port } } : {}),
    ...(peer.bluetoothAddress ? { bluetoothAddress: peer.bluetoothAddress } : {}),
  };
}

export function canControl(state: Pick<SyncedState, 'status' | 'transport' | 'screenSharing' | 'controlEnabled'>): boolean {
  return state.status === 'connected' && state.controlEnabled &&
    (state.transport === 'bluetooth' || state.screenSharing);
}

export function canGrantControl(state: Pick<SyncedState, 'role' | 'status' | 'transport' | 'screenSharing' | 'accessibilityEnabled'>): boolean {
  return state.role === 'HOST' && state.status === 'connected' && state.accessibilityEnabled &&
    (state.transport === 'bluetooth' || state.screenSharing);
}

export function canUseVoice(state: Pick<SyncedState, 'status' | 'transport'>, foreground: boolean): boolean {
  return foreground && state.status === 'connected' && state.transport === 'wifi';
}

/** Grants, screen URLs, invitation material, and partial approvals never survive a session. */
export function resetSession(state: SyncedState, error: string | null = null): SyncedState {
  return {
    ...state,
    role: 'IDLE', status: error ? 'error' : 'idle', invitation: null, localAddress: null,
    remoteAddress: null, pendingPeer: null, comparisonCode: null,
    screenSharing: false, controlEnabled: false, remoteStreamUrl: null, remoteStreamSize: null,
    peerIdentity: null, pairingState: 'unavailable', error,
    reconnect: { active: false, attempt: 0, maxAttempts: 4 }, voice: { phase: 'idle', muted: false },
    bluetooth: { ...state.bluetooth, loading: false },
  };
}
