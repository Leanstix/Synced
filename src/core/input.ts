import { Dimensions, PixelRatio, Platform } from 'react-native';
import * as Accessibility from 'react-native-accessibility-controller';
import * as IntentLauncher from 'expo-intent-launcher';
import { dialerUri, openDialer } from './calls';
import type { RemoteInput } from '../model/types';

const coordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
export function isRemoteInput(value: unknown): value is RemoteInput {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  switch (command.type) {
    case 'tap': case 'longPress': return coordinate(command.x) && coordinate(command.y);
    case 'swipe': return coordinate(command.fromX) && coordinate(command.fromY) && coordinate(command.toX) && coordinate(command.toY) &&
      Number.isInteger(command.durationMs) && (command.durationMs as number) >= 100 && (command.durationMs as number) <= 2000;
    case 'globalAction': return ['back', 'home', 'recents'].includes(command.action as string);
    case 'setFocusedText': return typeof command.text === 'string' && command.text.length <= 2000 && !command.text.includes('\u0000');
    case 'openDialer':
      try { dialerUri(command.number as string); return true; } catch { return false; }
    case 'setAlarm': return Number.isInteger(command.hour) && (command.hour as number) >= 0 && (command.hour as number) <= 23 &&
      Number.isInteger(command.minute) && (command.minute as number) >= 0 && (command.minute as number) <= 59;
    default: return false;
  }
}

/** Unknown windows and sensitive system surfaces never receive remote actions. */
export function isProtectedPackage(packageName: string | null): boolean {
  if (!packageName || !/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/.test(packageName)) return true;
  return packageName === 'android' || packageName === 'com.leanstix.synced' ||
    /(?:^|\.)(?:systemui|settings|permissioncontroller|packageinstaller|keyguard|credentialmanager|authenticator|securitycenter|wallet)(?:\.|$)/i.test(packageName) ||
    /(?:^|\.)(?:bank|banking|password|passwords|bitwarden|lastpass|onepassword|authy)(?:\.|$)/i.test(packageName);
}

function flatten(nodes: Accessibility.AccessibilityNode[]): Accessibility.AccessibilityNode[] {
  const result: Accessibility.AccessibilityNode[] = [];
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    if (result.length >= 10000) throw new Error('Accessibility tree is too large.');
    result.push(node);
    stack.push(...node.children);
  }
  return result;
}

/** Local grants are independent from pairing and capture. No commands are persisted. */
export class InputController {
  private enabled = false;
  private sharing = false;
  private bluetoothControlAllowed = false;
  private foreground: string | null = null;
  private generation = 0;
  private windowVersion = 0;
  private busy = false;
  private lastAction = 0;
  private subscription: Accessibility.Subscription | null = null;
  constructor(private onRevoke: (reason?: string) => void) {
    if (Platform.OS === 'android') this.subscription = Accessibility.onWindowChange(window => {
      this.windowVersion++;
      this.foreground = window.isActive ? window.packageName : null;
      // The grant dialog itself belongs to Synced. It may dismiss after the grant
      // resolves; only Home or a visible alarm/dialer intent is allowed on this surface.
      const ownerOpeningApp = this.foreground === 'com.leanstix.synced';
      if (this.enabled && isProtectedPackage(this.foreground) && !ownerOpeningApp) this.revoke('Remote control stopped on a protected or unknown system screen.');
    });
  }
  async isAvailable(): Promise<boolean> {
    return Platform.OS === 'android' && await Accessibility.isServiceEnabled();
  }
  async requestService(): Promise<void> {
    if (Platform.OS !== 'android') throw new Error('Remote control requires Android.');
    await Accessibility.requestServiceEnable();
  }
  setSharing(sharing: boolean): void { this.sharing = sharing; if (!sharing) this.revoke(); }
  /** Call only after fresh local owner consent; pairing alone never authorizes input. */
  setBluetoothControlAllowed(allowed: boolean): void {
    this.bluetoothControlAllowed = allowed;
    if (!allowed) this.revoke();
  }
  private hasControlContext(): boolean { return this.sharing || this.bluetoothControlAllowed; }
  async grant(): Promise<void> {
    const generation = ++this.generation;
    if (!this.hasControlContext()) throw new Error('Start screen sharing or locally allow Bluetooth control first.');
    if (!await this.isAvailable()) throw new Error('Enable Synced in Android Accessibility settings first.');
    if (generation !== this.generation || !this.hasControlContext()) throw new Error('Control request expired.');
    this.enabled = true;
  }
  revoke(reason?: string): void {
    const wasEnabled = this.enabled;
    this.enabled = false; this.bluetoothControlAllowed = false; this.generation++;
    if (wasEnabled) this.onRevoke(reason);
  }
  dispose(): void { this.revoke(); this.subscription?.remove(); this.subscription = null; }

  async execute(value: unknown): Promise<void> {
    if (!isRemoteInput(value)) throw new Error('Invalid remote action.');
    if (!this.enabled || !this.hasControlContext() || this.busy) return;
    const safeOwnerAction = this.foreground === 'com.leanstix.synced' &&
      ((value.type === 'globalAction' && value.action === 'home') || value.type === 'setAlarm' || value.type === 'openDialer');
    if (isProtectedPackage(this.foreground) && !safeOwnerAction) {
      if (this.foreground === 'com.leanstix.synced') throw new Error('Press Home or open the target app locally on the host phone first.');
      this.revoke('Open an ordinary app locally, then allow control again.'); return;
    }
    if (Date.now() - this.lastAction < 60) return;
    this.lastAction = Date.now(); this.busy = true;
    const generation = this.generation;
    const version = this.windowVersion;
    try {
      if (!await this.isAvailable()) { this.revoke('Android Accessibility access was disabled.'); return; }
      if (generation !== this.generation || version !== this.windowVersion || !this.enabled || !this.hasControlContext()) return;
      // Native tree is consulted immediately before each action. The package API does
      // not expose isPassword, so this guard must not be described as password detection.
      const tree = flatten(await Accessibility.getAccessibilityTree());
      if (!tree.length) { this.revoke('Cannot verify the active app.'); return; }
      if (generation !== this.generation || version !== this.windowVersion || !this.enabled || !this.hasControlContext()) return;
      const screen = Dimensions.get('screen');
      const width = Math.round(screen.width * PixelRatio.get());
      const height = Math.round(screen.height * PixelRatio.get());
      const x = (fraction: number) => Math.min(width - 1, Math.round(fraction * width));
      const y = (fraction: number) => Math.min(height - 1, Math.round(fraction * height));
      let succeeded = true;
      switch (value.type) {
        case 'tap': succeeded = await Accessibility.tap(x(value.x), y(value.y)); break;
        case 'longPress': succeeded = await Accessibility.longPress(x(value.x), y(value.y)); break;
        case 'swipe': succeeded = await Accessibility.swipe(x(value.fromX), y(value.fromY), x(value.toX), y(value.toY), value.durationMs); break;
        case 'globalAction': succeeded = await Accessibility.globalAction(value.action); break;
        case 'setFocusedText': {
          const focused = tree.filter(node => node.isEditable && node.isFocused && node.isEnabled);
          if (focused.length !== 1) throw new Error('Tap a visible editable field in the host app first.');
          succeeded = await Accessibility.setNodeText(focused[0]!.nodeId, value.text); break;
        }
        case 'openDialer': await openDialer(value.number); break;
        case 'setAlarm':
          await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
            extra: { 'android.intent.extra.alarm.HOUR': value.hour, 'android.intent.extra.alarm.MINUTES': value.minute, 'android.intent.extra.alarm.SKIP_UI': false },
          });
          break;
      }
      if (!succeeded) throw new Error('Android could not perform that action.');
    } finally { this.busy = false; }
  }
}
