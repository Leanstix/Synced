import { afterEach, describe, expect, it, vi } from 'vitest';

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; vi.resetModules(); });
async function config(env: Record<string, string> = {}) {
  for (const key of ['EAS_BUILD_PROFILE', 'APP_ENV', 'RELEASE_CHANNEL', 'ANDROID_ABIS', 'ANDROID_VERSION_CODE']) delete process.env[key];
  Object.assign(process.env, env);
  vi.resetModules();
  return (await import('../app.config')).default;
}

describe('app permission declarations', () => {
  it('requires separate microphone permission for the voice link', async () => {
    const c = await config(); expect(c.android?.permissions).toContain('RECORD_AUDIO');
    expect(c.android?.blockedPermissions).not.toContain('android.permission.RECORD_AUDIO');
  });
  it('declares modern Bluetooth permissions without unbounded legacy grants', async () => {
    const permissions = (await config()).android?.permissions;
    expect(permissions).toEqual(expect.arrayContaining(['BLUETOOTH_CONNECT', 'BLUETOOTH_SCAN', 'BLUETOOTH_ADVERTISE']));
    expect(permissions).not.toContain('BLUETOOTH'); expect(permissions).not.toContain('BLUETOOTH_ADMIN');
  });
  it('blocks transitive location access for bonded-device use', async () => {
    expect((await config()).android?.blockedPermissions).toEqual(expect.arrayContaining(['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION']));
  });
  it('blocks camera storage and overlays after adding voice permissions', async () => {
    expect((await config()).android?.blockedPermissions).toEqual(expect.arrayContaining(['android.permission.CAMERA', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.SYSTEM_ALERT_WINDOW']));
  });
  it('disables Android backup and configures secure storage metadata', async () => {
    const c = await config(); expect(c.android?.allowBackup).toBe(false);
    expect(c.plugins).toContainEqual(['expo-secure-store', { configureAndroidBackup: true }]);
  });
});

describe('app resolved release configuration', () => {
  it('preserves the installed app identity for upgrades', async () => {
    const c = await config(); expect(c.android?.package).toBe('com.leanstix.synced'); expect(c.scheme).toBe('synced'); expect(c.version).toBe('0.2.0');
  });
  it('resolves an explicit version code into the generated app', async () => {
    expect((await config({ ANDROID_VERSION_CODE: '42' })).android?.versionCode).toBe(42);
  });
  it('refuses an invalid version before native generation', async () => {
    await expect(config({ ANDROID_VERSION_CODE: '1.2' })).rejects.toThrow('positive integer');
  });
  it('refuses production without explicit production intent', async () => {
    await expect(config({ EAS_BUILD_PROFILE: 'production' })).rejects.toThrow('explicit APP_ENV');
  });
  it('feeds the validated ABI list to Expo build properties', async () => {
    const c = await config({ ANDROID_ABIS: 'arm64-v8a' });
    expect(c.plugins).toContainEqual(['expo-build-properties', expect.objectContaining({ android: expect.objectContaining({ buildArchs: ['arm64-v8a'] }) })]);
  });
});
