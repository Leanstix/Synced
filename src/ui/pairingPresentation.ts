import type {SyncedState, Transport} from '../model/types';
import {deviceDisplayName} from './savedPeerPresentation';

type SaveState = Pick<SyncedState, 'status' | 'trustReady' | 'pairingState' | 'capabilities'>;

export function pairingSavePresentation(state: SaveState) {
  const available = state.status === 'connected' && state.trustReady && state.capabilities.persistentPairing;
  const canSave = available && state.pairingState === 'available';
  if (state.pairingState === 'saved' && available) return {canSave: false, title: 'Pairing saved', detail: 'Both phones agreed to save this pairing. Each new connection still needs approval to share a screen, control touches or use a microphone.'};
  if (state.pairingState === 'requested' && available) return {canSave: false, title: 'Waiting for the other phone', detail: 'Choose “Save pairing” on the other phone too. Both phones must agree before either stores the pairing.'};
  return {canSave, title: 'Keep this phone within reach', detail: available ? 'Choose “Save pairing” on both phones to reconnect later without sending another invitation. This does not grant screen, touch or microphone permission.' : 'Saved pairing is not ready on this phone. You can still use this connection.'};
}

export function reconnectPresentation(active: boolean, attempt: number, maxAttempts: number) {
  const validProgress = Number.isInteger(attempt) && Number.isInteger(maxAttempts) && attempt > 0 && maxAttempts >= attempt;
  return {visible: active, title: validProgress ? `Reconnecting · Attempt ${attempt} of ${maxAttempts}` : 'Reconnecting to your saved phone', detail: 'Keep Synced open on both phones. On the host phone, choose “Receive connection”. You can cancel at any time.'};
}

export function transportAvailable(transport: Transport, capabilities: Pick<SyncedState['capabilities'], 'localNetwork' | 'bluetooth'>): boolean {
  return transport === 'wifi' ? capabilities.localNetwork : capabilities.bluetooth;
}

/** A saved listener has no invitation: guide the peer through its saved-phone row. */
export function connectionWaitingPresentation(state: Pick<SyncedState, 'role' | 'transport' | 'invitation' | 'peerIdentity' | 'pairingState'>) {
  const nearby = state.transport === 'bluetooth';
  if (state.role === 'HOST' && state.invitation) return {
    title: 'Your invitation is ready',
    detail: 'Send this invitation to the other phone. Keep Synced open while it connects.',
  };
  if (state.role === 'HOST' && state.pairingState === 'saved' && state.peerIdentity) return {
    title: `Waiting for ${deviceDisplayName(state.peerIdentity.name)}`,
    detail: nearby
      ? 'On your saved phone, open Synced, choose Bluetooth controls, then choose “Reconnect” for this phone. Keep both phones nearby with Bluetooth on. No new invitation is needed.'
      : 'On your saved phone, open Synced, choose Local Wi-Fi, then choose “Reconnect” for this phone. Enter this phone’s current address and matching port shown below. Keep both phones on the same trusted Wi-Fi. No new invitation is needed.',
  };
  return {
    title: state.role === 'HOST' ? 'Waiting for a connection' : 'Finding the other phone',
    detail: nearby ? 'Keep both phones nearby with Bluetooth on and Synced open.' : 'Keep both phones on the same trusted Wi-Fi, with Synced open.',
  };
}
