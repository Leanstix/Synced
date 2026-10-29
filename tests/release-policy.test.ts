import { describe, expect, it } from 'vitest';
import { resolveReleasePolicy, validateSigningIntent, type SigningIntent } from '../src/core/releasePolicy';

describe('release environment policy', () => {
  it('defaults local work to preview with both smoke and phone ABIs', () => {
    expect(resolveReleasePolicy({})).toEqual({ profile: 'preview', channel: 'preview', versionCode: 1, abis: ['arm64-v8a', 'x86_64'] });
  });
  it('accepts explicit production with arm64 only', () => {
    expect(resolveReleasePolicy({ EAS_BUILD_PROFILE: 'production', APP_ENV: 'production', ANDROID_ABIS: 'arm64-v8a' }).profile).toBe('production');
  });
  it('rejects unsupported profiles instead of silently using preview', () => {
    expect(() => resolveReleasePolicy({ EAS_BUILD_PROFILE: 'release' })).toThrow('Unsupported');
  });
  it('rejects production without its explicit environment', () => {
    expect(() => resolveReleasePolicy({ EAS_BUILD_PROFILE: 'production' })).toThrow('explicit');
  });
  it('rejects profile and environment disagreement', () => {
    expect(() => resolveReleasePolicy({ EAS_BUILD_PROFILE: 'preview', APP_ENV: 'production' })).toThrow('disagree');
  });
  it('rejects accidental cross-channel delivery', () => {
    expect(() => resolveReleasePolicy({ APP_ENV: 'production', RELEASE_CHANNEL: 'preview' })).toThrow('channel');
  });
});

describe('release version and ABI policy', () => {
  it('accepts the largest supported Play version code', () => {
    expect(resolveReleasePolicy({ ANDROID_VERSION_CODE: '2100000000' }).versionCode).toBe(2100000000);
  });
  it.each(['0', '-1', '1.2', '1e3', ' 1', '01', 'NaN', ''])('rejects noncanonical version %s', ANDROID_VERSION_CODE => {
    expect(() => resolveReleasePolicy({ ANDROID_VERSION_CODE })).toThrow('positive integer');
  });
  it('rejects versions beyond the store limit and safe integer range', () => {
    for (const ANDROID_VERSION_CODE of ['2100000001', '9007199254740993']) expect(() => resolveReleasePolicy({ ANDROID_VERSION_CODE })).toThrow('limit');
  });
  it.each(['', 'armeabi-v7a', 'x86', 'arm64-v8a,arm64-v8a', 'arm64-v8a, x86_64'])('rejects unsafe ABI selection %s', ANDROID_ABIS => {
    expect(() => resolveReleasePolicy({ ANDROID_ABIS })).toThrow('ABIs');
  });
  it('requires a phone ABI for production while permitting emulator-only preview', () => {
    expect(resolveReleasePolicy({ ANDROID_ABIS: 'x86_64' }).abis).toEqual(['x86_64']);
    expect(() => resolveReleasePolicy({ APP_ENV: 'production', ANDROID_ABIS: 'x86_64' })).toThrow('arm64');
  });
});

const production: SigningIntent = { profile: 'production', credentialsSource: 'remote', buildType: 'app-bundle', distribution: 'store', developmentClient: false };
describe('release signing policy', () => {
  it('accepts a managed production store bundle', () => expect(() => validateSigningIntent(production)).not.toThrow());
  it('accepts managed internal preview APK', () => expect(() => validateSigningIntent({ ...production, profile: 'preview', buildType: 'apk', distribution: 'internal' })).not.toThrow());
  it.each(['local', '', 'debug'])('rejects production credential fallback %s', credentialsSource => {
    expect(() => validateSigningIntent({ ...production, credentialsSource })).toThrow('remote');
  });
  it('rejects development clients', () => expect(() => validateSigningIntent({ ...production, developmentClient: true })).toThrow('development'));
  it('rejects Gradle commands that can bypass the AAB task', () => expect(() => validateSigningIntent({ ...production, gradleCommand: ':app:assembleDebug' })).toThrow('Gradle'));
  it('rejects a production APK or internal distribution', () => {
    expect(() => validateSigningIntent({ ...production, buildType: 'apk' })).toThrow('AAB');
    expect(() => validateSigningIntent({ ...production, distribution: 'internal' })).toThrow('AAB');
  });
  it('rejects a preview profile that points at a store bundle', () => {
    expect(() => validateSigningIntent({ ...production, profile: 'preview' })).toThrow('APK');
  });
});
