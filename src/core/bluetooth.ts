import * as Crypto from 'expo-crypto';
import BluetoothClassic, { type BluetoothDevice } from 'react-native-bluetooth-classic';
import { base64, encodeFrame, validNonce } from './protocol';
import { SecureSession, type SessionOptions, type SessionPayload, type SessionRole } from './session';
import { TrustManager, type DeviceIdentity, type SavedPeer } from './trust';
import { BLUETOOTH_OPTIONS, bluetoothAddress, listBondedDevices, requestBluetoothEnable } from './bluetoothAdapter';
import { BluetoothFrameDecoder, bluetoothRecords } from './bluetoothFraming';

export interface BluetoothConnectionCallbacks {
  onListening(invitation: string, address: string): void;
  onConnecting(role: SessionRole, address: string): void;
  onVerified(code: string, address: string): void;
  onApproved(): void;
  onPayload(payload: SessionPayload): void;
  onClosed(error?: string): void;
  onTrustedListening?(address: string, peer: SavedPeer): void;
  onPeerIdentity?(peer: DeviceIdentity): void;
  onPairingSaved?(peer: SavedPeer): void;
  onPairingError?(message: string): void;
}
const nonce = () => base64(Crypto.getRandomBytes(32));
const MAX_QUEUED_BYTES = 524288;
const INVITATION_PREFIX = 'synced-bt://';

export function parseBluetoothInvitation(value: string): string {
  if (typeof value !== 'string' || !value.startsWith(INVITATION_PREFIX) || !validNonce(value.slice(INVITATION_PREFIX.length))) {
    throw new Error('Paste the host’s complete Bluetooth invitation.');
  }
  return value.slice(INVITATION_PREFIX.length);
}

/** RFCOMM carries approved encrypted commands. Video/audio require a separate IP path. */
export class BluetoothConnection {
  private device: BluetoothDevice | null = null;
  private session: SecureSession | null = null;
  private subscriptions: Array<{ remove(): void }> = [];
  private generation = 0;
  private accepting = false;
  private nativeBusy = false;
  private pendingReject: ((error: Error) => void) | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private writeDeadline: ReturnType<typeof setTimeout> | null = null;
  private lastReceived = 0;
  private records: string[] = [];
  private queuedBytes = 0;
  private writing = false;
  private activePeerId: string | null = null;
  private sessionOptions: SessionOptions = {};
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly callbacks: BluetoothConnectionCallbacks, private readonly trust?: TrustManager) {
    this.unsubscribe = trust?.subscribe(peerId => {
      if (peerId && peerId === this.activePeerId) this.fail('Saved Bluetooth peer revoked. All permissions ended.');
    }) ?? null;
  }

  setSessionOptions(options: SessionOptions): void {
    if (this.session || this.nativeBusy) throw new Error('Configure pairing before starting Bluetooth.');
    this.sessionOptions = options;
  }

  async host(): Promise<void> { return this.listen(); }
  async hostTrusted(peerId: string): Promise<void> { return this.listen(peerId); }
  private async listen(peerId?: string): Promise<void> {
    this.assertAvailable();
    this.close(false);
    const generation = this.generation;
    if (this.trust) await this.trust.initialize();
    this.assertGeneration(generation);
    const peer = peerId ? this.trust?.get(peerId) : undefined;
    if (peerId && (!peer || peer.role !== 'CONTROLLER')) throw new Error('Saved Bluetooth controller is unavailable or revoked.');
    await requestBluetoothEnable();
    this.assertGeneration(generation);
    const secret = peer?.secret ?? nonce();
    this.activePeerId = peer?.id ?? null;
    this.accepting = true;
    this.nativeBusy = true;
    const accepted = BluetoothClassic.accept(BLUETOOTH_OPTIONS);
    if (peer) this.callbacks.onTrustedListening?.('Bluetooth • paired phones', peer);
    else this.callbacks.onListening(`${INVITATION_PREFIX}${secret}`, 'Bluetooth • paired phones');
    this.deadline = setTimeout(() => {
      if (generation === this.generation) this.fail('Bluetooth invitation expired. Create a new session.');
    }, 10 * 60 * 1000);
    void accepted.then(device => {
      this.nativeBusy = false;
      if (generation !== this.generation) { void device.disconnect().catch(() => undefined); return; }
      this.accepting = false;
      this.attach(device, 'HOST', secret, peer);
    }).catch(() => {
      this.nativeBusy = false;
      if (generation === this.generation) this.fail('Could not accept a Bluetooth connection.');
    });
  }

  async connect(invitation: string, selectedAddress: string): Promise<void> {
    const secret = parseBluetoothInvitation(invitation.trim());
    return this.dial(secret, selectedAddress);
  }
  async connectTrusted(peerId: string, addressOverride?: string): Promise<void> {
    const generation = this.generation;
    if (this.trust) await this.trust.initialize();
    this.assertGeneration(generation);
    const peer = this.trust?.get(peerId);
    if (!peer || peer.role !== 'HOST') throw new Error('Saved Bluetooth host is unavailable or revoked.');
    if (!addressOverride && !peer.bluetoothAddress) throw new Error('Select this saved host from the paired Bluetooth phones.');
    return this.dial(peer.secret, addressOverride ?? peer.bluetoothAddress!, peer);
  }
  private async dial(secret: string, selectedAddress: string, peer?: SavedPeer): Promise<void> {
    const address = bluetoothAddress(selectedAddress);
    this.assertAvailable();
    this.close(false);
    const generation = this.generation;
    if (this.trust) await this.trust.initialize();
    this.assertGeneration(generation);
    const devices = await listBondedDevices();
    this.assertGeneration(generation);
    if (!devices.some(device => device.address === address)) throw new Error('Pair this phone in Android Bluetooth settings first.');
    this.activePeerId = peer?.id ?? null;
    this.callbacks.onConnecting('CONTROLLER', address);
    this.nativeBusy = true;
    await new Promise<void>((resolve, reject) => {
      this.pendingReject = reject;
      this.deadline = setTimeout(() => {
        if (generation === this.generation) this.fail('Bluetooth connection timed out.');
      }, 15000);
      void BluetoothClassic.connectToDevice(address, BLUETOOTH_OPTIONS).then(device => {
        this.nativeBusy = false;
        if (generation !== this.generation) { void device.disconnect().catch(() => undefined); return; }
        this.pendingReject = null;
        this.attach(device, 'CONTROLLER', secret, peer);
        resolve();
      }).catch(error => {
        this.nativeBusy = false;
        if (generation !== this.generation) return;
        this.pendingReject = null;
        reject(error);
        this.fail('Could not connect to this paired Bluetooth phone.');
      });
    });
  }

  private assertAvailable(): void {
    if (this.nativeBusy) throw new Error('Bluetooth is finishing the previous attempt. Try again shortly.');
  }
  private assertGeneration(generation: number): void {
    if (generation !== this.generation) throw new Error('Bluetooth connection cancelled.');
  }

  private attach(device: BluetoothDevice, role: SessionRole, secret: string, savedPeer?: SavedPeer): void {
    this.clearDeadline();
    this.device = device;
    const generation = this.generation;
    const address = device.address;
    const decoder = new BluetoothFrameDecoder();
    this.lastReceived = Date.now();
    const session = new SecureSession(role, secret, nonce, {
      send: frame => this.enqueue(encodeFrame(frame)),
      onVerified: code => {
        this.clearDeadline();
        this.deadline = setTimeout(() => this.fail('Bluetooth pairing approval expired.'), 120000);
        this.callbacks.onVerified(code, address);
      },
      onApproved: () => { this.clearDeadline(); this.callbacks.onApproved(); },
      onPayload: payload => {
        if (payload.type === 'revoke' && payload.peerId === this.activePeerId && this.trust) {
          void this.trust.remove(payload.peerId).catch(() => this.callbacks.onPairingError?.('Could not persist peer removal. Forget this peer before reconnecting.'));
          this.close(false);
          return;
        }
        this.callbacks.onPayload(payload);
      },
    }, this.optionsFor(address, savedPeer));
    this.session = session;
    this.callbacks.onConnecting(role, address);
    this.subscriptions.push(device.onDataReceived(event => {
      if (generation !== this.generation) return;
      try {
        for (const frame of decoder.push(event.data)) {
          if (generation !== this.generation) return;
          session.receive(frame);
          if (generation === this.generation) this.lastReceived = Date.now();
        }
      } catch { if (generation === this.generation) this.fail('Bluetooth authentication or protocol validation failed.'); }
    }));
    this.subscriptions.push(BluetoothClassic.onDeviceDisconnected(event => {
      if (generation === this.generation && event.device.address === address) this.fail('Bluetooth phone disconnected. All permissions ended.');
    }));
    this.subscriptions.push(BluetoothClassic.onBluetoothDisabled(() => {
      if (generation === this.generation) this.fail('Bluetooth was turned off. All permissions ended.');
    }));
    this.deadline = setTimeout(() => this.fail('Bluetooth pairing handshake timed out.'), 15000);
    this.heartbeat = setInterval(() => {
      if (!session.ready) return;
      if (Date.now() - this.lastReceived > 25000) { this.fail('Bluetooth peer stopped responding.'); return; }
      if (role === 'CONTROLLER') {
        try { session.send({ type: 'ping' }); } catch { this.fail('Bluetooth connection closed.'); }
      }
    }, 5000);
    session.start();
  }

  private enqueue(frame: Uint8Array): void {
    if (!this.device) throw new Error('Bluetooth is disconnected.');
    const records = bluetoothRecords(frame);
    const size = records.reduce((total, record) => total + record.length, 0);
    if (this.queuedBytes + size > MAX_QUEUED_BYTES) {
      this.fail('Bluetooth is too slow. Session ended to prevent delayed controls.');
      throw new Error('Bluetooth send queue exceeded limit.');
    }
    this.records.push(...records);
    this.queuedBytes += size;
    void this.drain(this.generation);
  }

  private async drain(generation: number): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.records.length && generation === this.generation && this.device) {
        const record = this.records.shift()!;
        this.writeDeadline = setTimeout(() => {
          if (generation === this.generation) this.fail('Bluetooth write timed out.');
        }, 5000);
        const written = await this.device.write(record, 'ascii');
        if (generation !== this.generation) return;
        if (this.writeDeadline) clearTimeout(this.writeDeadline);
        this.writeDeadline = null;
        if (!written) throw new Error('Bluetooth write rejected.');
        this.queuedBytes -= record.length;
      }
    } catch {
      if (generation === this.generation) this.fail('Bluetooth write failed.');
    } finally {
      if (generation === this.generation) this.writing = false;
    }
  }

  private optionsFor(address: string, savedPeer?: SavedPeer): SessionOptions {
    const generation = this.generation;
    const identity = this.trust?.identity ?? this.sessionOptions.identity;
    const pairing = this.trust ? {
      persist: async (peer: SavedPeer) => {
        this.assertGeneration(generation);
        this.trust!.allowNewPairing(peer.id);
        await this.trust!.save({ ...peer, bluetoothAddress: bluetoothAddress(address) });
      },
      rollback: (peerId: string) => this.trust!.remove(peerId),
    } : this.sessionOptions.pairing;
    return {
      identity,
      ...(savedPeer ? { trustedPeer: { id: savedPeer.id, secret: savedPeer.secret } } : {}),
      ...(pairing ? { pairing: {
        ...pairing,
        persist: peer => pairing.persist({ ...peer, bluetoothAddress: bluetoothAddress(address) }),
        onPeerIdentity: peer => {
          if (generation !== this.generation) return;
          this.activePeerId = peer.id;
          this.sessionOptions.pairing?.onPeerIdentity?.(peer);
          this.callbacks.onPeerIdentity?.(peer);
        },
        onPairingSaved: peer => {
          if (generation !== this.generation) return;
          const record = { ...peer, bluetoothAddress: bluetoothAddress(address) };
          this.sessionOptions.pairing?.onPairingSaved?.(record);
          this.callbacks.onPairingSaved?.(record);
        },
        onPairingError: message => {
          this.sessionOptions.pairing?.onPairingError?.(message);
          this.callbacks.onPairingError?.(message);
        },
      } } : {}),
    };
  }

  savePairing(): void {
    if (!this.session) throw new Error('Connect and approve a Bluetooth peer first.');
    this.session.savePairing();
  }
  async revokePeer(peerId: string): Promise<void> {
    if (!this.trust) throw new Error('Saved pairing is unavailable.');
    if (this.activePeerId === peerId) {
      try { this.session?.send({ type: 'revoke', peerId: this.trust.identity.id }); } catch { /* Offline revocation still removes local trust. */ }
      this.close();
    }
    await this.trust.remove(peerId);
  }
  dispose(): void { this.close(false); this.unsubscribe?.(); this.unsubscribe = null; }
  get peerIdentity(): DeviceIdentity | null { return this.session?.peerIdentity ?? null; }
  get trusted(): boolean { return this.session?.trusted ?? false; }

  approve(): void {
    if (!this.session) throw new Error('No Bluetooth peer is waiting for approval.');
    this.session.approve();
  }
  send(payload: SessionPayload): void {
    if (!this.session) throw new Error('Connect a Bluetooth phone first.');
    this.session.send(payload);
  }
  private clearDeadline(): void { if (this.deadline) clearTimeout(this.deadline); this.deadline = null; }
  private fail(error: string): void { this.close(false); this.callbacks.onClosed(error); }
  close(notify = true): void {
    this.generation++;
    const reject = this.pendingReject; this.pendingReject = null;
    reject?.(new Error('Bluetooth connection cancelled.'));
    this.clearDeadline();
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.writeDeadline) clearTimeout(this.writeDeadline);
    this.heartbeat = null; this.writeDeadline = null;
    this.records = []; this.queuedBytes = 0; this.writing = false;
    this.activePeerId = null;
    this.session?.close(); this.session = null;
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
    const device = this.device; this.device = null;
    if (device) void device.disconnect().catch(() => undefined);
    if (this.accepting) { this.accepting = false; void BluetoothClassic.cancelAccept().catch(() => undefined); }
    if (notify) this.callbacks.onClosed();
  }
}
