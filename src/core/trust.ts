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
