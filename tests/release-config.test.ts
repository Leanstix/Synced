import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateEasConfiguration } from '../scripts/release-config.mts';

const config = () => JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
describe('release EAS configuration', () => {
  it('accepts the checked-in production and preview profiles', () => expect(() => validateEasConfiguration(config())).not.toThrow());
  it('rejects local version state that can duplicate published codes', () => {
    const value = config(); value.cli.appVersionSource = 'local';
    expect(() => validateEasConfiguration(value)).toThrow('remotely');
  });
  it('rejects unreviewed profiles and inherited signing settings', () => {
    const value = config(); value.build.test = {};
    expect(() => validateEasConfiguration(value)).toThrow('Unreviewed');
    delete value.build.test; value.build.production.extends = 'preview';
    expect(() => validateEasConfiguration(value)).toThrow('directly');
  });
  it('rejects an older Node runtime even when a local check ran on Node 24', () => {
    const value = config(); value.build.production.node = '22.0.0';
    expect(() => validateEasConfiguration(value)).toThrow('Node 24');
  });
  it('rejects environment and channel substitutions', () => {
    const value = config(); value.build.production.channel = 'preview';
    expect(() => validateEasConfiguration(value)).toThrow('mismatch');
  });
  it('rejects disabled auto-increment', () => {
    const value = config(); value.build.production.autoIncrement = false;
    expect(() => validateEasConfiguration(value)).toThrow('increment');
  });
  it('rejects unsigned and custom debug task escape hatches', () => {
    const value = config(); value.build.production.withoutCredentials = true;
    expect(() => validateEasConfiguration(value)).toThrow('Unsigned');
    delete value.build.production.withoutCredentials; value.build.production.android.gradleCommand = ':app:assembleDebug';
    expect(() => validateEasConfiguration(value)).toThrow('Gradle');
  });
});
