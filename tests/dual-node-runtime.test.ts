import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
const node = (code: string) => execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10000 });
describe('direct Node emulator harness runtime', () => {
  it('imports the UI adapter without TypeScript transformation flags or ADB', () => expect(node("await import('./scripts/dual-android-ui.mts'); console.log('loaded')")).toBe('loaded\n'));
  it('constructs device identity fields in Node strip-only mode', () => expect(node("const {AndroidUi}=await import('./scripts/dual-android-ui.mts');const p=new AndroidUi('emulator-5554','com.leanstix.synced');console.log(p.serial,p.packageName)")).toBe('emulator-5554 com.leanstix.synced\n'));
  it('executes injected device commands with the explicit selected serial', () => expect(node("const {AndroidUi}=await import('./scripts/dual-android-ui.mts');const p=new AndroidUi('emulator-5556','com.leanstix.synced',a=>a.join(' '));console.log(p.adb(['shell','getprop']))")).toBe('-s emulator-5556 shell getprop\n'));
  it('imports pairing and voice orchestration without running the CLI', () => expect(node("const m=await import('./scripts/dual-android.mts');console.log(typeof m.pairSaveReconnect,typeof m.voiceLink)")).toBe('function function\n'));
  it('imports the second-emulator launcher without spawning a guest', () => expect(node("const m=await import('./scripts/dual-emulator-start.mts');console.log(typeof m.startSecondEmulator)")).toBe('function\n'));
});
