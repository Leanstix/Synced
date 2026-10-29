import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { LocalConnection } from '../core/connection';
import { InputController, isRemoteInput } from '../core/input';
import { MediaSession, type MediaSignal } from '../core/media';
import { INITIAL_STATE, type SyncedActions, type SyncedState } from '../model/types';

interface Runtime { connection: LocalConnection; input: InputController; media: MediaSession; generation: number; controlGeneration: number; controllerMediaReady: boolean }
const message = (error: unknown) => error instanceof Error ? error.message : 'Something interrupted this session.';

export function useSynced(): { state: SyncedState; actions: SyncedActions } {
  const [state, setState] = useState<SyncedState>(INITIAL_STATE);
  const current = useRef(state);
  const runtime = useRef<Runtime | null>(null);
  const patch = (change: Partial<SyncedState>) => {
    current.current = { ...current.current, ...change };
    setState(current.current);
  };

  useEffect(() => {
    let mounted = true;
    const update = (change: Partial<SyncedState>) => { if (mounted) patch(change); };
    const permissions = () => {
      if (current.current.role === 'HOST' && current.current.status === 'connected') {
        try { rt.connection.send({ type: 'permissions', screenSharing: current.current.screenSharing, controlEnabled: current.current.controlEnabled }); }
        catch { /* Closing a session invalidates its permission update. */ }
      }
    };
    const rt = {} as Runtime;
    rt.generation = 0; rt.controlGeneration = 0; rt.controllerMediaReady = false;
    rt.input = new InputController(reason => {
      rt.controlGeneration++;
      update({ controlEnabled: false, ...(reason ? { error: reason } : {}) }); permissions();
    });
    rt.media = new MediaSession({
      send: signal => rt.connection.send({ type: 'media', signal }),
      onRemoteStream: (url, width, height) => update({ remoteStreamUrl: url, remoteStreamSize: { width, height }, screenSharing: true }),
      onSharingChanged: active => {
        if (!active) rt.controlGeneration++;
        if (current.current.role === 'HOST') rt.input.setSharing(active);
        update({ screenSharing: active, ...(!active ? { controlEnabled: false, remoteStreamUrl: null, remoteStreamSize: null } : {}) });
        permissions();
      },
      onError: error => { rt.input.revoke(); update({ error, screenSharing: false, controlEnabled: false, remoteStreamUrl: null, remoteStreamSize: null }); permissions(); },
    });
    rt.connection = new LocalConnection({
      onListening: (invitation, address) => update({ role: 'HOST', status: 'listening', invitation, localAddress: address, error: null }),
      onConnecting: (role, address) => update({ role, status: 'verifying', remoteAddress: address, invitation: null, error: null }),
      onVerified: (code, address) => update({ status: 'awaiting-approval', comparisonCode: code, pendingPeer: { address, comparisonCode: code } }),
      onApproved: () => {
        update({ status: 'connected', pendingPeer: null, invitation: null });
        if (current.current.role === 'CONTROLLER') { rt.media.startController(); rt.controllerMediaReady = true; }
        permissions();
      },
      onPayload: payload => {
        const snapshot = current.current;
        if (snapshot.status !== 'connected') return;
        if (payload.type === 'media') {
          const signal = payload.signal as MediaSignal;
          if (snapshot.role === 'CONTROLLER' && !rt.controllerMediaReady) { rt.media.startController(); rt.controllerMediaReady = true; }
          void rt.media.handleSignal(signal).catch(error => { rt.media.stop(); update({ error: message(error), screenSharing: false, remoteStreamUrl: null, remoteStreamSize: null }); });
        } else if (payload.type === 'input') {
          if (snapshot.role !== 'HOST' || !snapshot.controlEnabled || !snapshot.screenSharing) return;
          void rt.input.execute(payload.command).catch(error => update({ error: message(error) }));
        } else if (payload.type === 'permissions') {
          if (snapshot.role !== 'CONTROLLER' || typeof payload.screenSharing !== 'boolean' || typeof payload.controlEnabled !== 'boolean') return;
          if (!payload.screenSharing) { rt.media.stop(); rt.controllerMediaReady = false; }
          update({ screenSharing: payload.screenSharing, controlEnabled: payload.screenSharing && payload.controlEnabled });
        }
      },
      onClosed: error => {
        rt.generation++; rt.input.revoke(); rt.media.stop(); rt.controllerMediaReady = false;
        update({ ...INITIAL_STATE, capabilities: current.current.capabilities, accessibilityEnabled: current.current.accessibilityEnabled, status: error ? 'error' : 'disconnected', error: error ?? null });
      },
    });
    runtime.current = rt;
    const android = Platform.OS === 'android';
    update({ capabilities: { ...INITIAL_STATE.capabilities, localNetwork: android, screenSharing: android, remoteControl: android } });
    const refresh = async () => {
      try {
        const enabled = await rt.input.isAvailable();
        if (!mounted) return;
        update({ accessibilityEnabled: enabled });
        if (!enabled) rt.input.revoke();
      } catch { if (mounted) { update({ accessibilityEnabled: false }); rt.input.revoke(); } }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    return () => {
      mounted = false; rt.generation++;
      subscription.remove(); rt.connection.close(false); rt.input.dispose(); rt.media.stop();
      if (runtime.current === rt) runtime.current = null;
    };
  }, []);

  const actions = useMemo<SyncedActions>(() => {
    const getRuntime = () => {
      if (Platform.OS !== 'android') throw new Error('This build supports Android phones.');
      if (!runtime.current) throw new Error('Synced is still starting.');
      return runtime.current;
    };
    const fail = (error: unknown) => patch({ error: message(error) });
    const stop = (rt: Runtime) => {
      rt.generation++; rt.controlGeneration++; rt.input.revoke(); rt.connection.close(false); rt.media.stop(); rt.controllerMediaReady = false;
      patch({ ...INITIAL_STATE, capabilities: current.current.capabilities, accessibilityEnabled: current.current.accessibilityEnabled });
    };
    return {
      async startHost(options) {
        try {
          const rt = getRuntime(); stop(rt);
          const generation = rt.generation;
          patch({ role: 'HOST', status: 'connecting', error: null });
          try { await rt.connection.host(options?.privateAddress); }
          catch (error) { if (generation === rt.generation) { rt.connection.close(false); patch({ status: 'error', error: message(error) }); } }
        } catch (error) { fail(error); }
      },
      async connect(invitation) {
        try {
          const rt = getRuntime(); stop(rt);
          const generation = rt.generation;
          patch({ role: 'CONTROLLER', status: 'connecting', error: null });
          try { await rt.connection.connect(invitation); }
          catch (error) { if (generation === rt.generation) { rt.connection.close(false); patch({ status: 'error', error: message(error) }); } }
        } catch (error) { fail(error); }
      },
      approvePeer() {
        try {
          const rt = getRuntime();
          if (current.current.role !== 'HOST' || current.current.status !== 'awaiting-approval') return;
          rt.connection.approve();
        } catch (error) { fail(error); }
      },
      rejectPeer() { try { stop(getRuntime()); } catch (error) { fail(error); } },
      async startScreenSharing() {
        try {
          const rt = getRuntime();
          if (current.current.role !== 'HOST' || current.current.status !== 'connected') throw new Error('Approve a controller before sharing your screen.');
          patch({ error: null });
          await rt.media.startHost();
        } catch (error) { fail(error); }
      },
      stopScreenSharing() {
        try {
          const rt = getRuntime(); rt.controlGeneration++; rt.input.revoke(); rt.media.stop();
          patch({ screenSharing: false, controlEnabled: false });
          if (current.current.role === 'HOST' && current.current.status === 'connected') rt.connection.send({ type: 'permissions', screenSharing: false, controlEnabled: false });
        } catch (error) { fail(error); }
      },
      async setControlEnabled(enabled) {
        try {
          const rt = getRuntime();
          const controlGeneration = ++rt.controlGeneration;
          if (!enabled) { rt.input.revoke(); patch({ controlEnabled: false }); return; }
          if (current.current.role !== 'HOST' || current.current.status !== 'connected' || !current.current.screenSharing) throw new Error('Share your screen before allowing control.');
          const generation = rt.generation;
          const approved = await new Promise<boolean>(resolve => Alert.alert('Allow this peer to control your phone?',
            'They can tap, swipe, navigate, type into focused fields, and open the alarm screen. Open only apps you intend to share. Password fields cannot be reliably detected. You can stop control at any time.',
            [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Allow control', onPress: () => resolve(true) }],
            { cancelable: true, onDismiss: () => resolve(false) }));
          if (!approved || generation !== rt.generation || controlGeneration !== rt.controlGeneration || current.current.status !== 'connected' || !current.current.screenSharing) return;
          await rt.input.grant();
          if (generation !== rt.generation || controlGeneration !== rt.controlGeneration || current.current.status !== 'connected' || !current.current.screenSharing) { rt.input.revoke(); return; }
          patch({ controlEnabled: true, accessibilityEnabled: true, error: null });
          rt.connection.send({ type: 'permissions', screenSharing: true, controlEnabled: true });
        } catch (error) { fail(error); }
      },
      async requestAccessibility() { try { await getRuntime().input.requestService(); } catch (error) { fail(error); } },
      async refreshPermissions() {
        try {
          const rt = getRuntime(); const enabled = await rt.input.isAvailable();
          patch({ accessibilityEnabled: enabled }); if (!enabled) rt.input.revoke();
        } catch (error) { fail(error); }
      },
      sendInput(command) {
        try {
          const rt = getRuntime();
          if (!isRemoteInput(command)) throw new Error('Invalid remote action.');
          if (current.current.role !== 'CONTROLLER' || current.current.status !== 'connected' || !current.current.controlEnabled || !current.current.screenSharing) throw new Error('The host must allow screen sharing and control first.');
          rt.connection.send({ type: 'input', command });
        } catch (error) { fail(error); }
      },
      disconnect() { if (runtime.current) stop(runtime.current); },
      clearError() { patch({ error: null }); },
    };
  }, []);
  return { state, actions };
}
