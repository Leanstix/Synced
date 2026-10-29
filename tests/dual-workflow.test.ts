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
