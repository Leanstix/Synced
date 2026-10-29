import { Buffer } from 'buffer';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const MAX_FRAME_BYTES = 262144;
const VERSION = 'synced-v1';
const utf8 = (value: string) => new Uint8Array(Buffer.from(value, 'utf8'));
// buffer@6 (used by Hermes) supports base64 but does not support Node's newer
// base64url encoding label. Normalize the alphabet and padding explicitly.
const bytes = (value: string) => {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Buffer.from(standard.padEnd(Math.ceil(standard.length / 4) * 4, '='), 'base64'));
};
export const base64 = (value: Uint8Array) => Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export interface Invitation { version: 1; address: string; port: number; secret: string }
export function isPrivateAddress(address: string): boolean {
  const p = address.split('.').map(Number);
  return p.length === 4 && p.every((n, i) => Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === address.split('.')[i]) &&
    (p[0] === 10 || (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) || (p[0] === 192 && p[1] === 168));
}
export function encodeInvitation(invitation: Invitation): string {
  validateInvitation(invitation);
  return `synced://${base64(utf8(JSON.stringify(invitation)))}`;
}
export function parseInvitation(value: string): Invitation {
  if (value.length > 2048 || !value.startsWith('synced://')) throw new Error('Paste a complete Synced invitation.');
  let invitation: Invitation;
  try { invitation = JSON.parse(Buffer.from(bytes(value.slice(9))).toString('utf8')) as Invitation; }
  catch { throw new Error('This invitation is invalid.'); }
  validateInvitation(invitation);
  return invitation;
}
function validateInvitation(value: Invitation): void {
  if (!value || value.version !== 1 || typeof value.address !== 'string' || !isPrivateAddress(value.address) ||
      !Number.isInteger(value.port) || value.port < 1024 || value.port > 65535 ||
      typeof value.secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.secret) || !validNonce(value.secret)) {
    throw new Error('Invitation must contain a private Wi-Fi address and a strong session key.');
  }
}

export function deriveSession(secret: string, controllerNonce: string, hostNonce: string, context = '') {
  if (!validNonce(secret) || !validNonce(controllerNonce) || !validNonce(hostNonce)) throw new Error('Invalid handshake.');
  const salt = sha256(utf8(`${controllerNonce}:${hostNonce}${context ? `:${context}` : ''}`));
  const hostKey = hkdf(sha256, bytes(secret), salt, utf8(`${VERSION}:host-to-controller`), 32);
  const controllerKey = hkdf(sha256, bytes(secret), salt, utf8(`${VERSION}:controller-to-host`), 32);
  const comparison = hkdf(sha256, bytes(secret), salt, utf8(`${VERSION}:compare`), 4);
  const code = (new DataView(comparison.buffer, comparison.byteOffset, 4).getUint32(0) % 1000000).toString().padStart(6, '0');
  return { hostKey, controllerKey, comparisonCode: `${code.slice(0, 3)} ${code.slice(3)}` };
}
export function validNonce(nonce: unknown): nonce is string {
  return typeof nonce === 'string' && /^[A-Za-z0-9_-]{43}$/.test(nonce) && bytes(nonce).length === 32 && base64(bytes(nonce)) === nonce;
}

export interface EncryptedMessage { type: 'encrypted'; sequence: number; ciphertext: string }
/** One direction per key. In-order TCP transport permits strict replay rejection. */
export class CipherDirection {
  private sequence = 0;
  private destroyed = false;
  constructor(private readonly key: Uint8Array) {
    if (key.length !== 32) throw new Error('Invalid key.');
    this.key = new Uint8Array(key);
  }
  private nonce(sequence: number) {
    const nonce = new Uint8Array(12);
    new DataView(nonce.buffer).setUint32(8, sequence, false);
    return nonce;
  }
  destroy(): void { this.destroyed = true; this.key.fill(0); }
  seal(payload: unknown): EncryptedMessage {
    if (this.destroyed) throw new Error('Cipher is closed.');
    if (this.sequence >= 0xffffffff) throw new Error('Session limit reached. Reconnect.');
    const plaintext = utf8(JSON.stringify(payload));
    if (plaintext.length > MAX_FRAME_BYTES / 2) throw new Error('Message exceeds size limit.');
    const sequence = this.sequence;
    const ciphertext = gcm(this.key, this.nonce(sequence), utf8(`${VERSION}:${sequence}`)).encrypt(plaintext);
    this.sequence++;
    return { type: 'encrypted', sequence, ciphertext: base64(ciphertext) };
  }
  open(message: unknown): unknown {
    if (this.destroyed) throw new Error('Cipher is closed.');
    const envelope = message as Partial<EncryptedMessage> | null;
    if (!envelope || envelope.type !== 'encrypted' || envelope.sequence !== this.sequence ||
        typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > MAX_FRAME_BYTES ||
        !/^[A-Za-z0-9_-]+$/.test(envelope.ciphertext)) throw new Error('Rejected replayed or invalid message.');
    const plaintext = gcm(this.key, this.nonce(this.sequence), utf8(`${VERSION}:${this.sequence}`)).decrypt(bytes(envelope.ciphertext));
    const payload: unknown = JSON.parse(Buffer.from(plaintext).toString('utf8'));
    this.sequence++;
    return payload;
  }
}

export function encodeFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (!body.length || body.length > MAX_FRAME_BYTES) throw new Error('Frame exceeds size limit.');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

/** Incremental bounded framing; never retains an unbounded attacker supplied chunk. */
export class FrameDecoder {
  private pending = Buffer.alloc(0);
  push(chunk: Uint8Array): unknown[] {
    const results: unknown[] = [];
    let offset = 0;
    while (offset < chunk.length) {
      const target = this.pending.length < 4 ? 4 : 4 + this.pending.readUInt32BE(0);
      const take = Math.min(target - this.pending.length, chunk.length - offset);
      this.pending = Buffer.concat([this.pending, Buffer.from(chunk.subarray(offset, offset + take))]);
      offset += take;
      if (this.pending.length < 4) continue;
      const length = this.pending.readUInt32BE(0);
      if (!length || length > MAX_FRAME_BYTES) { this.pending = Buffer.alloc(0); throw new Error('Invalid frame length.'); }
      if (this.pending.length === length + 4) {
        results.push(JSON.parse(this.pending.subarray(4).toString('utf8')) as unknown);
        this.pending = Buffer.alloc(0);
      }
    }
    return results;
  }
}
