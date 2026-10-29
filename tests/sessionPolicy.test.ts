import { describe, expect, it } from 'vitest';
import { canControl, canGrantControl, canUseVoice, publicDevice, resetSession } from '../src/controller/sessionPolicy';
import { INITIAL_STATE, type SavedDevice } from '../src/model/types';

describe('public saved-device boundary edges', () => {
  const peer = { id: 'peer', name: 'My phone', role: 'HOST' as const, savedAt: 1, secret: 'must never reach UI', endpoint: { address: '192.168.1.2', port: 47631 } };
  it('strips the trust secret even when the input is structurally assignable', () => expect(publicDevice(peer)).not.toHaveProperty('secret'));
  it('strips unknown storage fields, including future credential fields', () => expect(publicDevice({ ...peer, credential: 'hidden' } as SavedDevice)).not.toHaveProperty('credential'));
  it('copies the endpoint so UI edits cannot change secure in-memory records', () => { const p = publicDevice(peer); p.endpoint!.address = '10.0.0.1'; expect(peer.endpoint.address).toBe('192.168.1.2'); });
  it('omits absent endpoint metadata for a Bluetooth-only peer', () => expect(publicDevice({ id: 'b', name: 'Phone', role: 'CONTROLLER', savedAt: 2, bluetoothAddress: 'AA:BB:CC:DD:EE:FF' })).not.toHaveProperty('endpoint'));
  it('does not mutate a frozen trust record', () => expect(() => publicDevice(Object.freeze(peer))).not.toThrow());
  it('projects only address and port from an endpoint with extra properties', () => expect(publicDevice({ ...peer, endpoint: { ...peer.endpoint, secret: 'hidden' } } as SavedDevice).endpoint).toEqual(peer.endpoint));
});

describe('transport control permission edges', () => {
  const state = { status: 'connected' as const, transport: 'wifi' as const, screenSharing: true, controlEnabled: true };
  it('blocks stale grants after disconnection', () => expect(canControl({ ...state, status: 'disconnected' })).toBe(false));
  it('blocks an approval-pending connection even with a stale grant', () => expect(canControl({ ...state, status: 'awaiting-approval' })).toBe(false));
  it('does not infer control from screen sharing alone', () => expect(canControl({ ...state, controlEnabled: false })).toBe(false));
  it('revokes Wi-Fi input as soon as capture stops', () => expect(canControl({ ...state, screenSharing: false })).toBe(false));
  it('permits explicitly granted Bluetooth input without claiming video capture', () => expect(canControl({ ...state, transport: 'bluetooth', screenSharing: false })).toBe(true));
  it('does not infer a Bluetooth control grant from a paired socket', () => expect(canControl({ ...state, transport: 'bluetooth', screenSharing: false, controlEnabled: false })).toBe(false));
});

describe('local host control grant edges', () => {
  const state = { role: 'HOST' as const, status: 'connected' as const, transport: 'wifi' as const, screenSharing: true, accessibilityEnabled: true };
  it('prevents a controller from granting access to the host', () => expect(canGrantControl({ ...state, role: 'CONTROLLER' })).toBe(false));
  it('requires authenticated connection approval before host consent', () => expect(canGrantControl({ ...state, status: 'verifying' })).toBe(false));
  it('requires current Accessibility access even on Bluetooth', () => expect(canGrantControl({ ...state, transport: 'bluetooth', accessibilityEnabled: false })).toBe(false));
  it('requires capture for Wi-Fi control', () => expect(canGrantControl({ ...state, screenSharing: false })).toBe(false));
  it('allows a local Bluetooth-only grant without starting a screen capture', () => expect(canGrantControl({ ...state, transport: 'bluetooth', screenSharing: false })).toBe(true));
  it('prevents idle devices from pre-authorizing the next peer', () => expect(canGrantControl({ ...state, role: 'IDLE' })).toBe(false));
});

describe('voice foreground permission edges', () => {
  it('blocks voice over a Bluetooth control socket', () => expect(canUseVoice({ status: 'connected', transport: 'bluetooth' }, true)).toBe(false));
  it('blocks foreground voice before peer approval', () => expect(canUseVoice({ status: 'awaiting-approval', transport: 'wifi' }, true)).toBe(false));
  it('ends voice when Synced leaves the foreground', () => expect(canUseVoice({ status: 'connected', transport: 'wifi' }, false)).toBe(false));
  it('does not resume voice from a previous session after an error', () => expect(canUseVoice({ status: 'error', transport: 'wifi' }, true)).toBe(false));
  it('does not treat a listening host as an approved voice peer', () => expect(canUseVoice({ status: 'listening', transport: 'wifi' }, true)).toBe(false));
  it('allows eligible Wi-Fi peers to proceed to the separate call consent flow', () => expect(canUseVoice({ status: 'connected', transport: 'wifi' }, true)).toBe(true));
});

describe('session reset privacy edges', () => {
  const active = { ...INITIAL_STATE, role: 'HOST' as const, status: 'connected' as const, invitation: 'secret invitation', pendingPeer: { address: 'peer', comparisonCode: 'code' }, comparisonCode: 'code', controlEnabled: true, screenSharing: true, remoteStreamUrl: 'video', remoteStreamSize: { width: 1, height: 2 }, peerIdentity: { id: 'peer', name: 'Phone' }, pairingState: 'requested' as const, trustReady: true, savedPeers: [{ id: 'peer', name: 'Phone', role: 'HOST' as const, savedAt: 1 }], voice: { phase: 'active' as const, muted: true }, reconnect: { active: true, attempt: 3, maxAttempts: 4 }, bluetooth: { devices: [], loading: true, enabled: true } };
  it('clears invitation and approval code material', () => { const s = resetSession(active); expect([s.invitation, s.pendingPeer, s.comparisonCode]).toEqual([null, null, null]); });
  it('clears all access grants and remote video metadata', () => { const s = resetSession(active); expect([s.screenSharing, s.controlEnabled, s.remoteStreamUrl, s.remoteStreamSize]).toEqual([false, false, null, null]); });
  it('retains secure-store availability and public saved-peer metadata', () => { const s = resetSession(active); expect(s.trustReady).toBe(true); expect(s.savedPeers).toEqual(active.savedPeers); });
  it('cancels reconnection and voice presentation states', () => { const s = resetSession(active); expect(s.reconnect.active).toBe(false); expect(s.voice).toEqual({ phase: 'idle', muted: false }); });
  it('retains a supplied connection error without leaving a connected role', () => { const s = resetSession(active, 'failed'); expect([s.role, s.status, s.error]).toEqual(['IDLE', 'error', 'failed']); });
  it('does not leave a Bluetooth loading spinner active after cancellation', () => expect(resetSession(active).bluetooth.loading).toBe(false));
});
