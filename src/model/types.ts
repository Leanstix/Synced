export type Role = 'IDLE' | 'HOST' | 'CONTROLLER';
export type ConnectionStatus = 'idle' | 'listening' | 'connecting' | 'verifying' | 'awaiting-approval' | 'connected' | 'disconnected' | 'error';

export type RemoteInput =
  | { type: 'tap'; x: number; y: number }
  | { type: 'longPress'; x: number; y: number }
  | { type: 'swipe'; fromX: number; fromY: number; toX: number; toY: number; durationMs: number }
  | { type: 'globalAction'; action: 'back' | 'home' | 'recents' }
  | { type: 'setFocusedText'; text: string }
  | { type: 'setAlarm'; hour: number; minute: number };

export interface SyncedState {
  role: Role;
  status: ConnectionStatus;
  invitation: string | null;
  localAddress: string | null;
  remoteAddress: string | null;
  pendingPeer: { address: string; comparisonCode: string } | null;
  comparisonCode: string | null;
  screenSharing: boolean;
  controlEnabled: boolean;
  accessibilityEnabled: boolean;
  remoteStreamUrl: string | null;
  remoteStreamSize: { width: number; height: number } | null;
  error: string | null;
  capabilities: { localNetwork: boolean; screenSharing: boolean; remoteControl: boolean; bluetooth: false; callAudio: false; persistentPairing: false };
}

export interface SyncedActions {
  startHost(options?: { privateAddress?: string }): Promise<void>;
  connect(invitation: string): Promise<void>;
  approvePeer(): void;
  rejectPeer(): void;
  startScreenSharing(): Promise<void>;
  stopScreenSharing(): void;
  setControlEnabled(enabled: boolean): Promise<void>;
  requestAccessibility(): Promise<void>;
  refreshPermissions(): Promise<void>;
  sendInput(command: RemoteInput): void;
  disconnect(): void;
  clearError(): void;
}

export const INITIAL_STATE: SyncedState = {
  role: 'IDLE', status: 'idle', invitation: null, localAddress: null, remoteAddress: null,
  pendingPeer: null, comparisonCode: null, screenSharing: false, controlEnabled: false,
  accessibilityEnabled: false, remoteStreamUrl: null, remoteStreamSize: null, error: null,
  capabilities: { localNetwork: false, screenSharing: false, remoteControl: false, bluetooth: false, callAudio: false, persistentPairing: false },
};
