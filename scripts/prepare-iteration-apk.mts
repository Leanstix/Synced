import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, realpathSync, rmSync, renameSync} from 'node:fs';
import {dirname, isAbsolute, relative, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function exportedAndroidBundle(metadataPath: string): string {
  const metadata: unknown = JSON.parse(readFileSync(metadataPath, 'utf8'));
  const bundle = (metadata as {fileMetadata?: {android?: {bundle?: unknown}}})?.fileMetadata?.android?.bundle;
  if (typeof bundle !== 'string' || !bundle.endsWith('.hbc') || isAbsolute(bundle)) throw new Error('Android Hermes export metadata is required.');
  const root = dirname(resolve(metadataPath)), path = resolve(root, bundle), within = relative(root, path);
  if (within.startsWith('..') || isAbsolute(within) || !existsSync(path)) throw new Error('Exported bundle must exist inside the export directory.');
  const physical = realpathSync(path), physicalWithin = relative(realpathSync(root), physical);
  if (physicalWithin.startsWith('..') || isAbsolute(physicalWithin)) throw new Error('Bundle symlink leaves the export directory.');
  return physical;
}
/** Reuse only an independently source-checked native envelope; align/sign separately. */
export function replaceApkBundle(apk: string, bundle: string, output: string): void {
  if (resolve(apk) === resolve(output)) throw new Error('The audited input APK must never be overwritten.');
  if (!readFileSync(bundle).length) throw new Error('The exported bundle is empty.');
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    execFileSync('python3', ['-c', String.raw`
from zipfile import ZipFile
from pathlib import Path
import sys
source, bundle, output = sys.argv[1:]
with ZipFile(source) as original:
    entries = original.infolist()
    if sum(i.filename == 'assets/index.android.bundle' for i in entries) != 1:
        raise ValueError('Exactly one bundle asset is required')
    with ZipFile(output, 'w') as target:
        for entry in entries:
            if entry.filename.startswith('META-INF/') and entry.filename.upper().endswith(('.RSA', '.DSA', '.EC', '.SF', '.MF')):
                continue
            target.writestr(entry, Path(bundle).read_bytes() if entry.filename == 'assets/index.android.bundle' else original.read(entry.filename))
`, apk, bundle, temporary], {stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000});
    renameSync(temporary, output);
  } catch { throw new Error('Iteration APK preparation failed; audited input retained.'); }
  finally { rmSync(temporary, {force: true}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [, , apk, metadata, output] = process.argv;
    if (!apk || !metadata || !output) throw new Error('Usage: prepare-iteration-apk.mts <audited.apk> <export-metadata.json> <unsigned-output.apk>');
    replaceApkBundle(apk, exportedAndroidBundle(metadata), output);
    console.log('PASS JS iteration APK prepared; alignment and development signing still required.');
  } catch (error) { console.error(error instanceof Error ? error.message : 'Iteration APK preparation failed.'); process.exitCode = 1; }
}
