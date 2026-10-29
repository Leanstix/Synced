import { describe, expect, it } from 'vitest';
import { sourceViolations } from '../scripts/source-policy.mts';

describe('release source boundary', () => {
  it('allows TypeScript application and resource-only Expo plugins', () => {
    expect(sourceViolations([{ path: 'src/App.tsx', text: 'export const App = () => null;' }, { path: 'app.config.ts', text: 'withStringsXml(config, edit)' }])).toEqual([]);
  });
  it.each(['src/Adapter.KT', 'modules/bridge.cpp', 'android/app/build.gradle', 'ios/Podfile', 'vendor/lib.aar', 'nested\\android\\build.gradle'])('rejects native path %s', path => {
    expect(sourceViolations([{ path }])).not.toEqual([]);
  });
  it.each(['NativeModules', 'TurboModuleRegistry', 'requireNativeModule', 'requireOptionalNativeModule', 'codegenNativeComponent'])('rejects bridge entry %s outside the original src-only guard', name => {
    expect(sourceViolations([{ path: 'plugins/control.ts', text: `${name}('Control')` }])).not.toEqual([]);
  });
  it('rejects build mutation from app configuration', () => {
    expect(sourceViolations([{ path: 'app.config.ts', text: 'withDangerousMod(config, code)' }])).not.toEqual([]);
  });
  it('rejects manifest native codegen', () => {
    expect(sourceViolations([{ path: 'package.json', text: '{"codegenConfig":{"name":"Bridge"}}' }])).not.toEqual([]);
  });
  it.each(['release.jks', 'credentials.json', '.env.production', 'keys/upload.P12', 'google-services.json'])('rejects secret path %s', path => {
    expect(sourceViolations([{ path }])).not.toEqual([]);
  });
  it('permits environment examples but rejects embedded private keys', () => {
    expect(sourceViolations([{ path: '.env.example' }])).toEqual([]);
    expect(sourceViolations([{ path: 'notes.txt', text: ['-----BEGIN', 'PRIVATE KEY-----'].join(' ') }])).not.toEqual([]);
  });
});
