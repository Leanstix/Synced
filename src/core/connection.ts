import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';
import { base64, encodeFrame, encodeInvitation, FrameDecoder, isPrivateAddress, parseInvitation } from './protocol';
import { SecureSession, type SessionOptions, type SessionPayload, type SessionRole } from './session';

import { TrustManager, validEndpoint, type DeviceIdentity, type PeerEndpoint, type SavedPeer } from './trust';

type Socket = ReturnType<typeof TcpSocket.createConnection>;
type Server = ReturnType<typeof TcpSocket.createServer>;
export interface ConnectionCallbacks {
  onListening: (invitation: string, address: string) => void;
  onConnecting: (role: SessionRole, address: string) => void;
  onVerified: (code: string, address: string) => void;
  onApproved: () => void;
  onPayload: (payload: SessionPayload) => void;
  onClosed: (error?: string) => void;
  onTrustedListening?: (address: string, port: number, peer: SavedPeer) => void;
  onPeerIdentity?: (peer: DeviceIdentity) => void;
  onPairingSaved?: (peer: SavedPeer) => void;
  onPairingError?: (message: string) => void;
}
const nonce = () => base64(Crypto.getRandomBytes(32));

/** Ephemeral LAN only. Every disconnect invalidates the invitation and all grants. */
export class LocalConnection {
  private server: Server | null = null;
  private socket: Socket | null = null;
  private session: SecureSession | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private invitationTimer: ReturnType<typeof setTimeout> | null = null;
  private lastReceived = 0;
  private generation = 0;
  private closing = false;
  private pendingReject: ((error: Error) => void) | null = null;
  private endpoint: PeerEndpoint | undefined;
  private activePeerId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  constructor(private callbacks: ConnectionCallbacks, private readonly trust?: TrustManager) {
    this.unsubscribe = trust?.subscribe(revokedId => { if (revokedId && revokedId === this.activePeerId) this.fail('Saved peer revoked. All sharing and control stopped.'); }) ?? null;
  }

  async host(privateAddress?: string): Promise<void> { return this.listen(undefined, privateAddress); }
  async hostTrusted(peerId: string, privateAddress?: string, port?: number): Promise<void> { return this.listen(peerId, privateAddress, port); }
  private async listen(peerId?: string, privateAddress?: string, port?: number): Promise<void> {
    this.close(false);
    const generation = this.generation;
    if (this.trust) await this.trust.initialize();
    if (generation !== this.generation) throw new Error('Connection cancelled.');
    const peer = peerId ? this.trust?.get(peerId) : undefined;
    if (peerId && (!peer || peer.role !== 'CONTROLLER')) throw new Error('Saved controller is unavailable or revoked.');
    const address = privateAddress?.trim() || await Network.getIpAddressAsync();
    if (!isPrivateAddress(address)) throw new Error('Connect to Wi-Fi or enter this phone’s private hotspot IPv4 address.');
    if (generation !== this.generation) throw new Error('Connection cancelled.');
    const listenPort = port ?? peer?.endpoint?.port ?? 0;
    if (listenPort !== 0 && (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535)) throw new Error('Invalid trusted listening port.');
    let secret = peer?.secret ?? nonce();
    this.activePeerId = peer?.id ?? null;
    await new Promise<void>((resolve, reject) => {
      if (generation !== this.generation) { reject(new Error('Connection cancelled.')); return; }
      this.pendingReject = reject;
      const server = TcpSocket.createServer(socket => {
        if (this.socket || generation !== this.generation) { socket.destroy(); return; }
        if (this.invitationTimer) clearTimeout(this.invitationTimer);
        this.invitationTimer = null;
        // An invitation admits exactly one transport attempt. Server.close keeps
        // this accepted socket alive while refusing any subsequent peer.
        server.close(); this.server = null;
        const remote = socket.remoteAddress ?? 'Local peer';
        this.attach(socket, 'HOST', secret, remote, peer);
        secret = '';
      });
      this.server = server;
      server.on('error', error => {
        if (this.pendingReject === reject) this.pendingReject = null;
        reject(error);
        if (generation === this.generation) this.fail('Could not listen on this Wi-Fi network.');
      });
      server.listen({ port: listenPort, host: '0.0.0.0' }, () => {
        if (generation !== this.generation) { server.close(); reject(new Error('Connection cancelled.')); return; }
        const info = server.address();
        if (!info || typeof info === 'string') { reject(new Error('Could not allocate local port.')); return; }
        this.endpoint = { address, port: info.port };
        if (peer) this.callbacks.onTrustedListening?.(address, info.port, peer);
        else this.callbacks.onListening(encodeInvitation({ version: 1, address, port: info.port, secret }), address);
        this.invitationTimer = setTimeout(() => {
          secret = '';
          if (generation === this.generation) this.fail('Invitation expired. Create a new session.');
        }, 10 * 60 * 1000);
        if (this.pendingReject === reject) this.pendingReject = null;
        resolve();
      });
    });
  }

  async connect(value: string): Promise<void> {
    const invitation = parseInvitation(value.trim());
    return this.dial(invitation);
  }
  async connectTrusted(peerId: string, endpointOverride?: PeerEndpoint): Promise<void> {
    const generation = this.generation;
    if (this.trust) await this.trust.initialize();
    if (generation !== this.generation) throw new Error('Connection cancelled.');
    const peer = this.trust?.get(peerId);
    if (!peer || peer.role !== 'HOST') throw new Error('Saved host is unavailable or revoked.');
    const endpoint = endpointOverride ?? peer.endpoint;
    if (!validEndpoint(endpoint)) throw new Error('Enter the saved host’s private IPv4 address and port.');
    return this.dial({ ...endpoint, secret: peer.secret }, peer);
  }
  private async dial(invitation: PeerEndpoint & { secret: string }, peer?: SavedPeer): Promise<void> {
    this.close(false);
    const generation = this.generation;
    if (this.trust) await this.trust.initialize();
    if (generation !== this.generation) throw new Error('Connection cancelled.');
    this.endpoint = { address: invitation.address, port: invitation.port };
    this.activePeerId = peer?.id ?? null;
    this.callbacks.onConnecting('CONTROLLER', `${invitation.address}:${invitation.port}`);
    await new Promise<void>((resolve, reject) => {
      this.pendingReject = reject;
      const socket = TcpSocket.createConnection({ host: invitation.address, port: invitation.port, connectTimeout: 12000 }, () => {
        if (generation !== this.generation) { socket.destroy(); reject(new Error('Connection cancelled.')); return; }
        this.attach(socket, 'CONTROLLER', invitation.secret, invitation.address, peer);
        if (this.pendingReject === reject) this.pendingReject = null;
        resolve();
      });
      this.socket = socket;
      socket.once('error', error => { if (this.pendingReject === reject) this.pendingReject = null; reject(error); if (generation === this.generation) this.fail('Could not reach the host. Check the invitation and Wi-Fi network.'); });
      this.handshakeTimer = setTimeout(() => {
        reject(new Error('Connection timed out.'));
        if (generation === this.generation) this.fail('Connection timed out.');
      }, 15000);
    });
  }

  private attach(socket: Socket, role: SessionRole, secret: string, address: string, peer?: SavedPeer) {
    this.socket = socket;
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    if (this.invitationTimer) clearTimeout(this.invitationTimer);
    this.callbacks.onConnecting(role, address);
    this.lastReceived = Date.now();
    const decoder = new FrameDecoder();
    const generation = this.generation;
    const options: SessionOptions = this.trust ? {
      identity: this.trust.identity,
      ...(peer ? { trustedPeer: peer } : { pairing: {
        persist: async saved => {
          if (generation !== this.generation || this.activePeerId !== saved.id) throw new Error('Pairing cancelled.');
          this.trust!.allowNewPairing(saved.id);
          await this.trust!.save({ ...saved, ...(this.endpoint ? { endpoint: this.endpoint } : {}) });
        },
        rollback: async id => { await this.trust!.remove(id); },
        onPeerIdentity: identity => { this.activePeerId = identity.id; this.callbacks.onPeerIdentity?.(identity); },
        onPairingSaved: saved => this.callbacks.onPairingSaved?.(this.trust!.get(saved.id) ?? saved),
        onPairingError: message => this.callbacks.onPairingError?.(message),
      } }),
    } : {};
    const session = new SecureSession(role, secret, nonce, {
      send: frame => { if (!this.socket || this.socket.destroyed) throw new Error('Connection is closed.'); this.socket.write(encodeFrame(frame)); },
      onVerified: code => {
        if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
        this.handshakeTimer = setTimeout(() => this.fail('Pairing approval expired. Start a new session.'), 120000);
        this.callbacks.onVerified(code, address);
      },
      onApproved: () => {
        if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
        this.callbacks.onApproved();
      },
      onPayload: payload => {
        if (payload.type === 'revoke') {
          if (payload.peerId !== this.activePeerId || !this.trust) throw new Error('Invalid revocation.');
          void this.trust.remove(payload.peerId).catch(() => this.callbacks.onPairingError?.('Could not persist peer revocation.'));
          this.fail('Peer revoked this saved pairing.'); return;
        }
        this.callbacks.onPayload(payload);
      },
    }, options);
    this.session = session;
    socket.setNoDelay(true);
    socket.on('data', (chunk: Buffer | string) => {
      if (generation !== this.generation) return;
      try {
        const frames = decoder.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        for (const frame of frames) session.receive(frame);
        this.lastReceived = Date.now();
      } catch { this.fail('Peer authentication or protocol validation failed. Session ended.'); }
    });
    socket.on('error', () => { if (generation === this.generation) this.fail('Local connection was interrupted.'); });
    socket.on('close', () => { if (generation === this.generation && !this.closing) this.close(true); });
    this.handshakeTimer = setTimeout(() => this.fail('Pairing handshake timed out.'), 15000);
    this.timer = setInterval(() => {
      if (!session.ready) return;
      if (Date.now() - this.lastReceived > 25000) { this.fail('Peer disconnected. All sharing and control stopped.'); return; }
      // Only the foreground controller drives heartbeats; the host answers immediately.
      if (role === 'CONTROLLER') { try { session.send({ type: 'ping' }); } catch { this.fail('Connection closed.'); } }
    }, 5000);
    session.start();
  }
  get currentPeerId(): string | null { return this.activePeerId; }
  savePairing(): void { if (!this.session) throw new Error('Connect a peer first.'); this.session.savePairing(); }
  async revokePeer(peerId: string): Promise<void> {
    if (!this.trust) throw new Error('Saved pairings are unavailable.');
    if (this.activePeerId === peerId) {
      try { if (this.session?.ready) this.session.send({ type: 'revoke', peerId: this.trust.identity.id }); } catch { /* Best effort notification. */ }
      this.close();
    }
    await this.trust.remove(peerId);
  }
  dispose(): void { this.close(false); this.unsubscribe?.(); this.unsubscribe = null; }
  approve(): void { this.session?.approve(); }
  send(payload: SessionPayload): void {
    if (!this.session) throw new Error('Connect a peer first.');
    this.session.send(payload);
  }
  private fail(message: string) { this.close(false); this.callbacks.onClosed(message); }
  close(notify = true): void {
    this.closing = true;
    this.generation++;
    const reject = this.pendingReject; this.pendingReject = null;
    reject?.(new Error('Connection cancelled.'));
    if (this.timer) clearInterval(this.timer);
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    if (this.invitationTimer) clearTimeout(this.invitationTimer);
    this.timer = null; this.handshakeTimer = null; this.invitationTimer = null;
    this.activePeerId = null; this.endpoint = undefined;
    this.session?.close(); this.session = null;
    const socket = this.socket; this.socket = null;
    const server = this.server; this.server = null;
    socket?.destroy(); server?.close();
    this.closing = false;
    if (notify) this.callbacks.onClosed();
  }
}
