import { CipherDirection, deriveSession, validNonce } from './protocol';

export type SessionPayload =
  | { type: 'media'; signal: unknown }
  | { type: 'input'; command: unknown }
  | { type: 'permissions'; screenSharing: boolean; controlEnabled: boolean }
  | { type: 'ping' }
  | { type: 'pong' };
export type SessionRole = 'HOST' | 'CONTROLLER';
interface Callbacks {
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
  constructor(private role: SessionRole, private secret: string, private nonce: () => string, private callbacks: Callbacks) {
    this.phase = role === 'HOST' ? 'hello' : 'challenge';
    this.controllerNonce = role === 'CONTROLLER' ? nonce() : '';
  }
  start(): void {
    if (this.role === 'CONTROLLER') this.callbacks.send({ type: 'hello', version: 1, nonce: this.controllerNonce });
  }
  private derive(hostNonce: string): void {
    const keys = deriveSession(this.secret, this.controllerNonce, hostNonce);
    this.code = keys.comparisonCode;
    this.outgoing = new CipherDirection(this.role === 'HOST' ? keys.hostKey : keys.controllerKey);
    this.incoming = new CipherDirection(this.role === 'HOST' ? keys.controllerKey : keys.hostKey);
    this.secret = '';
  }
  receive(frame: unknown): void {
    if (this.phase === 'closed') throw new Error('Session closed.');
    const plain = frame as Record<string, unknown> | null;
    if (this.phase === 'hello') {
      if (!plain || plain.type !== 'hello' || plain.version !== 1 || !validNonce(plain.nonce)) throw new Error('Invalid handshake.');
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
      this.callbacks.onVerified(this.code!);
      return;
    }
    const payload = this.incoming!.open(frame) as { type?: string } | null;
    if (!payload || typeof payload.type !== 'string') throw new Error('Invalid message.');
    if (this.phase === 'proof') {
      if (payload.type !== 'controller-proof') throw new Error('Controller authentication failed.');
      this.phase = 'approval';
      this.callbacks.onVerified(this.code!);
      return;
    }
    if (this.phase === 'approval') {
      if (this.role === 'CONTROLLER' && payload.type === 'approved') {
        this.phase = 'ready'; this.callbacks.onApproved(); return;
      }
      throw new Error('Host approval is required.');
    }
    if (!['media', 'input', 'permissions', 'ping', 'pong'].includes(payload.type)) throw new Error('Unsupported message.');
    if (payload.type === 'ping') { this.send({ type: 'pong' }); return; }
    this.callbacks.onPayload(payload as SessionPayload);
  }
  approve(): void {
    if (this.role !== 'HOST' || this.phase !== 'approval') throw new Error('No peer waiting for approval.');
    this.phase = 'ready';
    this.callbacks.send(this.outgoing!.seal({ type: 'approved' }));
    this.callbacks.onApproved();
  }
  send(payload: SessionPayload): void {
    if (this.phase !== 'ready') throw new Error('Host approval is required.');
    this.callbacks.send(this.outgoing!.seal(payload));
  }
  close(): void { this.phase = 'closed'; this.incoming = null; this.outgoing = null; this.secret = ''; }
  get ready(): boolean { return this.phase === 'ready'; }
}
