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
