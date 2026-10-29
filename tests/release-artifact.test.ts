import { describe, expect, it } from 'vitest';
import { auditAndroidArtifact, REQUIRED_PERMISSIONS, type ArtifactEvidence } from '../scripts/artifact-policy.mts';

const fingerprint = 'ab'.repeat(32);
const valid = (): ArtifactEvidence => ({
  permissions: REQUIRED_PERMISSIONS.map(name => `uses-permission: name='${name}'`).join('\n'),
  badging: "package: name='com.leanstix.synced' versionCode='1' versionName='0.1.0'\nnative-code: 'arm64-v8a' 'x86_64'",
  certificate: `Signer #1 certificate DN: CN=Synced\nSigner #1 certificate SHA-256 digest: ${fingerprint}`,
  profile: 'production', expectedSignerSha256: fingerprint,
});
describe('release artifact permission boundary', () => {
  it('accepts intended microphone and Bluetooth permissions', () => expect(() => auditAndroidArtifact(valid())).not.toThrow());
  it.each(['CAMERA', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SYSTEM_ALERT_WINDOW', 'READ_CONTACTS'])('rejects unexpected %s permission', permission => {
    expect(() => auditAndroidArtifact({ ...valid(), permissions: `${valid().permissions}\nuses-permission: name='android.permission.${permission}'` })).toThrow('Unreviewed');
  });
  it('catches SDK-limited permissions as well as ordinary permissions', () => {
    expect(() => auditAndroidArtifact({ ...valid(), permissions: `${valid().permissions}\nuses-permission-sdk-23: name='android.permission.CAMERA'` })).toThrow('Unreviewed');
  });
  it('rejects missing voice permission', () => {
    expect(() => auditAndroidArtifact({ ...valid(), permissions: valid().permissions.replace("uses-permission: name='android.permission.RECORD_AUDIO'", '') })).toThrow('Missing');
  });
  it('rejects empty or unrelated command output', () => {
    expect(() => auditAndroidArtifact({ ...valid(), permissions: 'aapt failed' })).toThrow('malformed');
  });
  it('rejects an application permission from another package', () => {
    expect(() => auditAndroidArtifact({ ...valid(), permissions: `${valid().permissions}\nuses-permission: name='com.other.app.CUSTOM'` })).toThrow('Unreviewed');
  });
  it('requires compiled XML even when the summary claims a bound', () => {
    expect(() => auditAndroidArtifact({...valid(), permissions: `${valid().permissions}\nuses-permission: name='android.permission.BLUETOOTH' maxSdkVersion='30'`})).toThrow('compiled manifest');
  });
});
describe('release artifact signing evidence', () => {
  it('requires independent expected production identity', () => expect(() => auditAndroidArtifact({ ...valid(), expectedSignerSha256: undefined })).toThrow('fingerprint'));
  it('rejects the default Android debug signer despite matching fingerprint', () => {
    expect(() => auditAndroidArtifact({ ...valid(), certificate: valid().certificate.replace('CN=Synced', 'CN=Android Debug') })).toThrow('Debug');
  });
  it('permits explicitly labeled CI preview debug signing', () => {
    expect(() => auditAndroidArtifact({ ...valid(), profile: 'preview', allowDebugSigner: true, certificate: valid().certificate.replace('CN=Synced', 'CN=Android Debug') })).not.toThrow();
  });
  it('rejects unlabeled preview debug signing', () => {
    expect(() => auditAndroidArtifact({ ...valid(), profile: 'preview', certificate: valid().certificate.replace('CN=Synced', 'CN=Android Debug') })).toThrow('Debug');
  });
  it('rejects absent, malformed, multiple, or changed signer evidence', () => {
    for (const certificate of ['', 'Signer #1 certificate SHA-256 digest: abc', valid().certificate + `\nSigner #2 certificate SHA-256 digest: ${fingerprint}`]) {
      expect(() => auditAndroidArtifact({ ...valid(), certificate })).toThrow();
    }
    expect(() => auditAndroidArtifact({ ...valid(), expectedSignerSha256: 'cd'.repeat(32) })).toThrow('match');
  });
  it('normalizes a colon-delimited independently recorded fingerprint', () => {
    expect(() => auditAndroidArtifact({ ...valid(), expectedSignerSha256: fingerprint.match(/../g)!.join(':').toUpperCase() })).not.toThrow();
  });
});
describe('release artifact package and architecture', () => {
  it('rejects a wrong package', () => expect(() => auditAndroidArtifact({ ...valid(), badging: valid().badging.replace('com.leanstix.synced', 'com.other.app') })).toThrow('identity'));
  it('rejects zero version code', () => expect(() => auditAndroidArtifact({ ...valid(), badging: valid().badging.replace("versionCode='1'", "versionCode='0'") })).toThrow('identity'));
  it('rejects a debuggable release artifact', () => expect(() => auditAndroidArtifact({ ...valid(), badging: `${valid().badging}\napplication-debuggable` })).toThrow('non-debuggable'));
  it('rejects emulator-only artifacts as phone release evidence', () => expect(() => auditAndroidArtifact({ ...valid(), badging: valid().badging.replace("'arm64-v8a' ", '') })).toThrow('ABI'));
  it('rejects accidental 32-bit native dependencies', () => expect(() => auditAndroidArtifact({ ...valid(), badging: `${valid().badging} 'armeabi-v7a'` })).toThrow('ABI'));
});

describe('legacy Bluetooth compiled manifest evidence', () => {
  const xml = (name: string, max = '30') => `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.leanstix.synced"><uses-permission android:name="${name}" android:maxSdkVersion="${max}"/></manifest>`;
  const withLegacy = (name: string, manifest: string) => ({...valid(), permissions: `${valid().permissions}\nuses-permission: name='${name}'`, manifest});
  it('requires XML rather than trusting a bounded-looking summary', () => expect(() => auditAndroidArtifact({...valid(), permissions: `${valid().permissions}\nuses-permission: name='android.permission.BLUETOOTH' maxSdkVersion='30'`})).toThrow('compiled manifest XML'));
  it('rejects compiled SDK bounds beyond Android 11', () => expect(() => auditAndroidArtifact(withLegacy('android.permission.BLUETOOTH', xml('android.permission.BLUETOOTH', '31')))).toThrow('Legacy Bluetooth'));
  it('accepts real compiled bounds when aapt omits maxSdkVersion', () => expect(() => auditAndroidArtifact(withLegacy('android.permission.BLUETOOTH', xml('android.permission.BLUETOOTH')))).not.toThrow());
  it('ignores implied summary grants while checking actual ADMIN declaration', () => expect(() => auditAndroidArtifact({...withLegacy('android.permission.BLUETOOTH_ADMIN', xml('android.permission.BLUETOOTH_ADMIN')), permissions: `${valid().permissions}\nuses-permission: name='android.permission.BLUETOOTH_ADMIN'\nuses-implied-permission: name='android.permission.BLUETOOTH' reason='requested BLUETOOTH_ADMIN permission'`})).not.toThrow());
  it('rejects a mismatching actual declaration', () => expect(() => auditAndroidArtifact(withLegacy('android.permission.BLUETOOTH_ADMIN', xml('android.permission.BLUETOOTH')))).toThrow('Legacy Bluetooth'));
  it('rejects an unbounded actual declaration despite a bounded summary', () => expect(() => auditAndroidArtifact({...withLegacy('android.permission.BLUETOOTH', xml('android.permission.BLUETOOTH').replace(' android:maxSdkVersion="30"', '')), permissions: `${valid().permissions}\nuses-permission: name='android.permission.BLUETOOTH' maxSdkVersion='30'`})).toThrow('Legacy Bluetooth'));
});
