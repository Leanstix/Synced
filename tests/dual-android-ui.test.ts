import { describe, expect, it, vi } from 'vitest';
import { AndroidUi, type AdbCommand } from '../scripts/dual-android-ui.mts';
const dump = '<hierarchy><node text="Save phone" enabled="true" bounds="[20,30][100,70]"/></hierarchy>';
const instant = async () => {};
describe('dual Android public UI command boundary', () => {
  it('replaces existing input with an actual Ctrl+A chord before entering new text', async () => {
    const run = vi.fn<AdbCommand>(() => dump); await new AndroidUi('host', 'com.leanstix.synced', run, instant).fill('Save phone', '47631');
    expect(run).toHaveBeenCalledWith(['-s', 'host', 'shell', 'input', 'keycombination', '113', '29'], undefined);
    expect(run).toHaveBeenCalledWith(['-s', 'host', 'shell', 'input', 'text', "'47631'"], undefined);
  });
  it('targets every Android command to its explicit serial', async () => { const run = vi.fn<AdbCommand>(() => dump); const phone = new AndroidUi('emulator-5554', 'com.leanstix.synced', run, instant); await phone.tap('Save phone'); expect(run.mock.calls.every(([args]) => args[0] === '-s' && args[1] === 'emulator-5554')).toBe(true); });
  it('taps the center of enabled public node bounds', async () => { const run = vi.fn<AdbCommand>(() => dump); await new AndroidUi('host', 'com.leanstix.synced', run, instant).tap('Save phone'); expect(run).toHaveBeenCalledWith(['-s', 'host', 'shell', 'input', 'tap', '60', '50'], undefined); });
  it('refuses disabled actions rather than bypassing UI consent', async () => { const run = vi.fn<AdbCommand>(() => dump.replace('enabled="true"', 'enabled="false"')); await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).tap('Save phone')).rejects.toThrow('disabled'); expect(run.mock.calls.some(([args]) => args.includes('tap'))).toBe(false); });
  it('bounds polling when an expected UI action never appears', async () => { const run = vi.fn<AdbCommand>(() => dump); await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).locate('Missing')).rejects.toThrow('not found'); expect(run.mock.calls.filter(([args]) => args.includes('uiautomator'))).toHaveLength(19); });
  it('never propagates raw adb output that might contain invitation XML', () => { const run = vi.fn<AdbCommand>(() => { throw new Error('synced://private SHOULD_NOT_ESCAPE'); }); expect(() => new AndroidUi('host', 'com.leanstix.synced', run, instant).dump()).toThrow('Raw command output withheld'); try { new AndroidUi('host', 'com.leanstix.synced', run, instant).dump(); } catch (error) { expect(String(error)).not.toContain('SHOULD_NOT_ESCAPE'); } });
  it('uses a private wlan0 address and refuses public or missing addresses', () => { const phone = (output: string) => new AndroidUi('host', 'com.leanstix.synced', () => output, instant); expect(phone('2: wlan0 inet 192.168.1.2/24').privateIp()).toBe('192.168.1.2'); expect(() => phone('2: wlan0 inet 8.8.8.8/24').privateIp()).toThrow(); expect(() => phone('').privateIp()).toThrow(); });
});

describe('explicit Android microphone permission', () => {
  const permission = (button = 'While using the app', question = 'Allow Synced to record audio?', enabled = true) => `<hierarchy><node text="${question}" bounds="[0,0][100,40]"/><node text="${button}" enabled="${enabled}" bounds="[20,40][100,80]"/></hierarchy>`;
  it.each(['While using the app', 'Only this time'])('taps the explicit %s permission choice', async button => {const run = vi.fn<AdbCommand>(() => permission(button)); await new AndroidUi('host', 'com.leanstix.synced', run, instant).allowMicrophone(); expect(run).toHaveBeenCalledWith(['-s', 'host', 'shell', 'input', 'tap', '60', '60'], undefined); expect(run.mock.calls.some(([args]) => args.includes('grant'))).toBe(false);});
  it('refuses an unrelated permission dialog', async () => {const run = vi.fn<AdbCommand>(() => permission('While using the app', 'Allow camera?')); await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).allowMicrophone()).rejects.toThrow('microphone'); expect(run.mock.calls.some(([args]) => args.includes('tap'))).toBe(false);});
  it('refuses disabled permission buttons', async () => {const run = vi.fn<AdbCommand>(() => permission('Only this time', undefined, false)); await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).allowMicrophone()).rejects.toThrow();});
  it('never taps denial or permanent permission choices', async () => {const run = vi.fn<AdbCommand>(() => permission('Don’t allow')); await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).allowMicrophone()).rejects.toThrow(); expect(run.mock.calls.filter(([args]) => args.includes('uiautomator'))).toHaveLength(30);});
  it('waits through transient app UI until the microphone prompt arrives', async () => {let reads = 0; const run = vi.fn<AdbCommand>(args => args.includes('uiautomator') && ++reads < 3 ? dump : permission()); await new AndroidUi('host', 'com.leanstix.synced', run, instant).allowMicrophone(); expect(reads).toBe(3);});
});


describe('current visible Android UI lookup', () => {
  it.each(['Save phone', 'save PHONE'])('finds current exact or case-insensitive label %s without swipes', async label => {
    const run = vi.fn<AdbCommand>(() => dump);
    await new AndroidUi('host', 'com.leanstix.synced', run, instant).locate(label);
    expect(run.mock.calls.some(([args]) => args.includes('swipe'))).toBe(false);
    expect(run.mock.calls).toHaveLength(1);
  });
  it('finds current case-insensitive prefix descriptions without swiping', async () => {
    const run = vi.fn<AdbCommand>(() => '<hierarchy><node content-desc="Comparison code: hidden" bounds="[0,0][100,80]"/></hierarchy>');
    await new AndroidUi('host', 'com.leanstix.synced', run, instant).locate('comparison CODE:', true);
    expect(run.mock.calls).toHaveLength(1);
  });
  it('refuses a disabled current action without swiping or tapping', async () => {
    const run = vi.fn<AdbCommand>(() => dump.replace('enabled="true"', 'enabled="false"'));
    await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).tap('Save phone')).rejects.toThrow('disabled');
    expect(run.mock.calls).toHaveLength(1);
  });
  it('recovers an offscreen action through the existing top and scroll search', async () => {
    let reads = 0;
    const run = vi.fn<AdbCommand>(args => args.includes('uiautomator') && ++reads < 3 ? '<hierarchy></hierarchy>' : dump);
    await new AndroidUi('host', 'com.leanstix.synced', run, instant).locate('Save phone');
    expect(reads).toBe(3);
    expect(run.mock.calls.filter(([args]) => args.includes('swipe'))).toHaveLength(6);
  });
  it('bounds a missing current action to 19 dumps and the existing top-scroll budget', async () => {
    const run = vi.fn<AdbCommand>(() => dump);
    await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).locate('Missing')).rejects.toThrow('not found');
    expect(run.mock.calls.filter(([args]) => args.includes('uiautomator'))).toHaveLength(19);
    expect(run.mock.calls.filter(([args]) => args.includes('swipe'))).toHaveLength(27);
  });
});

describe('retained microphone permission on emulator retries',()=>{
 it('honors an existing owner grant without pretending a new OS prompt appeared',async()=>{
  const run=vi.fn<AdbCommand>(()=>'User 0: installed=true\n runtime permissions:\n android.permission.RECORD_AUDIO: granted=true, flags=[USER_SET]');
  await new AndroidUi('emulator-5554','com.leanstix.synced',run,instant).allowMicrophone();
  expect(run).toHaveBeenCalledExactlyOnceWith(['-s','emulator-5554','shell','dumpsys','package','com.leanstix.synced'],undefined);
 });
});

describe('entire-screen Android OS consent variants', () => {
  const consent = (button = 'Start', scope = 'Entire screen', enabled = true, title = 'Start recording or casting with Synced?') => `<hierarchy><node text="${title}" bounds="[0,0][200,60]"/><node text="${scope}" bounds="[0,60][200,100]"/><node text="${button}" enabled="${enabled}" bounds="[160,300][240,340]"/></hierarchy>`;
  it.each(['Start', 'Start now'])('uses the actual OS %s button after entire-screen selection', async button => {
    const run = vi.fn<AdbCommand>(() => consent(button));
    await new AndroidUi('host', 'com.leanstix.synced', run, instant).allowEntireScreen();
    expect(run).toHaveBeenCalledWith(['-s', 'host', 'shell', 'input', 'tap', '200', '320'], undefined);
    expect(run.mock.calls.some(([args]) => args.includes('swipe') || args.includes('grant'))).toBe(false);
  });
  it('refuses single-app capture even with a valid Start button', async () => {
    const run = vi.fn<AdbCommand>(() => consent('Start', 'A single app'));
    await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).allowEntireScreen()).rejects.toThrow('entire-screen');
    expect(run.mock.calls.some(([args]) => args.includes('tap'))).toBe(false);
  });
  it('refuses disabled OS confirmation', async () => {
    const run = vi.fn<AdbCommand>(() => consent('Start', undefined, false));
    await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).allowEntireScreen()).rejects.toThrow();
    expect(run.mock.calls.some(([args]) => args.includes('tap'))).toBe(false);
  });
  it('rejects similarly named app actions outside the Android consent dialog', async () => {
    const run = vi.fn<AdbCommand>(() => consent('Start', undefined, true, 'Synced home screen'));
    await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).allowEntireScreen()).rejects.toThrow();
    expect(run.mock.calls.some(([args]) => args.includes('tap'))).toBe(false);
  });
  it('waits for the actual confirmation without scrolling a system dialog', async () => {
    let reads = 0;
    const run = vi.fn<AdbCommand>(args => args.includes('uiautomator') && ++reads < 3 ? '<hierarchy></hierarchy>' : consent());
    await new AndroidUi('host', 'com.leanstix.synced', run, instant).allowEntireScreen();
    expect(reads).toBe(3); expect(run.mock.calls.some(([args]) => args.includes('swipe'))).toBe(false);
  });
  it('bounds missing consent polling and never taps a denial choice', async () => {
    const run = vi.fn<AdbCommand>(() => consent('Cancel'));
    await expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).allowEntireScreen()).rejects.toThrow();
    expect(run.mock.calls.filter(([args]) => args.includes('uiautomator'))).toHaveLength(20);
    expect(run.mock.calls.some(([args]) => args.includes('tap'))).toBe(false);
  });
});

describe('sandbox Pixel Launcher ANR recovery', () => {
  const dialog = (title = "Pixel Launcher isn't responding", button = 'Close app', enabled = true) => `<hierarchy><node text="${title}" bounds="[0,0][200,80]"/><node text="${button}" enabled="${enabled}" bounds="[20,100][180,140]"/></hierarchy>`;
  it.each(["Pixel Launcher isn't responding", 'Pixel Launcher isn’t responding'])('closes only the observed launcher dialog variant %s', title => {
    const run = vi.fn<AdbCommand>(() => dialog(title));
    expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).dismissLauncherAnr()).toBe(true);
    expect(run).toHaveBeenCalledWith(['-s', 'host', 'shell', 'input', 'tap', '100', '120'], undefined);
  });
  it.each(["Synced isn't responding", "System UI isn't responding", "Messages isn't responding"])('does not hide the failure %s', title => {
    const run = vi.fn<AdbCommand>(() => dialog(title));
    expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).dismissLauncherAnr()).toBe(false);
    expect(run.mock.calls.some(([args]) => args.includes('tap'))).toBe(false);
  });
  it('refuses disabled Close app buttons', () => {
    const run = vi.fn<AdbCommand>(() => dialog(undefined, undefined, false));
    expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).dismissLauncherAnr()).toBe(false);
    expect(run.mock.calls.some(([args]) => args.includes('tap'))).toBe(false);
  });
  it('does not choose Wait or issue process-kill commands', () => {
    const run = vi.fn<AdbCommand>(() => dialog(undefined, 'Wait'));
    expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).dismissLauncherAnr()).toBe(false);
    expect(run.mock.calls).toHaveLength(1);
  });
  it('leaves an ordinary Synced screen untouched', () => {
    const run = vi.fn<AdbCommand>(() => dump);
    expect(new AndroidUi('host', 'com.leanstix.synced', run, instant).dismissLauncherAnr()).toBe(false);
    expect(run.mock.calls).toHaveLength(1);
  });
});

describe('remote-safe controller app scrolling', () => {
  it.each([
    [320, 640, 1], [480, 800, 1], [1080, 2400, 3], [1440, 3200, 4], [800, 1280, 1.5],
  ])('keeps app navigation outside the shared viewport at %sx%s density %s', async (width, height, density) => {
    const run = vi.fn<AdbCommand>(args => args.includes('size') ? `Physical size: ${width}x${height}` : dump);
    const ui = new AndroidUi('controller', 'com.leanstix.synced', run, instant); await ui.launch(); await ui.top();
    const swipes = run.mock.calls.filter(([args]) => args.includes('swipe'));
    expect(swipes).toHaveLength(5);
    for (const [args] of swipes) {
      const index = args.indexOf('swipe'); const [x1, y1, x2, y2] = args.slice(index + 1, index + 5).map(Number);
      expect(x1).toBeGreaterThan(0); expect(x1).toBeLessThan(22 * density); expect(x2).toBe(x1);
      expect(y1).toBeGreaterThan(0); expect(y2).toBeLessThan(height);
    }
  });
  it('finds an offscreen control caption by scrolling the app instead of sending host swipes', async () => {
    let scrolled = false, hostGestures = 0;
    const run = vi.fn<AdbCommand>(args => {
      const index = args.indexOf('swipe');
      if (index !== -1) { if (+args[index + 1]! < 22) scrolled = true; else hostGestures++; }
      return scrolled ? dump.replace('Save phone', 'Touch control allowed') : '<hierarchy></hierarchy>';
    });
    await new AndroidUi('controller', 'com.leanstix.synced', run, instant).locate('Touch control allowed');
    expect(scrolled).toBe(true); expect(hostGestures).toBe(0);
  });
});
