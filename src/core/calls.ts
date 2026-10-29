import { PermissionsAndroid, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Crypto from 'expo-crypto';
import { MediaStream, RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices } from '@livekit/react-native-webrtc';
import { base64, validNonce } from './protocol';

/** Ordinary dialer UI only. The phone owner still presses the call button. */
export function dialerUri(number: string): string {
  if (typeof number !== 'string' || number.length > 64 || !/^\+?[0-9 ()-]+$/.test(number)) throw new Error('Enter a phone number using digits and an optional leading +.');
  const normalized = number.replace(/[ ()-]/g, '');
  if (!/^\+?[0-9]{2,20}$/.test(normalized)) throw new Error('Enter a phone number with 2 to 20 digits.');
  return `tel:${normalized}`;
}

export async function openDialer(number: string): Promise<void> {
  const data = dialerUri(number);
  if (Platform.OS !== 'android') throw new Error('Opening the remote dialer requires Android.');
  await IntentLauncher.startActivityAsync('android.intent.action.DIAL', { data });
}

export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 23) return true;
  return await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO) === PermissionsAndroid.RESULTS.GRANTED;
}

export type VoicePhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';
export interface VoiceState { phase: VoicePhase; muted: boolean }
export type CallSignal =
  | { type: 'invite' | 'accept' | 'reject' | 'end'; callId: string }
  | { type: 'offer' | 'answer'; callId: string; sdp: string }
  | { type: 'candidate'; callId: string; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

interface VoiceCallbacks {
  send(signal: CallSignal): void;
  onState(state: VoiceState): void;
  onError(message: string): void;
  requestMicrophonePermission(): Promise<boolean>;
  /** Approved foreground Wi-Fi session only; Bluetooth has no IP audio path. */
  canCall(): boolean;
}

export function validateCallSignal(value: unknown): CallSignal {
  if (!value || typeof value !== 'object') throw new Error('Invalid intercom signal.');
  const signal = value as Partial<CallSignal>;
  if (!validNonce(signal.callId)) throw new Error('Invalid intercom call ID.');
  if (['invite', 'accept', 'reject', 'end'].includes(signal.type ?? '')) return signal as CallSignal;
  if (signal.type === 'offer' || signal.type === 'answer') {
    if (typeof signal.sdp !== 'string' || !signal.sdp.length || signal.sdp.length > 128000) throw new Error('Invalid intercom description.');
    return signal as CallSignal;
  }
  if (signal.type === 'candidate') {
    const candidate = signal.candidate;
    if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096 ||
      (candidate.sdpMid != null && (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 256)) ||
      (candidate.sdpMLineIndex != null && (!Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0 || candidate.sdpMLineIndex > 64))) {
      throw new Error('Invalid intercom candidate.');
    }
    return signal as CallSignal;
  }
  throw new Error('Unsupported intercom signal.');
}

/** Two-way local WebRTC intercom, independent of cellular calls and screen capture. */
export class VoiceSession {
  private state: VoiceState = { phase: 'idle', muted: false };
  private callId: string | null = null;
  private caller = false;
  private generation = 0;
  private permissionGeneration: number | null = null;
  private peer: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private remote: MediaStream | null = null;
  private pendingCandidates: Extract<CallSignal, { type: 'candidate' }>[] = [];
  private queue: Promise<void> = Promise.resolve();
  private queuedSignals = 0;
  private queuedSignalBytes = 0;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private disconnectedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly callbacks: VoiceCallbacks) {}

  /** No microphone exists while the owner's OS permission decision is pending. */
  get awaitingMicrophonePermission(): boolean { return this.permissionGeneration === this.generation; }

  async requestCall(): Promise<void> {
    if (!this.callbacks.canCall()) throw new Error('Intercom requires an approved foreground Wi-Fi session.');
    if (this.state.phase !== 'idle') throw new Error('An intercom call is already in progress.');
    const generation = this.generation;
    this.callId = base64(Crypto.getRandomBytes(32));
    this.caller = true;
    this.publish('outgoing');
    if (generation !== this.generation) return;
    this.setDeadline(30000, 'Intercom invitation was not answered.');
    try { this.callbacks.send({ type: 'invite', callId: this.callId }); }
    catch (error) { this.stop(); throw error; }
  }

  async acceptCall(): Promise<void> {
    if (this.state.phase !== 'incoming' || !this.callId) throw new Error('No incoming intercom call to accept.');
    if (!this.callbacks.canCall()) { this.stop(); throw new Error('Intercom requires an approved foreground Wi-Fi session.'); }
    const generation = this.generation;
    this.publish('connecting');
    if (generation !== this.generation) return;
    this.setDeadline(30000, 'Intercom connection timed out.');
    try {
      if (!await this.capture(generation)) return;
      this.callbacks.send({ type: 'accept', callId: this.callId! });
    } catch (error) {
      if (generation === this.generation) this.fail(error instanceof Error ? error.message : 'Could not start the microphone.');
      throw error;
    }
  }

  rejectCall(): void {
    if (this.state.phase !== 'incoming') return;
    this.finish('reject');
  }
  endCall(): void { this.finish('end'); }
  setMuted(muted: boolean): void {
    if (typeof muted !== 'boolean') throw new Error('Invalid microphone mute state.');
    this.state = { ...this.state, muted };
    this.local?.getAudioTracks().forEach(track => { track.enabled = !muted; });
    this.callbacks.onState({ ...this.state });
  }

  handleSignal(value: unknown): Promise<void> {
    // Termination must preempt a pending OS permission or WebRTC promise.
    // Otherwise a remote hangup could be stuck behind microphone acquisition.
    let signal: CallSignal;
    try { signal = validateCallSignal(value); }
    catch (error) { return Promise.reject(error); }
    if ((signal.type === 'end' || signal.type === 'reject') && signal.callId === this.callId) {
      this.stop();
      return Promise.resolve();
    }
    const generation = this.generation;
    const bytes = signal.type === 'offer' || signal.type === 'answer' ? signal.sdp.length * 2 : signal.type === 'candidate' ? (signal.candidate.candidate.length + (signal.candidate.sdpMid?.length ?? 0)) * 2 : 0;
    if (this.queuedSignals >= 128 || this.queuedSignalBytes + bytes > 524288) {
      const error = new Error('Too many queued intercom signals.');
      this.fail(error.message);
      return Promise.reject(error);
    }
    this.queuedSignals++; this.queuedSignalBytes += bytes;
    const work = this.queue.then(async () => {
      if (generation !== this.generation) return;
      if (!this.callbacks.canCall()) { this.stop(); return; }
      await this.receive(signal, generation);
    }).finally(() => {
      if (generation === this.generation) { this.queuedSignals--; this.queuedSignalBytes -= bytes; }
    });
    this.queue = work.catch(() => undefined);
    return work.catch(error => {
      if (generation === this.generation) this.fail(error instanceof Error ? error.message : 'Intercom signaling failed.');
      throw error;
    });
  }

  private async capture(generation: number): Promise<boolean> {
    if (generation !== this.generation) return false;
    if (!this.callbacks.canCall()) throw new Error('Intercom session is no longer available.');
    this.permissionGeneration = generation;
    let allowed: boolean;
    try { allowed = await this.callbacks.requestMicrophonePermission(); }
    catch (error) { if (generation !== this.generation) return false; throw error; }
    finally { if (this.permissionGeneration === generation) this.permissionGeneration = null; }
    if (generation !== this.generation) return false;
    if (!allowed) throw new Error('Microphone permission was declined.');
    if (!this.callbacks.canCall()) throw new Error('Intercom session is no longer available.');
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    if (generation !== this.generation) { this.release(stream); return false; }
    if (!this.callbacks.canCall()) { this.release(stream); throw new Error('Intercom session is no longer available.'); }
    stream.getVideoTracks().forEach(track => track.stop());
    const tracks = stream.getAudioTracks();
    if (!tracks.length) { this.release(stream); throw new Error('No microphone track was returned.'); }
    this.local = stream;
    const peer = this.createPeer(generation);
    for (const track of tracks) {
      track.enabled = !this.state.muted;
      track.addEventListener('ended', () => { if (generation === this.generation) this.fail('Microphone stopped.'); });
      peer.addTrack(track, stream);
    }
    return true;
  }

  private createPeer(generation: number): RTCPeerConnection {
    if (this.peer) return this.peer;
    const peer = new RTCPeerConnection({ iceServers: [] });
    this.peer = peer;
    peer.addEventListener('icecandidate', event => {
      if (generation !== this.generation || !this.callId || !event.candidate) return;
      try { this.callbacks.send({ type: 'candidate', callId: this.callId, candidate: event.candidate.toJSON() }); }
      catch { this.fail('Could not send intercom signaling.'); }
    });
    peer.addEventListener('track', event => {
      if (!event.track) return;
      if (generation !== this.generation || event.track.kind !== 'audio') { event.track.stop(); return; }
      if (this.remote) { event.track.stop(); return; }
      this.remote = event.streams[0] ?? new MediaStream([event.track]);
      event.track.addEventListener('ended', () => { if (generation === this.generation) this.fail('Remote microphone stopped.'); });
    });
    peer.addEventListener('connectionstatechange', () => {
      if (generation !== this.generation) return;
      if (peer.connectionState === 'connected') {
        this.clearDeadline();
        if (this.disconnectedTimer) clearTimeout(this.disconnectedTimer);
        this.disconnectedTimer = null;
        this.publish('active');
      } else if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
        this.fail('Intercom audio connection ended.');
      } else if (peer.connectionState === 'disconnected' && !this.disconnectedTimer) {
        this.disconnectedTimer = setTimeout(() => { if (generation === this.generation) this.fail('Intercom connection was lost.'); }, 10000);
      }
    });
    return peer;
  }

  private async receive(signal: CallSignal, generation: number): Promise<void> {
    if (signal.type === 'invite') {
      if (this.callId === signal.callId) return;
      if (this.state.phase !== 'idle') { this.callbacks.send({ type: 'reject', callId: signal.callId }); return; }
      this.callId = signal.callId; this.caller = false;
      this.publish('incoming'); this.setDeadline(30000, 'Incoming intercom invitation expired.'); return;
    }
    if (signal.callId !== this.callId) return;
    if (signal.type === 'reject' || signal.type === 'end') { this.stop(); return; }
    if (signal.type === 'accept') {
      if (!this.caller || this.state.phase !== 'outgoing') return;
      this.publish('connecting');
      if (generation !== this.generation) return;
      this.setDeadline(30000, 'Intercom connection timed out.');
      if (!await this.capture(generation)) return;
      const peer = this.peer!;
      const offer = await peer.createOffer({});
      if (generation !== this.generation) return;
      await peer.setLocalDescription(offer);
      if (generation === this.generation) this.callbacks.send({ type: 'offer', callId: this.callId!, sdp: offer.sdp ?? '' });
      return;
    }
    if (this.state.phase !== 'connecting' && this.state.phase !== 'active') throw new Error('Accept the intercom invitation first.');
    if (signal.type === 'candidate') {
      if (!this.peer?.remoteDescription) {
        if (this.pendingCandidates.length >= 128) throw new Error('Too many queued intercom candidates.');
        this.pendingCandidates.push(signal);
      } else await this.peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
      return;
    }
    if ((signal.type === 'offer' && this.caller) || (signal.type === 'answer' && !this.caller) || !this.peer || !this.local) throw new Error('Unexpected intercom description.');
    if (signal.type !== 'offer' && signal.type !== 'answer') throw new Error('Unexpected intercom signal.');
    const peer = this.peer;
    await peer.setRemoteDescription(new RTCSessionDescription({ type: signal.type, sdp: signal.sdp }));
    if (generation !== this.generation) return;
    const candidates = this.pendingCandidates; this.pendingCandidates = [];
    for (const candidate of candidates) {
      if (generation !== this.generation) return;
      await peer.addIceCandidate(new RTCIceCandidate(candidate.candidate));
    }
    if (signal.type === 'offer') {
      const answer = await peer.createAnswer();
      if (generation !== this.generation) return;
      await peer.setLocalDescription(answer);
      if (generation === this.generation) this.callbacks.send({ type: 'answer', callId: this.callId!, sdp: answer.sdp ?? '' });
    }
  }

  private publish(phase: VoicePhase): void { this.state = { ...this.state, phase }; this.callbacks.onState({ ...this.state }); }
  private clearDeadline(): void { if (this.deadline) clearTimeout(this.deadline); this.deadline = null; }
  private setDeadline(ms: number, message: string): void {
    this.clearDeadline(); const generation = this.generation;
    this.deadline = setTimeout(() => { if (generation === this.generation) this.fail(message); }, ms);
  }
  private release(stream: MediaStream): void { stream.getTracks().forEach(track => track.stop()); stream.release(); }
  private finish(type: 'end' | 'reject'): void {
    const callId = this.callId; this.stop();
    if (callId && this.callbacks.canCall()) { try { this.callbacks.send({ type, callId }); } catch { /* Local capture is already stopped. */ } }
  }
  private fail(message: string): void { this.finish('end'); this.callbacks.onError(message); }
  private stop(): void {
    this.generation++; this.permissionGeneration = null; this.clearDeadline();
    if (this.disconnectedTimer) clearTimeout(this.disconnectedTimer);
    this.disconnectedTimer = null;
    const peer = this.peer; this.peer = null; peer?.close();
    const local = this.local; this.local = null; if (local) this.release(local);
    const remote = this.remote; this.remote = null; if (remote) this.release(remote);
    this.pendingCandidates = []; this.callId = null; this.caller = false;
    // A stale OS permission promise must not block invitations for a later call.
    this.queue = Promise.resolve();
    this.queuedSignals = 0; this.queuedSignalBytes = 0;
    this.state = { phase: 'idle', muted: false }; this.callbacks.onState({ ...this.state });
  }
}
