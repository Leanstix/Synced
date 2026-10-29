import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseUi, findUi, assertEvidenceSafe, microphoneGrantedForOwner, shellQuote, type UiNode } from './dual-android-policy.mts';
export type AdbCommand = (args: string[], timeout?: number) => string;
export const realAdb: AdbCommand = (args, timeout = 30000) => execFileSync(process.env.ADB ?? 'adb', args, { encoding: 'utf8', timeout, maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'pipe'] });
export const delay = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
/** All app interaction uses the same public Android views as a person. */
export class AndroidUi {
  private width = 1080;
  private height = 1920;
  readonly serial: string;
  readonly packageName: string;
  private readonly execute: AdbCommand;
  private readonly pause: typeof delay;
  constructor(serial: string, packageName: string, execute: AdbCommand = realAdb, pause = delay) {
    this.serial = serial; this.packageName = packageName; this.execute = execute; this.pause = pause;
  }
  adb(args: string[], timeout?: number): string {
    try { return this.execute(['-s', this.serial, ...args], timeout); }
    catch { throw new Error(`Android command failed on selected device: ${args[0] ?? 'unknown'}. Raw command output withheld.`); }
  }
  install(apk: string): void { this.adb(['install', '-r', apk], 180000); }
  async launch(): Promise<void> {
    this.adb(['shell', 'am', 'force-stop', this.packageName]);
    this.adb(['shell', 'monkey', '-p', this.packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
    const dimensions = /(\d+)x(\d+)/.exec(this.adb(['shell', 'wm', 'size']));
    if (dimensions) { this.width = Number(dimensions[1]); this.height = Number(dimensions[2]); }
    await this.pause(1500);
  }
  dump(): UiNode[] { return parseUi(this.adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'])); }
  private swipe(down: boolean): void {
    const x = Math.round(this.width * 0.5), upper = Math.round(this.height * 0.28), lower = Math.round(this.height * 0.82);
    this.adb(['shell', 'input', 'swipe', String(x), String(down ? lower : upper), String(x), String(down ? upper : lower), '250']);
  }
  async top(): Promise<void> { for (let i = 0; i < 5; i++) this.swipe(false); await this.pause(200); }
  async locate(label: string, prefix = false): Promise<UiNode> {
    const match = (nodes: UiNode[]) => findUi(nodes, label, prefix) ?? nodes.find(n => [n.text, n.description].some(v => prefix ? v.toLowerCase().startsWith(label.toLowerCase()) : v.toLowerCase() === label.toLowerCase()));
    // Dialogs and nearby actions must be inspected before scrolling the app.
    const current = match(this.dump());
    if (current) return current;
    await this.top();
    for (let attempt = 0; attempt < 18; attempt++) {
      const nodes = this.dump();
      const node = match(nodes);
      if (node) return node;
      if (attempt === 8) await this.top(); else this.swipe(true);
      await this.pause(400);
    }
    // Labels are fixed script-owned public UI strings, never invitation values.
    throw new Error(`Expected public UI was not found: ${label}`);
  }
  async tap(label: string, prefix = false): Promise<void> {
    const node = await this.locate(label, prefix);
    if (!node.enabled) throw new Error(`Expected action is disabled: ${label}`);
    const [l, t, r, b] = node.bounds;
    this.adb(['shell', 'input', 'tap', String(Math.round((l + r) / 2)), String(Math.round((t + b) / 2))]); await this.pause(250);
  }
  async fill(label: string, value: string, prefix = false): Promise<void> {
    await this.tap(label, prefix);
    this.adb(['shell', 'input', 'keyevent', 'KEYCODE_MOVE_END']);
    this.adb(['shell', 'input', 'keycombination', '113', '29']);
    this.adb(['shell', 'input', 'keyevent', 'KEYCODE_DEL']);
    this.adb(['shell', 'input', 'text', shellQuote(value.replace(/ /g, '%s'))]);
    this.adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']); await this.pause(200);
  }
  async visible(label: string, prefix = false): Promise<void> { await this.locate(label, prefix); }
  async noAutoGrants(): Promise<void> { await this.visible('Your screen is private.'); await this.visible('Only you can control this phone.'); }
  async allowMicrophone(): Promise<void> {
    if (microphoneGrantedForOwner(this.adb(['shell', 'dumpsys', 'package', this.packageName]))) return;
    // Permission controller buttons are read and tapped directly, never app-op grants.
    for (let attempt = 0; attempt < 30; attempt++) {
      const nodes = this.dump();
      const button = nodes.find(node => node.enabled && [node.text, node.description].some(value => /^(While using the app|Only this time)$/i.test(value)));
      const microphone = nodes.some(node => /(?:record audio|microphone)/i.test(`${node.text} ${node.description}`));
      if (button && microphone) {
        const [l, t, r, b] = button.bounds;
        this.adb(['shell', 'input', 'tap', String(Math.round((l + r) / 2)), String(Math.round((t + b) / 2))]);
        await this.pause(250); return;
      }
      await this.pause(400);
    }
    throw new Error('Explicit Android microphone permission prompt was not found.');
  }
  privateIp(): string {
    const output = this.adb(['shell', 'ip', '-o', '-4', 'addr', 'show', 'wlan0']);
    const address = /\binet\s+(\d+\.\d+\.\d+\.\d+)\//.exec(output)?.[1];
    if (!address || !/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address) || address.split('.').some(octet => +octet > 255)) throw new Error('A private shared Wi-Fi address is required on wlan0.');
    return address;
  }
  screenshot(directory: string, name: string): void {
    assertEvidenceSafe(this.dump()); mkdirSync(directory, { recursive: true });
    // Binary output is kept separate from diagnostic text and only after the guard.
    const data = execFileSync(process.env.ADB ?? 'adb', ['-s', this.serial, 'exec-out', 'screencap', '-p'], { timeout: 30000, maxBuffer: 10_000_000 });
    writeFileSync(join(directory, name), data);
  }
  async enableTestAccessibility(): Promise<void> {
    const component = `${this.packageName}/com.beddatech.accessibilitycontroller.AccessibilityControllerService`;
    const previous = this.adb(['shell', 'settings', 'get', 'secure', 'enabled_accessibility_services']).trim();
    const services = [...new Set([...(previous && previous !== 'null' ? previous.split(':') : []), component])].join(':');
    this.adb(['shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', shellQuote(services)]);
    this.adb(['shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1']);
    await this.pause(1000);
  }
}
