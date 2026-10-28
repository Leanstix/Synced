import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  windowChange: null as null | ((window: { packageName: string; isActive: boolean }) => void),
  isServiceEnabled: vi.fn(async () => true),
  getAccessibilityTree: vi.fn(async () => [{ nodeId: '1', children: [], isEditable: true, isFocused: true, isEnabled: true }]),
  tap: vi.fn(async () => true), longPress: vi.fn(async () => true), swipe: vi.fn(async () => true),
  globalAction: vi.fn(async () => true), setNodeText: vi.fn(async () => true), requestServiceEnable: vi.fn(async () => undefined),
  remove: vi.fn(), alarm: vi.fn(async () => undefined),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Dimensions: { get: () => ({ width: 360, height: 720 }) }, PixelRatio: { get: () => 3 } }));
vi.mock('react-native-accessibility-controller', () => ({
  ...native,
  onWindowChange: (callback: typeof native.windowChange) => { native.windowChange = callback; return { remove: native.remove }; },
}));
vi.mock('expo-intent-launcher', () => ({ startActivityAsync: native.alarm }));
import { InputController, isProtectedPackage, isRemoteInput } from '../src/core/input';

const foreground = (packageName: string) => native.windowChange?.({ packageName, isActive: true });
beforeEach(() => {
  vi.clearAllMocks();
  native.isServiceEnabled.mockResolvedValue(true);
  native.getAccessibilityTree.mockResolvedValue([{ nodeId: '1', children: [], isEditable: true, isFocused: true, isEnabled: true }]);
});

describe('input validation and protected surfaces', () => {
  it('bounds coordinates, durations, text, alarm ranges, and global actions', () => {
    expect(isRemoteInput({ type: 'tap', x: NaN, y: 0 })).toBe(false);
    expect(isRemoteInput({ type: 'tap', x: 1.01, y: 0 })).toBe(false);
    expect(isRemoteInput({ type: 'swipe', fromX: 0, fromY: 0, toX: 1, toY: 1, durationMs: 99999 })).toBe(false);
    expect(isRemoteInput({ type: 'setFocusedText', text: 'x'.repeat(2001) })).toBe(false);
    expect(isRemoteInput({ type: 'globalAction', action: 'quickSettings' })).toBe(false);
    expect(isRemoteInput({ type: 'setAlarm', hour: 24, minute: 0 })).toBe(false);
    expect(isRemoteInput({ type: 'setAlarm', hour: 6, minute: 30 })).toBe(true);
    for (const name of [null, '', 'android', 'com.android.systemui', 'com.android.settings', 'com.google.android.permissioncontroller', 'com.leanstix.synced']) expect(isProtectedPackage(name)).toBe(true);
    expect(isProtectedPackage('com.example.notes')).toBe(false);
  });
  it('requires capture plus an explicit grant and known ordinary foreground app', async () => {
    const revoked = vi.fn(); const input = new InputController(revoked);
    await expect(input.grant()).rejects.toThrow('screen sharing');
    input.setSharing(true); await input.grant();
    await input.execute({ type: 'tap', x: 0.5, y: 0.5 });
    expect(native.tap).not.toHaveBeenCalled(); expect(revoked).toHaveBeenCalled();
    foreground('com.example.notes'); await input.grant();
    await input.execute({ type: 'tap', x: 0.5, y: 0.5 });
    expect(native.tap).toHaveBeenCalledWith(540, 1080);
    input.dispose(); expect(native.remove).toHaveBeenCalled();
  });
  it('revokes immediately entering SystemUI and does not resume automatically', async () => {
    const revoked = vi.fn(); const input = new InputController(revoked);
    foreground('com.example.notes'); input.setSharing(true); await input.grant();
    foreground('com.android.systemui'); foreground('com.example.notes');
    await input.execute({ type: 'tap', x: 0, y: 0 });
    expect(revoked).toHaveBeenCalled(); expect(native.tap).not.toHaveBeenCalled();
    input.dispose();
  });
  it('cancels an action awaiting accessibility tree when capture is stopped', async () => {
    const input = new InputController(vi.fn()); foreground('com.example.notes'); input.setSharing(true); await input.grant();
    let resolveTree!: (nodes: Awaited<ReturnType<typeof native.getAccessibilityTree>>) => void;
    let didStart!: () => void;
    const treeStarted = new Promise<void>(resolve => { didStart = resolve; });
    native.getAccessibilityTree.mockImplementationOnce(() => new Promise(resolve => { resolveTree = resolve; didStart(); }));
    const action = input.execute({ type: 'tap', x: 0.2, y: 0.3 });
    await treeStarted; input.setSharing(false);
    resolveTree([{ nodeId: '1', children: [], isEditable: true, isFocused: true, isEnabled: true }]);
    await action; expect(native.tap).not.toHaveBeenCalled(); input.dispose();
  });
  it('permits only safe Home from the grant screen, then controls an ordinary app', async () => {
    const input = new InputController(vi.fn()); foreground('com.leanstix.synced'); input.setSharing(true); await input.grant();
    await expect(input.execute({ type: 'tap', x: 0.8, y: 0.9 })).rejects.toThrow('Home');
    await input.execute({ type: 'globalAction', action: 'home' });
    expect(native.globalAction).toHaveBeenCalledWith('home');
    foreground('com.example.notes');
    // Advance the action clock without introducing a blocking timer.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 100);
    await input.execute({ type: 'tap', x: 0, y: 0 });
    expect(native.tap).toHaveBeenCalledWith(0, 0);
    clock.mockRestore(); input.dispose();
  });
  it('types only into the single focused node, and invokes visible alarm UI', async () => {
    const input = new InputController(vi.fn()); foreground('com.example.notes'); input.setSharing(true); await input.grant();
    await input.execute({ type: 'setFocusedText', text: 'hello' });
    expect(native.setNodeText).toHaveBeenCalledWith('1', 'hello'); input.dispose();
    const alarmInput = new InputController(vi.fn()); foreground('com.example.notes'); alarmInput.setSharing(true); await alarmInput.grant();
    await alarmInput.execute({ type: 'setAlarm', hour: 7, minute: 45 });
    expect(native.alarm).toHaveBeenCalledWith('android.intent.action.SET_ALARM', { extra: {
      'android.intent.extra.alarm.HOUR': 7, 'android.intent.extra.alarm.MINUTES': 45, 'android.intent.extra.alarm.SKIP_UI': false,
    } }); alarmInput.dispose();
  });
});
