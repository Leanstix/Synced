import { validNonce } from './protocol';
import { sanitizeDeviceName, type DeviceIdentity, type SavedPeer } from './trust';
import type { SessionRole } from './session';

export interface PairingCallbacks {
  send(message: unknown): void;
  persist(peer: SavedPeer): Promise<void>;
  rollback(peerId: string): Promise<void>;
  onPeerIdentity?(peer: DeviceIdentity): void;
  onPairingSaved?(peer: SavedPeer): void;
  onPairingError?(message: string): void;
}
/** Runs only over an already approved encrypted channel; both owners must opt in. */
export class TrustExchange {
  private peer: DeviceIdentity | null = null;
  private localConsent = false;
  private remoteConsent = false;
  private phase: 'idle' | 'offered' | 'persisting' | 'await-commit' | 'await-done' | 'await-complete' | 'saved' | 'aborted' | 'closed' = 'idle';
  private record: SavedPeer | null = null;
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly role: SessionRole, private readonly identity: DeviceIdentity, private readonly random: () => string, private readonly callbacks: PairingCallbacks) {}
  start(): void { this.callbacks.send({ type: 'identity', id: this.identity.id, name: this.identity.name }); }
  get peerIdentity(): DeviceIdentity | null { return this.peer ? { ...this.peer } : null; }
  savePairing(): void {
    if (this.phase !== 'idle' || this.localConsent) throw new Error('Pairing consent is unavailable.');
    this.localConsent = true;
    this.callbacks.send({ type: 'save-intent' });
    this.offerIfReady();
  }
  receive(value: unknown): void {
    const m = value as Record<string, unknown> | null;
    if (!m || typeof m.type !== 'string' || this.phase === 'closed' || this.phase === 'aborted') throw new Error('Invalid pairing exchange.');
    if (m.type === 'identity') {
      if (this.peer || !validNonce(m.id) || m.id === this.identity.id || typeof m.name !== 'string' || m.name.length > 256) throw new Error('Invalid peer identity.');
      this.peer = { id: m.id, name: sanitizeDeviceName(m.name) };
      this.callbacks.onPeerIdentity?.({ ...this.peer });
      this.offerIfReady(); return;
    }
    if (m.type === 'save-intent') {
      if (!this.peer || this.remoteConsent || this.phase !== 'idle') throw new Error('Invalid pairing consent.');
      this.remoteConsent = true; this.offerIfReady(); return;
    }
    if (m.type === 'save-abort') { this.abort('Peer could not save the pairing.', false); return; }
    if (!this.peer || !this.localConsent || !this.remoteConsent) throw new Error('Both owners must choose Save pairing.');
    if (m.type === 'save-offer' && this.role === 'CONTROLLER' && this.phase === 'idle' && validNonce(m.secret)) {
      this.record = this.makeRecord(m.secret); this.phase = 'offered'; this.callbacks.send({ type: 'save-accept' }); return;
    }
    if (m.type === 'save-accept' && this.role === 'HOST' && this.phase === 'offered') {
      this.persistThen('await-done', { type: 'save-commit', secret: this.record!.secret }); return;
    }
    if (m.type === 'save-commit' && this.role === 'CONTROLLER' && this.phase === 'offered' && m.secret === this.record?.secret) {
      this.persistThen('await-complete', { type: 'save-done' }); return;
    }
    if (m.type === 'save-done' && this.role === 'HOST' && this.phase === 'await-done') {
      this.phase = 'saved'; this.callbacks.send({ type: 'save-complete' }); this.callbacks.onPairingSaved?.({ ...this.record! }); return;
    }
    if (m.type === 'save-complete' && this.role === 'CONTROLLER' && this.phase === 'await-complete') {
      this.phase = 'saved'; this.callbacks.onPairingSaved?.({ ...this.record! }); return;
    }
    throw new Error('Invalid pairing exchange order.');
  }
  private makeRecord(secret: string): SavedPeer { return { ...this.peer!, secret, role: this.role === 'HOST' ? 'CONTROLLER' : 'HOST', savedAt: Date.now() }; }
  private offerIfReady() {
    if (this.role !== 'HOST' || !this.peer || !this.localConsent || !this.remoteConsent || this.phase !== 'idle') return;
    const secret = this.random();
    if (!validNonce(secret)) throw new Error('Secure pairing key generation failed.');
    this.record = this.makeRecord(secret); this.phase = 'offered'; this.callbacks.send({ type: 'save-offer', secret });
  }
  private persistThen(next: 'await-done' | 'await-complete', message: unknown) {
    this.phase = 'persisting';
    this.pending = this.callbacks.persist({ ...this.record! }).then(async () => {
      if (this.phase === 'closed' || this.phase === 'aborted') { await this.callbacks.rollback(this.record!.id); return; }
      this.phase = next; this.callbacks.send(message);
    }).catch(() => { this.abort('Could not save pairing securely.'); });
  }
  private abort(message: string, notify = true) {
    if (this.phase === 'closed' || this.phase === 'aborted') return;
    this.phase = 'aborted';
    if (this.record) this.pending = this.pending.then(() => this.callbacks.rollback(this.record!.id)).catch(() => { this.report('Could not remove incomplete saved pairing. Forget this peer before reconnecting.'); });
    if (notify) { try { this.callbacks.send({ type: 'save-abort' }); } catch { /* The authenticated channel may already be gone. */ } }
    this.report(message);
  }
  private report(message: string): void { try { this.callbacks.onPairingError?.(message); } catch { /* UI observers cannot interrupt rollback. */ } }
  close(): void {
    if (this.phase === 'closed') return;
    if (this.phase !== 'saved' && this.record) this.pending = this.pending.then(() => this.callbacks.rollback(this.record!.id)).catch(() => { this.report('Could not remove incomplete saved pairing.'); });
    this.phase = 'closed';
  }
  async settled(): Promise<void> {
    let pending: Promise<void>;
    do { pending = this.pending; await pending; } while (pending !== this.pending);
  }
}
