import type {SyncedState, Transport} from '../model/types';

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
