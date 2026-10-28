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
