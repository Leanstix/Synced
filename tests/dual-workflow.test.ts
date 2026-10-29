import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const workflow = readFileSync('.github/workflows/android.yml', 'utf8');
const launch = workflow.slice(workflow.indexOf('  launch-smoke-test:'));
describe('two-phone CI workflow contract', () => {
  it('tests only the artifact from the successful current build', () => { expect(launch).toContain('needs: verify-and-build'); expect(launch).toContain('name: synced-android-preview-debug-signed'); expect(launch).not.toContain('run-id:'); });
  it('runs the single-device smoke before introducing a second ADB target', () => { const first = launch.indexOf('bash scripts/smoke-android.sh'); expect(first).toBeGreaterThan(0); expect(first).toBeLessThan(launch.indexOf('node scripts/dual-emulator-start.mts')); });
  it('starts the second phone before exercising the real two-phone flow', () => { expect(launch.indexOf('node scripts/dual-emulator-start.mts')).toBeLessThan(launch.indexOf('node scripts/dual-android.mts preview/app-release.apk')); });
  it('requires both the voice and actual screen/control checks without masking failures', () => { expect(launch).toContain('--voice --screen-control --evidence=smoke-evidence/dual'); expect(launch).not.toContain('continue-on-error: true'); expect(launch).not.toContain('|| true'); });
  it('retains evidence on failure within a bounded accelerated test job', () => { expect(launch).toContain('timeout-minutes: 30'); expect(launch).toContain('Enable KVM access'); expect(launch).toContain('if: always()'); expect(launch).toContain('path: smoke-evidence/'); });
});


describe('APK audit failure evidence retention', () => {
  const metadata = workflow.slice(workflow.indexOf('      - name: Upload APK audit metadata'), workflow.indexOf('      - name: Upload preview APK'));
  it('retains metadata even if the preceding audit fails', () => expect(metadata).toContain('if: always()'));
  it('includes the exact permission evidence used by the audit', () => expect(metadata).toContain('android/app/build/outputs/apk/release/permissions.txt'));
  it('includes package and signer evidence for independent diagnosis', () => { expect(metadata).toContain('/badging.txt'); expect(metadata).toContain('/certificate.txt'); });
  it('does not expose an unaudited APK or signing key in the metadata artifact', () => { expect(metadata).not.toMatch(/app-release\.apk|keystore|\.jks|\*\*/); });
  it('does not turn absence of build output into an extra failure or weaken the build audit', () => { expect(metadata).toContain('if-no-files-found: ignore'); expect(workflow).toContain('node scripts/audit-manifest.mts'); expect(workflow).not.toContain('continue-on-error: true'); });
});

describe('compiled manifest audit workflow evidence', () => {
  it('extracts compiled XML from the same APK used by permission and signer checks', () => expect(workflow).toContain('"$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer" manifest print "$preview_apk" > "$evidence/manifest.xml"'));
  it('extracts XML before invoking the audit', () => expect(workflow.indexOf('apkanalyzer" manifest print')).toBeLessThan(workflow.indexOf('node scripts/audit-manifest.mts')));
  it('passes compiled XML as the fourth audit input', () => expect(workflow).toContain('"$evidence/certificate.txt" "$evidence/manifest.xml"'));
  it('retains compiled XML along with the human-readable summary', () => expect(workflow).toContain('android/app/build/outputs/apk/release/manifest.xml'));
  it('requires the CLI caller to provide the compiled manifest file', () => { const cli = readFileSync('scripts/audit-manifest.mts', 'utf8'); expect(cli).toContain('!manifest'); expect(cli).toContain("manifest: readFileSync(manifest, 'utf8')"); });
});
