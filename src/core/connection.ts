import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';
import { base64, encodeFrame, encodeInvitation, FrameDecoder, isPrivateAddress, parseInvitation } from './protocol';
import { SecureSession, type SessionPayload, type SessionRole } from './session';

type Socket = ReturnType<typeof TcpSocket.createConnection>;
type Server = ReturnType<typeof TcpSocket.createServer>;
interface ConnectionCallbacks {
  onListening: (invitation: string, address: string) => void;
  onConnecting: (role: SessionRole, address: string) => void;
  onVerified: (code: string, address: string) => void;
  onApproved: () => void;
  onPayload: (payload: SessionPayload) => void;
  onClosed: (error?: string) => void;
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
  constructor(private callbacks: ConnectionCallbacks) {}

  async host(privateAddress?: string): Promise<void> {
    this.close(false);
    const generation = this.generation;
    const address = privateAddress?.trim() || await Network.getIpAddressAsync();
    if (!isPrivateAddress(address)) throw new Error('Connect to Wi-Fi or enter this phone’s private hotspot IPv4 address.');
    let secret = nonce();
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
        this.attach(socket, 'HOST', secret, remote);
        secret = '';
      });
      this.server = server;
      server.on('error', error => {
        if (this.pendingReject === reject) this.pendingReject = null;
        reject(error);
        if (generation === this.generation) this.fail('Could not listen on this Wi-Fi network.');
      });
      server.listen({ port: 0, host: '0.0.0.0' }, () => {
        if (generation !== this.generation) { server.close(); reject(new Error('Connection cancelled.')); return; }
        const info = server.address();
        if (!info || typeof info === 'string') { reject(new Error('Could not allocate local port.')); return; }
        this.callbacks.onListening(encodeInvitation({ version: 1, address, port: info.port, secret }), address);
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
    this.close(false);
    const generation = this.generation;
    this.callbacks.onConnecting('CONTROLLER', `${invitation.address}:${invitation.port}`);
    await new Promise<void>((resolve, reject) => {
      this.pendingReject = reject;
      const socket = TcpSocket.createConnection({ host: invitation.address, port: invitation.port, connectTimeout: 12000 }, () => {
        if (generation !== this.generation) { socket.destroy(); reject(new Error('Connection cancelled.')); return; }
        this.attach(socket, 'CONTROLLER', invitation.secret, invitation.address);
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

  private attach(socket: Socket, role: SessionRole, secret: string, address: string) {
    this.socket = socket;
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    if (this.invitationTimer) clearTimeout(this.invitationTimer);
    this.callbacks.onConnecting(role, address);
    this.lastReceived = Date.now();
    const decoder = new FrameDecoder();
    const generation = this.generation;
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
      onPayload: this.callbacks.onPayload,
    });
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
    this.session?.close(); this.session = null;
    const socket = this.socket; this.socket = null;
    const server = this.server; this.server = null;
    socket?.destroy(); server?.close();
    this.closing = false;
    if (notify) this.callbacks.onClosed();
  }
}
