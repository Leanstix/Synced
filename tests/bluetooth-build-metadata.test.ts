import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILD_METADATA, configureBluetoothBuildMetadata as configure } from '../scripts/bluetooth-build-metadata.mts';
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('react-native-bluetooth-classic/package.json'));
const original = readFileSync(join(root, 'android/build.gradle'), 'utf8').replace(BUILD_METADATA, '');
const version = '1.73.0-rc.17';
describe('reviewed Bluetooth dependency build metadata', () => {
  it('enables AGP metadata only in the reviewed library android block', () => expect(configure(version, original)).toContain(`android {\n${BUILD_METADATA}`));
  it('is idempotent across repeated npm installs', () => { const once = configure(version, original); expect(configure(version, once)).toBe(once); });
  it('refuses an unreviewed dependency version', () => expect(() => configure('1.73.0-rc.18', original)).toThrow('version'));
  it('refuses drift in upstream build metadata even when version is unchanged', () => expect(() => configure(version, original.replace('compileSdkVersion', 'changedSdkVersion'))).toThrow('differs'));
  it('refuses a duplicate or forged preparation marker', () => expect(() => configure(version, configure(version, original) + BUILD_METADATA)).toThrow('differs'));
  it('preserves every other dependency byte and writes no Java or Kotlin source', () => { const result = configure(version, original); expect(result.replace(BUILD_METADATA, '')).toBe(original); expect(BUILD_METADATA).not.toMatch(/class |package |import |\.java|\.kt/); });
  it('refuses empty and truncated metadata', () => { for (const value of ['', original.slice(0, 100), original + '\n']) expect(() => configure(version, value)).toThrow('differs'); });
});


describe('Bluetooth build metadata marker placement', () => {
  it.each([
    ['appended', (text: string) => text + BUILD_METADATA],
    ['prepended', (text: string) => BUILD_METADATA + text],
    ['buildscript block', (text: string) => text.replace('buildscript {\n', `buildscript {\n${BUILD_METADATA}`)],
    ['repositories block', (text: string) => text.replace('    repositories {\n', `    repositories {\n${BUILD_METADATA}`)],
    ['late android block', (text: string) => text.replace('    lintOptions {\n', `${BUILD_METADATA}    lintOptions {\n`)],
  ])('refuses a marker relocated to %s', (_label, change) => { expect(() => configure(version, change(original))).toThrow('location'); });
});
