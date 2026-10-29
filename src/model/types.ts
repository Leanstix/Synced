export type Role = 'IDLE' | 'HOST' | 'CONTROLLER';
export type Transport = 'wifi' | 'bluetooth';
export interface SavedDevice {
  id: string;
  name: string;
  role: 'HOST' | 'CONTROLLER';
  endpoint?: { address: string; port: number };
  bluetoothAddress?: string;
  savedAt: number;
}
export interface BluetoothPeer { address: string; name: string }
export interface VoiceStatus { phase: 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active'; muted: boolean }
export type ConnectionStatus = 'idle' | 'listening' | 'connecting' | 'verifying' | 'awaiting-approval' | 'connected' | 'disconnected' | 'error';

export type RemoteInput =
  | { type: 'tap'; x: number; y: number }
  | { type: 'longPress'; x: number; y: number }
  | { type: 'swipe'; fromX: number; fromY: number; toX: number; toY: number; durationMs: number }
  | { type: 'globalAction'; action: 'back' | 'home' | 'recents' }
  | { type: 'setFocusedText'; text: string }
  | { type: 'setAlarm'; hour: number; minute: number }
  | { type: 'openDialer'; number: string };

export interface SyncedState {
  role: Role;
  transport: Transport;
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
  trustReady: boolean;
  savedPeers: SavedDevice[];
  peerIdentity: { id: string; name: string } | null;
  pairingState: 'unavailable' | 'available' | 'requested' | 'saved';
  reconnect: { active: boolean; attempt: number; maxAttempts: number };
  bluetooth: { devices: BluetoothPeer[]; loading: boolean; enabled: boolean | null };
  voice: VoiceStatus;
  capabilities: { localNetwork: boolean; screenSharing: boolean; remoteControl: boolean; bluetooth: boolean; callAudio: false; persistentPairing: boolean; voiceLink: boolean };
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
  savePairing(): Promise<void>;
  forgetPeer(id: string): Promise<void>;
  receiveTrustedPeer(id: string, options?: { privateAddress?: string; port?: number; transport?: Transport }): Promise<void>;
  reconnectPeer(id: string, options?: { address?: string; port?: number; retry?: boolean; transport?: Transport }): Promise<void>;
  cancelReconnect(): void;
  refreshBluetoothDevices(): Promise<void>;
  enableBluetooth(): Promise<void>;
  makeBluetoothDiscoverable(): Promise<void>;
  openBluetoothSettings(): Promise<void>;
  startBluetoothHost(): Promise<void>;
  connectBluetooth(invitation: string, address: string): Promise<void>;
  requestVoiceCall(): Promise<void>;
  acceptVoiceCall(): Promise<void>;
  rejectVoiceCall(): void;
  endVoiceCall(): void;
  setVoiceMuted(muted: boolean): void;
}

export const INITIAL_STATE: SyncedState = {
  role: 'IDLE', transport: 'wifi', status: 'idle', invitation: null, localAddress: null, remoteAddress: null,
  pendingPeer: null, comparisonCode: null, screenSharing: false, controlEnabled: false,
  accessibilityEnabled: false, remoteStreamUrl: null, remoteStreamSize: null, error: null,
  trustReady: false, savedPeers: [], peerIdentity: null, pairingState: 'unavailable',
  reconnect: { active: false, attempt: 0, maxAttempts: 4 },
  bluetooth: { devices: [], loading: false, enabled: null },
  voice: { phase: 'idle', muted: false },
  capabilities: { localNetwork: false, screenSharing: false, remoteControl: false, bluetooth: false, callAudio: false, persistentPairing: false, voiceLink: false },
};
