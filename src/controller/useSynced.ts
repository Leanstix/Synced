import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  DeviceEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from "react-native";

export type Role = "IDLE" | "HOST" | "CONTROLLER";
export interface UiState {
  role: Role;
  status: string;
  invitation: string;
  addresses: string;
  pendingPeer: string | null;
  connected: boolean;
  capturing: boolean;
  accessibilityEnabled: boolean;
  controlAllowed: boolean;
  peerName: string;
  /** An authenticated JPEG received from the approved host. Never a simulated frame. */
  remoteFrame: string | null;
  error: string | null;
}
export interface UiActions {
  startHosting(): void;
  connect(invitation: string): void;
  approvePeer(): void;
  rejectPeer(): void;
  startScreenSharing(): void;
  openAccessibilitySettings(): void;
  setControlAllowed(allowed: boolean): void;
  disconnect(): void;
  sendGesture(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs: number
  ): void;
  sendText(text: string): void;
  sendAction(action: string): void;
}
type NativeState = Omit<UiState, "remoteFrame"> & { _sessionId?: number };
interface SyncedBridge {
  getState(): Promise<NativeState>;
  ackFrame?(): void;
  startHosting(): void;
  connect(invitation: string): void;
  approvePeer(allow: boolean): void;
  startCapture(): void;
  openAccessibilitySettings(): void;
  setControlAllowed(allowed: boolean): void;
  disconnect(): void;
  sendGesture(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    duration: number
  ): void;
  sendText(text: string): void;
  sendAction(action: string): void;
}
export const initialState: UiState = {
  role: "IDLE",
  status: "Ready for a connection you approve.",
  invitation: "",
  addresses: "",
  pendingPeer: null,
  connected: false,
  capturing: false,
  accessibilityEnabled: false,
  controlAllowed: false,
  peerName: "",
  remoteFrame: null,
  error: null,
};
const native = NativeModules.Synced as SyncedBridge | undefined;

export function useSynced(): { state: UiState; actions: UiActions } {
  const [state, setState] = useState<UiState>(initialState);
  useEffect(() => {
    if (!native) {
      setState((previous) => ({
        ...previous,
        error:
          "The Android Synced module is unavailable. Install the native Android build.",
      }));
      return;
    }
    let disposed = false;
    let liveVersion = 0;
    let sessionId = -1;
    const apply = (next: NativeState) => {
      const sameSession = sessionId === (next._sessionId ?? 0);
      sessionId = next._sessionId ?? 0;
      setState((previous) => ({
        ...next,
        remoteFrame:
          sameSession && next.capturing && next.role === "CONTROLLER"
            ? previous.remoteFrame
            : null,
      }));
    };
    const status = DeviceEventEmitter.addListener(
      "SyncedState",
      (next: NativeState) => {
        liveVersion += 1;
        apply(next);
      }
    );
    const frames = DeviceEventEmitter.addListener(
      "SyncedFrame",
      (frame: { uri: string; sessionId?: number }) => {
        native.ackFrame?.();
        if ((frame.sessionId ?? 0) !== sessionId) return;
        setState((previous) =>
          previous.connected &&
          previous.role === "CONTROLLER" &&
          previous.capturing
            ? { ...previous, remoteFrame: frame.uri }
            : previous
        );
      }
    );
    native
      .getState()
      .then((next) => {
        if (!disposed && liveVersion === 0) apply(next);
      })
      .catch(() => {
        if (!disposed)
          setState((previous) => ({
            ...previous,
            error: "Could not read the native session.",
          }));
      });
    return () => {
      disposed = true;
      status.remove();
      frames.remove();
    };
  }, []);
  const actions = useMemo<UiActions>(
    () => ({
      startHosting: () => native?.startHosting(),
      connect: (invitation) => native?.connect(invitation.trim()),
      approvePeer: () => native?.approvePeer(true),
      rejectPeer: () => native?.approvePeer(false),
      disconnect: () => native?.disconnect(),
      startScreenSharing: () => {
        void (async () => {
          if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
            );
          }
          native?.startCapture();
        })().catch(() => native?.startCapture());
      },
      openAccessibilitySettings: () =>
        Alert.alert(
          "Enable remote input on this phone",
          "Synced uses Android Accessibility to tap, swipe, navigate and replace a focused text field only during a session you approve. Screen package information protects system permission screens and Synced's controls. It does not unlock your phone. Enable Synced in Accessibility settings, then return and allow control for this session. Disable the service in Settings at any time.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open settings",
              onPress: () => native?.openAccessibilitySettings(),
            },
          ]
        ),
      setControlAllowed: (allowed) => {
        if (!allowed) {
          native?.setControlAllowed(false);
          return;
        }
        Alert.alert(
          "Allow this phone to control your screen?",
          "Your approved phone can tap, swipe, replace normal text fields, navigate and open clock actions while sharing is active. Keep private apps closed. Stop sharing or turn control off to revoke.",
          [
            { text: "Keep control off", style: "cancel" },
            {
              text: "Allow control",
              onPress: () => native?.setControlAllowed(true),
            },
          ]
        );
      },
      sendGesture: (sx, sy, ex, ey, duration) => {
        if (
          [sx, sy, ex, ey].every(
            (n) => Number.isFinite(n) && n >= 0 && n <= 1
          ) &&
          Number.isFinite(duration)
        ) {
          native?.sendGesture(
            sx,
            sy,
            ex,
            ey,
            Math.max(50, Math.min(1500, Math.round(duration)))
          );
        }
      },
      sendText: (text) => {
        if (text.length > 0 && text.length <= 1000) native?.sendText(text);
      },
      sendAction: (action) => {
        if (
          [
            "back",
            "home",
            "recents",
            "alarms",
            "dismiss_alarm",
            "snooze_alarm",
          ].includes(action) ||
          /^set_alarm:([01]?\d|2[0-3]):([0-5]?\d)$/.test(action)
        )
          native?.sendAction(action);
      },
    }),
    []
  );
  return { state, actions };
}
