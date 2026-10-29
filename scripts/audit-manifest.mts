import { readFileSync } from 'node:fs';
import { auditAndroidArtifact } from './artifact-policy.mts';

const [permissions, badging, certificate] = process.argv.slice(2);
if (!permissions || !badging || !certificate) throw new Error('Usage: audit-manifest.mts <permissions.txt> <badging.txt> <certificate.txt>');
auditAndroidArtifact({
  permissions: readFileSync(permissions, 'utf8'), badging: readFileSync(badging, 'utf8'), certificate: readFileSync(certificate, 'utf8'),
  profile: process.env.APP_ENV === 'production' ? 'production' : 'preview',
  allowDebugSigner: process.env.ALLOW_DEBUG_PREVIEW_SIGNER === '1',
  expectedSignerSha256: process.env.EXPECTED_SIGNER_SHA256,
});
console.log('Artifact package, release mode, permission allowlist, ABIs, and signer evidence passed.');
