import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const APK_SOURCE_PATHS = ['App.tsx', 'index.ts', 'src', 'assets', 'config', 'app.config.ts', 'package.json', 'package-lock.json', 'scripts/prepare-dependencies.mts', 'scripts/bluetooth-build-metadata.mts'];
/** A reused binary qualifies only the identical APK source and locked dependency inputs. */
export function assertPreviewSource(source: string | undefined, cwd = process.cwd()): void {
  if (!source || !/^[a-f\d]{40}$/i.test(source)) throw new Error('A complete 40-character audited source SHA is required.');
  try {
    execFileSync('git', ['diff', '--exit-code', source, '--', ...APK_SOURCE_PATHS], {cwd, stdio: 'ignore', timeout: 30000});
  } catch {throw new Error('Audited APK source differs or its source commit is unavailable; binary reuse refused.');}
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {assertPreviewSource(process.argv[2]); console.log(`PASS reused APK source ${process.argv[2]}`);}
  catch (error) {console.error(error instanceof Error ? error.message : 'Source qualification failed.'); process.exitCode = 1;}
}
