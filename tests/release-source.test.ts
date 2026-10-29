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
  it('rejects custom autolinking manifests and out-of-tree dependency bypasses', () => {
    for (const path of ['modules/control/expo-module.config.json', 'react-native.config.js', 'bridge.podspec']) expect(sourceViolations([{ path }])).not.toEqual([]);
    expect(sourceViolations([{ path: 'package.json', text: '{"dependencies":{"bridge":"file:../outside-native"}}' }])).not.toEqual([]);
    expect(sourceViolations([{ path: 'package.json', text: '{"dependencies":{"safe":"1.2.3"}}' }])).toEqual([]);
  });
  it.each(['release.jks', 'credentials.json', '.env.production', 'keys/upload.P12', 'google-services.json'])('rejects secret path %s', path => {
    expect(sourceViolations([{ path }])).not.toEqual([]);
  });
  it('permits environment examples but rejects embedded private keys', () => {
    expect(sourceViolations([{ path: '.env.example' }])).toEqual([]);
    expect(sourceViolations([{ path: 'notes.txt', text: ['-----BEGIN', 'PRIVATE KEY-----'].join(' ') }])).not.toEqual([]);
  });
});


describe('application configuration helper boundary', () => {
  it('rejects bridge entry points in nested TypeScript config helpers', () => {
    expect(sourceViolations([{ path: 'config/permissions/control.ts', text: 'NativeModules.Control.allow()' }]))
      .toEqual(['config/permissions/control.ts: custom native bridge entry point']);
  });
  it('rejects native build injection in config helpers', () => {
    expect(sourceViolations([{ path: 'config/build.cts', text: 'withAppBuildGradle(config, mutate)' }]))
      .toEqual(['config/build.cts: native code or build injection plugin']);
  });
  it('allows metadata-only permission helpers', () => {
    expect(sourceViolations([{ path: 'config/androidPermissions.ts', text: 'export const permissions = ["android.permission.BLUETOOTH_CONNECT"];' }]))
      .toEqual([]);
  });
  it('rejects code generation declarations in config code', () => {
    expect(sourceViolations([{ path: 'config/generated.mts', text: 'export const options = { codegenConfig: { name: "Control" } };' }]))
      .toEqual(['config/generated.mts: custom native code generation']);
  });
  it('excludes non-code config assets from code-token scanning', () => {
    expect(sourceViolations([{ path: 'config/help.json', text: '{"description":"NativeModules withAppBuildGradle codegenConfig: are unsupported"}' }]))
      .toEqual([]);
  });
});
