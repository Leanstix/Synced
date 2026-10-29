export interface SourceEntry { path: string; text?: string }

/** Inspect repository inputs, including app config and locally authored plugins. */
export function sourceViolations(entries: SourceEntry[]): string[] {
  const failures: string[] = [];
  for (const entry of entries) {
    const path = entry.path.replaceAll('\\', '/');
    const lower = path.toLowerCase();
    const native = /\.(java|kt|kts|swift|m|mm|h|c|cc|cpp|rs|aar|so|dylib|framework)$/.test(lower)
      || /(^|\/)(android|ios)\//.test(lower)
      || /(^|\/)(podfile|.*\.gradle|.*\.xcodeproj|.*\.podspec)(\/|$)/.test(lower);
    if (native) failures.push(`${path}: authored native source or platform artifact`);
    if (/(^|\/)(expo-module\.config\.json|react-native\.config\.[cm]?[jt]s)$/.test(lower)) failures.push(`${path}: custom native module linking configuration`);
    const sensitive = /\.(jks|keystore|p12|pfx|mobileprovision|pem|key)$/.test(lower)
      || /(^|\/)(credentials\.json|google-services\.json|googleservice-info\.plist|\.env(?:\..+)?)$/.test(lower);
    if (sensitive && !/\.env\.(example|sample)$/.test(lower)) failures.push(`${path}: private credentials or environment file`);
    const appCode = /^(src\/|config\/|plugins\/|modules\/|App\.|index\.|app\.config\.|react-native\.config\.)/.test(path)
      && /\.[cm]?[jt]sx?$/.test(path);
    if (appCode && entry.text) {
      if (/\b(NativeModules|TurboModuleRegistry|requireNativeModule|requireOptionalNativeModule|codegenNativeComponent)\b/.test(entry.text)) {
        failures.push(`${path}: custom native bridge entry point`);
      }
      if (/\b(withDangerousMod|withMainApplication|withMainActivity|withAppBuildGradle|withProjectBuildGradle|withSettingsGradle)\b/.test(entry.text)) {
        failures.push(`${path}: native code or build injection plugin`);
      }
      if (/\bcodegenConfig\s*:/.test(entry.text)) failures.push(`${path}: custom native code generation`);
    }
    if (lower === 'package.json' && entry.text) {
      const manifest = JSON.parse(entry.text) as Record<string, unknown>;
      if (manifest.codegenConfig) failures.push(`${path}: custom native code generation`);
      for (const group of ['dependencies', 'optionalDependencies']) {
        const dependencies = manifest[group] as Record<string, unknown> | undefined;
        if (dependencies && Object.values(dependencies).some(value => typeof value === 'string' && /^(file:|link:|workspace:)/.test(value))) failures.push(`${path}: unreviewed local dependency can bypass the authored source boundary`);
      }
    }
    if (entry.text && /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(entry.text)) failures.push(`${path}: private key material`);
  }
  return failures;
}
