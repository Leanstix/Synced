import { createHash } from 'node:crypto';

const VERSION = '1.73.0-rc.17';
const ORIGINAL_SHA256 = 'edcf3914ad6d22be4430a6b77518a3a1350f3243d6ab566eea3e229f652dff95';
export const BUILD_METADATA = '    // Synced: generate the standard AGP BuildConfig used by this dependency.\n    buildFeatures { buildConfig = true }\n';

/** Enable AGP's own generated metadata; do not write Java/Kotlin or alter the adapter. */
export function configureBluetoothBuildMetadata(version: string, source: string): string {
  if (version !== VERSION) throw new Error('Unreviewed Bluetooth package version.');
  const original = source.replace(BUILD_METADATA, '');
  if (createHash('sha256').update(original).digest('hex') !== ORIGINAL_SHA256) throw new Error('Bluetooth build metadata differs from the reviewed package.');
  const configured = original.replace('android {\n', `android {\n${BUILD_METADATA}`);
  if (source !== original && source !== configured) throw new Error('Bluetooth metadata preparation marker is not in the reviewed location.');
  return configured;
}
