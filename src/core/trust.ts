import { base64, isPrivateAddress, validNonce } from './protocol';

export const TRUST_VERSION = 1;
export const MAX_SAVED_PEERS = 64;
export interface DeviceIdentity { id: string; name: string }
export interface PeerEndpoint { address: string; port: number }
export interface SavedPeer extends DeviceIdentity {
  secret: string;
  role: 'HOST' | 'CONTROLLER';
  endpoint?: PeerEndpoint;
  savedAt: number;
}
export interface TrustDocument { version: 1; identity: DeviceIdentity; peers: SavedPeer[] }
export interface TrustStorage { read(): Promise<string | null>; write(value: string): Promise<void> }
export function sanitizeDeviceName(value: unknown): string {
  if (typeof value !== 'string') return 'Synced device';
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 80) || 'Synced device';
}
export function validEndpoint(value: unknown): value is PeerEndpoint {
  const e = value as Partial<PeerEndpoint> | null;
  return !!e && typeof e.address === 'string' && isPrivateAddress(e.address) && Number.isInteger(e.port) && e.port! >= 1024 && e.port! <= 65535;
}
export function parseTrustDocument(raw: string): TrustDocument {
  if (raw.length > 65536) throw new Error('Saved pairing data exceeds size limit.');
  const d = JSON.parse(raw) as Partial<TrustDocument> | null;
  if (!d || d.version !== TRUST_VERSION || !d.identity || !validNonce(d.identity.id) || typeof d.identity.name !== 'string' || !Array.isArray(d.peers) || d.peers.length > MAX_SAVED_PEERS) throw new Error('Invalid saved pairing data.');
  const seen = new Set<string>([d.identity.id]);
  const peers = d.peers.map((peer: SavedPeer): SavedPeer => {
    if (!peer || !validNonce(peer.id) || seen.has(peer.id) || !validNonce(peer.secret) || typeof peer.name !== 'string' || !['HOST', 'CONTROLLER'].includes(peer.role) || !Number.isSafeInteger(peer.savedAt) || peer.savedAt < 0 || (peer.endpoint !== undefined && !validEndpoint(peer.endpoint))) throw new Error('Invalid saved peer.');
    seen.add(peer.id);
    return { id: peer.id, name: sanitizeDeviceName(peer.name), secret: peer.secret, role: peer.role, savedAt: peer.savedAt, ...(peer.endpoint ? { endpoint: { ...peer.endpoint } } : {}) };
  });
  return { version: 1, identity: { id: d.identity.id, name: sanitizeDeviceName(d.identity.name) }, peers };
}

/** One serialized secure document; never persists invitation/session secrets. */
export class TrustManager {
  private document: TrustDocument | null = null;
  private loading: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private listeners = new Set<(revokedPeerId?: string) => void>();
  private revoked = new Set<string>();
  constructor(private readonly storage: TrustStorage, private readonly randomBytes: (length: number) => Uint8Array, private readonly deviceName = 'Synced device') {}
  initialize(): Promise<void> {
    if (this.document) return Promise.resolve();
    if (!this.loading) this.loading = this.load().finally(() => { this.loading = null; });
    return this.loading;
  }
  private async load(): Promise<void> {
    const raw = await this.storage.read();
    if (raw !== null) { this.document = parseTrustDocument(raw); return; }
    const random = this.randomBytes(32);
    if (random.length !== 32) throw new Error('Secure random identity generation failed.');
    const document: TrustDocument = { version: 1, identity: { id: base64(random), name: sanitizeDeviceName(this.deviceName) }, peers: [] };
    await this.storage.write(JSON.stringify(document));
    this.document = document;
  }
  get identity(): DeviceIdentity { if (!this.document) throw new Error('Initialize saved pairings first.'); return { ...this.document.identity }; }
  list(): SavedPeer[] { return this.document?.peers.filter(p => !this.revoked.has(p.id)).map(p => ({ ...p, ...(p.endpoint ? { endpoint: { ...p.endpoint } } : {}) })) ?? []; }
  get(peerId: string): SavedPeer | undefined { return this.list().find(p => p.id === peerId); }
  subscribe(listener: (revokedPeerId?: string) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify(revokedPeerId?: string) { for (const listener of this.listeners) { try { listener(revokedPeerId); } catch { /* Observers cannot roll back a secure write. */ } } }
  private enqueue(change: (current: TrustDocument) => TrustDocument): Promise<void> {
    const result = this.writes.then(async () => {
      await this.initialize();
      const next = parseTrustDocument(JSON.stringify(change(this.document!)));
      await this.storage.write(JSON.stringify(next));
      this.document = next;
      this.notify();
    });
    this.writes = result.catch(() => {});
    return result;
  }
  save(peer: SavedPeer): Promise<void> {
    return this.enqueue(current => {
      if (this.revoked.has(peer.id)) throw new Error('This peer was revoked. Pair again in a new session.');
      const peers = current.peers.filter(p => p.id !== peer.id);
      return { ...current, peers: [...peers, peer] };
    });
  }
  updateEndpoint(peerId: string, endpoint: PeerEndpoint): Promise<void> {
    if (!validEndpoint(endpoint)) return Promise.reject(new Error('Enter a private IPv4 address and port.'));
    return this.enqueue(current => {
      if (!this.get(peerId)) throw new Error('Saved peer is unavailable.');
      return { ...current, peers: current.peers.map(p => p.id === peerId ? { ...p, endpoint: { ...endpoint } } : p) };
    });
  }
  remove(peerId: string): Promise<void> {
    this.revoked.add(peerId);
    this.notify(peerId);
    return this.enqueue(current => ({ ...current, peers: current.peers.filter(p => p.id !== peerId) }));
  }
  /** Explicit new-session consent permits a previously revoked identity to pair again. */
  allowNewPairing(peerId: string): void { this.revoked.delete(peerId); }
}
