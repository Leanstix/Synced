import type {Transport, VoiceStatus} from '../model/types';

type VoiceInput = {connected: boolean; transport: Transport; supported: boolean; voice: VoiceStatus};

export function voicePresentation({connected, transport, supported, voice}: VoiceInput) {
  const available = connected && transport === 'wifi' && supported;
  if (!available) return {available: false, canRequest: false, canAccept: false, canMute: false, canEnd: false, title: 'Synced voice', detail: !connected ? 'Connect both phones first.' : transport === 'bluetooth' ? 'Synced voice needs local Wi-Fi. Bluetooth connections carry controls only.' : 'Synced voice is unavailable in this build.'};
  const copy: Record<VoiceStatus['phase'], {title: string; detail: string}> = {
    idle: {title: 'Talk while you help.', detail: 'Start a voice link between these two phones. This uses your microphone and needs the other person’s acceptance. Keep Synced open on both phones.'},
    outgoing: {title: 'Waiting for them to accept', detail: 'The other phone must accept before you can talk. You can cancel this request at any time.'},
    incoming: {title: 'A voice request is waiting', detail: 'The connected phone wants to talk. Accepting uses your microphone so they can hear you. You can decline and keep the phone connection.'},
    connecting: {title: 'Connecting your voice link', detail: 'Keep Synced open on both phones. You can end the voice link while it connects.'},
    active: {title: voice.muted ? 'Your microphone is muted' : 'Voice link is active', detail: voice.muted ? 'You can still hear the other phone. Unmute when you are ready to speak.' : 'The other phone can hear you. Mute your microphone or end the voice link at any time.'},
  };
  return {available: true, canRequest: voice.phase === 'idle', canAccept: voice.phase === 'incoming', canMute: voice.phase === 'active', canEnd: voice.phase !== 'idle', ...copy[voice.phase]};
}
