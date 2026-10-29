import { Dimensions, PixelRatio } from 'react-native';
import {
  MediaStream, RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices,
} from '@livekit/react-native-webrtc';

export type MediaSignal =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'candidate'; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } }
  | { type: 'dimensions'; width: number; height: number };

interface Callbacks {
  send(signal: MediaSignal): void;
  onRemoteStream(url: string, width: number, height: number): void;
  onSharingChanged(active: boolean): void;
  onError(message: string): void;
}

/** Local WebRTC video. Signaling must travel only over an approved encrypted connection. */
export class MediaSession {
  private role: 'host' | 'controller' | null = null;
  private peer: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private remote: MediaStream | null = null;
  private size: { width: number; height: number } | null = null;
  private pendingCandidates: MediaSignal[] = [];
  private generation = 0;
  private sharing = false;
  private starting = false;
  private queue: Promise<void> = Promise.resolve();
  private queuedSignals = 0;
  private queuedSignalBytes = 0;
  private disconnectedTimer: ReturnType<typeof setTimeout> | null = null;
  private displaySubscription: ReturnType<typeof Dimensions.addEventListener> | null = null;

  constructor(private callbacks: Callbacks) {}

  startController(): void {
    this.stop();
    this.role = 'controller';
  }

  async startHost(): Promise<void> {
    if (this.starting || this.sharing) return;
    this.stop();
    this.role = 'host';
    this.starting = true;
    const generation = this.generation;
    let stream: MediaStream | null = null;
    try {
      // The OS dialog is mandatory. The owner must select the entire screen.
      stream = await mediaDevices.getDisplayMedia();
      if (generation !== this.generation) {
        this.release(stream);
        return;
      }
      this.local = stream;
      stream.getAudioTracks().forEach(track => track.stop());
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Screen capture returned no video track.');
      track.addEventListener('ended', () => {
        if (generation === this.generation) this.stop();
      });
      const peer = this.createPeer(generation);
      peer.addTrack(track, stream);
      const screen = Dimensions.get('screen');
      const width = Math.round(screen.width * PixelRatio.get());
      const height = Math.round(screen.height * PixelRatio.get());
      this.callbacks.send({ type: 'dimensions', width, height });
      const offer = await peer.createOffer({});
      if (generation !== this.generation) return;
      await peer.setLocalDescription(offer);
      if (generation !== this.generation) return;
      this.callbacks.send({ type: 'offer', sdp: offer.sdp ?? '' });
      this.sharing = true;
      this.callbacks.onSharingChanged(true);
      this.displaySubscription = Dimensions.addEventListener('change', ({ screen: next }: { screen: { width: number; height: number } }) => {
        if (generation !== this.generation) return;
        if (Math.round(next.width * PixelRatio.get()) !== width || Math.round(next.height * PixelRatio.get()) !== height) {
          this.fail('Display orientation changed. Start screen sharing again to remap touches safely.');
        }
      });
    } catch (error) {
      if (generation === this.generation) {
        this.stop();
        throw error;
      }
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }

  handleSignal(signal: MediaSignal): Promise<void> {
    const generation = this.generation;
    const bytes = (signal?.type === 'offer' || signal?.type === 'answer') && typeof signal.sdp === 'string' ? signal.sdp.length * 2
      : signal?.type === 'candidate' ? ((typeof signal.candidate?.candidate === 'string' ? signal.candidate.candidate.length : 0) + (typeof signal.candidate?.sdpMid === 'string' ? signal.candidate.sdpMid.length : 0)) * 2 : 0;
    if (this.queuedSignals >= 128 || this.queuedSignalBytes + bytes > 524288) {
      const error = new Error('Too many queued media signals.');
      this.fail(error.message);
      return Promise.reject(error);
    }
    this.queuedSignals++; this.queuedSignalBytes += bytes;
    const work = this.queue.then(async () => {
      if (generation !== this.generation || !this.role) return;
      await this.receive(signal, generation);
    }).finally(() => {
      if (generation === this.generation) { this.queuedSignals--; this.queuedSignalBytes -= bytes; }
    });
    this.queue = work.catch(() => undefined);
    return work.catch(error => {
      // A rejected native operation from a stopped session must not tear down
      // the next session through the controller's signaling error handler.
      if (generation === this.generation) throw error;
    });
  }

  stop(): void {
    const wasActive = this.sharing || this.remote !== null;
    this.generation++;
    this.role = null;
    this.starting = false;
    this.sharing = false;
    this.size = null;
    this.pendingCandidates = [];
    // An unresolved native operation belongs to the old peer. New sharing must
    // not wait behind it, and old completions cannot debit the new queue.
    this.queue = Promise.resolve();
    this.queuedSignals = 0; this.queuedSignalBytes = 0;
    this.displaySubscription?.remove();
    this.displaySubscription = null;
    if (this.disconnectedTimer) clearTimeout(this.disconnectedTimer);
    this.disconnectedTimer = null;
    const peer = this.peer;
    this.peer = null;
    peer?.close();
    if (this.local) this.release(this.local);
    if (this.remote) this.release(this.remote);
    this.local = null;
    this.remote = null;
    if (wasActive) this.callbacks.onSharingChanged(false);
  }

  private release(stream: MediaStream): void {
    stream.getTracks().forEach(track => track.stop());
    stream.release();
  }

  private fail(message: string): void {
    this.stop();
    this.callbacks.onError(message);
  }

  private publishRemote(): void {
    if (this.remote && this.size) {
      this.callbacks.onRemoteStream(this.remote.toURL(), this.size.width, this.size.height);
    }
  }

  private createPeer(generation: number): RTCPeerConnection {
    if (this.peer) return this.peer;
    // No public STUN/TURN server or cloud signaling endpoint.
    const peer = new RTCPeerConnection({ iceServers: [] });
    this.peer = peer;
    peer.addEventListener('icecandidate', event => {
      if (generation !== this.generation || !event.candidate) return;
      const candidate = event.candidate.toJSON();
      this.callbacks.send({ type: 'candidate', candidate: {
        candidate: candidate.candidate ?? '', sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex,
      } });
    });
    peer.addEventListener('track', event => {
      if (generation !== this.generation || this.role !== 'controller' || !event.track || event.track.kind !== 'video') return;
      this.remote = event.streams[0] ?? new MediaStream([event.track]);
      event.track.addEventListener('ended', () => { if (generation === this.generation) this.stop(); });
      this.publishRemote();
    });
    peer.addEventListener('connectionstatechange', () => {
      if (generation !== this.generation) return;
      if (peer.connectionState === 'failed') this.fail('Screen connection failed. Reconnect both phones.');
      if (peer.connectionState === 'disconnected' && !this.disconnectedTimer) {
        this.disconnectedTimer = setTimeout(() => {
          if (generation === this.generation) this.fail('Screen connection was lost.');
        }, 10_000);
      } else if (peer.connectionState === 'connected' && this.disconnectedTimer) {
        clearTimeout(this.disconnectedTimer);
        this.disconnectedTimer = null;
      }
    });
    return peer;
  }

  private async receive(signal: MediaSignal, generation: number): Promise<void> {
    if (!signal || typeof signal !== 'object') throw new Error('Invalid media signal.');
    if (signal.type === 'dimensions') {
      if (this.role !== 'controller' || !Number.isInteger(signal.width) || !Number.isInteger(signal.height) || signal.width < 1 || signal.height < 1 || signal.width > 16384 || signal.height > 16384) throw new Error('Invalid display dimensions.');
      this.size = { width: signal.width, height: signal.height };
      this.publishRemote();
      return;
    }
    if (signal.type === 'candidate') {
      const value = signal.candidate;
      if (!value || typeof value.candidate !== 'string' || value.candidate.length > 4096 || (value.sdpMid != null && (typeof value.sdpMid !== 'string' || value.sdpMid.length > 256)) || (value.sdpMLineIndex != null && (!Number.isInteger(value.sdpMLineIndex) || value.sdpMLineIndex < 0 || value.sdpMLineIndex > 64))) throw new Error('Invalid ICE candidate.');
      if (!this.peer?.remoteDescription) {
        if (this.pendingCandidates.length >= 128) throw new Error('Too many queued ICE candidates.');
        this.pendingCandidates.push(signal);
      } else {
        await this.peer.addIceCandidate(new RTCIceCandidate(value));
      }
      return;
    }
    if ((signal.type !== 'offer' && signal.type !== 'answer') || typeof signal.sdp !== 'string' || !signal.sdp || signal.sdp.length > 128_000) throw new Error('Invalid session description.');
    if ((signal.type === 'offer' && this.role !== 'controller') || (signal.type === 'answer' && this.role !== 'host')) throw new Error('Unexpected session description.');
    const peer = this.createPeer(generation);
    await peer.setRemoteDescription(new RTCSessionDescription({ type: signal.type, sdp: signal.sdp }));
    if (generation !== this.generation) return;
    const candidates = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of candidates) {
      if (generation !== this.generation) return;
      if (candidate.type === 'candidate') await peer.addIceCandidate(new RTCIceCandidate(candidate.candidate));
    }
    if (signal.type === 'offer') {
      const answer = await peer.createAnswer();
      if (generation !== this.generation) return;
      await peer.setLocalDescription(answer);
      if (generation === this.generation) this.callbacks.send({ type: 'answer', sdp: answer.sdp ?? '' });
    }
  }
}
