import { TrustExchange, type PairingCallbacks } from './trustExchange';
import type { DeviceIdentity, SavedPeer } from './trust';
import { CipherDirection, deriveSession, validNonce } from './protocol';

export type SessionPayload =
  | { type: 'media'; signal: unknown }
  | { type: 'call'; signal: unknown }
  | { type: 'revoke'; peerId: string }
  | { type: 'input'; command: unknown }
  | { type: 'permissions'; screenSharing: boolean; controlEnabled: boolean }
  | { type: 'ping' }
  | { type: 'pong' };
export type SessionRole = 'HOST' | 'CONTROLLER';
export interface SessionOptions {
  identity?: DeviceIdentity;
  trustedPeer?: Pick<SavedPeer, 'id' | 'secret'>;
  pairing?: Omit<PairingCallbacks, 'send'>;
}
export interface SessionCallbacks {
  send: (frame: unknown) => void;
  onVerified: (comparisonCode: string) => void;
  onApproved: () => void;
  onPayload: (payload: SessionPayload) => void;
}

/** The six digit comparison is a human check, never an encryption key. */
export class SecureSession {
  private incoming: CipherDirection | null = null;
  private outgoing: CipherDirection | null = null;
  private phase: 'hello' | 'challenge' | 'proof' | 'approval' | 'ready' | 'closed';
  private controllerNonce: string;
  private code: string | null = null;
  private exchange: TrustExchange | null = null;
  private started = false;
  constructor(private role: SessionRole, private secret: string, private nonce: () => string, private callbacks: SessionCallbacks, private options: SessionOptions = {}) {
    if (!validNonce(secret) || (options.identity && !validNonce(options.identity.id))) throw new Error('Invalid session key or identity.');
    this.options = { ...options, ...(options.identity ? { identity: { ...options.identity } } : {}), ...(options.trustedPeer ? { trustedPeer: { ...options.trustedPeer } } : {}) };
    if (options.trustedPeer && (!options.identity || !validNonce(options.identity.id) || !validNonce(options.trustedPeer.id) || options.identity.id === options.trustedPeer.id || options.trustedPeer.secret !== secret)) throw new Error('Invalid trusted session.');
    this.phase = role === 'HOST' ? 'hello' : 'challenge';
    this.controllerNonce = role === 'CONTROLLER' ? nonce() : '';
  }
  start(): void {
    if (this.started || this.phase === 'closed') throw new Error('Session already started or closed.');
    this.started = true;
    if (this.role === 'CONTROLLER') this.callbacks.send({ type: 'hello', version: 1, nonce: this.controllerNonce, ...(this.options.trustedPeer ? { mode: 'trusted', from: this.options.identity!.id, to: this.options.trustedPeer.id } : {}) });
  }
  private derive(hostNonce: string): void {
    const keys = deriveSession(this.secret, this.controllerNonce, hostNonce, this.options.trustedPeer ? `trusted:${this.role === 'HOST' ? this.options.identity!.id : this.options.trustedPeer.id}:${this.role === 'CONTROLLER' ? this.options.identity!.id : this.options.trustedPeer.id}` : '');
    this.code = keys.comparisonCode;
    this.outgoing = new CipherDirection(this.role === 'HOST' ? keys.hostKey : keys.controllerKey);
    this.incoming = new CipherDirection(this.role === 'HOST' ? keys.controllerKey : keys.hostKey);
    this.secret = '';
  }
  receive(frame: unknown): void {
    try { this.receiveFrame(frame); } catch (error) { this.close(); throw error; }
  }
  private receiveFrame(frame: unknown): void {
    if (this.phase === 'closed') throw new Error('Session closed.');
    const plain = frame as Record<string, unknown> | null;
    if (this.phase === 'hello') {
      if (!plain || plain.type !== 'hello' || plain.version !== 1 || !validNonce(plain.nonce)) throw new Error('Invalid handshake.');
      if (this.options.trustedPeer ? (plain.mode !== 'trusted' || plain.from !== this.options.trustedPeer.id || plain.to !== this.options.identity!.id) : plain.mode !== undefined) throw new Error('Unknown or mismatched trusted peer.');
      this.controllerNonce = plain.nonce;
      const hostNonce = this.nonce();
      this.derive(hostNonce);
      this.phase = 'proof';
      this.callbacks.send({ type: 'challenge', nonce: hostNonce, proof: this.outgoing!.seal({ type: 'host-proof' }) });
      return;
    }
    if (this.phase === 'challenge') {
      if (!plain || plain.type !== 'challenge' || !validNonce(plain.nonce)) throw new Error('Invalid handshake.');
      this.derive(plain.nonce);
      const proof = this.incoming!.open(plain.proof) as { type?: string } | null;
      if (proof?.type !== 'host-proof') throw new Error('Host authentication failed.');
      this.phase = 'approval';
      this.callbacks.send(this.outgoing!.seal({ type: 'controller-proof' }));
      if (!this.options.trustedPeer) this.callbacks.onVerified(this.code!);
      return;
    }
    const payload = this.incoming!.open(frame) as { type?: string } | null;
    if (!payload || typeof payload.type !== 'string') throw new Error('Invalid message.');
    if (this.phase === 'proof') {
      if (payload.type !== 'controller-proof') throw new Error('Controller authentication failed.');
      this.phase = 'approval';
      if (this.options.trustedPeer) this.approve();
      else this.callbacks.onVerified(this.code!);
      return;
    }
    if (this.phase === 'approval') {
      if (this.role === 'CONTROLLER' && payload.type === 'approved') {
        this.phase = 'ready'; this.becameReady(); return;
      }
      throw new Error('Host approval is required.');
    }
    if (payload.type === 'trust') { if (!this.exchange) throw new Error('Pairing is unavailable.'); this.exchange.receive((payload as { message?: unknown }).message); return; }
    if (!['media', 'call', 'revoke', 'input', 'permissions', 'ping', 'pong'].includes(payload.type)) throw new Error('Unsupported message.');
    if (payload.type === 'ping') { this.send({ type: 'pong' }); return; }
    if (payload.type === 'permissions' && (typeof (payload as { screenSharing?: unknown }).screenSharing !== 'boolean' || typeof (payload as { controlEnabled?: unknown }).controlEnabled !== 'boolean')) throw new Error('Invalid permissions message.');
    if (payload.type === 'revoke' && !validNonce((payload as { peerId?: unknown }).peerId)) throw new Error('Invalid revocation message.');
    this.callbacks.onPayload(payload as SessionPayload);
  }
  approve(): void {
    if (this.role !== 'HOST' || this.phase !== 'approval') throw new Error('No peer waiting for approval.');
    this.phase = 'ready';
    this.callbacks.send(this.outgoing!.seal({ type: 'approved' }));
    this.becameReady();
  }
  private becameReady(): void {
    if (!this.options.trustedPeer && this.options.identity && this.options.pairing) {
      this.exchange = new TrustExchange(this.role, this.options.identity, this.nonce, { ...this.options.pairing, send: message => { if (this.phase === 'ready') this.callbacks.send(this.outgoing!.seal({ type: 'trust', message })); } });
      this.exchange.start();
    }
    this.callbacks.onApproved();
  }
  savePairing(): void { if (this.phase !== 'ready' || !this.exchange) throw new Error('Approve the comparison before saving pairing.'); this.exchange.savePairing(); }
  get peerIdentity(): DeviceIdentity | null { return this.options.trustedPeer ? { id: this.options.trustedPeer.id, name: 'Saved device' } : this.exchange?.peerIdentity ?? null; }
  get trusted(): boolean { return !!this.options.trustedPeer; }
  send(payload: SessionPayload): void {
    if (this.phase !== 'ready') throw new Error('Host approval is required.');
    this.callbacks.send(this.outgoing!.seal(payload));
  }
  close(): void { this.exchange?.close(); this.exchange = null; this.phase = 'closed'; this.incoming = null; this.outgoing = null; this.secret = ''; }
  get ready(): boolean { return this.phase === 'ready'; }
}
