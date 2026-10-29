import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {APK_SOURCE_PATHS, assertPreviewSource} from '../scripts/assert-preview-source.mts';
const roots: string[] = [];
afterEach(() => {for(const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'synced-source-')); roots.push(root);
  const git = (args: string[]) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  const paths = [...APK_SOURCE_PATHS.map(path => ['src', 'assets', 'config'].includes(path) ? `${path}/fixture` : path), 'scripts/dual-android.mts', 'README.md'];
  for(const path of paths) {mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), 'original');}
  git(['add', '.']); git(['commit', '-qm', 'initial']);
  return {root, sha: git(['rev-parse', 'HEAD']), git};
}
describe('audited APK source reuse boundary', () => {
it('allows identical audited source in a real Git checkout', () => {const {root, sha} = fixture(); expect(() => assertPreviewSource(sha, root)).not.toThrow();});
it.each(['App.tsx', 'src/fixture', 'app.config.ts', 'config/fixture', 'package-lock.json', 'scripts/prepare-dependencies.mts', 'scripts/bluetooth-build-metadata.mts', 'assets/fixture'])('refuses modified binary input %s', path => {const {root, sha} = fixture(); writeFileSync(join(root, path), 'changed'); expect(() => assertPreviewSource(sha, root)).toThrow('reuse refused');});
it('allows only harness and documentation changes', () => {const {root, sha} = fixture(); for(const path of ['scripts/dual-android.mts', 'README.md']) writeFileSync(join(root, path), 'changed'); expect(() => assertPreviewSource(sha, root)).not.toThrow();});
it('rejects committed binary source changes too', () => {const {root, sha, git} = fixture(); writeFileSync(join(root, 'App.tsx'), 'changed'); git(['commit', '-am', 'change']); expect(() => assertPreviewSource(sha, root)).toThrow('reuse refused');});
it.each([undefined, '', 'HEAD', '--help', 'a'.repeat(39), 'z'.repeat(40)])('rejects invalid or missing SHA %s', sha => {const {root} = fixture(); expect(() => assertPreviewSource(sha, root)).toThrow('40-character');});
it('rejects a well formed but unavailable source SHA', () => {const {root} = fixture(); expect(() => assertPreviewSource('0'.repeat(40), root)).toThrow('unavailable');});

});
