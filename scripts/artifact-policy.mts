import {assertLegacyBluetoothBounds} from './manifest-permissions.mts';
export const REQUIRED_PERMISSIONS = [
  'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.POST_NOTIFICATIONS', 'android.permission.RECORD_AUDIO',
  'android.permission.BLUETOOTH_CONNECT', 'android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_ADVERTISE',
];
export const ALLOWED_PERMISSIONS = new Set([
  ...REQUIRED_PERMISSIONS,
  'android.permission.ACCESS_WIFI_STATE', 'android.permission.CHANGE_NETWORK_STATE',
  'android.permission.MODIFY_AUDIO_SETTINGS', 'android.permission.WAKE_LOCK',
  'android.permission.BIND_ACCESSIBILITY_SERVICE', 'com.android.alarm.permission.SET_ALARM',
  'android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_ADMIN',
  'com.leanstix.synced.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
]);

export interface ArtifactEvidence {
  permissions: string;
  manifest?: string;
  badging: string;
  certificate: string;
  profile: 'preview' | 'production';
  allowDebugSigner?: boolean;
  expectedSignerSha256?: string;
}

export function auditAndroidArtifact(evidence: ArtifactEvidence): void {
  const permissions = [...evidence.permissions.matchAll(/^uses-permission(?:-sdk-\d+)?: name='([^']+)'/gm)].map(match => match[1]);
  if (!permissions.length) throw new Error('Permission evidence is missing or malformed');
  for (const permission of permissions) if (!ALLOWED_PERMISSIONS.has(permission)) throw new Error(`Unreviewed Android permission: ${permission}`);
  if (permissions.some(permission => /^android\.permission\.BLUETOOTH(?:_ADMIN)?$/.test(permission))) {
    if (!evidence.manifest) throw new Error('Legacy Bluetooth permissions require compiled manifest XML evidence.');
    assertLegacyBluetoothBounds(evidence.manifest, permissions);
  }
  for (const permission of REQUIRED_PERMISSIONS) if (!permissions.includes(permission)) throw new Error(`Missing Android permission: ${permission}`);
  const identity = evidence.badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  if (!identity || identity[1] !== 'com.leanstix.synced' || Number(identity[2]) < 1) throw new Error('APK package or version identity mismatch');
  if (/^application-debuggable(?:\s|$)/m.test(evidence.badging)) throw new Error('APK must use optimized non-debuggable release mode');
  const abis = evidence.badging.match(/^native-code: (.+)$/m)?.[1].match(/'([^']+)'/g)?.map(value => value.slice(1, -1)) ?? [];
  if (!abis.includes('arm64-v8a') || abis.some(abi => !['arm64-v8a', 'x86_64'].includes(abi))) throw new Error('Unexpected or missing 64-bit phone ABI');
  const signerMatches = [...evidence.certificate.matchAll(/^((?:Signer #\d+)|(?:V[1-4](?:\.\d+)? Signer)):? certificate SHA-256 digest: ([a-f\d]{64})\r?$/gim)];
  const digestLines = evidence.certificate.split('\n').filter(line => /certificate SHA-256 digest:/i.test(line));
  const labels = signerMatches.map(match => match[1].toLowerCase());
  const fingerprints = [...new Set(signerMatches.map(match => match[2].toLowerCase()))];
  if (!signerMatches.length || signerMatches.length !== digestLines.length || new Set(labels).size !== labels.length) throw new Error('Verified signer evidence is required');
  if (labels.some(label => /^signer #/.test(label) && label !== 'signer #1') || fingerprints.length !== 1) throw new Error('Multiple signer identities are not accepted');
  const debug = /(?:CN|O)=Android Debug\b/i.test(evidence.certificate);
  if (debug && (evidence.profile === 'production' || !evidence.allowDebugSigner)) throw new Error('Debug signer forbidden for this artifact');
  if (evidence.profile === 'production' && !evidence.expectedSignerSha256) throw new Error('Production audit requires an independently verified signer fingerprint');
  if (evidence.expectedSignerSha256) {
    const expected = evidence.expectedSignerSha256.replaceAll(':', '').toLowerCase();
    if (!/^[a-f\d]{64}$/.test(expected) || fingerprints.length !== 1 || fingerprints[0] !== expected) throw new Error('Artifact signer does not match expected fingerprint');
  }
}
