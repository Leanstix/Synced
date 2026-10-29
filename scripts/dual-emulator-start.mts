import {execFileSync, spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export interface LauncherCommands {
  run(file: string, args: string[], input?: string): string;
  launch(file: string, args: string[]): void;
  pause(ms: number): Promise<void>;
  now(): number;
}
const commands: LauncherCommands = {
  run: (file, args, input) => execFileSync(file, args, {encoding: 'utf8', input, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe']}),
  launch: (file, args) => { const child = spawn(file, args, {detached: true, stdio: 'ignore'}); child.on('error', () => {}); child.unref(); },
  pause: ms => new Promise(resolve => setTimeout(resolve, ms)), now: Date.now,
};
/** Owns only a uniquely named second AVD; never deletes the runner's first AVD. */
export async function startSecondEmulator(sdk: string, io: LauncherCommands = commands, timeoutMs = 240000, name = `synced-dual-${randomUUID()}`): Promise<void> {
  if (!sdk || !/^synced-dual-[a-zA-Z0-9-]+$/.test(name)) throw new Error('An Android SDK and unique Synced AVD name are required.');
  const adb = join(sdk, 'platform-tools/adb'), emulator = join(sdk, 'emulator/emulator'), manager = join(sdk, 'cmdline-tools/latest/bin/avdmanager');
  const devices = io.run(adb, ['devices']);
  if (/^emulator-5556\s/m.test(devices)) throw new Error('Second emulator port is already occupied, including offline devices.');
  if (!/^emulator-5554\s+device\s*$/m.test(devices)) throw new Error('First emulator must be online on port 5554.');
  const version = /(?:version\s+)(\d+)\.(\d+)/i.exec(io.run(emulator, ['-no-window', '-version']));
  if (!version || Number(version[1]) < 36 || (Number(version[1]) === 36 && Number(version[2]) < 5)) throw new Error('Emulator 36.5 or newer is required for shared Wi-Fi.');
  let owned = false;
  try {
    io.run(manager, ['create', 'avd', '--name', name, '--package', 'system-images;android-35;google_apis;x86_64'], 'no\n'); owned = true;
    io.launch(emulator, ['-avd', name, '-port', '5556', '-accel', 'on', '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim', '-gpu', 'swiftshader', '-memory', '2048', '-cores', '2']);
    const deadline = io.now() + timeoutMs;
    while (io.now() < deadline) {
      try {
        const booted = ['emulator-5554', 'emulator-5556'].every(serial => io.run(adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']).trim() === '1');
        if (booted) return;
      } catch { /* ADB may briefly report offline during boot. */ }
      await io.pause(2000);
    }
    throw new Error('Two-emulator boot deadline exceeded.');
  } catch {
    if (owned) {
      try { io.run(adb, ['-s', 'emulator-5556', 'emu', 'kill']); } catch { /* Already stopped. */ }
      try { io.run(manager, ['delete', 'avd', '--name', name]); } catch { /* Preserve original failure. */ }
    }
    throw new Error('Second emulator startup failed; owned AVD cleanup attempted.');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void startSecondEmulator(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? '').then(() => console.log('PASS two-emulators-booted')).catch(error => { console.error(error instanceof Error ? error.message : 'Emulator startup failed.'); process.exitCode = 1; });
}
