import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import { LocalConnection, type ConnectionCallbacks } from '../core/connection';
import { BluetoothConnection } from '../core/bluetooth';
import * as Bluetooth from '../core/bluetoothAdapter';
import { VoiceSession, requestMicrophonePermission } from '../core/calls';
import { createSecureTrustManager } from '../core/secureStorage';
import { Reconnector, ReconnectError } from '../core/reconnect';
import type { TrustManager } from '../core/trust';
import { InputController, isRemoteInput } from '../core/input';
import { MediaSession, type MediaSignal } from '../core/media';
import { INITIAL_STATE, type SyncedActions, type SyncedState, type Transport } from '../model/types';
import { canControl, canUseVoice, publicDevice, resetSession } from './sessionPolicy';

type Connection = LocalConnection | BluetoothConnection;
interface Runtime {
  connection: Connection | null; input: InputController; media: MediaSession; voice: VoiceSession;
  trust: TrustManager; reconnect: Reconnector; generation: number; controlGeneration: number;
  controllerMediaReady: boolean; foreground: boolean; mounted: boolean;
  open(transport: Transport): Connection;
  stop(): void; permissions(): void;
  approved: null | { resolve(): void; reject(error: unknown): void };
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Something interrupted this session.';
const consent = (title: string, description: string, label: string) => new Promise<boolean>(resolve => Alert.alert(title, description,
  [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: label, onPress: () => resolve(true) }],
  { cancelable: true, onDismiss: () => resolve(false) }));

export function useSynced(): { state: SyncedState; actions: SyncedActions } {
  const [state, setState] = useState<SyncedState>(INITIAL_STATE);
  const current = useRef(state);
  const runtime = useRef<Runtime | null>(null);
  const patch = (change: Partial<SyncedState>) => {
    current.current = { ...current.current, ...change };
    setState(current.current);
  };

  useEffect(() => {
    const rt = { generation: 0, controlGeneration: 0, controllerMediaReady: false, foreground: AppState.currentState !== 'background' && AppState.currentState !== 'inactive', mounted: true, connection: null, approved: null } as Runtime;
    const update = (change: Partial<SyncedState>) => { if (rt.mounted) patch(change); };
    const send = (payload: Parameters<Connection['send']>[0]) => {
      if (!rt.connection) throw new Error('Connect a peer first.');
      rt.connection.send(payload);
    };
    rt.permissions = () => {
      const s = current.current;
      if (s.role === 'HOST' && s.status === 'connected') {
        try { send({ type: 'permissions', screenSharing: s.screenSharing, controlEnabled: s.controlEnabled, controlMode: s.transport === 'bluetooth' ? 'bluetooth' : 'screen' }); }
        catch { /* Closing invalidates permission updates. */ }
      }
    };
    rt.input = new InputController(reason => {
      rt.controlGeneration++;
      update({ controlEnabled: false, ...(reason ? { error: reason } : {}) }); rt.permissions();
    });
    rt.voice = new VoiceSession({
      send: signal => send({ type: 'call', signal }),
      onState: voice => update({ voice }), onError: error => update({ error }),
      canCall: () => rt.mounted && canUseVoice(current.current, rt.foreground), requestMicrophonePermission,
    });
    rt.media = new MediaSession({
      send: signal => { if (current.current.transport === 'wifi' && current.current.status === 'connected') send({ type: 'media', signal }); },
      onRemoteStream: (url, width, height) => {
        if (current.current.transport === 'wifi' && current.current.status === 'connected') update({ remoteStreamUrl: url, remoteStreamSize: { width, height }, screenSharing: true });
      },
      onSharingChanged: active => {
        if (current.current.transport !== 'wifi' || current.current.status !== 'connected') return;
        if (!active) rt.controlGeneration++;
        if (current.current.role === 'HOST') rt.input.setSharing(active);
        update({ screenSharing: active, ...(!active ? { controlEnabled: false, remoteStreamUrl: null, remoteStreamSize: null } : {}) });
        rt.permissions();
      },
      onError: error => { rt.input.revoke(); update({ error, screenSharing: false, controlEnabled: false, remoteStreamUrl: null, remoteStreamSize: null }); rt.permissions(); },
    });
    rt.stop = () => {
      rt.generation++; rt.controlGeneration++; rt.reconnect.cancel();
      rt.approved?.reject(new ReconnectError('manual', 'Connection cancelled.')); rt.approved = null;
      const connection = rt.connection; rt.connection = null;
      rt.voice.endCall(); rt.input.revoke(); rt.input.setBluetoothControlAllowed(false);
      connection?.close(false); rt.media.stop(); rt.controllerMediaReady = false;
      update(resetSession(current.current));
    };
    rt.reconnect = new Reconnector();
    rt.trust = createSecureTrustManager(Device.deviceName ?? undefined);
    const syncPeers = (revoked?: string) => {
      const pending = current.current.savedPeers.filter(p => p.revocationPending);
      const savedPeers = [...rt.trust.list().map(publicDevice), ...pending.filter(p => !rt.trust.get(p.id))];
      if (revoked && current.current.peerIdentity?.id === revoked) rt.stop();
      update({ savedPeers });
    };
    const unsubscribe = rt.trust.subscribe(syncPeers);
    rt.open = transport => {
      // Allocate fresh callback closures for every attempt. Old native callbacks
      // cannot mutate a new session even when the transport is unchanged.
      const generation = rt.generation;
      let connection: Connection;
      const live = () => rt.mounted && generation === rt.generation && rt.connection === connection;
      const guarded = (change: Partial<SyncedState>) => { if (live()) update(change); };
      const callbacks: ConnectionCallbacks = {
        onListening: (invitation, address) => guarded({ role: 'HOST', status: 'listening', invitation, localAddress: address, error: null }),
        onTrustedListening: (address, _port, peer) => guarded({ role: 'HOST', status: 'listening', localAddress: address, invitation: null, peerIdentity: { id: peer.id, name: peer.name }, pairingState: 'saved' }),
        onConnecting: (role, address) => guarded({ role, status: 'verifying', remoteAddress: address, invitation: null, error: null }),
        onVerified: (code, address) => guarded({ status: 'awaiting-approval', comparisonCode: code, pendingPeer: { address, comparisonCode: code } }),
        onPeerIdentity: peer => guarded({ peerIdentity: { id: peer.id, name: peer.name }, pairingState: 'available' }),
        onPairingSaved: peer => { if (live()) { syncPeers(); update({ peerIdentity: { id: peer.id, name: peer.name }, pairingState: 'saved' }); } },
        onPairingError: error => guarded({ error }),
        onApproved: () => {
          if (!live()) return;
          update({ status: 'connected', pendingPeer: null, invitation: null, reconnect: { ...current.current.reconnect, active: false } });
          rt.approved?.resolve(); rt.approved = null;
          if (transport === 'wifi' && current.current.role === 'CONTROLLER') { rt.media.startController(); rt.controllerMediaReady = true; }
          rt.permissions();
        },
        onPayload: payload => {
          if (!live() || current.current.status !== 'connected') return;
          const snapshot = current.current;
          if (payload.type === 'media' && transport === 'wifi') {
            if (snapshot.role === 'CONTROLLER' && !rt.controllerMediaReady) { rt.media.startController(); rt.controllerMediaReady = true; }
            void rt.media.handleSignal(payload.signal as MediaSignal).catch(error => { if (live()) { rt.media.stop(); update({ error: message(error), screenSharing: false, remoteStreamUrl: null, remoteStreamSize: null }); } });
          } else if (payload.type === 'call' && canUseVoice(snapshot, rt.foreground)) {
            void rt.voice.handleSignal(payload.signal).catch(error => guarded({ error: message(error) }));
          } else if (payload.type === 'input') {
            if (snapshot.role !== 'HOST' || !canControl(snapshot)) return;
            void rt.input.execute(payload.command).catch(error => guarded({ error: message(error) }));
          } else if (payload.type === 'permissions') {
            if (snapshot.role !== 'CONTROLLER' || typeof payload.screenSharing !== 'boolean' || typeof payload.controlEnabled !== 'boolean') return;
            const mode = payload.controlMode ?? 'screen';
            if (mode !== (transport === 'bluetooth' ? 'bluetooth' : 'screen')) return;
            const screenSharing = transport === 'wifi' && payload.screenSharing;
            if (!screenSharing) { rt.media.stop(); rt.controllerMediaReady = false; }
            update({ screenSharing, controlEnabled: payload.controlEnabled && (transport === 'bluetooth' || screenSharing) });
          }
        },
        onClosed: error => {
          if (!live()) return;
          const waiter = rt.approved; rt.approved = null;
          if (waiter) {
            // Only transport failures retry. Protocol/authentication failures fail closed.
            const network = !!error && /(?:connect to|network|socket|timed out|connection (?:lost|closed)|disconnected)/i.test(error) && !/(?:auth|proof|identity|revok|handshake|approval|pairing)/i.test(error);
            waiter.reject(new ReconnectError(network ? 'network' : 'authentication', error ?? 'Connection closed.'));
            rt.connection = null; rt.input.revoke(); rt.voice.endCall(); rt.media.stop();
          } else { rt.stop(); update({ status: error ? 'error' : 'disconnected', error: error ?? null }); }
        },
      };
      connection = transport === 'wifi' ? new LocalConnection(callbacks, rt.trust) : new BluetoothConnection({ ...callbacks,
        onTrustedListening: (address, peer) => callbacks.onTrustedListening?.(address, 0, peer),
      }, rt.trust);
      rt.connection = connection;
      update({ transport });
      return connection;
    };
    runtime.current = rt;
    const android = Platform.OS === 'android';
    update({ capabilities: { ...INITIAL_STATE.capabilities, localNetwork: android, screenSharing: android, remoteControl: android, bluetooth: android, voiceLink: android } });
    void rt.trust.initialize().then(() => {
      if (!rt.mounted) return;
      syncPeers(); update({ trustReady: true, capabilities: { ...current.current.capabilities, persistentPairing: android } });
    }).catch(error => update({ trustReady: false, error: message(error) }));
    const refresh = async () => {
      try {
        const enabled = await rt.input.isAvailable();
        if (!rt.mounted) return;
        update({ accessibilityEnabled: enabled }); if (!enabled) rt.input.revoke();
      } catch { if (rt.mounted) { update({ accessibilityEnabled: false }); rt.input.revoke(); } }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', next => {
      rt.foreground = next === 'active';
      if (!rt.foreground) rt.voice.endCall(); else void refresh();
    });
    return () => {
      rt.stop(); rt.mounted = false; unsubscribe(); subscription.remove(); rt.input.dispose();
      if (runtime.current === rt) runtime.current = null;
    };
  }, []);

  const actions = useMemo<SyncedActions>(() => {
    const getRuntime = () => {
      if (Platform.OS !== 'android') throw new Error('This build supports Android phones.');
      if (!runtime.current) throw new Error('Synced is still starting.');
      return runtime.current;
    };
    const fail = (error: unknown) => { if (runtime.current?.mounted) patch({ error: message(error) }); };
    const start = async (transport: Transport, role: 'HOST' | 'CONTROLLER', operation: (connection: Connection) => Promise<void>) => {
      try {
        const rt = getRuntime(); rt.stop(); const generation = rt.generation;
        patch({ transport, role, status: 'connecting', error: null });
        const connection = rt.open(transport);
        try { await operation(connection); }
        catch (error) { if (generation === rt.generation) { rt.stop(); patch({ status: 'error', error: message(error) }); } }
      } catch (error) { fail(error); }
    };
    return {
      startHost: options => start('wifi', 'HOST', c => (c as LocalConnection).host(options?.privateAddress)),
      connect: invitation => start('wifi', 'CONTROLLER', c => (c as LocalConnection).connect(invitation)),
      startBluetoothHost: () => start('bluetooth', 'HOST', c => (c as BluetoothConnection).host()),
      connectBluetooth: (invitation, address) => start('bluetooth', 'CONTROLLER', c => (c as BluetoothConnection).connect(invitation, address)),
      approvePeer() {
        try { const rt = getRuntime(); if (current.current.role === 'HOST' && current.current.status === 'awaiting-approval') rt.connection?.approve(); }
        catch (error) { fail(error); }
      },
      rejectPeer() { try { getRuntime().stop(); } catch (error) { fail(error); } },
      async startScreenSharing() {
        try {
          const rt = getRuntime();
          if (current.current.transport !== 'wifi' || current.current.role !== 'HOST' || current.current.status !== 'connected') throw new Error('Approve a Wi-Fi controller before sharing your screen.');
          const generation = rt.generation; patch({ error: null }); await rt.media.startHost();
          if (generation !== rt.generation) rt.media.stop();
        } catch (error) { fail(error); }
      },
      stopScreenSharing() {
        try {
          const rt = getRuntime(); if (current.current.transport !== 'wifi') return;
          rt.controlGeneration++; rt.input.revoke(); rt.media.stop();
          patch({ screenSharing: false, controlEnabled: false }); rt.permissions();
        } catch (error) { fail(error); }
      },
      async setControlEnabled(enabled) {
        try {
          const rt = getRuntime(); const controlGeneration = ++rt.controlGeneration;
          if (!enabled) { rt.input.revoke(); rt.input.setBluetoothControlAllowed(false); patch({ controlEnabled: false }); rt.permissions(); return; }
          const snapshot = current.current;
          if (snapshot.role !== 'HOST' || snapshot.status !== 'connected' || (snapshot.transport === 'wifi' && !snapshot.screenSharing)) throw new Error('Approve a peer and share your Wi-Fi screen before allowing control.');
          const generation = rt.generation;
          const valid = () => rt.mounted && generation === rt.generation && controlGeneration === rt.controlGeneration && current.current.status === 'connected' && (current.current.transport === 'bluetooth' || current.current.screenSharing);
          const approved = await consent('Allow this peer to control your phone?', snapshot.transport === 'bluetooth'
            ? 'Bluetooth control has no screen preview. This peer can tap, swipe, navigate, type, open the alarm screen, and open the dialer. Watch this phone and stop control at any time.'
            : 'They can tap, swipe, navigate, type into focused fields, and open the alarm screen or dialer. Open only apps you intend to share. Password fields cannot be reliably detected. You can stop control at any time.', 'Allow control');
          if (!approved || !valid()) return;
          rt.input.setBluetoothControlAllowed(snapshot.transport === 'bluetooth');
          try { await rt.input.grant(); } catch (error) { rt.input.setBluetoothControlAllowed(false); throw error; }
          if (!valid()) { rt.input.revoke(); rt.input.setBluetoothControlAllowed(false); return; }
          patch({ controlEnabled: true, accessibilityEnabled: true, error: null }); rt.permissions();
        } catch (error) { fail(error); }
      },
      async requestAccessibility() { try { await getRuntime().input.requestService(); } catch (error) { fail(error); } },
      async refreshPermissions() {
        try { const rt = getRuntime(); const generation = rt.generation; const enabled = await rt.input.isAvailable(); if (!rt.mounted || generation !== rt.generation) return; patch({ accessibilityEnabled: enabled }); if (!enabled) rt.input.revoke(); }
        catch (error) { fail(error); }
      },
      sendInput(command) {
        try {
          const rt = getRuntime(); if (!isRemoteInput(command)) throw new Error('Invalid remote action.');
          if (current.current.role !== 'CONTROLLER' || !canControl(current.current)) throw new Error('The host must allow control first.');
          rt.connection?.send({ type: 'input', command });
        } catch (error) { fail(error); }
      },
      async savePairing() {
        try {
          const rt = getRuntime(); const snapshot = current.current; const generation = rt.generation;
          if (!snapshot.trustReady || snapshot.status !== 'connected' || !snapshot.peerIdentity || snapshot.pairingState === 'saved') throw new Error('Connect a verified peer before saving.');
          const peerId = snapshot.peerIdentity.id;
          if (!await consent('Save this phone?', 'Both phones must choose Save. Future sessions still require explicit screen sharing, control, and microphone consent.', 'Save phone')) return;
          if (!rt.mounted || generation !== rt.generation || current.current.status !== 'connected' || current.current.peerIdentity?.id !== peerId) return;
          rt.trust.allowNewPairing(peerId); rt.connection?.savePairing(); patch({ pairingState: 'requested', error: null });
        } catch (error) { fail(error); }
      },
      async forgetPeer(id) {
        try {
          const rt = getRuntime(); const peer = current.current.savedPeers.find(p => p.id === id);
          if (!peer) throw new Error('Saved peer is unavailable.');
          // Keep a public retry row until the secure deletion is durable.
          patch({ savedPeers: current.current.savedPeers.map(p => p.id === id ? { ...p, revocationPending: true } : p) });
          await rt.trust.remove(id);
          if (rt.mounted) patch({ savedPeers: current.current.savedPeers.filter(p => p.id !== id) });
        } catch (error) { fail(error); }
      },
      async receiveTrustedPeer(id, options) {
        try {
          const rt = getRuntime(); const peer = rt.trust.get(id);
          if (!current.current.trustReady || !peer || peer.role !== 'CONTROLLER') throw new Error('Select a saved controller to receive.');
          const transport = options?.transport ?? 'wifi';
          await start(transport, 'HOST', c => {
            patch({ peerIdentity: { id: peer.id, name: peer.name }, pairingState: 'saved' });
            return transport === 'wifi' ? (c as LocalConnection).hostTrusted(id, options?.privateAddress, options?.port) : (c as BluetoothConnection).hostTrusted(id);
          });
        } catch (error) { fail(error); }
      },
      async reconnectPeer(id, options) {
        try {
          const rt = getRuntime(); const peer = rt.trust.get(id);
          if (!current.current.trustReady || !peer || peer.role !== 'HOST') throw new Error('Select a saved host to reconnect.');
          const transport = options?.transport ?? 'wifi'; rt.stop(); const generation = rt.generation;
          const maxAttempts = options?.retry ? 4 : 1;
          patch({ transport, role: 'CONTROLLER', peerIdentity: { id: peer.id, name: peer.name }, pairingState: 'saved', status: 'connecting', reconnect: { active: true, attempt: 0, maxAttempts }, error: null });
          try {
            await rt.reconnect.start(async signal => {
              if (!rt.trust.get(id)) throw new ReconnectError('revoked', 'Saved peer was revoked.');
              rt.connection?.close(false); rt.connection = null;
              const connection = rt.open(transport);
              await new Promise<void>((resolve, reject) => {
                const finish = (error?: unknown) => { signal.removeEventListener('abort', abort); if (rt.approved === waiter) rt.approved = null; if (error) reject(error); else resolve(); };
                const waiter = { resolve: () => finish(), reject: (error: unknown) => finish(error) };
                const abort = () => { if (rt.connection === connection) { rt.connection = null; connection.close(false); } finish(new ReconnectError('manual', 'Connection cancelled.')); };
                rt.approved = waiter; signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted) { abort(); return; }
                const operation = transport === 'wifi'
                  ? (connection as LocalConnection).connectTrusted(id, options?.address ? { address: options.address, port: options.port ?? peer.endpoint?.port ?? 0 } : undefined)
                  : (connection as BluetoothConnection).connectTrusted(id, options?.address);
                // Native connect completes before the cryptographic approval callback.
                void operation.catch(error => finish(error));
              });
            }, { maxAttempts, onAttempt: attempt => { if (generation === rt.generation) patch({ status: 'connecting', reconnect: { active: true, attempt, maxAttempts } }); } });
            if (rt.mounted && generation === rt.generation) patch({ reconnect: { ...current.current.reconnect, active: false } });
          } catch (error) { if (rt.mounted && generation === rt.generation) { rt.stop(); patch({ status: 'error', error: message(error) }); } }
        } catch (error) { fail(error); }
      },
      cancelReconnect() { try { getRuntime().stop(); } catch (error) { fail(error); } },
      async refreshBluetoothDevices() {
        try {
          const rt = getRuntime(); patch({ bluetooth: { ...current.current.bluetooth, loading: true } });
          try { const devices = await Bluetooth.listBondedDevices(); if (rt.mounted) patch({ bluetooth: { devices, enabled: true, loading: false } }); }
          finally { if (rt.mounted) patch({ bluetooth: { ...current.current.bluetooth, loading: false } }); }
        } catch (error) { fail(error); }
      },
      async enableBluetooth() { try { const rt = getRuntime(); await Bluetooth.requestBluetoothEnable(); if (rt.mounted) patch({ bluetooth: { ...current.current.bluetooth, enabled: true } }); } catch (error) { fail(error); } },
      async makeBluetoothDiscoverable() { try { getRuntime(); await Bluetooth.requestBluetoothDiscoverable(); } catch (error) { fail(error); } },
      async openBluetoothSettings() { try { getRuntime(); await Bluetooth.openBluetoothPairingSettings(); } catch (error) { fail(error); } },
      async requestVoiceCall() { try { await getRuntime().voice.requestCall(); } catch (error) { fail(error); } },
      async acceptVoiceCall() { try { await getRuntime().voice.acceptCall(); } catch (error) { fail(error); } },
      rejectVoiceCall() { try { getRuntime().voice.rejectCall(); } catch (error) { fail(error); } },
      endVoiceCall() { try { getRuntime().voice.endCall(); } catch (error) { fail(error); } },
      setVoiceMuted(muted) { try { getRuntime().voice.setMuted(muted); } catch (error) { fail(error); } },
      disconnect() { runtime.current?.stop(); },
      clearError() { patch({ error: null }); },
    };
  }, []);
  return { state, actions };
}
