import { readFileSync } from 'node:fs';
import { redactReleaseLog } from './log-policy.mts';

const input = readFileSync(0, 'utf8');
if (input.length > 20_000_000) throw new Error('Diagnostic input exceeds the redaction size limit');
process.stdout.write(redactReleaseLog(input));
