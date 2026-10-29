import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AndroidUi, delay } from './dual-android-ui.mts';
import { comparisonFromUi, invitationFromUi, validateSerials } from './dual-android-policy.mts';
import { redactReleaseLog } from './log-policy.mts';

export interface PairingPhone {
  serial: string; privateIp(): string; install(apk: string): void; launch(): Promise<void>; top(): Promise<void>;
  locate(label: string, prefix?: boolean): Promise<unknown>; dump(): ReturnType<AndroidUi['dump']>;
  tap(label: string, prefix?: boolean): Promise<void>; fill(label: string, value: string, prefix?: boolean): Promise<void>;
  visible(label: string, prefix?: boolean): Promise<void>; noAutoGrants(): Promise<void>;
}
export async function pairSaveReconnect(host: PairingPhone, controller: PairingPhone, apk: string, stage: (name: string) => void = () => {}): Promise<void> {
  validateSerials(host.serial, controller.serial);
  const hostIp = host.privateIp(), controllerIp = controller.privateIp();
  if (hostIp === controllerIp) throw new Error('Distinct shared Wi-Fi addresses are required; old isolated emulator NAT is not a two-device media network.');
  host.install(apk); controller.install(apk); await host.launch(); await controller.launch(); stage('installed-and-opened');
  await host.tap('Need to enter a network address?'); await host.fill("This phone's private Wi-Fi address", hostIp);
  await host.tap('Create invitation', true); await host.locate('PRIVATE INVITATION');
  const invitation = invitationFromUi(host.dump());
  await controller.tap('Connect to a phone'); await controller.fill('Connection invitation', invitation); await controller.tap('Request connection', true);
  await host.locate('Comparison code:', true); const hostCode = comparisonFromUi(host.dump());
  await controller.locate('Comparison code:', true); const controllerCode = comparisonFromUi(controller.dump());
  if (hostCode !== controllerCode) throw new Error('Comparison codes do not match; approval refused.');
  await host.tap('The codes match · Approve'); await host.visible('Connected'); await controller.visible('Connected'); stage('pair-approved');
  await host.noAutoGrants(); stage('initial-grants-private');
  await host.tap('Save pairing'); await host.tap('Save phone'); await controller.tap('Save pairing'); await controller.tap('Save phone');
  await host.visible('Pairing saved'); await controller.visible('Pairing saved'); stage('mutual-save-completed');
  await host.tap('Disconnect phones'); await controller.visible('Disconnected'); stage('first-disconnect');
  await host.launch(); await controller.launch(); stage('cold-restart-saved-devices');
  await host.tap('Receive connection'); await host.fill('This phone’s private Wi-Fi address for saved pairing', hostIp); await host.fill('Connection port for ', '47631', true); await host.tap('Receive this phone’s connection');
  await controller.tap('Reconnect'); await controller.fill('Current Wi-Fi address for ', hostIp, true); await controller.fill('Connection port for ', '47631', true); await controller.tap('Reconnect to this phone');
  await host.visible('Connected'); await controller.visible('Connected'); await host.noAutoGrants(); stage('trusted-reconnect-no-grants');
}

export interface VoicePhone {
  visible(label: string): Promise<void>; tap(label: string): Promise<void>;
  dump(): ReturnType<AndroidUi['dump']>; allowMicrophone(): Promise<void>;
}
export async function voiceLink(host: VoicePhone, controller: VoicePhone, stage: (name: string) => void = () => {}) {
  await host.visible('Talk while you help.'); await controller.visible('Talk while you help.');
  await host.tap('Request voice link');
  await host.visible('Waiting for them to accept'); await controller.visible('A voice request is waiting');
  for (const phone of [host, controller]) {
    if (phone.dump().some(node => [node.text, node.description].includes('Voice link is active'))) throw new Error('Voice became active before explicit acceptance.');
  }
  stage('voice-waits-for-explicit-acceptance');
  await controller.tap('Accept · Use microphone'); await controller.allowMicrophone();
  await host.allowMicrophone();
  await host.visible('Voice link is active'); await controller.visible('Voice link is active'); stage('voice-link-active-both');
  for (const phone of [host, controller]) {
    await phone.tap('Mute my microphone'); await phone.visible('Your microphone is muted');
    await phone.tap('Unmute my microphone'); await phone.visible('Voice link is active');
  }
  stage('voice-mute-unmute-both');
  await controller.tap('End voice link');
  await host.visible('Talk while you help.'); await controller.visible('Talk while you help.'); stage('voice-ended-both-idle');
}

export async function screenAndControl(host: AndroidUi, controller: AndroidUi, stage: (name: string) => void, pause = delay) {
  await host.enableTestAccessibility();
  // Refresh the service state through the public button rather than an app hook.
  await host.tap('I enabled it · Check permission');
  await host.tap('Share my entire screen');
  // Android 14+ defaults to a single app. Entire screen is required for gestures.
  try { await host.tap('A single app'); } catch { /* Some Android images already show the choice list. */ }
  await host.tap('Entire screen');
  await host.tap('Start now');
  await controller.visible('Live remote phone screen');
  await host.tap('Allow touch control'); await host.tap('Allow control');
  await controller.visible('Touch control allowed'); stage('real-video-and-control-ready');
  await controller.tap('Home on the other phone'); await pause(1000);
  const resumed = host.adb(['shell', 'dumpsys', 'activity', 'activities']);
  const foreground = resumed.split('\n').filter(line => /(?:mResumedActivity|topResumedActivity)/.test(line)).join(' ');
  if (!/(?:launcher|NexusLauncherActivity|Launcher)/i.test(foreground) || foreground.includes(host.packageName)) throw new Error('Remote Home did not open the host launcher.');
  stage('remote-home-opened-launcher');
  // Bring the owner UI back through the normal launcher; the grants remain explicit.
  host.adb(['shell', 'monkey', '-p', host.packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  await pause(700);
}

async function main() {
  const apk = process.argv[2];
  if (!apk || !existsSync(apk)) throw new Error('Usage: node scripts/dual-android.mts <apk> [--voice] [--screen-control] [--evidence=directory]');
  const hostSerial = process.env.HOST_SERIAL ?? 'emulator-5554', controllerSerial = process.env.CONTROLLER_SERIAL ?? 'emulator-5556';
  validateSerials(hostSerial, controllerSerial);
  const packageName = process.env.APP_PACKAGE ?? 'com.leanstix.synced';
  if (!/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(packageName)) throw new Error('Invalid app package.');
  const host = new AndroidUi(hostSerial, packageName), controller = new AndroidUi(controllerSerial, packageName);
  const evidence = resolve(process.argv.find(arg => arg.startsWith('--evidence='))?.slice('--evidence='.length) ?? '.test-results/dual-android');
  const completed: string[] = [];
  const stage = (name: string) => { completed.push(name); console.log(`PASS ${name}`); };
  let failure: string | undefined;
  try {
    await pairSaveReconnect(host, controller, resolve(apk), stage);
    // Pairing secrets and comparison codes are hidden before any screenshots.
    host.screenshot(evidence, 'host-trusted-private.png'); controller.screenshot(evidence, 'controller-trusted-private.png');
    if (process.argv.includes('--voice')) await voiceLink(host, controller, stage);
    if (process.argv.includes('--screen-control')) await screenAndControl(host, controller, stage);
    await controller.tap('Disconnect phones'); await host.visible('Disconnected'); stage('final-disconnect');
  } catch (error) {
    failure = redactReleaseLog(error instanceof Error ? error.message : 'Two-device validation failed.');
    // No XML, raw adb stderr, invitation screenshots or payloads are persisted.
    console.error(failure); process.exitCode = 1;
  } finally {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(resolve(evidence, 'result.json'), JSON.stringify({ completed, success: !failure, ...(failure ? { failure } : {}), screenControlRequested: process.argv.includes('--screen-control'), voiceRequested: process.argv.includes('--voice'), audioSamplesVerified: false }, null, 2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch(error => { console.error(redactReleaseLog(error instanceof Error ? error.message : 'Harness failed.')); process.exitCode = 1; });
