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
