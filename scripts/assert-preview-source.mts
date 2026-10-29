import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const APK_SOURCE_PATHS = ['App.tsx', 'index.ts', 'src', 'assets', 'config', 'app.config.ts', 'package.json', 'package-lock.json', 'scripts/prepare-dependencies.mts', 'scripts/bluetooth-build-metadata.mts'];
/** A reused binary qualifies only the identical APK source and locked dependency inputs. */
export function assertPreviewSource(source: string | undefined, cwd = process.cwd()): void {
  if (!source || !/^[a-f\d]{40}$/i.test(source)) throw new Error('A complete 40-character audited source SHA is required.');
  try {
    execFileSync('git', ['diff', '--exit-code', source, '--', ...APK_SOURCE_PATHS], {cwd, stdio: 'ignore', timeout: 30000});
    if (execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...APK_SOURCE_PATHS], {cwd, encoding: 'utf8', timeout: 30000}).trim()) throw new Error('Untracked APK input');
  } catch {throw new Error('Audited APK source differs or its source commit is unavailable; binary reuse refused.');}
}

export const NATIVE_APK_SOURCE_PATHS = [...APK_SOURCE_PATHS.filter(path => !['App.tsx', 'index.ts', 'src'].includes(path)), 'src/core/releasePolicy.ts', 'scripts/release-config.mts', 'eas.json', 'metro.config.js', 'babel.config.js'];
/** JS iteration may change application code, never native configuration or dependencies. */
export function assertPreviewNativeSource(source: string | undefined, cwd = process.cwd()): void {
  if (!source || !/^[a-f\d]{40}$/i.test(source)) throw new Error('A complete audited native source SHA is required.');
  try {
    execFileSync('git', ['diff', '--exit-code', source, '--', ...NATIVE_APK_SOURCE_PATHS], {cwd, stdio: 'ignore', timeout: 30000});
    const added = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...NATIVE_APK_SOURCE_PATHS], {cwd, encoding: 'utf8', timeout: 30000}).trim();
    if (added) throw new Error('Untracked native input');
  }
  catch {throw new Error('Audited native inputs differ; JS-only iteration refused.');}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {(process.argv.includes('--javascript-only') ? assertPreviewNativeSource : assertPreviewSource)(process.argv[2]); console.log(`PASS reused ${process.argv.includes('--javascript-only') ? 'native APK envelope' : 'APK'} source ${process.argv[2]}`);}
  catch (error) {console.error(error instanceof Error ? error.message : 'Source qualification failed.'); process.exitCode = 1;}
}
